// app/api/admin/research/[projectId]/packets/route.ts — the deliverable (plan R25).
//
// GET  — list packets for this project.
// POST — create the next version, or approve one (`{ action: 'approve', packetId }`).
//
// Approving snapshots the assembled packet into `rendered_json`. Editing an approved packet is not
// possible: it creates the next version instead, because a mutable "approved" flag lets somebody
// approve a packet and then change what they approved.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { supabaseAdmin } from '@/lib/supabase';
import { assemblePacket, canApprove, type PacketItemRef, type PacketSources } from '@/lib/research/packet';
import type { Discrepancy, ExtractedDataPoint, ResearchDocument } from '@/types/research';

function extractProjectId(req: NextRequest): string | null {
  const after = req.nextUrl.pathname.split('/research/')[1];
  return after ? after.split('/')[0] || null : null;
}

/** Load everything a packet can reference, plus human labels for the documents. */
async function loadSources(projectId: string): Promise<PacketSources> {
  const [factRes, docRes, conflictRes, planRes] = await Promise.all([
    supabaseAdmin.from('extracted_data_points').select('*').eq('research_project_id', projectId),
    supabaseAdmin.from('research_documents').select('*').eq('research_project_id', projectId),
    supabaseAdmin.from('discrepancies').select('*').eq('research_project_id', projectId),
    supabaseAdmin.from('research_survey_plans').select('ai_plan').eq('research_project_id', projectId)
      .eq('is_current', true).limit(1),
  ]);


  const documents = (docRes.data ?? []) as ResearchDocument[];
  const documentLabels: Record<string, string> = {};
  for (const d of documents) {
    const year = d.recorded_date?.slice(0, 4);
    documentLabels[d.id] =
      d.document_label
      || [year, d.document_type?.replace(/_/g, ' ')].filter(Boolean).join(' ')
      || d.original_filename
      || 'an unnamed document';
  }

  const plan = (planRes.data ?? [])[0] as {
    ai_plan?: {
      property_summary?: string;
      closure_check?: { closure_ratio?: string; acceptable?: boolean; note?: string } | null;
    };
  } | undefined;

  // Whether the boundary closes, on the cover.
  //
  // `readingCaveat` was added to the packet two slices ago with a renderer and a test and NO
  // PRODUCER — a consumer with nothing feeding it, which is the mirror image of the defect this
  // whole document keeps recording, and I committed it. Wiring it rather than deleting it, because
  // the fact is genuinely available: the survey plan this route already loads carries the closure
  // check.
  //
  // Only surfaced when the closure is NOT acceptable. A packet whose boundary closes fine does not
  // need a cover line saying so — cover warnings that fire on healthy runs are how a crew learns to
  // skip the cover.
  const cc = plan?.ai_plan?.closure_check;
  const readingCaveat = cc && cc.acceptable === false
    ? `The boundary calls in this packet do not close acceptably` +
      `${cc.closure_ratio ? ` (${cc.closure_ratio})` : ''}. ` +
      `${cc.note ? `${cc.note} ` : ''}` +
      `Either the record does not close or the calls were misread — treat every bearing and distance ` +
      `here as unconfirmed until that is settled.`
    : null;

  // Documents this project holds that cannot be relied on, named for the cover.
  //
  // The worker's own `retrievalFailures` list — documents it tried to fetch and could not — is not
  // visible from here; it lives on the pipeline result rather than in a table. What IS visible is
  // the other half of the same fact, and it is the half a crew cares about: documents that arrived
  // and could not be read (`unreadable`), and documents whose processing errored.
  //
  // Both belong on the cover for the reason R18 exists: an unreadable deed becomes a document with
  // no facts, and the packet then reports the property as having no easements rather than as having
  // a deed nobody could read.
  const unusable = documents
    .filter((d) => d.processing_status === 'unreadable' || d.processing_status === 'error')
    .map((d) => `${documentLabels[d.id]} (${d.processing_status === 'unreadable' ? 'could not be read' : 'processing failed'})`);

  return {
    facts: (factRes.data ?? []) as ExtractedDataPoint[],
    documents,
    conflicts: (conflictRes.data ?? []) as Discrepancy[],
    planSummary: plan?.ai_plan?.property_summary ?? null,
    documentLabels,
    // `[]` rather than undefined: this query DID run, so "none" is established rather than unknown.
    // The distinction is the packet's, and handing it the wrong one would make a checked run look
    // unchecked — or worse, the reverse.
    retrievalFailures: unusable,
    readingCaveat,
  };
}

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const projectId = extractProjectId(req);
  if (!projectId) return NextResponse.json({ error: 'Project ID required' }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from('research_packets')
    .select('*')
    .eq('research_project_id', projectId)
    .order('version', { ascending: false });

  // A failed read is not "no packets" — a crew told there is no packet when one was approved is the
  // §1.1b defect with a job attached to it.
  if (error) {
    return NextResponse.json(
      { error: 'The packets could not be read. This is not the same as none existing.' },
      { status: 500 },
    );
  }

  return NextResponse.json({ packets: data ?? [] }, { headers: { 'Cache-Control': 'no-store' } });
}, { routeName: 'research/packets' });

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const projectId = extractProjectId(req);
  if (!projectId) return NextResponse.json({ error: 'Project ID required' }, { status: 400 });

  const body = (await req.json().catch(() => ({}))) as {
    action?: 'create' | 'approve';
    packetId?: string;
    title?: string;
    coverNotes?: string | null;
    contents?: PacketItemRef[];
  };

  const sources = await loadSources(projectId);

  // ── Approve ───────────────────────────────────────────────────────────────
  if (body.action === 'approve') {
    if (!body.packetId) return NextResponse.json({ error: 'packetId is required to approve' }, { status: 400 });

    const { data: row } = await supabaseAdmin
      .from('research_packets').select('*')
      .eq('id', body.packetId).eq('research_project_id', projectId).single();
    if (!row) return NextResponse.json({ error: 'Packet not found' }, { status: 404 });
    if (row.status === 'approved') {
      return NextResponse.json(
        { error: 'This packet is already approved. Create a new version to change what it contains.' },
        { status: 409 },
      );
    }

    const assembled = assemblePacket(row.title, row.cover_notes, row.contents ?? [], sources);
    const check = canApprove(assembled);
    if (!check.canApprove) return NextResponse.json({ error: check.reason }, { status: 400 });

    const { data, error } = await supabaseAdmin
      .from('research_packets')
      .update({
        status: 'approved',
        // The snapshot is a COPY on purpose: what was approved must stay what was approved, even
        // when a fact is corrected afterwards.
        rendered_json: assembled,
        approved_by: session.user.email,
        approved_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', body.packetId)
      .select('*')
      .single();

    if (error) return NextResponse.json({ error: `Could not approve: ${error.message}` }, { status: 500 });

    // Older approved packets become superseded rather than deleted — a packet a crew worked from is
    // evidence of what they were given.
    await supabaseAdmin
      .from('research_packets')
      .update({ status: 'superseded' })
      .eq('research_project_id', projectId)
      .eq('status', 'approved')
      .neq('id', body.packetId);

    return NextResponse.json({ packet: data, assembled, approval: check });
  }

  // ── Create the next version ───────────────────────────────────────────────
  const contents = body.contents ?? [];
  const { data: existing } = await supabaseAdmin
    .from('research_packets').select('version')
    .eq('research_project_id', projectId)
    .order('version', { ascending: false }).limit(1);
  const nextVersion = ((existing ?? [])[0]?.version ?? 0) + 1;

  const title = body.title?.trim() || `Survey research packet v${nextVersion}`;
  const assembled = assemblePacket(title, body.coverNotes ?? null, contents, sources);

  const { data, error } = await supabaseAdmin
    .from('research_packets')
    .insert({
      research_project_id: projectId,
      version: nextVersion,
      title,
      cover_notes: body.coverNotes ?? null,
      contents,
      status: 'draft',
      created_by: session.user.email,
    })
    .select('*')
    .single();

  if (error) return NextResponse.json({ error: `Could not create the packet: ${error.message}` }, { status: 500 });

  return NextResponse.json({ packet: data, assembled });
}, { routeName: 'research/packets-create' });

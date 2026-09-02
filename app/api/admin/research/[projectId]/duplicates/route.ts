// app/api/admin/research/[projectId]/duplicates/route.ts — what was merged, into what, and why
// (plan B5).
//
// ── WHY THIS HAS TO BE VISIBLE, AND REVERSIBLE ──────────────────────────────────────────────────
//
// Seed 623 marked 78 existing rows as duplicates of 44 keepers — 53 by identical stored file, 25 by
// label and recording reference — and the worker now marks more on every run. None of it was
// visible anywhere. A document that has been quietly folded into another one, with no screen that
// says so, is functionally deleted: nobody can find it, and nobody can tell you were wrong.
//
// The whole deduplication design rests on "never delete, always explain, always reversible", and
// the third of those is a promise this endpoint has to keep. Until it existed, the promise was
// theoretical — the `duplicate_of` column could be set by three code paths and unset by none.
//
// ── AND WHY UN-MARKING IS A REAL OPERATION, NOT AN ADMIN ESCAPE HATCH ───────────────────────────
//
// The match rules are deliberately willing to be wrong in this direction. Pass 2 of seed 623 groups
// on (project, label, recording reference) — evidence weak enough that the seed says so in the
// reason text it writes. A county that files two genuinely different instruments under one label on
// one day produces a false match, and the person who notices is the surveyor reading the packet.
//
// So un-marking is one PATCH, it records nothing clever, and it does not fight the seed: seed 623's
// passes are guarded by `duplicate_of IS NULL`, so a row a human un-marks is never re-marked by
// re-running the seed.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';

function extractProjectId(req: NextRequest): string | null {
  const after = req.nextUrl.pathname.split('/research/')[1];
  return after ? after.split('/')[0] || null : null;
}

interface DocRow {
  id: string;
  document_label: string | null;
  document_type: string | null;
  recording_info: string | null;
  duplicate_of: string | null;
  duplicate_reason: string | null;
  storage_path: string | null;
  public_url: string | null;
  research_run_id: string | null;
  created_at: string | null;
}

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const projectId = extractProjectId(req);
  if (!projectId) return NextResponse.json({ error: 'Project ID required' }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from('research_documents')
    .select(
      'id, document_label, document_type, recording_info, duplicate_of, duplicate_reason, ' +
      'storage_path, public_url, research_run_id, created_at',
    )
    .eq('research_project_id', projectId);

  if (error) {
    // A failed read is not "no duplicates". Reporting an empty list here would tell an operator the
    // library is clean at the exact moment we cannot see it.
    return NextResponse.json(
      { error: 'The document library could not be read, so duplicates could not be listed. This is not the same as there being none.' },
      { status: 500 },
    );
  }

  const rows = (data ?? []) as DocRow[];
  const byId = new Map(rows.map((r) => [r.id, r]));

  const duplicates = rows
    .filter((r) => r.duplicate_of)
    .map((r) => {
      const keeper = byId.get(r.duplicate_of!) ?? null;
      return {
        id: r.id,
        label: r.document_label ?? r.document_type ?? 'Untitled document',
        recordingInfo: r.recording_info,
        // The reason is the point. A merge with no stated reason cannot be argued with, and a
        // reader who cannot argue with it has to either trust it completely or distrust the whole
        // library.
        reason: r.duplicate_reason ?? 'No reason was recorded, which is itself worth knowing.',
        publicUrl: r.public_url,
        createdAt: r.created_at,
        keeper: keeper
          ? {
              id: keeper.id,
              label: keeper.document_label ?? keeper.document_type ?? 'Untitled document',
              publicUrl: keeper.public_url,
            }
          // A duplicate whose keeper is gone is worth surfacing loudly: it means the row it pointed
          // at was removed, so this document is now hidden behind nothing at all.
          : null,
      };
    })
    .sort((a, b) => (a.label ?? '').localeCompare(b.label ?? ''));

  return NextResponse.json(
    {
      duplicates,
      total: duplicates.length,
      libraryTotal: rows.length,
      liveTotal: rows.filter((r) => !r.duplicate_of).length,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}, { routeName: 'research/duplicates' });

/* PATCH — un-mark a duplicate. The reversibility the whole design promises. */
export const PATCH = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const projectId = extractProjectId(req);
  if (!projectId) return NextResponse.json({ error: 'Project ID required' }, { status: 400 });

  const body = await req.json().catch(() => ({})) as { documentId?: string };
  if (!body.documentId) return NextResponse.json({ error: 'documentId is required' }, { status: 400 });

  const { error } = await supabaseAdmin
    .from('research_documents')
    .update({
      duplicate_of: null,
      // The reason goes too. Leaving it would have the row carrying an explanation for a state it
      // is no longer in, which is how a stale note becomes a fact nobody questions.
      duplicate_reason: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', body.documentId)
    // Scoped to the project so a document id from elsewhere cannot be edited through this route.
    .eq('research_project_id', projectId);

  if (error) {
    return NextResponse.json({ error: `The document could not be un-marked: ${error.message}` }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    documentId: body.documentId,
    message:
      'Un-marked. This document is a distinct record again and appears in the library. Re-running ' +
      'the deduplication seed will not re-mark it — its passes only touch rows with no duplicate set.',
  });
}, { routeName: 'research/duplicates/unmark' });

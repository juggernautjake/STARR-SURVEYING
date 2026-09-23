// app/api/admin/jobs/[id]/files/from-research/route.ts — a research document, in the job's files.
//
// Owner, 2026-09-23: "we need to be able to add the research documents we find that are related to
// a job into that job's files."
//
// ── WHY THIS DID NOT EXIST ──────────────────────────────────────────────────────────────────────
//
// `job_files` and `research_documents` have never met. There is no join table, no foreign key, and
// no route: a job's file list is fed by human uploads, and the research a run did for that same
// property lives on a different page behind a different table. The only bridge is
// `/api/admin/jobs/[id]/research-packet`, which READS the analysis and attaches nothing.
//
// So the deed a run found for 1007 Cushing Drive was invisible on job 26144's own file list.
//
// ── WHY IT LINKS RATHER THAN COPIES ─────────────────────────────────────────────────────────────
//
// The opposite choice from the CAD route next door, and for the opposite reason.
//
// A CAD underlay is traced over: the drawing must not change under the drafter, so those bytes are
// copied and frozen. A job file is a reference to the document itself — the same deed, on the job
// it belongs to. Copying would put an 8 MB second copy in a second bucket and, worse, would freeze
// a document that SHOULD track its source: when a better scan supersedes it, the job should get the
// better scan.
//
// `job_files` already carries `storage_bucket` alongside `storage_path`, so a row can point into
// the research bucket without anything else changing. The download route reads both.
//
// ── THE LICENCE DOES NOT GATE THIS ONE ──────────────────────────────────────────────────────────
//
// Deliberately. `shareable` governs serving a document to a customer OTHER than the one it was
// fetched for. Attaching it to the job it was fetched for is the opposite: a TexasFile purchase
// bought for this job belongs on this job, which is exactly what its licence permits. What is
// refused is attaching a document from a DIFFERENT customer's project unless it is shareable.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin, RESEARCH_DOCUMENTS_BUCKET } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';

export const dynamic = 'force-dynamic';

interface DocRow {
  id: string;
  research_project_id: string | null;
  document_label: string | null;
  original_filename: string | null;
  document_type: string | null;
  storage_path: string | null;
  storage_url: string | null;
  pages_pdf_url: string | null;
  source_url: string | null;
  file_type: string | null;
  file_size_bytes: number | null;
  county_fips: string | null;
  shareable: boolean | null;
  provenance: string | null;
  recording_info: string | null;
}

function jobIdFrom(req: NextRequest): string | null {
  const parts = req.nextUrl.pathname.split('/jobs/')[1]?.split('/');
  return parts?.[0] || null;
}

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const jobId = jobIdFrom(req);
  if (!jobId) return NextResponse.json({ error: 'Job ID required' }, { status: 400 });

  const body = (await req.json().catch(() => ({}))) as { documentIds?: string[]; documentId?: string; section?: string };
  const ids = (body.documentIds ?? (body.documentId ? [body.documentId] : [])).filter(Boolean);
  if (ids.length === 0) return NextResponse.json({ error: 'documentId or documentIds is required' }, { status: 400 });

  const { data: job } = await supabaseAdmin
    .from('jobs').select('id, org_id').eq('id', jobId).is('deleted_at', null).maybeSingle();
  if (!job) return NextResponse.json({ error: 'That job no longer exists.' }, { status: 404 });

  // Which research projects belong to this job — both the modern join table and the legacy mirror,
  // because `research_project_jobs` is the source of truth but `research_projects.job_id` is still
  // written and older projects only have that.
  const [{ data: linkRows }, { data: legacyRows }] = await Promise.all([
    supabaseAdmin.from('research_project_jobs').select('research_project_id').eq('job_id', jobId),
    supabaseAdmin.from('research_projects').select('id').eq('job_id', jobId),
  ]);
  const ownProjects = new Set<string>([
    ...((linkRows ?? []) as unknown as Array<{ research_project_id: string }>).map((r) => r.research_project_id),
    ...((legacyRows ?? []) as unknown as Array<{ id: string }>).map((r) => r.id),
  ]);

  const { data: docs, error: docErr } = await supabaseAdmin
    .from('research_documents')
    .select('id, research_project_id, document_label, original_filename, document_type, storage_path, '
      + 'storage_url, pages_pdf_url, source_url, file_type, file_size_bytes, county_fips, shareable, '
      + 'provenance, recording_info')
    .in('id', ids);
  if (docErr) return NextResponse.json({ error: 'Could not read those documents', details: docErr.message }, { status: 500 });

  const attached: Array<{ id: string; label: string }> = [];
  const refused: Array<{ id: string; why: string }> = [];

  for (const raw of (docs ?? []) as unknown as DocRow[]) {
    const label = raw.document_label || raw.original_filename || 'Document';

    // A document from this job's own research is always allowed. One from elsewhere has to be
    // shareable — that is the case `shareable` exists for.
    const ownedByThisJob = raw.research_project_id ? ownProjects.has(raw.research_project_id) : false;
    if (!ownedByThisJob && raw.shareable !== true) {
      refused.push({
        id: raw.id,
        why: raw.provenance === 'customer_upload'
          ? `${label} is another customer's own file.`
          : `${label} was obtained for a different job and is not marked shareable.`,
      });
      continue;
    }

    if (!raw.storage_path && !raw.pages_pdf_url && !raw.storage_url) {
      refused.push({ id: raw.id, why: `${label} has no stored file yet — only a note of where it came from.` });
      continue;
    }

    const { data: already } = await supabaseAdmin
      .from('job_files')
      .select('id')
      .eq('job_id', jobId)
      .eq('storage_path', raw.storage_path ?? '')
      .is('is_deleted', null)
      .maybeSingle();
    if (already) { attached.push({ id: raw.id, label }); continue; }

    const { error } = await supabaseAdmin.from('job_files').insert({
      job_id: jobId,
      org_id: (job as { org_id?: string }).org_id ?? undefined,
      file_name: label,
      name: label,
      file_type: raw.document_type || 'other',
      section: body.section || 'research',
      // Pointing into the research bucket rather than copying: same document, one copy, and a
      // better scan filed later reaches the job without anyone re-attaching it.
      storage_path: raw.storage_path,
      storage_bucket: raw.storage_path ? RESEARCH_DOCUMENTS_BUCKET : null,
      file_url: raw.storage_path ? null : (raw.pages_pdf_url ?? raw.storage_url),
      content_type: raw.file_type === 'pdf' ? 'application/pdf' : null,
      mime_type: raw.file_type === 'pdf' ? 'application/pdf' : null,
      file_size: raw.file_size_bytes,
      file_size_bytes: raw.file_size_bytes,
      upload_state: 'done',
      uploaded_by: session.user.email,
      created_by: session.user.email,
      description: [
        raw.recording_info,
        raw.county_fips ? `${raw.county_fips} County records` : null,
        raw.source_url ? `Source: ${raw.source_url}` : null,
      ].filter(Boolean).join(' · ') || 'Attached from research',
    });
    if (error) refused.push({ id: raw.id, why: `${label}: ${error.message.slice(0, 90)}` });
    else attached.push({ id: raw.id, label });
  }

  const missing = ids.filter((id) => !attached.some((a) => a.id === id) && !refused.some((r) => r.id === id));
  for (const id of missing) refused.push({ id, why: 'No such document.' });

  return NextResponse.json({
    jobId,
    attached: attached.length,
    files: attached,
    refused,
    summary: attached.length === 0
      ? 'Nothing was attached.'
      : `${attached.length} document(s) added to the job's files${refused.length ? `; ${refused.length} refused` : ''}.`,
  });
}, { routeName: 'jobs/files/from-research' });

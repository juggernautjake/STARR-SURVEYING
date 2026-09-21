// app/api/admin/research/[projectId]/documents/from-job/route.ts
//
// Owner, 2026-09-20: the research button "should inherit all of the information for the job such as
// any documents, address, property id, customer name, etc".
//
// The address, the county and the owner ride along on the project row. Documents cannot: the
// pipeline reads `research_documents` where `source_type = 'user_upload'`, and a job's files live
// in `job_files`. Without this route the run starts having seen none of them — which is exactly the
// failure the pipeline route's own G1 comment describes, one table further back:
//
//     "An operator could upload the client's survey, watch it appear on the project, start the run,
//      and have the run never see it. Nothing failed — the file was stored, it just was not
//      research."
//
// ── WHY THE BYTES ARE COPIED AND NOT LINKED ─────────────────────────────────────────────────────
//
// The map attaches media by reference and is right to: `job_map_point_media.job_file_id` points at
// the file, and a point showing a photo that somebody deleted should lose the photo.
//
// A research document is the opposite. It gets OCR'd, extracted, analysed, quoted in a report and
// cited in a chain of title. It has to still be readable in a year, and it must not change under a
// finding that referenced it. Worse, the two buckets disagree about access: `research-documents` is
// public and read by URL, while `starr-field-files` is private and served through signed URLs that
// expire. A cross-bucket link would work on the day it was made and 404 afterwards.
//
// So: copy. A handful of PDFs per job, and the research document becomes self-contained.
//
// ── WHY PHOTOS AND VIDEOS ARE NOT THE DEFAULT ───────────────────────────────────────────────────
//
// Measured on this database, 2026-09-21: of 182 job files, 147 are photographs and video. Attaching
// all of them would hand the run 70 site photos to read, cost real money doing it, and bury the one
// deed that mattered. The caller chooses; the confirm screen ticks the documents and leaves the
// site media alone.

import { NextRequest, NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin, RESEARCH_DOCUMENTS_BUCKET } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';

/** Nobody needs a 400MB drone video inside a title search, and the copy would time out. */
const MAX_BYTES = 40 * 1024 * 1024;

/** How long the signed read URL for the SOURCE file needs to live. Seconds; only used in-request. */
const SOURCE_URL_SECONDS = 300;

function extensionOf(name: string): string {
  const m = /\.([A-Za-z0-9]{1,8})$/.exec(name ?? '');
  return m ? m[1]!.toLowerCase() : '';
}

export const POST = withErrorHandler(
  async (req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) => {
    const session = await auth();
    if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!isAdmin(session.user.roles)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const { projectId } = await params;
    const body = await req.json().catch(() => ({}));
    const jobId: unknown = body?.jobId;
    const ids: unknown = body?.jobFileIds;

    if (typeof jobId !== 'string' || !jobId) {
      return NextResponse.json({ error: 'jobId is required' }, { status: 400 });
    }
    const jobFileIds = Array.isArray(ids)
      ? [...new Set(ids.filter((i): i is string => typeof i === 'string' && i.length > 0))]
      : [];
    if (jobFileIds.length === 0) {
      // Not an error. "Attach nothing" is a legitimate choice on the confirm screen, and returning
      // 400 for it would make the happy path look like a failure.
      return NextResponse.json({ attached: 0, skipped: [], documents: [] });
    }

    // The project has to exist and the files have to belong to the job the caller named. Checked
    // rather than trusted: `projectId` comes from the URL and `jobFileIds` from a request body, and
    // without this a caller could copy any file in the database into a project they can see.
    const { data: project } = await supabaseAdmin
      .from('research_projects')
      .select('id')
      .eq('id', projectId)
      .maybeSingle();
    if (!project) return NextResponse.json({ error: 'No such research project' }, { status: 404 });

    const { data: files, error: filesErr } = await supabaseAdmin
      .from('job_files')
      .select('id, job_id, name, file_name, storage_path, storage_bucket, content_type, mime_type, file_size_bytes, file_size, label')
      .eq('job_id', jobId)
      .in('id', jobFileIds);

    if (filesErr) return NextResponse.json({ error: filesErr.message }, { status: 500 });

    const rows = (files ?? []) as Array<Record<string, unknown>>;
    const found = new Set(rows.map((f) => String(f.id)));
    const skipped: Array<{ id: string; name: string | null; why: string }> = [];

    for (const id of jobFileIds) {
      if (!found.has(id)) skipped.push({ id, name: null, why: 'not a file on this job' });
    }

    // Already attached? A second press of the button must not produce two copies of the same deed
    // for the run to read twice.
    //
    // Deduped on STORAGE PATH, not on the file name. The first version used the name, and real data
    // broke it immediately: job 26143 carries two different files both called "LANCE BLDG 14.pdf",
    // and the name test would have attached one and silently reported the other as a duplicate.
    // Two documents with the same name are ordinary in a survey job — pages scanned separately, a
    // revision saved beside its original — and dropping one of them is exactly the kind of quiet
    // loss that only shows up when somebody asks why a boundary call is missing.
    //
    // The destination path is derived from the job file's id, so it identifies the SOURCE file
    // rather than its label, and a genuine re-attach collides while two same-named files do not.
    const destPathFor = (fileId: string, ext: string) =>
      `${projectId}/from-job/${fileId}${ext ? `.${ext}` : ''}`;

    const { data: already } = await supabaseAdmin
      .from('research_documents')
      .select('storage_path')
      .eq('research_project_id', projectId)
      .eq('source_type', 'user_upload');
    const have = new Set(
      ((already ?? []) as Array<{ storage_path: string | null }>)
        .map((d) => d.storage_path)
        .filter((p): p is string => Boolean(p)),
    );

    const documents: Array<{ id: string; name: string }> = [];

    for (const f of rows) {
      const name = String(f.name ?? f.file_name ?? 'document');
      const bucket = String(f.storage_bucket ?? 'starr-field-files');
      const path = f.storage_path ? String(f.storage_path) : '';
      const size = Number(f.file_size_bytes ?? f.file_size ?? 0);
      const contentType = String(f.content_type ?? f.mime_type ?? '') || 'application/octet-stream';

      if (!path) { skipped.push({ id: String(f.id), name, why: 'the file has no storage path' }); continue; }
      if (size > MAX_BYTES) {
        skipped.push({ id: String(f.id), name, why: `larger than ${Math.round(MAX_BYTES / 1024 / 1024)}MB` });
        continue;
      }
      const ext = extensionOf(name);
      const destPath = destPathFor(String(f.id), ext);
      if (have.has(destPath)) {
        skipped.push({ id: String(f.id), name, why: 'already attached to this project' });
        continue;
      }

      try {
        // Sign, fetch, re-upload. `download()` would be one call fewer, but it returns a Blob in an
        // environment where the buffer conversion has bitten before; the signed fetch is the same
        // path `attachUploadedDocuments` uses at run time and is therefore the one already proven.
        const { data: signed, error: signErr } = await supabaseAdmin.storage
          .from(bucket)
          .createSignedUrl(path, SOURCE_URL_SECONDS);
        if (signErr || !signed?.signedUrl) throw new Error(signErr?.message ?? 'could not sign the source file');

        const res = await fetch(signed.signedUrl);
        if (!res.ok) throw new Error(`the source file could not be read (${res.status})`);
        const bytes = Buffer.from(await res.arrayBuffer());

        const { error: upErr } = await supabaseAdmin.storage
          .from(RESEARCH_DOCUMENTS_BUCKET)
          .upload(destPath, bytes, { contentType, upsert: true });
        if (upErr) throw new Error(upErr.message);

        const { data: urlData } = supabaseAdmin.storage
          .from(RESEARCH_DOCUMENTS_BUCKET)
          .getPublicUrl(destPath);

        const { data: doc, error: dbErr } = await supabaseAdmin
          .from('research_documents')
          .insert({
            research_project_id: projectId,
            // The pipeline route selects exactly this value. Anything else and the run does not see
            // the document, which is the whole bug this route exists to fix.
            source_type: 'user_upload',
            original_filename: name,
            file_type: ext || null,
            file_size_bytes: size || bytes.length,
            storage_path: destPath,
            storage_url: urlData?.publicUrl ?? null,
            document_label: String(f.label ?? name),
            processing_status: 'pending',
          })
          .select('id')
          .single();
        if (dbErr) throw new Error(dbErr.message);

        documents.push({ id: String(doc.id), name });
        have.add(destPath);
      } catch (e) {
        // One unreadable file must not lose the other nine. Each failure is named and returned, so
        // the caller can say "seven of nine attached" rather than implying everything arrived.
        skipped.push({ id: String(f.id), name, why: e instanceof Error ? e.message : 'could not be copied' });
      }
    }

    console.log(
      `[research/from-job] ${projectId}: attached ${documents.length} of ${jobFileIds.length} file(s) from job ${jobId}` +
      (skipped.length ? `; skipped ${skipped.length}` : ''),
    );

    return NextResponse.json({ attached: documents.length, documents, skipped });
  },
  { routeName: 'research-documents-from-job' },
);

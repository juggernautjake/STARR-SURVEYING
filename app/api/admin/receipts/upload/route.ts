// app/api/admin/receipts/upload/route.ts
//
// quick-actions-wiring-2026-06-22 — web-side receipt upload entry point.
// The mobile app uploads through `useCaptureReceipt` (RLS-scoped to the
// user's own session). The admin web side runs under next-auth and the
// service-role client, so the mobile path doesn't fit. This route:
//
//   1. Accepts a multipart POST: { file: File, jobId?: string, notes?: string }
//   2. Looks up the admin's auth.users.id from their next-auth email so
//      the `receipts.user_id NOT NULL REFERENCES auth.users` FK is satisfied.
//   3. Uploads the photo to the `starr-field-receipts` Supabase Storage
//      bucket at `{user_uuid}/{receipt_id}.{ext}` (matches the mobile
//      convention so worker AI-extraction picks it up the same way).
//   4. Inserts a `receipts` row in 'pending' status with
//      `extraction_status = 'queued'` so the worker picks it up.
//
// Returns { id, photo_url } on success.

import { NextRequest, NextResponse } from 'next/server';
import { normaliseImage, UnsupportedImageError } from '@/lib/media/normalise-image';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { resolveJobRef } from '@/lib/jobs/job-ref';

const RECEIPTS_BUCKET = 'starr-field-receipts';
const MAX_BYTES = 12 * 1024 * 1024; // 12 MiB — matches mobile downscale ceiling

/** Look up a user's auth.users.id by email. The bookkeeper-receipts
 *  routes use the same `listUsers` pattern; we mirror it here so a
 *  schema change is centralized. Returns null when the lookup fails. */
async function resolveUserIdByEmail(email: string): Promise<string | null> {
  try {
    const { data } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const match = data?.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    return match?.id ?? null;
  } catch {
    return null;
  }
}

function extFromMime(mime: string | null): string {
  switch ((mime ?? '').toLowerCase()) {
    case 'image/jpeg':
    case 'image/jpg':  return 'jpg';
    case 'image/png':  return 'png';
    case 'image/webp': return 'webp';
    case 'image/heic': return 'heic';
    case 'image/heif': return 'heif';
    case 'application/pdf': return 'pdf';
    default: return 'bin';
  }
}

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const form = await req.formData();
  const file = form.get('file');
  const jobIdRaw = form.get('jobId');
  const notesRaw = form.get('notes');

  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Missing file' }, { status: 400 });
  }
  if (file.size === 0) {
    return NextResponse.json({ error: 'Empty file' }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: `File too large (${file.size} > ${MAX_BYTES} bytes)` }, { status: 413 });
  }

  const userId = await resolveUserIdByEmail(session.user.email);
  if (!userId) {
    return NextResponse.json(
      { error: 'Your account is not provisioned in auth.users yet — ask an admin to invite you.' },
      { status: 422 },
    );
  }

  // ── RESOLVE THE JOB *BEFORE* TOUCHING STORAGE (2026-08-11) ────────────────────────────────────
  //
  // `jobId` used to be written straight into `receipts.job_id`, a UUID FK. The form that fed it
  // asked for a "Job number", so the value people actually typed — `24-103` — failed on INSERT with
  // `invalid input syntax for type uuid`, *after* the photo had been written to the bucket and
  // therefore after the rollback path had to run. The field only ever accepted a value nobody knows.
  //
  // Resolving first means: a job number works, a job name works, a picker's UUID works, and the one
  // case left over — a job that genuinely does not exist yet — gets an answer the client can act on
  // rather than a 500. `job_not_found` carries the reference and the near-misses so the UI can offer
  // to create it (owner, 2026-08-11: crews work a job before the office types it in).
  //
  // The check is ahead of the upload deliberately. Rejecting after the bytes are stored means either
  // a stranded object or a rollback that can itself fail; rejecting before means the phone still
  // holds the photo and the retry costs nothing.
  const jobRefRaw = typeof jobIdRaw === 'string' ? jobIdRaw.trim() : '';
  const jobResolution = await resolveJobRef(jobRefRaw);
  if (jobResolution.status === 'not_found') {
    return NextResponse.json(
      {
        error: `No job matches “${jobResolution.ref}”.`,
        code: 'job_not_found',
        ref: jobResolution.ref,
        suggestions: jobResolution.suggestions,
      },
      { status: 409 },
    );
  }
  const jobId = jobResolution.status === 'resolved' ? jobResolution.job.id : null;

  // Build the storage path the worker + bookkeeper UI both already know
  // how to read: `{user_uuid}/{receipt_id}.{ext}`.
  const receiptId = crypto.randomUUID();
  const raw = Buffer.from(await file.arrayBuffer());

  // ── NO HEIC REACHES THE BUCKET (2026-08-08) ───────────────────────────────────────────────────
  //
  // This route used to derive the extension from `file.type` and store the bytes untouched, so an
  // iPhone receipt landed as `.heic` — unreadable by the bookkeeper on Windows, and by plenty of the
  // tooling downstream. Owner: *"I do not want HEIC."*
  //
  // The decision is made from the BYTES, never `file.type`. iOS routinely reports a HEIC as
  // `image/jpeg` when "Most Compatible" is half configured, and browsers that do not know the format
  // send `application/octet-stream`. Trusting the header is how a HEIC gets stored under a `.jpg`
  // name, which is worse than an honest `.heic` because the file then lies about itself.
  //
  // PDFs pass through untouched — a scanned receipt is a legitimate PDF and is not an image problem.
  let bytes: Uint8Array = new Uint8Array(raw);
  let ext = extFromMime(file.type);
  let contentType = file.type || 'application/octet-stream';
  let converted = false;

  const isPdf = raw.length > 4 && raw[0] === 0x25 && raw[1] === 0x50 && raw[2] === 0x44 && raw[3] === 0x46;
  if (!isPdf) {
    try {
      const norm = await normaliseImage(raw);
      bytes = new Uint8Array(norm.bytes);
      ext = norm.extension.replace('.', '');
      contentType = norm.contentType;
      converted = norm.converted;
    } catch (err) {
      // Not a PDF and not an image we can read. Refuse with something actionable rather than
      // storing a file nobody will be able to open later.
      return NextResponse.json(
        {
          error:
            err instanceof UnsupportedImageError
              ? err.message
              : 'That file could not be read as a receipt image. Please upload a photo or a PDF.',
        },
        { status: 415 },
      );
    }
  }

  const path = `${userId}/${receiptId}.${ext}`;

  const { error: uploadErr } = await supabaseAdmin.storage
    .from(RECEIPTS_BUCKET)
    .upload(path, bytes, {
      contentType,
      upsert: false,
    });
  if (uploadErr) {
    return NextResponse.json(
      { error: `Storage upload failed: ${uploadErr.message}` },
      { status: 500 },
    );
  }

  const notes = typeof notesRaw === 'string' && notesRaw.trim().length > 0 ? notesRaw.trim() : null;

  const { data: inserted, error: insertErr } = await supabaseAdmin
    .from('receipts')
    .insert({
      id: receiptId,
      user_id: userId,
      job_id: jobId,
      notes,
      photo_url: path,
      status: 'pending',
      extraction_status: 'queued',
    })
    .select('id, photo_url')
    .single();

  if (insertErr) {
    // Roll back the storage upload so we don't strand the photo.
    await supabaseAdmin.storage.from(RECEIPTS_BUCKET).remove([path]).catch(() => null);
    return NextResponse.json(
      { error: `Receipt insert failed: ${insertErr.message}` },
      { status: 500 },
    );
  }

  // `converted` lets the UI say "your iPhone photo was converted to JPEG" rather than silently
  // changing the file. Somebody who uploads IMG_0042.HEIC and finds a .jpg later should have been
  // told, not left to wonder.
  return NextResponse.json({ receipt: inserted, converted });
}, { routeName: 'admin/receipts/upload' });

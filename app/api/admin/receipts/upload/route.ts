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
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';

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

  // Build the storage path the worker + bookkeeper UI both already know
  // how to read: `{user_uuid}/{receipt_id}.{ext}`.
  const receiptId = crypto.randomUUID();
  const ext = extFromMime(file.type);
  const path = `${userId}/${receiptId}.${ext}`;
  const bytes = new Uint8Array(await file.arrayBuffer());

  const { error: uploadErr } = await supabaseAdmin.storage
    .from(RECEIPTS_BUCKET)
    .upload(path, bytes, {
      contentType: file.type || 'application/octet-stream',
      upsert: false,
    });
  if (uploadErr) {
    return NextResponse.json(
      { error: `Storage upload failed: ${uploadErr.message}` },
      { status: 500 },
    );
  }

  const jobId = typeof jobIdRaw === 'string' && jobIdRaw.trim().length > 0 ? jobIdRaw.trim() : null;
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

  return NextResponse.json({ receipt: inserted });
}, { routeName: 'admin/receipts/upload' });

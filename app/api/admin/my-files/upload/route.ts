// app/api/admin/my-files/upload/route.ts — a signed URL for a My Files upload (2026-10-01).
//
// My Files used to read the whole file as base64 and POST it as JSON to /api/admin/my-files. The
// page promised 50 MB; Vercel refuses any function request body over 4.5 MB, and base64 adds a
// third — so every file over about 3.3 MB (one phone photo) was refused with a 413 the page showed
// as "Server 413", or as a network error when the platform closed the connection.
//
// Same three-step as the job files and the File Explorer: sign here → the browser PUTs the bytes
// straight to storage → POST /api/admin/my-files with `storage_path` to create the row. The bytes
// never pass through a function.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin, ensureStorageBucket } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { MY_FILES_BUCKET, MY_FILES_MAX_BYTES, myFilesStoragePath, checkMyFilesUpload } from '@/lib/files/my-files-upload';

export const runtime = 'nodejs';

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { name?: string; size_bytes?: number };
  const check = checkMyFilesUpload({ name: body.name, sizeBytes: body.size_bytes });
  if (!check.ok) return NextResponse.json({ error: check.error }, { status: check.status });

  await ensureStorageBucket(MY_FILES_BUCKET, { public: false, fileSizeLimit: MY_FILES_MAX_BYTES });
  const objectId = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const path = myFilesStoragePath(session.user.email, objectId, body.name as string);
  const { data, error } = await supabaseAdmin.storage.from(MY_FILES_BUCKET).createSignedUploadUrl(path);
  if (error || !data) return NextResponse.json({ error: error?.message ?? 'Could not start the upload.' }, { status: 500 });
  return NextResponse.json({ path: data.path, signed_url: data.signedUrl });
}, { routeName: 'admin/my-files/upload' });

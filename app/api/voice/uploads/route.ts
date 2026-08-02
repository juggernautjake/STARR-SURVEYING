// app/api/voice/uploads/route.ts — the public script-upload endpoint.
//
// A stranger can POST a file here. That is unavoidable — a client with a 12-page script is not going
// to paste it into a textarea — and it is the single most abusable surface on the platform, so the
// constraints are strict and stated.
//
// ── WHAT IS ALLOWED, AND WHY THE LIST IS SHORT ──────────────────────────────────────────────────
//
// Scripts and reference audio only. Not images (there is no reason to send Andrew a photo with a
// voice-over brief, and image parsers are a classic exploit surface), not archives (a zip is a way to
// smuggle anything past an extension check), not executables for obvious reasons.
//
// The extension AND the declared MIME type must both be on the list. Neither is trustworthy alone —
// a browser will happily send `script.pdf` with `application/octet-stream`, and a script can send any
// MIME it likes with any name — but requiring both agreement narrows what an attacker can express.
//
// ── WHY THE FILES ARE NOT SERVED PUBLICLY ───────────────────────────────────────────────────────
//
// The bucket is private and Andrew's studio fetches signed URLs. A public bucket would mean anyone
// who guessed a path could read another client's unreleased script — which for an advertising client
// under embargo is exactly the thing their legal team asked about.

import { NextResponse } from 'next/server';
import { supabaseAdmin, ensureStorageBucket } from '@/lib/supabase';

export const runtime = 'nodejs';
/** Comfortably above a long PDF script, well below anything that would stress a serverless body. */
export const maxDuration = 30;

const BUCKET = 'voice-uploads';
const MAX_BYTES = 15 * 1024 * 1024; // 15 MB
const MAX_FILES = 5;

const ALLOWED: { ext: string; mimes: string[] }[] = [
  { ext: 'pdf', mimes: ['application/pdf'] },
  { ext: 'txt', mimes: ['text/plain'] },
  { ext: 'rtf', mimes: ['application/rtf', 'text/rtf'] },
  { ext: 'doc', mimes: ['application/msword'] },
  { ext: 'docx', mimes: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'] },
  { ext: 'odt', mimes: ['application/vnd.oasis.opendocument.text'] },
  { ext: 'md', mimes: ['text/markdown', 'text/plain'] },
  { ext: 'csv', mimes: ['text/csv', 'text/plain'] },
  // Reference audio — "here is the read we liked". Common and genuinely useful.
  { ext: 'mp3', mimes: ['audio/mpeg', 'audio/mp3'] },
  { ext: 'wav', mimes: ['audio/wav', 'audio/x-wav', 'audio/wave'] },
  { ext: 'm4a', mimes: ['audio/mp4', 'audio/x-m4a'] },
];

export function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot === -1 ? '' : name.slice(dot + 1).toLowerCase();
}

/** Both the extension and the declared type must be on the list, and must agree with each other. */
export function fileTypeAllowed(name: string, mime: string): boolean {
  const ext = extensionOf(name);
  const entry = ALLOWED.find((a) => a.ext === ext);
  if (!entry) return false;
  // Some browsers send an empty type for less common extensions. Accept that rather than reject a
  // legitimate .rtf, since the extension already had to match.
  if (!mime) return true;
  return entry.mimes.includes(mime.toLowerCase());
}

/**
 * A storage-safe filename that keeps the original readable.
 *
 * The original name is preserved in the DB record; this only decides the PATH. Directory traversal
 * (`../../`), leading dots, and anything outside a conservative character set are removed — a
 * filename is attacker-controlled input and it is being used to build a path.
 */
export function safeStorageName(original: string): string {
  const ext = extensionOf(original);
  const stem = original
    .slice(0, original.length - (ext ? ext.length + 1 : 0))
    .replace(/[^a-zA-Z0-9._-]/g, '-')
    .replace(/^[.-]+/, '')
    .replace(/-+/g, '-')
    .slice(0, 60) || 'file';
  return ext ? `${stem}.${ext}` : stem;
}

export async function POST(request: Request): Promise<NextResponse> {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Bad request.' }, { status: 400 });
  }

  const files = form.getAll('files').filter((f): f is File => f instanceof File);
  if (!files.length) return NextResponse.json({ error: 'No file received.' }, { status: 400 });
  if (files.length > MAX_FILES) {
    return NextResponse.json({ error: `Up to ${MAX_FILES} files at a time.` }, { status: 400 });
  }

  await ensureStorageBucket(BUCKET, { public: false, fileSizeLimit: MAX_BYTES });

  const uploaded: Record<string, unknown>[] = [];

  for (const file of files) {
    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { error: `"${file.name}" is larger than 15 MB. Send a link instead, or split it.` },
        { status: 413 },
      );
    }
    if (file.size === 0) {
      return NextResponse.json({ error: `"${file.name}" is empty.` }, { status: 400 });
    }
    if (!fileTypeAllowed(file.name, file.type)) {
      return NextResponse.json(
        {
          error: `"${file.name}" is not a file type I can take. Scripts as PDF, Word, RTF or plain text; reference audio as MP3, WAV or M4A.`,
        },
        { status: 415 },
      );
    }

    // A random prefix per upload: two clients sending "script.pdf" must not collide, and the path
    // must not be guessable from the filename.
    const prefix = crypto.randomUUID();
    const path = `inquiries/${prefix}/${safeStorageName(file.name)}`;

    const { error } = await supabaseAdmin.storage.from(BUCKET).upload(path, file, {
      contentType: file.type || 'application/octet-stream',
      upsert: false,
    });

    if (error) {
      console.error('[voice/uploads] failed:', error.message);
      return NextResponse.json({ error: 'Could not store that file. Try again.' }, { status: 500 });
    }

    uploaded.push({
      name: file.name.slice(0, 200),
      storage_path: path,
      size_bytes: file.size,
      mime_type: file.type || null,
    });
  }

  return NextResponse.json({ files: uploaded });
}

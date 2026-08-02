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
//
// ── AND WHY IT IS THROTTLED ─────────────────────────────────────────────────────────────────────
//
// Added 2026-08-02 after `scripts/audit-route-auth.mjs` reported this as the one genuinely ungated
// write on the platform. Type, size and count caps bound a SINGLE request; nothing bounded how many
// requests. 5 files × 15 MB, repeated, is an unbounded bill on a storage-metered account belonging to
// someone who has not had his first invoice paid yet. Same two buckets the surveying contact form
// uses: a burst limit per IP, and a daily ceiling counted in MEGABYTES for the slow grind that never
// trips the burst one.

import { NextResponse } from 'next/server';
import { supabaseAdmin, ensureStorageBucket } from '@/lib/supabase';
import { enforceRateLimit } from '@/lib/rate-limit';
// The rules live in lib/ because a route file may export only its handlers and segment config —
// see lib/voice/slug.ts for the build error that taught us.
import {
  MAX_UPLOAD_BYTES,
  MAX_UPLOAD_FILES,
  fileTypeAllowed,
  safeStorageName,
} from '@/lib/voice/upload-rules';

export const runtime = 'nodejs';
/** Comfortably above a long PDF script, well below anything that would stress a serverless body. */
export const maxDuration = 30;

const BUCKET = 'voice-uploads';

function clientIpOf(request: Request): string {
  return (
    (request.headers.get('x-forwarded-for') || '').split(',')[0].trim() ||
    request.headers.get('x-real-ip') ||
    ''
  );
}

export async function POST(request: Request): Promise<NextResponse> {
  // Before the body is read, because reading a multipart body pulls the whole thing into memory —
  // throttling after that point still lets an abuser make us do the expensive part.
  const ip = clientIpOf(request);
  const burst = await enforceRateLimit('contact-form', null, { ip });
  if (burst) return burst;

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Bad request.' }, { status: 400 });
  }

  const files = form.getAll('files').filter((f): f is File => f instanceof File);
  if (!files.length) return NextResponse.json({ error: 'No file received.' }, { status: 400 });
  if (files.length > MAX_UPLOAD_FILES) {
    return NextResponse.json({ error: `Up to ${MAX_UPLOAD_FILES} files at a time.` }, { status: 400 });
  }

  // Necessarily after the body is read — the sizes are the thing being limited and they do not exist
  // until then. Acceptable because the burst limit above already bounds how often we get here.
  const megabytes = files.reduce((sum, f) => sum + (f.size || 0), 0) / (1024 * 1024);
  const overStorage = await enforceRateLimit('contact-storage-daily', null, { ip, cost: megabytes });
  if (overStorage) return overStorage;

  await ensureStorageBucket(BUCKET, { public: false, fileSizeLimit: MAX_UPLOAD_BYTES });

  const uploaded: Record<string, unknown>[] = [];

  for (const file of files) {
    if (file.size > MAX_UPLOAD_BYTES) {
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

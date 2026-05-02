// app/api/admin/maintenance/events/[id]/documents/upload-url/route.ts
//
// POST /api/admin/maintenance/events/[id]/documents/upload-url
//
// Phase F10.7-g-ii-δ — issues a Supabase Storage signed-upload
// URL so the browser can PUT bytes directly to the bucket without
// streaming through the Next.js serverless function (50 MB
// calibration PDFs would 413 a Vercel function body).
//
// Flow (mirrors the research-documents pattern in
// /api/admin/research/[projectId]/documents/upload-url):
//
//   1. Client POSTs filename + fileSize + fileType here.
//   2. We validate the parent event exists, sanity-check the
//      file, ensure the maintenance-documents bucket exists, and
//      return { signedUrl, storagePath, publicUrl }.
//   3. Client PUTs the file bytes to signedUrl.
//   4. Client POSTs metadata (with storage_url = publicUrl) to
//      the F10.7-d POST documents endpoint, which inserts the
//      maintenance_event_documents row. Splitting upload from
//      metadata-record means a network failure in step 3 leaves
//      no orphan DB rows; a stranded storage object is the only
//      cost (cheap to GC).
//
// Auth: admin / developer / equipment_manager (write).
// File-size cap: 50 MB (matches the bucket's default).

import { NextRequest, NextResponse } from 'next/server';

import { auth, isAdmin } from '@/lib/auth';
import {
  supabaseAdmin,
  MAINTENANCE_DOCUMENTS_BUCKET,
  ensureStorageBucket,
} from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';

export const maxDuration = 30;

const UUID_RE =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const MAX_FILE_BYTES = 50 * 1024 * 1024; // 50 MB
const MAX_FILENAME_LEN = 255;

function eventIdFromUrl(url: URL): string | null {
  // /api/admin/maintenance/events/[id]/documents/upload-url
  const segments = url.pathname.split('/').filter(Boolean);
  const eventsIdx = segments.indexOf('events');
  if (eventsIdx < 0) return null;
  const id = segments[eventsIdx + 1];
  if (!id || !UUID_RE.test(id)) return null;
  return id;
}

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userRoles = (session.user as { roles?: string[] } | undefined)
    ?.roles ?? [];
  if (
    !isAdmin(session.user.roles) &&
    !userRoles.includes('equipment_manager')
  ) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const url = new URL(req.url);
  const eventId = eventIdFromUrl(url);
  if (!eventId) {
    return NextResponse.json(
      { error: 'event id must be a UUID.' },
      { status: 400 }
    );
  }

  const body = (await req.json().catch(() => null)) as {
    filename?: unknown;
    fileSize?: unknown;
    fileType?: unknown;
  } | null;
  if (!body || typeof body !== 'object') {
    return NextResponse.json(
      { error: 'Body must be a JSON object.' },
      { status: 400 }
    );
  }

  // ── Validate filename ────────────────────────────────────────
  if (typeof body.filename !== 'string' || body.filename.trim().length === 0) {
    return NextResponse.json(
      { error: '`filename` is required.' },
      { status: 400 }
    );
  }
  const filename = body.filename.trim();
  if (filename.length > MAX_FILENAME_LEN) {
    return NextResponse.json(
      { error: `\`filename\` must be ≤ ${MAX_FILENAME_LEN} characters.` },
      { status: 400 }
    );
  }

  // ── Validate fileSize ────────────────────────────────────────
  let fileSize: number | null = null;
  if (body.fileSize !== undefined && body.fileSize !== null) {
    if (
      typeof body.fileSize !== 'number' ||
      !Number.isInteger(body.fileSize) ||
      body.fileSize < 0
    ) {
      return NextResponse.json(
        { error: '`fileSize` must be a non-negative integer when present.' },
        { status: 400 }
      );
    }
    if (body.fileSize > MAX_FILE_BYTES) {
      return NextResponse.json(
        {
          error:
            `File too large: ${(body.fileSize / 1024 / 1024).toFixed(1)} MB ` +
            `exceeds the ${MAX_FILE_BYTES / 1024 / 1024} MB cap.`,
        },
        { status: 413 }
      );
    }
    fileSize = body.fileSize;
  }

  // ── Validate parent event exists ─────────────────────────────
  const { data: parent, error: parentErr } = await supabaseAdmin
    .from('maintenance_events')
    .select('id')
    .eq('id', eventId)
    .maybeSingle();
  if (parentErr) {
    return NextResponse.json(
      { error: parentErr.message },
      { status: 500 }
    );
  }
  if (!parent) {
    return NextResponse.json(
      { error: 'Maintenance event not found.' },
      { status: 404 }
    );
  }

  // ── Build storage path + ensure bucket exists ────────────────
  const timestamp = Date.now();
  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
  const storagePath = `${eventId}/${timestamp}_${safeName}`;

  await ensureStorageBucket(MAINTENANCE_DOCUMENTS_BUCKET, {
    public: true,
    fileSizeLimit: MAX_FILE_BYTES,
  });

  const { data: signedData, error: signedError } = await supabaseAdmin.storage
    .from(MAINTENANCE_DOCUMENTS_BUCKET)
    .createSignedUploadUrl(storagePath);

  if (signedError || !signedData) {
    return NextResponse.json(
      {
        error: `Failed to create upload URL: ${signedError?.message ?? 'unknown error'}`,
      },
      { status: 500 }
    );
  }

  const { data: publicUrlData } = supabaseAdmin.storage
    .from(MAINTENANCE_DOCUMENTS_BUCKET)
    .getPublicUrl(storagePath);

  console.log('[admin/maintenance/events/:id/documents/upload-url] ok', {
    event_id: eventId,
    storage_path: storagePath,
    file_size: fileSize,
    actor_email: session.user.email,
  });

  return NextResponse.json({
    signedUrl: signedData.signedUrl,
    storagePath,
    publicUrl: publicUrlData?.publicUrl ?? '',
  });
}, { routeName: 'admin/maintenance/events/:id/documents/upload-url' });

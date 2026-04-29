// app/api/admin/equipment/[id]/photo/route.ts
//
// POST /api/admin/equipment/{id}/photo
//
// Photo upload endpoint — companion to seeds/238 photo_url +
// seeds/243 storage bucket. Equipment Manager picks an image (cage
// snapshot, vendor product photo, damage record) and the endpoint:
//
//   1. Streams the file from the multipart form into the
//      `starr-field-equipment-photos` bucket at
//      `{equipment_id}/photo.{ext}` (replacing any prior upload —
//      seeds/243 path convention supports multiple photos per unit
//      via different filenames; v1 standardises on `photo.<ext>`
//      so the catalogue thumbnail has a stable resolver).
//   2. Updates `equipment_inventory.photo_url` to the new path.
//   3. Returns a fresh 60-minute signed URL so the Add/Edit
//      modal can preview the upload immediately without waiting
//      on the catalogue refetch.
//
// Body: multipart/form-data with a single `file` field.
// Constraints (mirrors the seeds/243 bucket config):
//   * MIME types: image/jpeg | png | heic | heif | webp
//   * Size: ≤10 MB
//
// Auth: admin / developer / equipment_manager. tech_support
// read-only; other roles forbidden.

import { NextRequest, NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';

const BUCKET = 'starr-field-equipment-photos';
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB
const SIGNED_URL_TTL_SECONDS = 60 * 60; // 1h

const ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/heic',
  'image/heif',
  'image/webp',
]);

const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/heic': 'heic',
  'image/heif': 'heif',
  'image/webp': 'webp',
};

const UUID_RE =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

export const POST = withErrorHandler(
  async (req: NextRequest) => {
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

    // Pull `[id]` from URL pathname — same parser as the other
    // [id]-scoped routes. Path is /api/admin/equipment/[id]/photo;
    // id is at -2.
    const url = new URL(req.url);
    const pathSegments = url.pathname.split('/').filter(Boolean);
    const id = pathSegments[pathSegments.length - 2];
    if (!id || !UUID_RE.test(id)) {
      return NextResponse.json(
        { error: 'id must be a UUID' },
        { status: 400 }
      );
    }

    // Parse multipart body. Next.js App Router supports req.formData()
    // natively; the runtime caps body size at the deployment level
    // (Vercel default ~4.5 MB serverless / configurable). For 10 MB
    // images the route will need a Vercel function size override —
    // documented as an operator step in the activation note.
    let formData: FormData;
    try {
      formData = await req.formData();
    } catch (err) {
      return NextResponse.json(
        {
          error:
            'Failed to parse multipart body. Use Content-Type: multipart/form-data with a `file` field.',
          details: err instanceof Error ? err.message : String(err),
        },
        { status: 400 }
      );
    }

    const file = formData.get('file');
    if (!file || typeof file === 'string') {
      return NextResponse.json(
        { error: 'Missing `file` field in form-data body' },
        { status: 400 }
      );
    }

    // file is a File / Blob in this branch. Read MIME + size from
    // the metadata; reject before reading bytes if either is wrong.
    const mimeType = (file.type || '').toLowerCase();
    if (!ALLOWED_MIME.has(mimeType)) {
      return NextResponse.json(
        {
          error: `MIME type "${mimeType || 'unknown'}" not allowed. Use: ${Array.from(ALLOWED_MIME).join(', ')}`,
        },
        { status: 415 }
      );
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        {
          error: `File too large (${file.size} bytes). Max ${MAX_BYTES} bytes (10 MB).`,
        },
        { status: 413 }
      );
    }
    if (file.size === 0) {
      return NextResponse.json(
        { error: 'File is empty' },
        { status: 400 }
      );
    }

    // Confirm the equipment row exists before uploading — avoids
    // orphaned objects in the bucket if the operator passes a
    // bad UUID.
    const { data: existing, error: existingErr } = await supabaseAdmin
      .from('equipment_inventory')
      .select('id, photo_url')
      .eq('id', id)
      .maybeSingle();
    if (existingErr) {
      console.error('[admin/equipment/:id/photo] row check failed', {
        id,
        error: existingErr.message,
      });
      return NextResponse.json(
        { error: existingErr.message },
        { status: 500 }
      );
    }
    if (!existing) {
      return NextResponse.json(
        { error: 'Equipment row not found' },
        { status: 404 }
      );
    }

    const ext = MIME_TO_EXT[mimeType] ?? 'jpg';
    const path = `${id}/photo.${ext}`;

    // Read the bytes once and pipe to Supabase Storage. We use
    // upsert: true so re-uploads replace the existing object;
    // the seeds/243 path convention permits additional photos
    // under different filenames in future polish work.
    const arrayBuffer = await file.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);

    const { error: uploadErr } = await supabaseAdmin.storage
      .from(BUCKET)
      .upload(path, bytes, {
        contentType: mimeType,
        upsert: true,
        cacheControl: '3600',
      });
    if (uploadErr) {
      console.error('[admin/equipment/:id/photo] upload failed', {
        id,
        path,
        error: uploadErr.message,
      });
      return NextResponse.json(
        { error: `Storage upload failed: ${uploadErr.message}` },
        { status: 500 }
      );
    }

    // If the previous photo had a different extension (e.g. user
    // replaces a .heic with a .jpg), delete the orphan so the
    // bucket stays clean. Tolerant — log but don't fail the
    // upload on cleanup error.
    const prior = (existing as { photo_url: string | null }).photo_url;
    if (prior && prior !== path) {
      const { error: rmErr } = await supabaseAdmin.storage
        .from(BUCKET)
        .remove([prior]);
      if (rmErr) {
        console.warn(
          '[admin/equipment/:id/photo] orphan cleanup failed',
          { id, prior, error: rmErr.message }
        );
      }
    }

    // Update the row's photo_url + updated_at.
    const nowIso = new Date().toISOString();
    const { error: updateErr } = await supabaseAdmin
      .from('equipment_inventory')
      .update({ photo_url: path, updated_at: nowIso })
      .eq('id', id);
    if (updateErr) {
      // Roll back the bucket object so we don't leave the row
      // pointing at a path that doesn't exist (or worse, the
      // row's old path orphaned alongside the new one).
      await supabaseAdmin.storage.from(BUCKET).remove([path]);
      console.error('[admin/equipment/:id/photo] db update failed', {
        id,
        error: updateErr.message,
      });
      return NextResponse.json(
        { error: `Database update failed (storage rolled back): ${updateErr.message}` },
        { status: 500 }
      );
    }

    // Sign a fresh URL for immediate display in the Add/Edit
    // modal. 1 hour TTL is plenty for a single edit session;
    // subsequent page renders re-sign on demand.
    const { data: signed, error: signErr } = await supabaseAdmin.storage
      .from(BUCKET)
      .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
    if (signErr) {
      // Non-fatal — the upload succeeded; the page can re-sign
      // later. Surface the path so the caller can retry signing.
      console.warn(
        '[admin/equipment/:id/photo] signed-url creation failed',
        { id, path, error: signErr.message }
      );
    }

    console.log('[admin/equipment/:id/photo] uploaded', {
      id,
      path,
      bytes: file.size,
      mime: mimeType,
      admin_email: session.user.email,
    });

    return NextResponse.json({
      photo_url: path,
      signed_url: signed?.signedUrl ?? null,
      expires_in: signed ? SIGNED_URL_TTL_SECONDS : null,
    });
  },
  { routeName: 'admin/equipment/:id/photo' }
);

// app/api/admin/vehicles/[id]/photos/route.ts
//
// vehicle-details-and-photos-2026-06-22 — gallery CRUD for a single
// vehicle:
//   GET    → list of { id, photo_path, signed_url, caption, uploaded_by, uploaded_at }
//   POST   → multipart upload: file (image), caption?
//   DELETE → ?photoId= soft-removes the row + best-effort drops the
//            storage object.
//
// Storage bucket: `vehicle-photos`. Object path is
// `{vehicle_id}/{uuid}.{ext}` so listing by prefix is cheap and the
// DB row is self-describing.

import { NextRequest, NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';

const BUCKET = 'vehicle-photos';
const MAX_BYTES = 12 * 1024 * 1024;
const SIGNED_URL_TTL_SEC = 60 * 60;

interface VehiclePhotoRow {
  id: string;
  vehicle_id: string;
  photo_path: string;
  caption: string | null;
  uploaded_by: string | null;
  uploaded_at: string;
}

async function authorize(): Promise<{ ok: true; email: string; isAdmin: boolean } | { ok: false; res: NextResponse }> {
  const session = await auth();
  if (!session?.user?.email) {
    return { ok: false, res: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }
  const userRoles = (session.user as { roles?: string[] } | undefined)?.roles ?? [];
  const admin = isAdmin(session.user.roles);
  if (!admin && !userRoles.includes('tech_support')) {
    return { ok: false, res: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }
  return { ok: true, email: session.user.email, isAdmin: admin };
}

function extFromMime(mime: string | null): string {
  switch ((mime ?? '').toLowerCase()) {
    case 'image/jpeg':
    case 'image/jpg':  return 'jpg';
    case 'image/png':  return 'png';
    case 'image/webp': return 'webp';
    case 'image/heic': return 'heic';
    case 'image/heif': return 'heif';
    default: return 'bin';
  }
}

function vehicleIdFromUrl(req: NextRequest): string | null {
  // URL shape: /api/admin/vehicles/{id}/photos — parse the segment
  // before "photos" so it matches the existing receipts/[id] convention.
  const parts = new URL(req.url).pathname.split('/').filter(Boolean);
  const idx = parts.lastIndexOf('photos');
  if (idx < 1) return null;
  return parts[idx - 1] ?? null;
}

export const GET = withErrorHandler(async (req: NextRequest) => {
  const guard = await authorize();
  if (!guard.ok) return guard.res;
  const id = vehicleIdFromUrl(req);
  if (!id) return NextResponse.json({ error: 'vehicle id required' }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from('vehicle_photos')
    .select('*')
    .eq('vehicle_id', id)
    .order('uploaded_at', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const photos = (data ?? []) as VehiclePhotoRow[];
  const decorated = await Promise.all(photos.map(async (p) => {
    const { data: signed } = await supabaseAdmin.storage
      .from(BUCKET)
      .createSignedUrl(p.photo_path, SIGNED_URL_TTL_SEC);
    return { ...p, signed_url: signed?.signedUrl ?? null };
  }));
  return NextResponse.json({ photos: decorated });
}, { routeName: 'admin/vehicles/photos.get' });

export const POST = withErrorHandler(async (req: NextRequest) => {
  const guard = await authorize();
  if (!guard.ok) return guard.res;
  if (!guard.isAdmin) {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }
  const id = vehicleIdFromUrl(req);
  if (!id) return NextResponse.json({ error: 'vehicle id required' }, { status: 400 });

  // Confirm the vehicle exists so we don't strand an orphan photo.
  const { data: vehicle } = await supabaseAdmin
    .from('vehicles')
    .select('id, primary_photo_path')
    .eq('id', id)
    .single();
  if (!vehicle) return NextResponse.json({ error: 'Vehicle not found' }, { status: 404 });

  const form = await req.formData();
  const file = form.get('file');
  const captionRaw = form.get('caption');
  const makePrimary = form.get('make_primary') === '1';

  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Missing file' }, { status: 400 });
  }
  if (file.size === 0) {
    return NextResponse.json({ error: 'Empty file' }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: `File too large (${file.size} > ${MAX_BYTES} bytes)` },
      { status: 413 },
    );
  }
  if (!file.type.startsWith('image/')) {
    return NextResponse.json({ error: 'Only image files are allowed' }, { status: 415 });
  }

  const photoId = crypto.randomUUID();
  const ext = extFromMime(file.type);
  const path = `${id}/${photoId}.${ext}`;
  const bytes = new Uint8Array(await file.arrayBuffer());

  const { error: uploadErr } = await supabaseAdmin.storage
    .from(BUCKET)
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

  const caption = typeof captionRaw === 'string' && captionRaw.trim().length > 0
    ? captionRaw.trim()
    : null;

  const { data: inserted, error: insertErr } = await supabaseAdmin
    .from('vehicle_photos')
    .insert({
      id: photoId,
      vehicle_id: id,
      photo_path: path,
      caption,
      uploaded_by: guard.email,
    })
    .select()
    .single();
  if (insertErr) {
    // Roll back storage so we don't strand the blob.
    await supabaseAdmin.storage.from(BUCKET).remove([path]).catch(() => null);
    return NextResponse.json(
      { error: `Photo insert failed: ${insertErr.message}` },
      { status: 500 },
    );
  }

  // If asked, OR if this is the vehicle's first photo, promote it to
  // the primary so the list-grid thumbnail is always populated.
  if (makePrimary || !vehicle.primary_photo_path) {
    await supabaseAdmin
      .from('vehicles')
      .update({ primary_photo_path: path, updated_at: new Date().toISOString() })
      .eq('id', id);
  }

  const { data: signed } = await supabaseAdmin.storage
    .from(BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_SEC);

  return NextResponse.json({
    photo: { ...(inserted as VehiclePhotoRow), signed_url: signed?.signedUrl ?? null },
  }, { status: 201 });
}, { routeName: 'admin/vehicles/photos.post' });

export const DELETE = withErrorHandler(async (req: NextRequest) => {
  const guard = await authorize();
  if (!guard.ok) return guard.res;
  if (!guard.isAdmin) {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }
  const id = vehicleIdFromUrl(req);
  const photoId = new URL(req.url).searchParams.get('photoId');
  if (!id || !photoId) {
    return NextResponse.json({ error: 'vehicle id + photoId required' }, { status: 400 });
  }

  const { data: photo } = await supabaseAdmin
    .from('vehicle_photos')
    .select('*')
    .eq('id', photoId)
    .eq('vehicle_id', id)
    .single();
  if (!photo) return NextResponse.json({ error: 'Photo not found' }, { status: 404 });

  const { error: delErr } = await supabaseAdmin
    .from('vehicle_photos')
    .delete()
    .eq('id', photoId);
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });

  // Best-effort — if the storage delete fails we still cleared the
  // row so the gallery shows the photo as gone.
  await supabaseAdmin.storage.from(BUCKET).remove([photo.photo_path]).catch(() => null);

  // If this was the primary photo, clear that pointer too.
  const { data: vehicle } = await supabaseAdmin
    .from('vehicles')
    .select('primary_photo_path')
    .eq('id', id)
    .single();
  if (vehicle?.primary_photo_path === photo.photo_path) {
    await supabaseAdmin
      .from('vehicles')
      .update({ primary_photo_path: null, updated_at: new Date().toISOString() })
      .eq('id', id);
  }

  return NextResponse.json({ ok: true });
}, { routeName: 'admin/vehicles/photos.delete' });

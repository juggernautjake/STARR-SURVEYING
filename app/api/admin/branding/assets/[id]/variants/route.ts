// app/api/admin/branding/assets/[id]/variants/route.ts
//
//   POST /api/admin/branding/assets/{id}/variants
//
// Adds a resolution variation, by either of the two routes somebody actually has one:
//
//   * **Generated** — `width=1024`. The server resizes the original. This is the common case and
//     the reason the endpoint exists: nobody wants to open an image editor seven times to produce a
//     size ladder.
//   * **Uploaded** — a `file` field. For a variation that is not a resize: a one-colour version, a
//     version with the tagline removed, a hand-tuned small size where the strokes were thickened so
//     they survive. `source` records which it was, because a generated 4096px and a redrawn 4096px
//     are not interchangeable.
//
// ── UPSCALING IS REFUSED, NOT CLAMPED ───────────────────────────────────────────────────────────
//
// A 700px original asked for at 4096px comes back as a bigger file carrying no more detail.
// `withoutEnlargement` would silently return 700px under a label that says 4096 — which is worse
// than refusing, because somebody takes that file to a sign shop believing it is what the label
// says. So the request is refused with the number that IS available.

import { NextRequest, NextResponse } from 'next/server';
import sharp from 'sharp';

import { auth } from '@/lib/auth';
import { supabaseAdmin, ensureStorageBucket } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import {
  ACCEPTED_MIME, BRAND_UPLOAD_MAX_BYTES, isResizable, humanBytes, VARIANT_SIZES,
} from '@/lib/branding/uploads';
import { BRAND_BUCKET, mayManageBrandAssets, getAsset } from '@/lib/branding/asset-store';

export const maxDuration = 60;

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/** The route is …/assets/[id]/variants, so the id is the second-to-last segment. */
function idFrom(req: NextRequest): string | null {
  const seg = new URL(req.url).pathname.split('/').filter(Boolean);
  const id = seg[seg.length - 2];
  return id && UUID_RE.test(id) ? id : null;
}

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!mayManageBrandAssets(session.user.roles)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const assetId = idFrom(req);
  if (!assetId) return NextResponse.json({ error: 'id must be a UUID' }, { status: 400 });

  const { data: row, error: rowErr } = await supabaseAdmin
    .from('brand_assets').select('storage_path, file_type, width, name').eq('id', assetId).maybeSingle();
  if (rowErr) return NextResponse.json({ error: rowErr.message }, { status: 500 });
  if (!row) return NextResponse.json({ error: 'No such asset' }, { status: 404 });
  const asset = row as { storage_path: string; file_type: string; width: number | null; name: string };

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Expected a multipart body.' }, { status: 400 });
  }

  const supplied = form.get('file');
  const widthRaw = form.get('width');
  const label = String(form.get('label') ?? '').trim();

  await ensureStorageBucket(BRAND_BUCKET, { public: false });
  const variantId = crypto.randomUUID();

  // ── path one: a file somebody made ───────────────────────────────────────────────────────────
  if (supplied instanceof File && supplied.size > 0) {
    if (supplied.size > BRAND_UPLOAD_MAX_BYTES) {
      return NextResponse.json({
        error: `That file is ${humanBytes(supplied.size)}. The limit is ${humanBytes(BRAND_UPLOAD_MAX_BYTES)}.`,
      }, { status: 400 });
    }
    const mime = (supplied.type || '').toLowerCase();
    const ext = ACCEPTED_MIME[mime];
    if (!ext) {
      return NextResponse.json({ error: `${mime || 'That file type'} is not accepted here.` }, { status: 400 });
    }

    const buffer = Buffer.from(await supplied.arrayBuffer());
    let w: number | null = null, h: number | null = null;
    if (isResizable(mime)) {
      try { const m = await sharp(buffer).metadata(); w = m.width ?? null; h = m.height ?? null; } catch { /* unmeasurable */ }
    }

    const key = `${assetId}/${variantId}.${ext}`;
    const { error: upErr } = await supabaseAdmin.storage
      .from(BRAND_BUCKET).upload(key, buffer, { contentType: mime, upsert: true });
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

    const finalLabel = label || (w ? `${w}px` : supplied.name);
    const { error } = await supabaseAdmin.from('brand_asset_variants').insert({
      id: variantId, asset_id: assetId, label: finalLabel, storage_path: key,
      file_type: mime, width: w, height: h, bytes: buffer.byteLength,
      is_original: false, source: 'upload',
    });
    if (error) {
      await supabaseAdmin.storage.from(BRAND_BUCKET).remove([key]).catch(() => {});
      // The one constraint a person can trip from the UI, so it gets a sentence rather than the
      // Postgres text: two variants of one asset may not share a label.
      const msg = /brand_asset_variants_label_unique/.test(error.message)
        ? `This asset already has a variation called "${finalLabel}".`
        : error.message;
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    return NextResponse.json({ asset: await getAsset(assetId) }, { status: 201 });
  }

  // ── path two: resize the original ────────────────────────────────────────────────────────────
  const width = Number(widthRaw);
  if (!Number.isFinite(width) || width <= 0) {
    return NextResponse.json({
      error: 'Send either a file, or a width to generate from the original.',
    }, { status: 400 });
  }
  if (!VARIANT_SIZES.some((s) => s.width === width)) {
    return NextResponse.json({
      error: `${width}px is not one of the offered sizes (${VARIANT_SIZES.map((s) => s.width).join(', ')}).`,
    }, { status: 400 });
  }
  if (!isResizable(asset.file_type)) {
    return NextResponse.json({
      error: `${asset.file_type} cannot be resized on the server. Upload the variation as a file instead.`,
    }, { status: 400 });
  }
  if (asset.width && width > asset.width) {
    return NextResponse.json({
      error: `The original is ${asset.width}px wide, so a ${width}px version would be an upscale — `
        + 'a larger file with no more detail in it. The largest honest size here is '
        + `${VARIANT_SIZES.filter((s) => s.width <= asset.width!)[0]?.width ?? asset.width}px.`,
    }, { status: 400 });
  }

  const { data: blob, error: dlErr } = await supabaseAdmin.storage
    .from(BRAND_BUCKET).download(asset.storage_path);
  if (dlErr || !blob) {
    return NextResponse.json({ error: `The original could not be read: ${dlErr?.message ?? 'missing'}` }, { status: 500 });
  }

  const source = Buffer.from(await blob.arrayBuffer());
  const isJpeg = asset.file_type === 'image/jpeg';
  // `fit: 'inside'` preserves the aspect ratio and bounds BOTH axes, so a wide banner asked for at
  // 1024 comes back 1024 wide rather than 1024 tall.
  const pipeline = sharp(source).resize(width, width, { fit: 'inside', withoutEnlargement: true });
  const out = await (isJpeg ? pipeline.jpeg({ quality: 90 }) : pipeline.png({ compressionLevel: 9 })).toBuffer();
  const meta = await sharp(out).metadata();

  const ext = isJpeg ? 'jpg' : 'png';
  const key = `${assetId}/${variantId}.${ext}`;
  const contentType = isJpeg ? 'image/jpeg' : 'image/png';

  const { error: upErr } = await supabaseAdmin.storage
    .from(BRAND_BUCKET).upload(key, out, { contentType, upsert: true });
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  const finalLabel = label || `${width}px`;
  const { error } = await supabaseAdmin.from('brand_asset_variants').insert({
    id: variantId, asset_id: assetId, label: finalLabel, storage_path: key,
    file_type: contentType, width: meta.width ?? width, height: meta.height ?? null,
    bytes: out.byteLength, is_original: false, source: 'generated',
  });
  if (error) {
    await supabaseAdmin.storage.from(BRAND_BUCKET).remove([key]).catch(() => {});
    const msg = /brand_asset_variants_label_unique/.test(error.message)
      ? `This asset already has a variation called "${finalLabel}".`
      : error.message;
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  return NextResponse.json({ asset: await getAsset(assetId) }, { status: 201 });
}, { routeName: 'admin/branding/assets/[id]/variants#post' });

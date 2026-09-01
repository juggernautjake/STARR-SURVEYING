// app/api/admin/branding/assets/route.ts
//
//   GET  /api/admin/branding/assets            → the uploaded library, with every variant
//   POST /api/admin/branding/assets            → add a design
//
// ── ONE ENDPOINT, TWO PATHS ─────────────────────────────────────────────────────────────────────
//
// Owner: *"when uploading, we can just upload the image, or we can fill out all of the color and
// font and use case and description information."*
//
// Both paths are this POST. The difference is which form fields are present, and the only field
// that is ever required is the file — a missing name falls back to the filename with its extension
// stripped, so "just upload the image" is genuinely one action and not a form with one box on it.
//
// The alternative would have been two endpoints, or a required `name`. Both make the quick path
// slower than dragging a file onto a page, which is the thing being asked for.
//
// ── THE ORIGINAL IS A VARIANT ───────────────────────────────────────────────────────────────────
//
// Every upload creates a `brand_assets` row AND a `brand_asset_variants` row with
// `is_original = true`. It costs one insert and it means "the biggest file" is a query rather than
// a branch that every consumer has to remember. See seeds/622.

import { NextRequest, NextResponse } from 'next/server';
import sharp from 'sharp';

import { auth } from '@/lib/auth';
import { supabaseAdmin, ensureStorageBucket } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import {
  ACCEPTED_MIME, BRAND_UPLOAD_MAX_BYTES, isResizable, isUploadKind, isUploadPlate, isUploadStatus,
  slugify, validateProfile, humanBytes,
} from '@/lib/branding/uploads';
import {
  BRAND_BUCKET, mayManageBrandAssets, listAssets, getAsset, uniqueSlug,
} from '@/lib/branding/asset-store';

// A 25 MB upload plus a sharp probe is comfortably inside this; the default 10s is not, on a cold
// start with a large PNG.
export const maxDuration = 60;

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!mayManageBrandAssets(session.user.roles)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const includeArchived = req.nextUrl.searchParams.get('archived') === '1';
  return NextResponse.json({ assets: await listAssets({ includeArchived }) });
}, { routeName: 'admin/branding/assets#get' });

/** A form value as a trimmed string, or undefined when it was not sent at all. */
function str(form: FormData, key: string): string | undefined {
  const v = form.get(key);
  if (v === null) return undefined;
  return String(v).trim();
}

/**
 * A repeated field as a list.
 *
 * The form sends `useCases` once per line rather than a JSON blob, because a JSON string inside a
 * multipart field is a second encoding to get wrong and it cannot be read in a network panel.
 * Blank lines are dropped here rather than rejected — a trailing empty box in a list editor is
 * somebody having pressed "add" once more, not an error worth a message.
 */
function list(form: FormData, key: string): string[] {
  return form.getAll(key).map((v) => String(v).trim()).filter(Boolean);
}

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!mayManageBrandAssets(session.user.roles)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Expected a multipart upload.' }, { status: 400 });
  }

  const file = form.get('file');
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: 'A file is required.' }, { status: 400 });
  }
  if (file.size > BRAND_UPLOAD_MAX_BYTES) {
    return NextResponse.json({
      error: `That file is ${humanBytes(file.size)}. The limit is ${humanBytes(BRAND_UPLOAD_MAX_BYTES)}.`,
    }, { status: 400 });
  }

  // The MIME check is against the same list the file input's `accept` is built from, and that list
  // is a subset of the bucket's allowlist (seeds/622). Refusing here rather than at the bucket is
  // the difference between a sentence and a storage error nobody can act on.
  const mime = (file.type || '').toLowerCase();
  const ext = ACCEPTED_MIME[mime];
  if (!ext) {
    return NextResponse.json({
      error: mime
        ? `${mime} is not an image type this library accepts. Send PNG, JPEG, WebP, GIF, SVG or PDF.`
        : 'The browser did not say what type that file is. Try a PNG or JPEG.',
    }, { status: 400 });
  }

  // ── the profile, which may be entirely absent ────────────────────────────────────────────────
  //
  // The filename minus its extension is the fallback name. It is nearly always what somebody would
  // have typed, and it is always better than "Untitled".
  const name = str(form, 'name') || file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim() || 'Untitled design';
  const kindRaw = str(form, 'kind');
  const plateRaw = str(form, 'plate');
  const statusRaw = str(form, 'status');

  const profile = {
    name,
    kind: kindRaw,
    plate: plateRaw,
    status: statusRaw,
    note: str(form, 'note'),
    description: str(form, 'description'),
    useCases: list(form, 'useCases'),
    avoid: list(form, 'avoid'),
    colours: list(form, 'colours'),
    fonts: list(form, 'fonts'),
    minSize: str(form, 'minSize'),
  };

  // Server-side, not only in the form. The form is a courtesy; this is the constraint.
  const problems = validateProfile(profile);
  if (problems.length > 0) {
    return NextResponse.json({ error: problems[0]!.message, problems }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  // ── measure it ───────────────────────────────────────────────────────────────────────────────
  //
  // The dimensions decide which ladder rungs the UI may offer, so getting them wrong means offering
  // an upscale. Best-effort: an SVG or PDF has no pixel size, and a corrupt raster should still be
  // storable — a file that fails to probe is not a file that fails to upload.
  let width: number | null = null;
  let height: number | null = null;
  if (isResizable(mime)) {
    try {
      const meta = await sharp(buffer).metadata();
      width = meta.width ?? null;
      height = meta.height ?? null;
    } catch {
      // Left null. `offeredSizes(null)` returns null and the UI shows the upload path instead of a
      // ladder, which is the correct behaviour for a file we could not measure.
    }
  }

  const slug = await uniqueSlug(slugify(name));
  const assetId = crypto.randomUUID();
  const key = `${assetId}/original.${ext}`;

  await ensureStorageBucket(BRAND_BUCKET, { public: false });
  const { error: upErr } = await supabaseAdmin.storage
    .from(BRAND_BUCKET)
    .upload(key, buffer, { contentType: mime, upsert: true });
  if (upErr) {
    return NextResponse.json({ error: `The file could not be stored: ${upErr.message}` }, { status: 500 });
  }

  const { error: insErr } = await supabaseAdmin.from('brand_assets').insert({
    id: assetId,
    slug,
    name,
    kind: isUploadKind(kindRaw) ? kindRaw : 'other',
    note: profile.note || null,
    description: profile.description || null,
    use_cases: profile.useCases,
    avoid: profile.avoid,
    colours: profile.colours,
    fonts: profile.fonts,
    min_size: profile.minSize || null,
    plate: isUploadPlate(plateRaw) ? plateRaw : 'white',
    storage_path: key,
    file_type: mime,
    original_filename: file.name,
    width,
    height,
    bytes: file.size,
    status: isUploadStatus(statusRaw) ? statusRaw : 'approved',
    created_by: session.user.email,
  });

  if (insErr) {
    // The row failed after the bytes landed. Removing the orphan matters more than it looks:
    // storage has no foreign key, so a file with no row is invisible to every screen and still
    // counts against the bucket forever.
    await supabaseAdmin.storage.from(BRAND_BUCKET).remove([key]).catch(() => {});
    return NextResponse.json({ error: insErr.message }, { status: 500 });
  }

  const { error: varErr } = await supabaseAdmin.from('brand_asset_variants').insert({
    asset_id: assetId,
    label: width ? `Original — ${width}px` : 'Original',
    storage_path: key,
    file_type: mime,
    width,
    height,
    bytes: file.size,
    is_original: true,
    source: 'upload',
  });
  if (varErr) {
    // Not fatal to the upload — the asset row carries the same path and the file route falls back to
    // it when no variant is named. Reported so it does not become a silent gap in the variant list.
    console.error('[branding/assets] original variant row failed', varErr.message);
  }

  return NextResponse.json({ asset: await getAsset(assetId) }, { status: 201 });
}, { routeName: 'admin/branding/assets#post' });

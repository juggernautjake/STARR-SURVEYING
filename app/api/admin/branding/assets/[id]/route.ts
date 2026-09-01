// app/api/admin/branding/assets/[id]/route.ts
//
//   GET    /api/admin/branding/assets/{id}   → one asset with its variants
//   PATCH  /api/admin/branding/assets/{id}   → fill in or change the profile
//   DELETE /api/admin/branding/assets/{id}   → remove it, and its files
//
// ── PATCH IS THE SECOND HALF OF THE TWO PATHS ───────────────────────────────────────────────────
//
// The owner asked to be able to upload the image alone OR fill everything in. Those are not two
// kinds of asset — they are the same asset at two moments. Somebody drops a file in during a call
// and writes the profile the next morning, which only works if the profile can be added to a row
// that already exists. Without PATCH the quick path is a dead end and the honest advice would be
// "fill the whole form in now", which is the thing being avoided.
//
// It is a genuine partial update: a field absent from the body is left alone, and a field present
// and empty is CLEARED. Those are different, and conflating them is how "remove this note" becomes
// impossible.

import { NextRequest, NextResponse } from 'next/server';

import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { validateProfile, slugify } from '@/lib/branding/uploads';
import {
  BRAND_BUCKET, mayManageBrandAssets, getAsset, uniqueSlug,
} from '@/lib/branding/asset-store';

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/** `[id]` from the path. The route is /api/admin/branding/assets/[id], so it is the last segment. */
function idFrom(req: NextRequest): string | null {
  const seg = new URL(req.url).pathname.split('/').filter(Boolean);
  const id = seg[seg.length - 1];
  return id && UUID_RE.test(id) ? id : null;
}

async function gate(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  if (!mayManageBrandAssets(session.user.roles)) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }
  const id = idFrom(req);
  if (!id) return { error: NextResponse.json({ error: 'id must be a UUID' }, { status: 400 }) };
  return { id };
}

export const GET = withErrorHandler(async (req: NextRequest) => {
  const g = await gate(req);
  if (g.error) return g.error;
  const asset = await getAsset(g.id!);
  if (!asset) return NextResponse.json({ error: 'No such asset' }, { status: 404 });
  return NextResponse.json({ asset });
}, { routeName: 'admin/branding/assets/[id]#get' });

export const PATCH = withErrorHandler(async (req: NextRequest) => {
  const g = await gate(req);
  if (g.error) return g.error;
  const id = g.id!;

  const existing = await getAsset(id);
  if (!existing) return NextResponse.json({ error: 'No such asset' }, { status: 404 });

  let body: Record<string, unknown>;
  try {
    body = await req.json() as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Expected a JSON body.' }, { status: 400 });
  }

  // Validate the RESULT of the patch, not the patch. A body of `{ note: 'x' }` carries no name, and
  // validating the fragment alone would report a missing name on every partial edit.
  const merged = {
    name: 'name' in body ? String(body.name ?? '') : existing.name,
    kind: 'kind' in body ? String(body.kind ?? '') : existing.kind,
    plate: 'plate' in body ? String(body.plate ?? '') : existing.plate,
    status: 'status' in body ? String(body.status ?? '') : existing.status,
    note: 'note' in body ? String(body.note ?? '') : (existing.note ?? ''),
    description: 'description' in body ? String(body.description ?? '') : (existing.description ?? ''),
    useCases: 'useCases' in body ? asList(body.useCases) : existing.useCases,
    avoid: 'avoid' in body ? asList(body.avoid) : existing.avoid,
    colours: 'colours' in body ? asList(body.colours) : existing.colours,
    fonts: 'fonts' in body ? asList(body.fonts) : existing.fonts,
    minSize: 'minSize' in body ? String(body.minSize ?? '') : (existing.minSize ?? ''),
  };

  const problems = validateProfile(merged);
  if (problems.length > 0) {
    return NextResponse.json({ error: problems[0]!.message, problems }, { status: 400 });
  }

  const update: Record<string, unknown> = {};
  if ('name' in body) {
    update.name = merged.name.trim();
    // The slug follows the name, because a slug that says `untitled-design` on an asset now called
    // "Roundel — Navy" is a handle that lies. Re-uniquified, since the new name may collide.
    if (merged.name.trim() !== existing.name) {
      update.slug = await uniqueSlug(slugify(merged.name));
    }
  }
  if ('kind' in body) update.kind = merged.kind;
  if ('plate' in body) update.plate = merged.plate;
  if ('status' in body) update.status = merged.status;
  // Empty string clears the column. That is the difference between "leave this alone" (absent) and
  // "remove what is there" (present and empty).
  if ('note' in body) update.note = merged.note.trim() || null;
  if ('description' in body) update.description = merged.description.trim() || null;
  if ('minSize' in body) update.min_size = merged.minSize.trim() || null;
  if ('useCases' in body) update.use_cases = merged.useCases;
  if ('avoid' in body) update.avoid = merged.avoid;
  if ('colours' in body) update.colours = merged.colours;
  if ('fonts' in body) update.fonts = merged.fonts;

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ asset: existing });
  }

  const { error } = await supabaseAdmin.from('brand_assets').update(update).eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ asset: await getAsset(id) });
}, { routeName: 'admin/branding/assets/[id]#patch' });

export const DELETE = withErrorHandler(async (req: NextRequest) => {
  const g = await gate(req);
  if (g.error) return g.error;
  const id = g.id!;

  // Read the storage paths BEFORE deleting the rows. The other order loses them: the cascade takes
  // the variant rows with the asset, and the bucket keys go with them — leaving files nothing
  // references, which no screen shows and which count against the bucket forever.
  const { data: variants } = await supabaseAdmin
    .from('brand_asset_variants').select('storage_path').eq('asset_id', id);
  const { data: asset } = await supabaseAdmin
    .from('brand_assets').select('storage_path').eq('id', id).maybeSingle();
  if (!asset) return NextResponse.json({ error: 'No such asset' }, { status: 404 });

  const paths = [...new Set([
    (asset as { storage_path: string }).storage_path,
    ...((variants ?? []) as { storage_path: string }[]).map((v) => v.storage_path),
  ])];

  const { error } = await supabaseAdmin.from('brand_assets').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // After the rows, and not fatal if it fails. A file left in the bucket is waste; a row left
  // pointing at a deleted file is a broken image on the page. Losing the row first is the safer
  // half to get right.
  const { error: rmErr } = await supabaseAdmin.storage.from(BRAND_BUCKET).remove(paths);
  if (rmErr) console.error('[branding/assets] files left in the bucket', paths, rmErr.message);

  return NextResponse.json({ ok: true, removedFiles: paths.length });
}, { routeName: 'admin/branding/assets/[id]#delete' });

function asList(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => String(x).trim()).filter(Boolean);
}

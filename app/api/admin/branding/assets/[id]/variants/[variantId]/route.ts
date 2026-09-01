// app/api/admin/branding/assets/[id]/variants/[variantId]/route.ts
//
//   DELETE /api/admin/branding/assets/{id}/variants/{variantId}
//
// Removes one resolution variation and its file.
//
// The original is refused. It is the source every generated variation is made from and the fallback
// the file route uses when no variant is named, so deleting it would leave an asset whose thumbnail
// is a broken image and whose ladder can never be regenerated. Deleting the whole asset is the
// operation somebody wanting that actually wants, and it is one level up.

import { NextRequest, NextResponse } from 'next/server';

import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { BRAND_BUCKET, mayManageBrandAssets, getAsset } from '@/lib/branding/asset-store';

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

export const DELETE = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!mayManageBrandAssets(session.user.roles)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // …/assets/[id]/variants/[variantId] — the ids are the last and fourth-from-last segments.
  const seg = new URL(req.url).pathname.split('/').filter(Boolean);
  const variantId = seg[seg.length - 1] ?? '';
  const assetId = seg[seg.length - 3] ?? '';
  if (!UUID_RE.test(assetId) || !UUID_RE.test(variantId)) {
    return NextResponse.json({ error: 'Both ids must be UUIDs' }, { status: 400 });
  }

  const { data, error: readErr } = await supabaseAdmin
    .from('brand_asset_variants')
    .select('storage_path, is_original, asset_id, label')
    .eq('id', variantId)
    .maybeSingle();
  if (readErr) return NextResponse.json({ error: readErr.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'No such variation' }, { status: 404 });

  const v = data as { storage_path: string; is_original: boolean; asset_id: string; label: string };

  // Without this, a variant id from one asset deletes under another asset's path. The row would go
  // and the response would look correct.
  if (v.asset_id !== assetId) {
    return NextResponse.json({ error: 'That variation belongs to a different asset' }, { status: 404 });
  }

  if (v.is_original) {
    return NextResponse.json({
      error: 'The original cannot be removed on its own — every other size is generated from it. '
        + 'Delete the whole design instead.',
    }, { status: 400 });
  }

  const { error } = await supabaseAdmin.from('brand_asset_variants').delete().eq('id', variantId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { error: rmErr } = await supabaseAdmin.storage.from(BRAND_BUCKET).remove([v.storage_path]);
  if (rmErr) console.error('[branding/variants] file left in the bucket', v.storage_path, rmErr.message);

  return NextResponse.json({ asset: await getAsset(assetId) });
}, { routeName: 'admin/branding/assets/[id]/variants/[variantId]#delete' });

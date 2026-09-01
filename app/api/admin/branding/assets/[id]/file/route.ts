// app/api/admin/branding/assets/[id]/file/route.ts
//
//   GET /api/admin/branding/assets/{id}/file             → the original
//   GET /api/admin/branding/assets/{id}/file?variant={v} → one resolution
//   GET /api/admin/branding/assets/{id}/file?download=1  → same bytes, as an attachment
//
// ── WHY THE BYTES COME THROUGH THE APP ──────────────────────────────────────────────────────────
//
// The bucket is private, so the two options were a signed URL handed to the browser or a stream
// through here. Streaming wins on the thing that actually matters for a page full of thumbnails: a
// signed URL expires, so every `<img src>` on the page becomes a 400 at some point while the tab is
// open — the classic "it worked and then the images went" that looks like a storage outage. A route
// URL is stable for as long as the session is.
//
// It also means the role gate is on the bytes rather than on the act of minting a link. A signed URL
// is bearer access to a private bucket object: forwarded, it works for whoever holds it, for as long
// as it lives. This 403s anybody without one of the five roles, every time.
//
// The storage key is never built from the request. It is looked up by id in `asset-store.ts`, which
// is the same discipline the resize endpoint states: no path arithmetic on user input.

import { NextRequest, NextResponse } from 'next/server';

import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { BRAND_BUCKET, mayManageBrandAssets, variantStoragePath } from '@/lib/branding/asset-store';

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

const EXT_FOR: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
  'image/gif': 'gif',
  'application/pdf': 'pdf',
};

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!mayManageBrandAssets(session.user.roles)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // …/assets/[id]/file — the id is the second-to-last segment.
  const seg = new URL(req.url).pathname.split('/').filter(Boolean);
  const assetId = seg[seg.length - 2] ?? '';
  if (!UUID_RE.test(assetId)) {
    return NextResponse.json({ error: 'id must be a UUID' }, { status: 400 });
  }

  const variantId = req.nextUrl.searchParams.get('variant');
  if (variantId && !UUID_RE.test(variantId)) {
    return NextResponse.json({ error: 'variant must be a UUID' }, { status: 400 });
  }

  const target = await variantStoragePath(assetId, variantId);
  if (!target) return NextResponse.json({ error: 'No such file' }, { status: 404 });

  const { data, error } = await supabaseAdmin.storage.from(BRAND_BUCKET).download(target.path);
  if (error || !data) {
    // The row exists and the object does not. Reported rather than 500'd: a 404 is the honest
    // outcome, and the log line is what tells somebody the bucket and the tables have drifted.
    console.error('[branding/file] row points at a missing object', target.path, error?.message);
    return NextResponse.json({ error: 'The file is missing from storage.' }, { status: 404 });
  }

  const bytes = new Uint8Array(await data.arrayBuffer());
  const ext = EXT_FOR[target.fileType] ?? 'bin';
  const safeName = target.label.replace(/[^\w. -]+/g, '').trim() || 'brand-asset';
  const download = req.nextUrl.searchParams.get('download') === '1';

  return new NextResponse(bytes, {
    headers: {
      'Content-Type': target.fileType,
      // `private` matters here. A shared cache holding a brand asset keyed only by URL would serve
      // it to the next requester without the role check ever running.
      //
      // Not `immutable`: a variation can be replaced, and an immutable response is one a browser
      // will not re-fetch for a year.
      'Cache-Control': 'private, max-age=3600',
      'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="${safeName}.${ext}"`,
      // The bucket accepts SVG, and an SVG served inline is a script execution context on this
      // origin. CSP here is what keeps an uploaded mark from being an uploaded script.
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; img-src data:; sandbox",
      'X-Content-Type-Options': 'nosniff',
    },
  });
}, { routeName: 'admin/branding/assets/[id]/file#get' });

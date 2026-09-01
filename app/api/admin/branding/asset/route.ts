// app/api/admin/branding/asset/route.ts
//
// Serves any brand mark at any of the offered sizes, resized on demand.
//
//   GET /api/admin/branding/asset?file=badge-primary.png&w=512
//
// ── WHY THIS EXISTS RATHER THAN 900 FILES ───────────────────────────────────────────────────────
//
// Owner: *"we have multiple resolutions of the different images/logos. We need four or five
// different sizes to choose from."*
//
// The library is 178 marks once the recoloured colourways are counted. Baking five sizes each is
// 890 files and roughly 60 MB in `public/`, committed to git, re-downloaded on every clone, and
// stale the moment a mark is redrawn. Resizing on request costs one sharp call, cached hard, and
// the size ladder becomes a number in one array rather than a regeneration script somebody has to
// remember to run.
//
// ── THE FILENAME IS VALIDATED AGAINST THE MANIFEST, NOT SANITISED ───────────────────────────────
//
// A resize endpoint that takes a path is a directory-traversal bug waiting to be found, and
// stripping `..` is the fix that gets bypassed. This one checks the requested name against the set
// the brand system actually declares: anything not in that set is a 404 regardless of what it looks
// like. There is no path arithmetic on user input anywhere below.

import { NextRequest, NextResponse } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

import { auth } from '@/lib/auth';
import { BRAND_LOGOS, allRecolourFiles, ASSET_SIZES } from '@/lib/branding/logos';

/**
 * Who may pull an asset.
 *
 * The same five as the page. Deliberately not wider even though these are the firm's own logos and
 * a determined person could screenshot them off the portal: an endpoint that serves files should
 * answer the same question the page does, or the page's gate is decoration.
 */
const ALLOWED = new Set(['admin', 'developer', 'tech_support', 'teacher', 'employee']);

/** Every filename the brand system declares. Built once — the manifest does not change at runtime. */
const KNOWN: Set<string> = new Set([
  ...BRAND_LOGOS.map((l) => l.file),
  ...allRecolourFiles(),
]);

const DIR = path.join(process.cwd(), 'public', 'branding');

export async function GET(req: NextRequest) {
  const session = await auth();
  const roles = (session?.user?.roles ?? []) as string[];
  if (!roles.some((r) => ALLOWED.has(r))) {
    return NextResponse.json({ error: 'Not authorised' }, { status: 403 });
  }

  const file = req.nextUrl.searchParams.get('file') ?? '';
  if (!KNOWN.has(file)) {
    // Deliberately the same answer for "not a brand asset" and "does not exist": a different
    // message for each would turn this into a probe for what is on disk.
    return NextResponse.json({ error: 'Unknown asset' }, { status: 404 });
  }

  const requested = Number(req.nextUrl.searchParams.get('w') ?? 0);
  // Round DOWN to an offered size rather than honouring an arbitrary number. Two reasons: the cache
  // has five keys per file instead of unbounded ones, and nobody gets a 9000px upscale of a 700px
  // source, which would be a bigger file that carries no more detail.
  const width = ASSET_SIZES.find((s) => s <= requested) ?? ASSET_SIZES[ASSET_SIZES.length - 1];

  const src = path.join(DIR, file);
  if (!fs.existsSync(src)) {
    // The manifest and the disk disagree. `brand-system.test.ts` fails on exactly this, so in a
    // deployed build it should be unreachable — but a 500 here would be an unexplained crash and a
    // 404 is at least honest about the outcome.
    return NextResponse.json({ error: 'Asset missing from disk' }, { status: 404 });
  }

  const isJpeg = /\.jpe?g$/i.test(file);
  const pipeline = sharp(src).resize(width, width, { fit: 'inside', withoutEnlargement: true });
  const body = await (isJpeg ? pipeline.jpeg({ quality: 88 }) : pipeline.png({ compressionLevel: 9 }))
    .toBuffer();

  return new NextResponse(new Uint8Array(body), {
    headers: {
      'Content-Type': isJpeg ? 'image/jpeg' : 'image/png',
      // A brand mark at a given size is immutable: the only way the bytes change is somebody
      // replacing the file, which changes the deploy.
      'Cache-Control': 'private, max-age=31536000, immutable',
      'Content-Disposition': `inline; filename="${file.replace(/\.(png|jpe?g)$/i, '')}-${width}.${isJpeg ? 'jpg' : 'png'}"`,
    },
  });
}

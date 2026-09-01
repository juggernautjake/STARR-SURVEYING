// scripts/recolour-brand-marks.mjs
//
// Produces brand-kit colourways of the core marks from the red/navy/white originals.
//
//   node scripts/recolour-brand-marks.mjs [--check]
//
// ── WHY THIS IS PIXEL WORK AND NOT A VECTOR EDIT ────────────────────────────────────────────────
//
// The right way to recolour a logo is to open the vector source and change the swatches. There is
// no vector source — the library is entirely PNG and JPG, which the Downloads tab of the brand
// portal says out loud. Until somebody commissions a trace, the choice is between recolouring the
// raster art and not having the colourways at all.
//
// ── MEASURED FIRST, THEN WRITTEN ────────────────────────────────────────────────────────────────
//
// Sampling the originals before choosing an algorithm mattered. `roundel-navy.png` is genuinely
// flat: 14 distinct colours. `badge-primary.png` has 255, but they are compression noise around
// three inks — the top six are all near-whites within two levels of each other — not gradients.
//
// So an exact-match substitution would have recoloured the flat art and left the noisy art with
// speckled edges, which is the kind of result that looks fine at thumbnail size and falls apart on
// a hat. The algorithm below classifies every pixel to its nearest source ink and rebuilds it
// against the target ink at the same blend, which keeps anti-aliased edges smooth because an edge
// pixel halfway between red and white comes out halfway between the new ink and the new paper.

import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';

const OUT = 'public/branding';
const CHECK = process.argv.includes('--check');

/**
 * The FOUR inks the source marks are drawn in.
 *
 * Black was missing from the first version, and the result was a real defect rather than a cosmetic
 * one. `mark-surveyor.png` carries a black surveyor silhouette across the star; with only three
 * source inks, black classified to NAVY — it is nearer navy than red by squared distance — so on the
 * one-colour way, where ink and accent are the same navy, the silhouette disappeared entirely into
 * the star behind it. The mark whose whole point is showing a person at an instrument came out with
 * no person in it.
 *
 * Caught by looking at the contact sheet rather than by any check, which is the honest account: a
 * recolouriser has no way to know that one of the shapes it merged was the subject.
 */
const SOURCE = {
  ink: [0xBD, 0x12, 0x18],    // Starr Red — the dominant ink in most marks
  accent: [0x1D, 0x30, 0x95], // Starr Navy
  detail: [0x0F, 0x14, 0x19], // Ink Black — silhouettes and fine detail
  paper: [0xFF, 0xFF, 0xFF],
};

/**
 * Colourways. `ink` replaces red, `accent` replaces navy, `paper` replaces white.
 *
 * Each is a pair already in the brand palette, and each was picked so the result clears 4.5:1
 * between its own ink and paper — a colourway whose two halves do not separate is a mark nobody can
 * use, which is exactly the failure the brand guide's ink rule exists to prevent.
 */
const WAYS = [
  // `detail` is the silhouette colour. It is the DARKEST value in each way rather than a repeat of
  // `accent`, so a black shape stays a distinct shape — including on the one-colour ways, where
  // ink and accent are deliberately the same and detail is the only thing keeping them apart.
  { id: 'forest',    label: 'Forest Green',  ink: [0x2C, 0x4A, 0x2E], accent: [0x1C, 0x33, 0x23], detail: [0x0F, 0x1D, 0x13], paper: [0xF5, 0xEF, 0xE3] },
  { id: 'maroon',    label: 'Maroon',        ink: [0x6B, 0x10, 0x27], accent: [0x3E, 0x33, 0x2A], detail: [0x24, 0x1C, 0x16], paper: [0xF5, 0xEF, 0xE3] },
  { id: 'burnt',     label: 'Burnt Orange',  ink: [0xB4, 0x49, 0x1A], accent: [0x3E, 0x33, 0x2A], detail: [0x24, 0x1C, 0x16], paper: [0xF5, 0xEF, 0xE3] },
  { id: 'espresso',  label: 'Espresso',      ink: [0x3E, 0x33, 0x2A], accent: [0x6B, 0x4A, 0x2F], detail: [0x1F, 0x18, 0x12], paper: [0xF5, 0xEF, 0xE3] },
  { id: 'slate',     label: 'Slate Blue',    ink: [0x3C, 0x54, 0x6C], accent: [0x15, 0x20, 0x50], detail: [0x0B, 0x11, 0x2B], paper: [0xF5, 0xEF, 0xE3] },
  { id: 'olive',     label: 'Olive Drab',    ink: [0x54, 0x54, 0x3C], accent: [0x1C, 0x33, 0x23], detail: [0x14, 0x14, 0x0E], paper: [0xF5, 0xEF, 0xE3] },
  // The one-colour ways KNOCK the detail out rather than colouring it, because they have only one
  // ink to spend and a silhouette drawn in that same ink is not a silhouette. Setting detail to the
  // paper colour is what a real single-colour reproduction does: the surveyor becomes a hole in the
  // star rather than a shape that vanishes into it.
  { id: 'mono-dark', label: 'One Colour',    ink: [0x15, 0x20, 0x50], accent: [0x15, 0x20, 0x50], detail: [0xFF, 0xFF, 0xFF], paper: [0xFF, 0xFF, 0xFF] },
  { id: 'mono-light',label: 'Reversed',      ink: [0xFF, 0xFF, 0xFF], accent: [0xFF, 0xFF, 0xFF], detail: [0x15, 0x20, 0x50], paper: [0x15, 0x20, 0x50] },
];

/** Every mark that is flat vector-derived art. See the note below for what is not here. */
const MARKS = [
  { file: 'badge-primary.png',      slug: 'badge' },
  { file: 'badge-red-type.png',     slug: 'badge-open' },
  { file: 'badge-navy-ring.png',    slug: 'badge-ring' },
  { file: 'badge-navy-star.png',    slug: 'badge-quiet' },
  { file: 'badge-grid-a.png',       slug: 'badge-heavy' },
  { file: 'badge-grid-b.png',       slug: 'stacked' },
  { file: 'banner-wide.png',        slug: 'banner' },
  { file: 'banner-box.png',         slug: 'banner-narrow' },
  { file: 'lockup-horizontal.png',  slug: 'horizontal' },
  { file: 'lockup-stacked.png',     slug: 'capside' },
  { file: 'lockup-mountain.png',    slug: 'mountain' },
  { file: 'roundel-navy.png',       slug: 'roundel' },
  { file: 'roundel-red.png',        slug: 'roundel-navy-field' },
  { file: 'mark-star.png',          slug: 'star' },
  { file: 'mark-surveyor.png',      slug: 'surveyor' },
  { file: 'icon-app.png',           slug: 'icon' },
  { file: 'wordmark-starr.png',     slug: 'wordmark-starr' },
  { file: 'wordmark-surveying.png', slug: 'wordmark-surveying' },
];

// ── WHAT IS NOT IN THAT LIST, AND WHY ───────────────────────────────────────────────────────────
//
// Two groups now, down from four. The first cut was too aggressive and the reasoning was wrong:
//
//   · The four BADGE VARIANTS were excluded on the grounds that every colourway reassigns all the
//     inks anyway, so their output would match the primary's. That was wrong. They differ
//     STRUCTURALLY, not just in ink placement — badge-primary has a filled centre disc and
//     badge-red-type has an open one — and a recolour preserves structure. They are all here now.
//   · The HERITAGE set is genuinely redundant rather than excluded: heritage-*.png are colourways
//     of the badge, and `recolour-badge-*` regenerates that whole family from the original at
//     higher fidelity than recolouring an already-recoloured file would.
//
// Still out, for reasons that hold:
//
//   · The cap and patch PHOTOGRAPHS (cap-*.jpg, patch-*.jpg). Photographs of real embroidery under
//     real light. There is no ink to substitute, and a tinted photograph of a khaki cap presented
//     as a forest-green cap is a false product image — the one output here that could actually
//     mislead somebody placing an order.
//   · badge-alt.png is a contact sheet of nine marks, not a mark.

const dist2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
const lum = ([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

async function recolour(srcPath, way) {
  const { data, info } = await sharp(srcPath).ensureAlpha().raw()
    .toBuffer({ resolveWithObject: true });
  const out = Buffer.from(data);

  const srcPaperLum = lum(SOURCE.paper);

  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 8) continue;          // fully transparent — leave it alone
    const px = [data[i], data[i + 1], data[i + 2]];

    // Which of the three inks is this pixel closest to?
    const d = {
      ink: dist2(px, SOURCE.ink),
      accent: dist2(px, SOURCE.accent),
      detail: dist2(px, SOURCE.detail),
      paper: dist2(px, SOURCE.paper),
    };
    const nearest = Object.keys(d).reduce((a, b) => (d[b] < d[a] ? b : a));

    if (nearest === 'paper') {
      // Paper pixels keep their own lightness relative to white, so a faint drop shadow or a
      // near-white edge stays faint rather than snapping to the new paper colour.
      const t = clamp01(lum(px) / srcPaperLum);
      for (let c = 0; c < 3; c++) out[i + c] = Math.round(way.paper[c] * t + way.ink[c] * (1 - t));
      continue;
    }

    // An ink pixel. `t` is how far it has been blended toward paper — 0 at the solid ink, 1 at
    // paper — recovered from luminance, which is what keeps anti-aliased edges smooth.
    const srcInk = SOURCE[nearest];
    const span = srcPaperLum - lum(srcInk);
    const t = span <= 1 ? 0 : clamp01((lum(px) - lum(srcInk)) / span);
    const target = way[nearest];
    for (let c = 0; c < 3; c++) out[i + c] = Math.round(target[c] * (1 - t) + way.paper[c] * t);
  }

  return sharp(out, { raw: { width: info.width, height: info.height, channels: 4 } })
    .png({ compressionLevel: 9 });
}

let made = 0;
const manifest = [];
for (const mark of MARKS) {
  const src = path.join(OUT, mark.file);
  if (!fs.existsSync(src)) { console.error(`missing source: ${mark.file}`); process.exit(1); }
  for (const way of WAYS) {
    const name = `recolour-${mark.slug}-${way.id}.png`;
    if (!CHECK) await (await recolour(src, way)).toFile(path.join(OUT, name));
    manifest.push({ file: name, mark: mark.slug, way: way.id, label: way.label });
    made++;
  }
}

console.log(`${CHECK ? 'would write' : 'wrote'} ${made} recoloured marks`);
console.log(`  ${MARKS.length} marks × ${WAYS.length} colourways`);
if (!CHECK) {
  const total = manifest.reduce((n, m) => n + fs.statSync(path.join(OUT, m.file)).size, 0);
  console.log(`  ${(total / 1024 / 1024).toFixed(2)} MB`);
}

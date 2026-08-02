// scripts/prepare-andrew-photos.mjs
//
// One-shot asset pipeline for the Andrew Ash voice-over portfolio (/AndrewAsh).
//
// The source photos are straight off a phone and a DSLR: 2048px JPEGs between
// 300kB and 2MB, in three different aspect ratios, with EXIF rotation. Shipping
// them as-is would make the hero of a portfolio site — the one thing a casting
// director sees before deciding whether to keep scrolling — a multi-megabyte
// download.
//
// So each photo is emitted at two widths (1600 for hero/full-bleed use, 800 for
// cards and thumbnails) in both WebP and JPEG. WebP because it is roughly half
// the bytes at the same quality and every browser Andrew's clients will use has
// supported it for years; JPEG alongside it because `<img>` with a `<picture>`
// fallback costs nothing and means a photo never fails to render.
//
// FACE-AWARE CROPPING IS THE POINT OF THE `focus` FIELD.
//
// sharp's default `cover` crop takes the centre of the frame. On a portfolio the
// subject is almost never centred: Andrew is stage-right in the Frozen duet,
// low-and-centre under the UMHB letters, and flanked by his parents in the
// pirate costume. A centre crop of that last one cuts him in half. `focus` names
// the gravity sharp should crop toward so the square/portrait derivatives keep
// the person in frame.
//
// Run:  node scripts/prepare-andrew-photos.mjs
// Idempotent — re-running overwrites the derivatives and leaves sources alone.

import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const SRC_DIR = process.env.ANDREW_PHOTO_SRC || 'C:/Users/lando/Downloads/Andrew_Ash';
const OUT_DIR = path.join(process.cwd(), 'public', 'andrew', 'photos');

// Ordered so the console log reads like the site: portraits first, then stage,
// then the archive material.
//
// `role` is documentation, not behaviour — it records WHY a photo was kept, so
// that whoever swaps in a real headshot later knows which slot they are filling.
//
// ── `focal` IS THE MOST IMPORTANT FIELD HERE ────────────────────────────────
//
// Reported by the owner with a screenshot: the service cards were cutting
// people's heads off. The cause is that `object-fit: cover` crops around the
// GEOMETRIC CENTRE, and in almost none of these photographs is the subject at
// the geometric centre. Andrew is at the far left of the choir, at the far
// right of the curtain call, and — worst case — his head is in the top eighth
// of the square costume photo, so a 16:10 crop of it removed him entirely and
// left a photograph of some stairs.
//
// `focal` is the `object-position` that keeps the face in frame at ANY crop.
// It travels in the manifest rather than being written at each call site,
// because a call site that forgets it is exactly the bug that was shipped: the
// framing is a property of the photograph, so it belongs to the photograph.
//
// Values are eyeballed from the source images and expressed as "x% y%", where
// y is deliberately biased upward — heads sit above centre in almost every
// photograph ever taken of a standing person.
const PHOTOS = [
  {
    src: 'IMG_5442.JPG',
    out: 'portrait-formal',
    focus: 'north',
    focal: '50% 34%', // Face fills the frame; biased up so a wide crop keeps the top hat.
    alt: 'Black-and-white portrait of Andrew Ash in a top hat and bow tie',
    role: 'Primary hero portrait. Dramatic, monochrome, already square.',
  },
  {
    src: 'IMG_5451.JPG',
    out: 'recital-white-tie',
    focus: 'north',
    focal: '50% 18%', // Full-length: the face sits in the top fifth of a 1342×2048 frame.
    alt: 'Andrew Ash performing in white tie and tails at a chapel recital',
    role: 'Classical credibility shot — the one that says "trained singer".',
  },
  {
    src: 'IMG_5449.JPG',
    out: 'recital-expressive',
    focus: 'centre',
    focal: '44% 30%', // Just left of centre, head well above the midline.
    alt: 'Andrew Ash mid-performance, hands raised, at a recital',
    role: 'Motion + expression. Used wide, behind text.',
  },
  {
    src: 'IMG_5448.JPG',
    out: 'ensemble-choir',
    focus: 'west',
    focal: '14% 38%', // Andrew is the FAR-LEFT singer; a centre crop shows someone else entirely.
    alt: 'Andrew Ash singing in a vocal ensemble on stage',
    role: 'Ensemble work. Andrew is far left, hence the west gravity.',
  },
  {
    src: 'IMG_5444.JPG',
    out: 'stage-duet',
    focus: 'centre',
    focal: '48% 24%', // Both heads are high in the frame.
    alt: 'Andrew Ash performing a duet in a stage musical',
    role: 'Musical theatre lead, in character, mid-scene.',
  },
  {
    src: 'IMG_5445.JPG',
    out: 'stage-ensemble-scene',
    focus: 'east',
    focal: '76% 32%', // Andrew is stage-right; a centre crop is his scene partner.
    alt: 'Andrew Ash on stage with the full company of a musical',
    role: 'Production scale. Andrew is stage-right.',
  },
  {
    src: 'IMG_5453.JPG',
    out: 'stage-period-scene',
    focus: 'west',
    focal: '34% 24%', // Andrew is the left of the two figures.
    alt: 'Andrew Ash in period costume performing a comic scene',
    role: 'Comic timing / character range.',
  },
  {
    src: 'IMG_5446.JPG',
    out: 'stage-costume',
    focus: 'centre',
    focal: '50% 26%',
    alt: 'Andrew Ash in full period costume after a performance, with his parents',
    // NOT A SERVICE-CARD PHOTO, and two failed attempts to make it one are why this note exists.
    //
    // His parents have their arms around him and their faces are immediately adjacent to his. A 2.7×
    // isotropic zoom still left both of them in frame; an anisotropic crop box tight enough to lose
    // them cut into the costume, which is the only reason the photograph is in the set. There is no
    // crop of this image that is "Andrew in costume" rather than "Andrew with his parents".
    //
    // So it stays uncropped and moves to the About page, where a caption says who they are and the
    // photograph does what it is actually good at. The lesson generalises: when a crop cannot make an
    // image mean the right thing, the fix is a different placement, not a tighter crop.
    zoom: 1.25,
    role: 'About page only — costume and family, needs a caption. Never a service card.',
  },
  {
    src: 'IMG_5440.JPG',
    out: 'graduation-presser-hall',
    focus: 'centre',
    focal: '38% 34%', // Off-centre left, framed against the building.
    alt: 'Andrew Ash in cap and gown outside Presser Hall at UMHB',
    role: 'Education. Presser Hall is the UMHB music building — on the nose.',
  },
  {
    src: 'IMG_5439.JPG',
    out: 'graduation-umhb',
    focus: 'centre',
    focal: '48% 46%', // Small figure in a wide frame — close to centred.
    alt: 'Andrew Ash in cap and gown beside the UMHB letters on campus',
    role: 'Wide establishing shot for the About timeline.',
  },
  {
    src: 'IMG_5443.JPG',
    out: 'event-tuxedo',
    focus: 'north',
    focal: '32% 22%', // Andrew is the LEFT of two people, head near the top edge.
    alt: 'Andrew Ash in a tuxedo at a music event',
    role: 'Formal/professional. Also reads as "after the show".',
  },
  {
    src: 'IMG_5454.JPG',
    out: 'character-fishbowl',
    focus: 'centre',
    focal: '50% 12%', // THE ONE THAT BROKE: the helmet is in the top eighth of a square frame.
    alt: 'Andrew Ash in a green-and-purple caped costume with a glass helmet',
    role: 'Character work — the "I will commit to a bit" evidence.',
  },
  {
    src: 'IMG_5452.jpg',
    out: 'character-aviator',
    focus: 'north',
    focal: '46% 10%', // Small source; the face is right at the top edge.
    alt: 'Andrew Ash in an aviator costume with goggles and a leather jacket',
    role: 'Second character-work photo, different genre.',
  },
  {
    src: 'IMG_5450.JPG',
    out: 'archive-young',
    focus: 'north',
    focal: '48% 24%', // Child, roughly centred, head high in the frame.
    alt: 'Andrew Ash as a child, smiling at an outdoor gathering',
    role: 'The "it started early" beat in the About story. Deliberately small.',
  },
  {
    src: 'IMG_5447.JPG',
    out: 'personal-formal',
    focus: 'east',
    focal: '50% 12%', // Two full-length figures; both faces are at the very top.
    alt: 'Andrew Ash dressed formally at a family celebration',
    role: 'Held in the library, unused on the public pages by default.',
  },
  {
    src: 'IMG_5441.JPG',
    out: 'personal-candid',
    focus: 'centre',
    focal: '50% 34%', // Close selfie; face just above centre.
    alt: 'Candid photo of Andrew Ash',
    role: 'Held in the library, unused on the public pages by default.',
  },
];

const WIDTHS = [
  { w: 1600, suffix: '' },
  { w: 800, suffix: '-800' },
];

async function main() {
  if (!fs.existsSync(SRC_DIR)) {
    console.error(`[andrew-photos] Source directory not found: ${SRC_DIR}`);
    process.exit(1);
  }
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const manifest = [];

  for (const photo of PHOTOS) {
    const srcPath = path.join(SRC_DIR, photo.src);
    if (!fs.existsSync(srcPath)) {
      console.warn(`[andrew-photos] MISSING ${photo.src} — skipped`);
      continue;
    }

    // `.rotate()` with no argument applies the EXIF orientation and then strips
    // it. Without this, phone photos that look upright in Explorer arrive
    // sideways in the browser, because sharp's resize works on raw pixels and
    // the metadata that would have corrected it is dropped on write.
    const base = sharp(srcPath).rotate();
    const meta = await base.metadata();

    for (const { w, suffix } of WIDTHS) {
      const pipeline = () => {
        let p = sharp(srcPath).rotate();
        if (photo.cropBox) {
          // Explicit rectangle, in fractions of the source. Clamped into bounds because sharp
          // throws — rather than clipping — on an extract region that runs past an edge, and a
          // rounding error on an odd-numbered dimension is enough to do that.
          const cb = photo.cropBox;
          const left = Math.max(0, Math.round(meta.width * cb.left));
          const top = Math.max(0, Math.round(meta.height * cb.top));
          p = p.extract({
            left,
            top,
            width: Math.min(meta.width - left, Math.round(meta.width * cb.width)),
            height: Math.min(meta.height - top, Math.round(meta.height * cb.height)),
          });
        } else if (photo.zoom && photo.zoom > 1) {
          // Crop toward the centre before resizing, to cut out flanking figures
          // or dead space. extract() needs integers inside the source bounds.
          const cw = Math.round(meta.width / photo.zoom);
          const ch = Math.round(meta.height / photo.zoom);
          p = p.extract({
            left: Math.round((meta.width - cw) / 2),
            top: Math.round((meta.height - ch) / 6), // bias upward — heads, not shoes
            width: cw,
            height: ch,
          });
        }
        return p.resize({ width: w, withoutEnlargement: true });
      };

      await pipeline().webp({ quality: 82 }).toFile(path.join(OUT_DIR, `${photo.out}${suffix}.webp`));
      await pipeline().jpeg({ quality: 84, mozjpeg: true }).toFile(path.join(OUT_DIR, `${photo.out}${suffix}.jpg`));
    }

    const finalMeta = await sharp(path.join(OUT_DIR, `${photo.out}.jpg`)).metadata();
    manifest.push({
      id: photo.out,
      alt: photo.alt,
      focal: photo.focal || '50% 40%',
      role: photo.role,
      width: finalMeta.width,
      height: finalMeta.height,
      orientation:
        finalMeta.width > finalMeta.height * 1.15
          ? 'landscape'
          : finalMeta.height > finalMeta.width * 1.15
            ? 'portrait'
            : 'square',
    });
    console.log(`[andrew-photos] ${photo.src} → ${photo.out} (${finalMeta.width}×${finalMeta.height})`);
  }

  // The manifest is what the app imports. Generating it here — rather than
  // hand-maintaining a TS constant — means the dimensions in code can never
  // drift from the bytes on disk, which is what causes layout shift.
  const ts =
    `// GENERATED by scripts/prepare-andrew-photos.mjs — do not edit by hand.\n` +
    `// Re-run \`node scripts/prepare-andrew-photos.mjs\` after changing the source photos.\n\n` +
    `export interface AndrewPhoto {\n` +
    `  id: string;\n  alt: string;\n  role: string;\n` +
    `  /** CSS \`object-position\` that keeps the subject in frame at ANY crop ratio.\n` +
    `   *  Travels with the photo so no call site can forget it — the bug that shipped\n` +
    `   *  service cards with people's heads cropped off. */\n` +
    `  focal: string;\n` +
    `  width: number;\n  height: number;\n` +
    `  orientation: 'landscape' | 'portrait' | 'square';\n}\n\n` +
    `export const ANDREW_PHOTOS: readonly AndrewPhoto[] = ${JSON.stringify(manifest, null, 2)} as const;\n\n` +
    `/** Public URL for a photo. \`size\` picks the 800px derivative for cards. */\n` +
    `export function photoUrl(id: string, size: 'full' | 'card' = 'full'): string {\n` +
    `  return \`/andrew/photos/\${id}\${size === 'card' ? '-800' : ''}.jpg\`;\n}\n\n` +
    `export function photoUrlWebp(id: string, size: 'full' | 'card' = 'full'): string {\n` +
    `  return \`/andrew/photos/\${id}\${size === 'card' ? '-800' : ''}.webp\`;\n}\n\n` +
    `export function photoById(id: string): AndrewPhoto | undefined {\n` +
    `  return ANDREW_PHOTOS.find((p) => p.id === id);\n}\n`;

  fs.writeFileSync(path.join(process.cwd(), 'lib', 'voice', 'photos.ts'), ts, 'utf8');
  console.log(`[andrew-photos] Wrote lib/voice/photos.ts (${manifest.length} photos)`);
}

main().catch((err) => {
  console.error('[andrew-photos] failed:', err);
  process.exit(1);
});

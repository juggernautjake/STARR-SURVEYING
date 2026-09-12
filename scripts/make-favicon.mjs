// scripts/make-favicon.mjs — build app/favicon.ico and app/icon.png from the master icon.
//
//   node scripts/make-favicon.mjs
//
// Why: Google's ad and search crawlers want a favicon that is a multiple of 48 px (48, 96, 144…)
// and will fall back to a generic globe when the only icon they can read is 16×16 — which is what
// the sponsored listing showed on 2026-09-12 while the organic one, which had picked up the 192 px
// PNG, showed the star. This writes one .ico holding 16/32/48/64/128 PNG frames (48 first, so
// Next.js advertises sizes="48x48") and a 96 px icon.png, both from public/apple-touch-icon.png,
// the largest source with a transparent background.
import sharp from 'sharp';
import { writeFile } from 'node:fs/promises';

const SOURCE = 'public/apple-touch-icon.png';
const SIZES = [48, 32, 16, 64, 128];

async function frame(size) {
  return sharp(SOURCE).resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
}

/** ICO container with PNG-compressed frames (supported by every browser and Windows since Vista). */
function ico(frames) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(frames.length, 4);
  const dir = Buffer.alloc(16 * frames.length);
  let offset = 6 + dir.length;
  frames.forEach(({ size, png }, i) => {
    const o = i * 16;
    dir[o] = size >= 256 ? 0 : size; // width
    dir[o + 1] = size >= 256 ? 0 : size; // height
    dir[o + 2] = 0; // palette
    dir[o + 3] = 0; // reserved
    dir.writeUInt16LE(1, o + 4); // planes
    dir.writeUInt16LE(32, o + 6); // bits per pixel
    dir.writeUInt32LE(png.length, o + 8);
    dir.writeUInt32LE(offset, o + 12);
    offset += png.length;
  });
  return Buffer.concat([header, dir, ...frames.map((f) => f.png)]);
}

const frames = [];
for (const size of SIZES) frames.push({ size, png: await frame(size) });
await writeFile('app/favicon.ico', ico(frames));
await writeFile('app/icon.png', await frame(96));
console.log(`app/favicon.ico: ${SIZES.join('/')} px, ${frames.reduce((n, f) => n + f.png.length, 0)} bytes of frames`);
console.log('app/icon.png: 96 px');

// make-icon.cjs — a real .ico, drawn pixel by pixel, no dependencies.
//
// Windows cannot give a plain .html file its own icon: Explorer shows whatever the default browser
// registered for that file type. A .url shortcut CAN carry `IconFile=`, so the desktop item is a
// shortcut pointing at the HTML, and this is the icon it wears.
//
// Node has zlib but no canvas, so the PNG is assembled by hand — raw RGBA scanlines, deflate, then
// the four chunks with their CRCs. The ICO container then wraps one PNG per size (Vista+ accepts
// PNG payloads directly, which avoids hand-rolling BMP + AND masks at six sizes).

const fs = require('fs');
const zlib = require('zlib');

// ── The mark: a clipboard with three lines and a green check. Reads at 16px, which is the only
//    size that really has to survive. Brand blue ground, white board.
const BLUE = [0x1d, 0x30, 0x95];
const WHITE = [0xff, 0xff, 0xff];
const GREEN = [0x15, 0x80, 0x3d];

/** Signed distance to a rounded rect, in the unit square. Anti-aliasing falls out of the distance. */
function rrect(x, y, x0, y0, x1, y1, r) {
  const cx = Math.max(x0 + r, Math.min(x1 - r, x));
  const cy = Math.max(y0 + r, Math.min(y1 - r, y));
  const dx = x - cx, dy = y - cy;
  const d = Math.hypot(dx, dy);
  if (x >= x0 + r && x <= x1 - r) return (y < y0 ? y0 - y : y > y1 ? y - y1 : Math.max(y0 - y, y - y1));
  if (y >= y0 + r && y <= y1 - r) return (x < x0 ? x0 - x : x > x1 ? x - x1 : Math.max(x0 - x, x - x1));
  return d - r;
}

/** Distance from a point to a segment — used for the ruled lines and the tick. */
function seg(px, py, ax, ay, bx, by) {
  const vx = bx - ax, vy = by - ay;
  const wx = px - ax, wy = py - ay;
  const len2 = vx * vx + vy * vy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, (wx * vx + wy * vy) / len2));
  return Math.hypot(px - (ax + t * vx), py - (ay + t * vy));
}

function mix(dst, src, a) {
  for (let i = 0; i < 3; i++) dst[i] = Math.round(dst[i] * (1 - a) + src[i] * a);
}

/** Coverage from a signed distance, softened over roughly one pixel. */
function cov(d, px) { return Math.max(0, Math.min(1, 0.5 - d / px)); }

function drawRGBA(size) {
  const px = 1 / size;                       // one pixel, in unit-square terms
  const buf = Buffer.alloc(size * size * 4);

  for (let yi = 0; yi < size; yi++) {
    for (let xi = 0; xi < size; xi++) {
      const x = (xi + 0.5) / size, y = (yi + 0.5) / size;
      const rgb = [0, 0, 0];
      let alpha = 0;

      // Ground: rounded square in brand blue.
      const a0 = cov(rrect(x, y, 0.02, 0.02, 0.98, 0.98, 0.20), px);
      if (a0 > 0) { mix(rgb, BLUE, 1); alpha = a0; }

      // Clip at the top of the board.
      const aClip = cov(rrect(x, y, 0.27, 0.13, 0.73, 0.26, 0.05), px);
      if (aClip > 0) mix(rgb, WHITE, aClip);

      // Board.
      const aBoard = cov(rrect(x, y, 0.19, 0.22, 0.81, 0.85, 0.09), px);
      if (aBoard > 0) mix(rgb, WHITE, aBoard);

      // Three ruled lines. The third is short — a list that is not finished.
      const lines = [[0.30, 0.42, 0.52], [0.30, 0.55, 0.52], [0.30, 0.68, 0.44]];
      for (const [lx0, ly, lx1] of lines) {
        const a = cov(seg(x, y, lx0, ly, lx1, ly) - 0.027, px);
        if (a > 0) mix(rgb, BLUE, a * aBoard);
      }

      // The check, drawn over the lines' right end so it reads as "this one is done".
      const t1 = cov(seg(x, y, 0.545, 0.665, 0.615, 0.735) - 0.040, px);
      const t2 = cov(seg(x, y, 0.615, 0.735, 0.755, 0.525) - 0.040, px);
      const aTick = Math.max(t1, t2);
      if (aTick > 0) mix(rgb, GREEN, aTick * Math.max(aBoard, 0.85));

      const o = (yi * size + xi) * 4;
      buf[o] = rgb[0]; buf[o + 1] = rgb[1]; buf[o + 2] = rgb[2];
      buf[o + 3] = Math.round(alpha * 255);
    }
  }
  return buf;
}

// ── PNG ─────────────────────────────────────────────────────────────────────────────────────────
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

function png(size) {
  const rgba = drawRGBA(size);
  // Filter byte 0 (None) in front of every scanline.
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;    // bit depth
  ihdr[9] = 6;    // colour type: RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ── ICO ─────────────────────────────────────────────────────────────────────────────────────────
const SIZES = [16, 24, 32, 48, 64, 128, 256];
const images = SIZES.map((s) => ({ s, data: png(s) }));

const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(images.length, 4);

const dirSize = 16 * images.length;
let offset = 6 + dirSize;
const entries = images.map(({ s, data }) => {
  const e = Buffer.alloc(16);
  e[0] = s === 256 ? 0 : s;   // 0 means 256 in the ICO directory
  e[1] = s === 256 ? 0 : s;
  e[2] = 0; e[3] = 0;
  e.writeUInt16LE(1, 4);      // colour planes
  e.writeUInt16LE(32, 6);     // bits per pixel
  e.writeUInt32LE(data.length, 8);
  e.writeUInt32LE(offset, 12);
  offset += data.length;
  return e;
});

const ico = Buffer.concat([header, ...entries, ...images.map((i) => i.data)]);
const out = process.argv[2] || 'planner-icon.ico';
fs.writeFileSync(out, ico);
fs.writeFileSync(out.replace(/\.ico$/, '-256.png'), images[images.length - 1].data);
console.log('wrote ' + out + ' — ' + images.length + ' sizes, ' + ico.length + ' bytes');

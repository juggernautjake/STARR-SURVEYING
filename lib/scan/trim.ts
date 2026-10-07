// lib/scan/trim.ts — crop a scanned page down to the paper, cutting the empty scan space around it.
//
// Found on the first real DS-640 scan, 2026-10-07: a sheet feeder that does not know how long the
// page is scans its full length — 14 inches — so a letter page arrives with three inches of empty
// white under it. Owner, the same day: "Whenever we scan receipts it often has a lot of blank/empty
// scan space that can be trimmed." A receipt is worse: a 3-inch strip centred in an 8.5-inch-wide
// scan is two-thirds empty, on both sides as well as below.
//
// So this finds the box the content sits in — top, bottom, left and right — and crops to it with a
// small margin. The person sees the cropped page in the preview and can still turn or drop it.
//
// Conservative on purpose: nothing is cut unless a meaningful strip (≥ 3% of the page) is empty,
// a stray speck of dust does not count as content, and a page with nothing on it is left exactly as
// scanned for the person to judge.

export interface Box { left: number; top: number; width: number; height: number }

/** First and last index whose ink count is over `threshold`, or null when none is. Pure. */
export function contentSpan(ink: ArrayLike<number>, threshold: number): [number, number] | null {
  let first = -1;
  let last = -1;
  for (let i = 0; i < ink.length; i += 1) {
    if (ink[i] > threshold) { if (first < 0) first = i; last = i; }
  }
  return first < 0 ? null : [first, last];
}

/**
 * Where to crop, from per-row and per-column "ink" counts (dark pixels per line). Pure: returns the
 * box to keep, or null when there is nothing worth cutting.
 */
export function trimPlan(rowsInk: ArrayLike<number>, colsInk: ArrayLike<number>, width: number, height: number, margin = 24): Box | null {
  // A line with a few specks of dust is still blank: allow 0.2% of the line's length.
  const rows = contentSpan(rowsInk, Math.max(2, width * 0.002));
  const cols = contentSpan(colsInk, Math.max(2, height * 0.002));
  if (!rows || !cols) return null;
  const top = Math.max(0, rows[0] - margin);
  const bottom = Math.min(height, rows[1] + 1 + margin);
  const left = Math.max(0, cols[0] - margin);
  const right = Math.min(width, cols[1] + 1 + margin);
  const box = { left, top, width: right - left, height: bottom - top };
  const worthIt = box.height < height * 0.97 || box.width < width * 0.97;
  return worthIt ? box : null;
}

/** Crop a scanned page image in the browser. Returns the original blob when there is nothing to cut. */
export async function trimScannedPage(blob: Blob): Promise<Blob> {
  if (!blob.type.startsWith('image/') || typeof createImageBitmap !== 'function') return blob;
  let bmp: ImageBitmap;
  try { bmp = await createImageBitmap(blob); } catch { return blob; }
  try {
    // Measure on a small copy: the decision does not need full resolution, and a 2550×4200 page is
    // eleven million pixels.
    const scale = Math.min(1, 800 / Math.max(bmp.width, bmp.height));
    const w = Math.max(1, Math.round(bmp.width * scale));
    const h = Math.max(1, Math.round(bmp.height * scale));
    const probe = document.createElement('canvas');
    probe.width = w; probe.height = h;
    const pctx = probe.getContext('2d', { willReadFrequently: true });
    if (!pctx) return blob;
    pctx.drawImage(bmp, 0, 0, w, h);
    const data = pctx.getImageData(0, 0, w, h).data;
    const rows = new Uint32Array(h);
    const cols = new Uint32Array(w);
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        const i = (y * w + x) * 4;
        // "Ink" = clearly darker than paper. Yellow legal pads and cream paper are still paper.
        const luma = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
        if (luma < 160) { rows[y] += 1; cols[x] += 1; }
      }
    }
    const plan = trimPlan(rows, cols, w, h, Math.round(24 * scale) + 2);
    if (!plan) return blob;
    const sx = Math.max(0, Math.floor(plan.left / scale));
    const sy = Math.max(0, Math.floor(plan.top / scale));
    const sw = Math.min(bmp.width - sx, Math.ceil(plan.width / scale));
    const sh = Math.min(bmp.height - sy, Math.ceil(plan.height / scale));
    const out = document.createElement('canvas');
    out.width = sw; out.height = sh;
    const octx = out.getContext('2d');
    if (!octx) return blob;
    octx.drawImage(bmp, sx, sy, sw, sh, 0, 0, sw, sh);
    const type = blob.type === 'image/png' ? 'image/png' : 'image/jpeg';
    const trimmed = await new Promise<Blob | null>((resolve) => out.toBlob(resolve, type, 0.92));
    out.width = 1; out.height = 1;
    return trimmed ?? blob;
  } finally {
    bmp.close();
  }
}

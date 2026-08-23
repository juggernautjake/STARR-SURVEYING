// lib/design/capture.ts — turning the artboard into a PNG, without a dependency.
//
// Slice E1 of docs/planning/in-progress/DESIGN_STUDIO_2026-08-23.md.
//
// Owner: *"I need to be able to… just capture the canvas view as an image."*
//
// ── WHY THIS IS HAND-WRITTEN ────────────────────────────────────────────────────────────────────
//
// The plan named `html-to-image`. What that library does is: clone the node, inline the computed
// styles, wrap it in an SVG `foreignObject`, paint the SVG onto a canvas and read the canvas back.
// That is what this file does, in about eighty lines, and it avoids adding a dependency to a tool
// whose whole job is to render arbitrary application CSS.
//
// ── WHAT IT CANNOT DO, STATED HONESTLY ──────────────────────────────────────────────────────────
//
// `foreignObject` rendering has one real limit, and it is a sharp one: **anything the image fetches
// from another origin taints the canvas**, and a tainted canvas cannot be read back at all. Fonts
// are handled below by embedding them; a remote image in a mockup is neutralised rather than
// allowed to poison the whole capture. If a capture still fails, it says why, and an OS screenshot
// is the fallback — which is what the owner does today, so that is a detour rather than a wall.

/**
 * ── THE TAINTED CANVAS, AND WHY THIS FILE IS LONGER THAN IT LOOKS ───────────────────────────────
 *
 * The first version of this produced nothing at all, silently. Probed in a real browser, the failure
 * was exact:
 *
 *     SecurityError: Failed to execute 'toBlob' on 'HTMLCanvasElement':
 *     Tainted canvases may not be exported.
 *
 * The SVG carries the app's whole stylesheet — half a megabyte — and `app/styles/globals.css` opens
 * with `@import url('https://fonts.googleapis.com/…')`. Every `@font-face` in there points at
 * `fonts.gstatic.com`. Drawing an image that pulls a cross-origin resource taints the canvas, and a
 * tainted canvas cannot be read back. The SVG loaded fine; it was the read that was refused.
 *
 * Dropping the fonts would fix the taint and break the point: a mockup in the wrong typeface has the
 * wrong line breaks, and line breaks are most of what a layout IS. So the fonts are fetched and
 * embedded as data URIs — same bytes, no cross-origin request at draw time — and anything else
 * remote is neutralised.
 *
 * Only the Latin subsets are fetched. Google serves a dozen unicode-range slices per family; the
 * Cyrillic and Vietnamese ones are bytes nobody in this app will ever render.
 */
const FONT_CACHE = new Map<string, string>();

function base64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  // Chunked: `String.fromCharCode(...bytes)` blows the argument limit on a 30 KB font.
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

/** Does this `@font-face` block cover ordinary Latin text? */
function isLatinFace(block: string): boolean {
  const range = /unicode-range:\s*([^;}]+)/i.exec(block)?.[1];
  if (!range) return true;                     // no range declared — it covers everything
  return /U\+0{0,3}0[0-9a-f]{2}/i.test(range) || /U\+0-7F/i.test(range);
}

async function embedFonts(css: string): Promise<string> {
  // Keep only the font faces worth carrying, then inline their files.
  const faces = [...css.matchAll(/@font-face\s*\{[^}]*\}/gi)].map((m) => m[0]);
  let out = css;

  for (const face of faces) {
    if (!isLatinFace(face)) { out = out.split(face).join(''); continue; }
    const url = /url\((['"]?)(https:\/\/fonts\.gstatic\.com\/[^)'"]+)\1\)/i.exec(face)?.[2];
    if (!url) continue;
    if (!FONT_CACHE.has(url)) {
      try {
        const res = await fetch(url, { mode: 'cors' });
        FONT_CACHE.set(url, res.ok ? `data:font/woff2;base64,${base64(await res.arrayBuffer())}` : '');
      } catch {
        FONT_CACHE.set(url, '');
      }
    }
    const data = FONT_CACHE.get(url);
    if (data) out = out.split(url).join(data);
    else out = out.split(face).join('');       // could not fetch it — drop the face rather than taint
  }

  // An @import would re-fetch cross-origin CSS from inside the image; and any remaining remote
  // url() — a background image, an icon — taints the canvas exactly the same way a font did.
  out = out.replace(/@import\s+url\([^)]*\)\s*;?/gi, '');
  out = out.replace(/url\((['"]?)https?:\/\/[^)'"]+\1\)/gi, 'none');
  return out;
}

/** Every stylesheet rule in the document, as text. `foreignObject` gets no cascade of its own — the
 *  clone carries its styles or it renders as unstyled markup. */
function collectStyles(): string {
  const chunks: string[] = [];
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      const rules = (sheet as CSSStyleSheet).cssRules;
      if (!rules) continue;
      for (const rule of Array.from(rules)) chunks.push(rule.cssText);
    } catch {
      // A cross-origin stylesheet (Google Fonts) refuses `cssRules`. The @font-face it holds is
      // already applied to the live document, and the fonts are loaded, so the capture still
      // renders in the right typeface — there is nothing to recover here.
    }
  }
  return chunks.join('\n');
}

/**
 * Render a DOM node to a PNG blob at its true size.
 *
 * `scale` is a device-pixel multiplier: 2 produces a crisp image on a retina screen and for a
 * document somebody will zoom into.
 */
export interface CaptureResult {
  blob: Blob | null;
  /** Why it failed, in words a person can act on. Never swallowed: a capture that returns null with
   *  no reason is a bug report nobody can file, and this one cost a debugging session. */
  error?: string;
}

export async function captureArtboard(
  node: HTMLElement,
  width: number,
  height: number,
  scale = 2,
): Promise<CaptureResult> {
  try {
    if (document.fonts?.ready) await document.fonts.ready;

    const clone = node.cloneNode(true) as HTMLElement;
    // The live artboard is scaled by the zoom control; the capture wants it at 1:1.
    clone.style.transform = 'none';
    clone.style.width = `${width}px`;
    clone.style.height = `${height}px`;
    clone.style.margin = '0';
    // Editor-only furniture must not appear in the picture.
    clone.querySelectorAll('.dsx__handle, .dsx__size, .dsx__guide, .dsx__gap, .dsx__fold, .dsx__safe')
      .forEach((el) => el.remove());
    clone.querySelectorAll('.is-selected').forEach((el) => el.classList.remove('is-selected'));

    const styles = await embedFonts(collectStyles());
    const serialized = new XMLSerializer().serializeToString(clone);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">`
      + `<defs><style type="text/css"><![CDATA[\n${styles}\n]]></style></defs>`
      + `<foreignObject x="0" y="0" width="${width}" height="${height}">`
      + `<div xmlns="http://www.w3.org/1999/xhtml">${serialized}</div>`
      + '</foreignObject></svg>';

    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
    try {
      const image = await new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('the artboard could not be rasterised — an element in it may reference an image the browser will not read'));
        img.src = url;
      });

      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(width * scale);
      canvas.height = Math.ceil(height * scale);
      const ctx = canvas.getContext('2d');
      if (!ctx) return { blob: null, error: 'this browser gave no 2D canvas context' };
      ctx.scale(scale, scale);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(image, 0, 0);

      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob((b) => resolve(b), 'image/png'));
      return blob ? { blob } : { blob: null, error: 'the canvas produced no image data' };
    } finally {
      URL.revokeObjectURL(url);
    }
  } catch (err) {
    // Never throw at the caller — but never stay silent either. The message is what tells somebody
    // whether to retry, screenshot instead, or report a bug.
    return { blob: null, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Hand a blob to the browser as a download. */
export function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Revoked on the next tick: revoking synchronously races the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadText(filename: string, content: string): void {
  const type = filename.endsWith('.json') ? 'application/json'
    : filename.endsWith('.css') ? 'text/css'
    : filename.endsWith('.md') ? 'text/markdown'
    : 'text/html';
  downloadBlob(filename, new Blob([content], { type: `${type};charset=utf-8` }));
}

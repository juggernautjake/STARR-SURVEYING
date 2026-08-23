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
// `foreignObject` rendering has two real limits, and both are handled rather than hidden:
//
//   · **Cross-origin images taint the canvas**, and `toBlob` then throws. Mockups use placeholders
//     rather than remote photographs, but if one ever does, the capture returns null and the caller
//     says "use a screenshot instead" — which is what the owner does today, so the fallback is the
//     status quo rather than a failure.
//   · **Fonts must be embedded or already loaded.** The studio runs inside the app, so Inter and
//     Sora are loaded by the time anybody presses the button; `document.fonts.ready` is awaited to
//     be sure.

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
export async function captureArtboard(
  node: HTMLElement,
  width: number,
  height: number,
  scale = 2,
): Promise<Blob | null> {
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

    const serialized = new XMLSerializer().serializeToString(clone);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">`
      + `<defs><style type="text/css"><![CDATA[\n${collectStyles()}\n]]></style></defs>`
      + `<foreignObject x="0" y="0" width="${width}" height="${height}">`
      + `<div xmlns="http://www.w3.org/1999/xhtml">${serialized}</div>`
      + '</foreignObject></svg>';

    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
    try {
      const image = await new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('the SVG could not be rasterised'));
        img.src = url;
      });

      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(width * scale);
      canvas.height = Math.ceil(height * scale);
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      ctx.scale(scale, scale);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(image, 0, 0);

      return await new Promise<Blob | null>((resolve) => canvas.toBlob((blob) => resolve(blob), 'image/png'));
    } finally {
      URL.revokeObjectURL(url);
    }
  } catch {
    // Never throw at the caller: a failed capture should say so and leave the design untouched.
    return null;
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

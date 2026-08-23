// lib/design/capture.ts — turning the artboard into a picture.
//
// Slice E1 of docs/planning/in-progress/DESIGN_STUDIO_2026-08-23.md.
//
// Owner: *"I need to be able to… just capture the canvas view as an image."*
//
// ── THE OBVIOUS APPROACH DOES NOT WORK HERE, AND THE PROOF IS SHORT ─────────────────────────────
//
// Every "DOM to image" library — `html-to-image`, `dom-to-image`, and the first version of this
// file — wraps the cloned DOM in an SVG `<foreignObject>`, draws that SVG onto a canvas, and reads
// the canvas back. It produced nothing at all, silently. Probed in the real browser:
//
//     SecurityError: Failed to execute 'toBlob' on 'HTMLCanvasElement':
//     Tainted canvases may not be exported.
//
// The first suspicion was the fonts: the app `@import`s Google Fonts, and a cross-origin resource
// inside the image taints the canvas. Embedding the fonts as data URIs did not fix it. So the
// question was asked directly — draw a `foreignObject` containing one red `<div>`, with no CSS, no
// fonts and nothing remote at all:
//
//     bare foreignObject → TAINTED
//     plain <rect>       → 334 byte PNG, fine
//
// **This browser taints any canvas drawn from an SVG containing a foreignObject, full stop.** No
// amount of cleaning the content changes that, because the content was never the problem.
//
// ── SO THE ARTBOARD IS DRAWN AS REAL SVG ────────────────────────────────────────────────────────
//
// Instead of asking the browser to rasterise HTML, this walks the artboard and emits the primitives
// SVG has always been allowed to rasterise: a `<rect>` per box, using its computed background,
// border and corner radius, and a `<text>` per LINE of text, positioned from the line's own client
// rect so wrapped text lands exactly where it wrapped.
//
// It is not a screenshot and does not pretend to be — gradients, shadows and images are not carried
// — but for a mockup made of boxes, borders and words it is faithful, it is VECTOR (so the SVG is
// worth keeping in its own right), and unlike the approach every library uses, it actually works.

/** A box we are going to draw, in artboard coordinates. */
interface Box {
  x: number; y: number; w: number; h: number;
  fill?: string;
  stroke?: { color: string; width: number };
  radius: [number, number, number, number];
  opacity: number;
}

interface TextLine {
  x: number; y: number;
  text: string;
  font: string;
  size: number;
  weight: string;
  colour: string;
  anchor: 'start' | 'middle' | 'end';
}

const TRANSPARENT = /^(transparent|rgba\(0,\s*0,\s*0,\s*0\))$/i;

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function radiusOf(style: CSSStyleDeclaration): [number, number, number, number] {
  const read = (v: string) => Math.max(0, parseFloat(v) || 0);
  return [
    read(style.borderTopLeftRadius),
    read(style.borderTopRightRadius),
    read(style.borderBottomRightRadius),
    read(style.borderBottomLeftRadius),
  ];
}

/** A rounded rectangle path, so per-corner radii survive — one control that becomes four is a
 *  feature of the inspector, and an export that flattens it would quietly discard the decision. */
function roundedRectPath(box: Box): string {
  const [tl, tr, br, bl] = box.radius.map((r) => Math.min(r, box.w / 2, box.h / 2));
  const { x, y, w, h } = box;
  return [
    `M${x + tl},${y}`,
    `H${x + w - tr}`, tr ? `A${tr},${tr} 0 0 1 ${x + w},${y + tr}` : '',
    `V${y + h - br}`, br ? `A${br},${br} 0 0 1 ${x + w - br},${y + h}` : '',
    `H${x + bl}`, bl ? `A${bl},${bl} 0 0 1 ${x},${y + h - bl}` : '',
    `V${y + tl}`, tl ? `A${tl},${tl} 0 0 1 ${x + tl},${y}` : '',
    'Z',
  ].filter(Boolean).join(' ');
}

/**
 * Walk the artboard and collect what to draw.
 *
 * Boxes first, in DOM order, so later siblings paint over earlier ones exactly as the browser
 * stacks them. Text is collected per line via `Range.getClientRects()`, which is the browser's own
 * answer to "where did this text actually end up" — including wrapping, alignment and ellipsis.
 */
function collect(root: HTMLElement): { boxes: Box[]; lines: TextLine[] } {
  const origin = root.getBoundingClientRect();
  // The artboard is rendered at the studio's zoom; everything is divided back to 1:1.
  const scale = origin.width / root.offsetWidth || 1;
  const toLocal = (r: DOMRect) => ({
    x: (r.left - origin.left) / scale,
    y: (r.top - origin.top) / scale,
    w: r.width / scale,
    h: r.height / scale,
  });

  const boxes: Box[] = [];
  const lines: TextLine[] = [];
  const SKIP = /dsx__handle|dsx__size|dsx__guide|dsx__gap|dsx__fold|dsx__safe/;

  const visit = (el: HTMLElement) => {
    if (SKIP.test(el.className || '')) return;
    const style = getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') return;

    const rect = toLocal(el.getBoundingClientRect());
    if (rect.w > 0 && rect.h > 0) {
      const fill = TRANSPARENT.test(style.backgroundColor) ? undefined : style.backgroundColor;
      const borderWidth = parseFloat(style.borderTopWidth) || 0;
      const stroke = borderWidth > 0 && !TRANSPARENT.test(style.borderTopColor)
        ? { color: style.borderTopColor, width: borderWidth / scale }
        : undefined;
      if (fill || stroke) {
        boxes.push({ ...rect, fill, stroke, radius: radiusOf(style), opacity: parseFloat(style.opacity) || 1 });
      }
    }

    for (const node of Array.from(el.childNodes)) {
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent ?? '';
        if (!text.trim()) continue;
        const range = document.createRange();
        range.selectNodeContents(node);
        // One <text> per visual line, so wrapped copy lands where it wrapped rather than on one
        // long line running off the edge.
        for (const lineRect of Array.from(range.getClientRects())) {
          if (lineRect.width < 0.5) continue;
          const local = toLocal(lineRect);
          const size = (parseFloat(style.fontSize) || 14) / scale;
          lines.push({
            // The baseline sits roughly 78% down the line box for the stacks this app uses.
            x: style.textAlign === 'center' ? local.x + local.w / 2
              : style.textAlign === 'right' ? local.x + local.w
                : local.x,
            y: local.y + local.h * 0.78,
            text: text.replace(/\s+/g, ' ').trim(),
            font: style.fontFamily,
            size,
            weight: style.fontWeight,
            colour: style.color,
            anchor: style.textAlign === 'center' ? 'middle' : style.textAlign === 'right' ? 'end' : 'start',
          });
        }
        range.detach?.();
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        visit(node as HTMLElement);
      }
    }
  };

  visit(root);
  return { boxes, lines };
}

/**
 * The artboard as an SVG document.
 *
 * Exported in its own right: a vector file opens in any browser, scales without blurring, and can
 * be dropped into a document. The PNG below is this, rasterised.
 */
export function artboardToSvg(node: HTMLElement, width: number, height: number): string {
  const { boxes, lines } = collect(node);
  const parts: string[] = [];

  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`);
  parts.push(`<rect width="${width}" height="${height}" fill="#F3F4F6"/>`);

  for (const box of boxes) {
    const opacity = box.opacity < 1 ? ` opacity="${box.opacity}"` : '';
    const fill = box.fill ? ` fill="${box.fill}"` : ' fill="none"';
    const stroke = box.stroke ? ` stroke="${box.stroke.color}" stroke-width="${box.stroke.width}"` : '';
    const rounded = box.radius.some((r) => r > 0);
    parts.push(rounded
      ? `<path d="${roundedRectPath(box)}"${fill}${stroke}${opacity}/>`
      : `<rect x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}"${fill}${stroke}${opacity}/>`);
  }

  for (const line of lines) {
    parts.push(
      `<text x="${line.x.toFixed(1)}" y="${line.y.toFixed(1)}"`
      + ` font-family="${escapeXml(line.font)}" font-size="${line.size.toFixed(1)}"`
      + ` font-weight="${line.weight}" fill="${line.colour}"`
      + (line.anchor === 'start' ? '' : ` text-anchor="${line.anchor}"`)
      + `>${escapeXml(line.text)}</text>`,
    );
  }

  parts.push('</svg>');
  return parts.join('\n');
}

export interface CaptureResult {
  blob: Blob | null;
  /** Why it failed, in words a person can act on. Never swallowed: a capture that returns null with
   *  no reason is a bug report nobody can file, and that cost a debugging session once already. */
  error?: string;
}

/**
 * Rasterise the artboard to a PNG.
 *
 * `scale` is a device-pixel multiplier: 2 is crisp on a retina screen and stands up to zooming.
 */
export async function captureArtboard(
  node: HTMLElement,
  width: number,
  height: number,
  scale = 2,
): Promise<CaptureResult> {
  try {
    if (document.fonts?.ready) await document.fonts.ready;

    const svg = artboardToSvg(node, width, height);
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
    try {
      const image = await new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('the drawing could not be rasterised'));
        img.src = url;
        // Never hang. A promise with no timeout is how an export button becomes a button that does
        // nothing forever, with no message and nothing to report.
        setTimeout(() => reject(new Error('rendering timed out after 20 seconds')), 20_000);
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
    // whether to retry, to export the SVG instead, or to report a bug.
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
    : filename.endsWith('.svg') ? 'image/svg+xml'
    : filename.endsWith('.md') ? 'text/markdown'
    : 'text/html';
  downloadBlob(filename, new Blob([content], { type: `${type};charset=utf-8` }));
}

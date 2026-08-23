// lib/design/capture.ts — turning the artboard into a picture.
//
// Slice E1 of docs/planning/completed/DESIGN_STUDIO_2026-08-23.md.
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
// It is not a screenshot and does not pretend to be. Canvases and data-URI images ARE carried, as
// embedded images; gradients, shadows, rotation and remote images are not — and every one of those
// is REPORTED back to the caller, rather than vanishing quietly, because a picture that is missing
// something while looking finished is the worst thing this file could produce. For a mockup made of
// boxes, borders and words it is faithful, it is VECTOR (so the SVG is worth keeping in its own
// right), and unlike the approach every library uses, it actually works.

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

/** One visual line of a text node: where it landed, and which words are on it. */
interface LineFragment { x: number; y: number; w: number; h: number; text: string }

type ToLocal = (r: DOMRect) => { x: number; y: number; w: number; h: number };

/** Past this, the per-character walk below is not worth its cost — and no mockup label is a novel. */
const MAX_MEASURED_CHARS = 4000;

/**
 * Where each line of a text node ended up, and WHICH WORDS are on it.
 *
 * `Range.getClientRects()` answers the first half — one rect per visual line — and the first version
 * of this file stopped there, pairing every rect with the node's WHOLE text. A sticky note that
 * wrapped onto two lines therefore exported its sentence twice, both copies running off the side of
 * the note. It was invisible in the studio and obvious the moment the PNG was opened, which is the
 * whole argument for opening the PNG: the export IS the deliverable here, so a wrong export is
 * wrong work, not a cosmetic blemish on correct work.
 *
 * The offsets are recovered by measuring one character at a time and grouping by their tops — the
 * browser is the only thing that knows where it chose to break, and it will only say so one range
 * at a time. Geometry still comes from `getClientRects()`, whose rects are the real line boxes;
 * the walk only decides which characters belong to each. Single-line nodes — nearly all of them —
 * skip the walk entirely.
 */
function lineFragments(node: Text, toLocal: ToLocal): LineFragment[] {
  const raw = node.textContent ?? '';
  const range = document.createRange();
  range.selectNodeContents(node);
  const rects = Array.from(range.getClientRects()).filter((r) => r.width >= 0.5);
  const tidy = (s: string) => s.replace(/\s+/g, ' ').trim();

  if (rects.length === 0) return [];
  if (rects.length === 1 || raw.length > MAX_MEASURED_CHARS) {
    return [{ ...toLocal(rects[0]), text: tidy(raw) }];
  }

  const groups: { top: number; left: number; right: number; bottom: number; chars: string[] }[] = [];
  for (let i = 0; i < raw.length; i += 1) {
    range.setStart(node, i);
    range.setEnd(node, i + 1);
    const r = range.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;      // collapsed whitespace: no box at all
    const last = groups[groups.length - 1];
    if (last && Math.abs(last.top - r.top) <= 1) {
      last.chars.push(raw[i]);
      last.bottom = Math.max(last.bottom, r.bottom);
      if (r.width > 0) {
        last.left = Math.min(last.left, r.left);
        last.right = Math.max(last.right, r.right);
      }
    } else {
      groups.push({ top: r.top, left: r.left, right: r.right, bottom: r.bottom, chars: [raw[i]] });
    }
  }

  const spoken = groups
    .map((g) => ({ g, text: tidy(g.chars.join('')) }))
    .filter((entry) => entry.text.length > 0);

  // The happy path: one group per line box, so each line keeps the browser's own geometry.
  if (spoken.length === rects.length) {
    return spoken.map((entry, i) => ({ ...toLocal(rects[i]), text: entry.text }));
  }
  // Disagreement (bidi, ligatures, an ellipsis): trust the walk's own bounds rather than guess at a
  // pairing. Slightly less exact, still one sentence per line instead of the sentence per line.
  return spoken.map(({ g, text }) => ({
    ...toLocal(new DOMRect(g.left, g.top, Math.max(0, g.right - g.left), Math.max(0, g.bottom - g.top))),
    text,
  }));
}

/**
 * Walk the artboard and collect what to draw.
 *
 * Boxes first, in DOM order, so later siblings paint over earlier ones exactly as the browser
 * stacks them. Text is collected per line via `lineFragments`, which is the browser's own answer to
 * "where did this text actually end up" — including wrapping, alignment and ellipsis.
 */
interface Embedded { x: number; y: number; w: number; h: number; href: string }

function collect(root: HTMLElement): { boxes: Box[]; lines: TextLine[]; images: Embedded[]; untaintable: string[]; omitted: string[] } {
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
  const images: Embedded[] = [];
  const untaintable: string[] = [];
  /** Things this exporter cannot draw. A Set, because one gradient and forty gradients are the same
   *  sentence to the person reading the warning. */
  const omitted = new Set<string>();
  const SKIP = /dsx__handle|dsx__size|dsx__guide|dsx__gap|dsx__fold|dsx__safe/;

  const visit = (el: HTMLElement) => {
    if (SKIP.test(el.className || '')) return;
    const style = getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') return;

    // ── The sketch layer is pixels, and this exporter draws vectors ────────────────────────────
    //
    // Everything else here is redrawn as `<rect>` and `<text>`. A canvas cannot be, so it is
    // carried across as an embedded image. Without this the PNG silently omits every line the
    // owner drew — the worst kind of export bug, because the file looks finished.
    if (el instanceof HTMLCanvasElement) {
      const rect = toLocal(el.getBoundingClientRect());
      if (rect.w > 0 && rect.h > 0) {
        try {
          images.push({ ...rect, href: el.toDataURL('image/png') });
        } catch {
          // A tainted canvas cannot be read. Recorded rather than dropped, so the caller can say so.
          untaintable.push('the drawing layer');
        }
      }
      return;
    }

    // An <img> travels the same way as the canvas — as an embedded image — because an imported page
    // can carry photographs and logos and a mockup missing them is a mockup of a different page.
    // A cross-origin source cannot be read back, and that is reported rather than silently skipped.
    if (el instanceof HTMLImageElement && el.src) {
      const rect = toLocal(el.getBoundingClientRect());
      if (rect.w > 0 && rect.h > 0) {
        if (el.src.startsWith('data:')) images.push({ ...rect, href: el.src });
        else untaintable.push(`an image (${el.src.split('/').pop()?.slice(0, 30) ?? 'remote'})`);
      }
      return;
    }

    const rect = toLocal(el.getBoundingClientRect());

    // ── What this exporter cannot draw, recorded rather than dropped ────────────────────────────
    //
    // It emits rects, paths, text and embedded images. Three things fall outside that, and each one
    // would otherwise vanish from the PNG with the file still looking finished — which is the
    // failure mode this whole file exists to avoid.
    if (rect.w > 0 && rect.h > 0) {
      if (style.backgroundImage && style.backgroundImage !== 'none') {
        omitted.add(/^(linear|radial|conic)-gradient/.test(style.backgroundImage)
          ? 'gradients (drawn as a flat colour)'
          : 'background images');
      }
      if (style.boxShadow && style.boxShadow !== 'none') omitted.add('shadows');
      if (style.transform && style.transform !== 'none' && !/^matrix\(1, ?0, ?0, ?1,/.test(style.transform)) {
        omitted.add('rotation (drawn upright)');
      }
    }

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

    // A form control keeps its words in a PROPERTY, not in a child text node, so the walk below
    // never sees them: the first export drew the jobs search field as an empty white bar. On a
    // mockup the placeholder is not decoration — "Search jobs, clients, addresses…" is the design
    // decision being shown — so it is drawn, greyed the way the browser greys it.
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) {
      const boxOnly = el instanceof HTMLInputElement
        && /^(checkbox|radio|range|color|file|image|hidden)$/.test(el.type);
      const placeholder = el instanceof HTMLSelectElement ? '' : el.placeholder;
      const shown = el instanceof HTMLSelectElement
        ? (el.selectedOptions[0]?.text ?? '')
        : (el.value || placeholder);
      if (!boxOnly && shown.trim()) {
        const size = (parseFloat(style.fontSize) || 14) / scale;
        const padLeft = (parseFloat(style.paddingLeft) || 0) / scale;
        const padTop = (parseFloat(style.paddingTop) || 0) / scale;
        const centred = style.textAlign === 'center';
        lines.push({
          x: centred ? rect.x + rect.w / 2 : rect.x + padLeft,
          // A textarea fills from the top; everything else is one line sitting on the middle.
          y: el instanceof HTMLTextAreaElement
            ? rect.y + padTop + size
            : rect.y + rect.h / 2 + size * 0.35,
          text: shown.replace(/\s+/g, ' ').trim(),
          font: style.fontFamily,
          size,
          weight: style.fontWeight,
          colour: !el.value && placeholder ? 'rgb(148, 163, 184)' : style.color,
          anchor: centred ? 'middle' : 'start',
        });
      }
      return;   // its children are the browser's own furniture, not the mockup's
    }

    for (const node of Array.from(el.childNodes)) {
      if (node.nodeType === Node.TEXT_NODE) {
        const raw = node.textContent ?? '';
        if (!raw.trim()) continue;
        const size = (parseFloat(style.fontSize) || 14) / scale;
        // One <text> per visual line, each carrying only ITS line, so wrapped copy lands where it
        // wrapped rather than repeating the whole sentence on every line.
        for (const frag of lineFragments(node as Text, toLocal)) {
          lines.push({
            // The baseline sits roughly 78% down the line box for the stacks this app uses.
            x: style.textAlign === 'center' ? frag.x + frag.w / 2
              : style.textAlign === 'right' ? frag.x + frag.w
                : frag.x,
            y: frag.y + frag.h * 0.78,
            text: frag.text,
            font: style.fontFamily,
            size,
            weight: style.fontWeight,
            colour: style.color,
            anchor: style.textAlign === 'center' ? 'middle' : style.textAlign === 'right' ? 'end' : 'start',
          });
        }
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        visit(node as HTMLElement);
      }
    }
  };

  visit(root);
  return { boxes, lines, images, untaintable, omitted: [...omitted] };
}

/**
 * The artboard as an SVG document.
 *
 * Exported in its own right: a vector file opens in any browser, scales without blurring, and can
 * be dropped into a document. The PNG below is this, rasterised.
 */
export function artboardToSvg(node: HTMLElement, width: number, height: number): string {
  const { boxes, lines, images, untaintable, omitted } = collect(node);
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

  // Between the boxes and the words: ink sits over surfaces, and text stays readable over ink.
  for (const img of images) {
    parts.push(
      `<image x="${img.x.toFixed(1)}" y="${img.y.toFixed(1)}"`
      + ` width="${img.w.toFixed(1)}" height="${img.h.toFixed(1)}"`
      + ` href="${img.href}" preserveAspectRatio="none"/>`,
    );
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
  /** What the drawing could not carry — gradients, shadows, rotation, a remote image. The PNG is
   *  the deliverable, so a silent omission is a wrong deliverable that looks finished. Reported so
   *  the studio can say it rather than the owner finding out from the file. */
  omitted?: string[];
}

/** Everything the vector exporter could not draw on this artboard, without rasterising anything. */
export function captureOmissions(node: HTMLElement, width: number, height: number): string[] {
  const { untaintable, omitted } = collect(node);
  return [...omitted, ...untaintable.map((what) => `${what} could not be read`)];
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

    const omitted = captureOmissions(node, width, height);
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
      return blob ? { blob, omitted } : { blob: null, error: 'the canvas produced no image data', omitted };
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

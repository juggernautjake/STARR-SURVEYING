// lib/viewers/viewer-fit.ts
//
// ── THE DEFAULT ZOOM WAS 100% OF NATURAL SIZE ───────────────────────────────────────────────────
//
// Owner: *"whenever I open an image, it shows it, but if I click the button to go to the next image
// … it does a weird resizing thing. Like, the default is to have the zoom too far in on a lot of
// documents."*
//
// `SourceDocumentViewer` reset `zoom` to `1` on open and on every page change. `1` is not "fit the
// window" — it is 100% of the image's own pixel dimensions. The image element carries
// `maxWidth: 100%`, so the WIDTH always fitted and the bug hid: for a landscape image the page
// looked fine, and for a portrait scan — which is most recorded documents — the height overflowed
// and you saw the top third. Clicking to the next page returned you there every time.
//
// ── WHY THIS IS A MODULE AND NOT FOUR LINES IN THE COMPONENT ────────────────────────────────────
//
// The arithmetic has four edge cases that are each a real bug if wrong, and none of them are
// visible by reading the component: a container that has not been laid out yet, an image whose
// natural dimensions are not known yet, an image smaller than the container, and the interaction
// between `maxWidth: 100%` and the wrapper's `scale()`. The last one is the subtle one — the
// browser has already fitted the width before the transform applies, so the naive
// `containerW / naturalW` is wrong for every image wider than its container.

/**
 * Quarter turns clockwise. Only these four, because only these four leave a scanned page readable
 * and only these four have an exact bounding box — an arbitrary angle needs a trigonometric fit and
 * nobody has ever asked to read a deed at 37°.
 */
export type Rotation = 0 | 90 | 180 | 270;

export interface FitInput {
  containerW: number;
  containerH: number;
  naturalW: number;
  naturalH: number;
  /** Defaults to 0, so every existing caller keeps its exact behaviour. */
  rotation?: Rotation;
}

/**
 * The scale at which the whole page is visible inside the container.
 *
 * Returns `null` when there is not enough information to decide — a container that has not been
 * measured, or an image whose dimensions the browser has not resolved. `null` rather than a
 * fallback of `1` on purpose: `1` is a plausible-looking answer that would leave the viewer in
 * exactly the over-zoomed state this exists to prevent, and a caller that ignores `null` is a
 * caller that has not thought about the un-measured case.
 */
export function fitScale({ containerW, containerH, naturalW, naturalH, rotation = 0 }: FitInput): number | null {
  // These two are belt-and-braces: a NaN reaches the `Number.isFinite(scale)` guard at the end
  // and returns null there anyway, so removing them changes no behaviour — mutation-tested, and the
  // mutant correctly survived. They stay because failing at the input is easier to read at a
  // callsite than failing four lines later for a reason that has to be traced.
  if (!Number.isFinite(containerW) || !Number.isFinite(containerH)) return null;
  if (!Number.isFinite(naturalW) || !Number.isFinite(naturalH)) return null;
  // A container under 2px has been created but not laid out. Measuring against it produces a scale
  // near zero, which renders the page as a dot.
  if (containerW < 2 || containerH < 2) return null;
  if (naturalW <= 0 || naturalH <= 0) return null;

  // The size the browser will draw BEFORE the transform, given `maxWidth: 100%` on the image.
  // For an image wider than the container this is the container width, not the natural width —
  // which is why `containerW / naturalW` is the wrong formula and produces a scale far too small
  // on any large scan.
  const laidOutW = Math.min(containerW, naturalW);
  const laidOutH = laidOutW * (naturalH / naturalW);

  // ── ROTATION CHANGES THE BOX, NOT THE LAYOUT ────────────────────────────────────────────────
  //
  // `rotate()` is a transform: the browser lays the image out first, at `maxWidth: 100%`, and then
  // turns the result. So the laid-out box is the same in every rotation, and what changes is which
  // side of it faces which side of the container. At a quarter turn the box the container has to
  // hold is `laidOutH × laidOutW`.
  //
  // Getting this wrong is not subtle in the way the width bug was: rotating a portrait scan without
  // swapping the terms leaves it fitted to a height it no longer has, and the page runs off both
  // sides. But it IS invisible to every existing test, because they all pass rotation 0.
  const quarter = rotation === 90 || rotation === 270;
  const boxW = quarter ? laidOutH : laidOutW;
  const boxH = quarter ? laidOutW : laidOutH;

  // Capped at 1. A 300px image in a 900px panel is shown at its own size rather than blown up into
  // a blur — "the full page is viewable" is already true for it.
  const scale = Math.min(containerW / boxW, containerH / boxH, 1);

  return Number.isFinite(scale) && scale > 0 ? scale : null;
}

/**
 * The extra scale a quarter-turned page needs, for a viewer whose layout ALREADY fits at scale 1.
 *
 * ── WHY THIS IS A SECOND FUNCTION AND NOT AN ARGUMENT TO THE FIRST ──────────────────────────────
 *
 * `fitScale` above assumes the image is constrained on WIDTH only (`maxWidth: 100%`), which is what
 * `SourceDocumentViewer` does. `ArtifactGallery`'s lightbox constrains BOTH — `max-width: 90vw;
 * max-height: 80vh; object-fit: contain` — so its image already fits the window at zoom 1 and the
 * over-zoom bug never applied to it. Measured, not assumed: that CSS is why the owner's complaint
 * was about the document viewer and not the gallery.
 *
 * What a both-constrained viewer still gets wrong is ROTATION. The box is laid out for the upright
 * aspect ratio; turn it a quarter and the long side is now across the short side of the container.
 * Nothing in the CSS re-runs, because a transform is not layout.
 *
 * So this takes the box the browser has already produced and answers one question: how much smaller
 * does it have to be to survive the turn. At 0° and 180° the answer is always 1.
 */
export function rotationFit({
  containerW, containerH, laidOutW, laidOutH, rotation,
}: {
  containerW: number;
  containerH: number;
  laidOutW: number;
  laidOutH: number;
  rotation: Rotation;
}): number {
  // 1, not null, and the difference from `fitScale` is deliberate. There the un-measured case had
  // to be distinguished because a wrong answer left the viewer over-zoomed. Here the caller is
  // already fitted by CSS, so "no extra scaling" is the correct answer for an unrotated page AND
  // the safe answer for an unmeasurable one.
  if (rotation !== 90 && rotation !== 270) return 1;
  if (![containerW, containerH, laidOutW, laidOutH].every((n) => Number.isFinite(n) && n > 0)) return 1;

  const scale = Math.min(containerW / laidOutH, containerH / laidOutW, 1);
  return Number.isFinite(scale) && scale > 0 ? scale : 1;
}

/**
 * The next rotation, a quarter turn in either direction.
 *
 * Modular arithmetic rather than a lookup table so that 270 + 90 is 0 and not `undefined` — the
 * wrap is the only case worth being careful about, and a table is where somebody forgets a row.
 */
export function nextRotation(current: Rotation, direction: 'cw' | 'ccw' = 'cw'): Rotation {
  const delta = direction === 'cw' ? 90 : 270;
  return (((current + delta) % 360) + 360) % 360 as Rotation;
}

/** Whether the viewer is currently showing the whole page, within floating-point tolerance. */
export function isAtFit(zoom: number, fitZoom: number): boolean {
  return Math.abs(zoom - fitZoom) < 0.001;
}

/**
 * On a next/previous page change, should the viewer re-fit the new page — or keep the user's zoom?
 *
 * Owner: "the images and files render full size when opened, but once the user zooms in while
 * viewing a file, then if they hit a button to view the next or previous page, it will keep that
 * same level of zoom. The zoom should only change if the user updates it manually."
 *
 * So: re-fit only when the user is currently viewing the whole page (still at fit). Once they have
 * zoomed in — `zoom` differs from `fitZoom` — that zoom persists across page navigation, and the new
 * page is shown at the same scale rather than snapping back to fit.
 */
export function shouldRefitOnPageChange(zoom: number, fitZoom: number): boolean {
  return isAtFit(zoom, fitZoom);
}

/** The zoom bounds the controls clamp to. Exported so the buttons and the wheel agree. */
export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 10;

export function clampZoom(z: number): number {
  return Math.min(Math.max(z, MIN_ZOOM), MAX_ZOOM);
}

/** One press of the zoom buttons, and one notch of the wheel. Shared so the two agree. */
export const ZOOM_STEP = 0.25;
export const WHEEL_STEP = 0.15;

// ── THE KEYBOARD MAP, AND THE HINT THAT CANNOT DISAGREE WITH IT ─────────────────────────────────
//
// Owner: *"fix the viewing settings and properties and controls for images/docs on the backend."*
//
// Before this, the viewer handled three keys — Escape, ← and → — and printed a hint naming two of
// them. Every other control was mouse-only: there was no way to rotate a sideways scan at all, no
// way to open it full screen, and no way to save the file you were looking at.
//
// The map and the on-screen hint are ONE list. A shortcut table typed out in JSX beside a switch
// statement is two lists that agree on the day they are written; this repository has now shipped
// four defects of exactly that shape in a week — a label saying "Extracting Data" through a stage
// that was not, a fallback that renamed `unreadable` to "Pending", a health check reporting config
// as capability. `VIEWER_SHORTCUTS` is the source, `viewerIntent` reads it, and the hint renders it.

export type ViewerIntent =
  | 'close'
  | 'prev-page' | 'next-page' | 'first-page' | 'last-page'
  | 'zoom-in' | 'zoom-out' | 'fit' | 'actual-size'
  | 'rotate-cw' | 'rotate-ccw'
  | 'fullscreen' | 'download';

export interface ViewerShortcut {
  intent: ViewerIntent;
  /** The `KeyboardEvent.key` values that fire it. More than one where a keyboard has more than one. */
  keys: readonly string[];
  /** What is printed on screen. `keys[0]` is often unprintable ("ArrowLeft"), so this is separate. */
  shown: string;
  label: string;
  /** Only meaningful when the document has more than one page; the hint hides these for a one-pager. */
  paged?: boolean;
}

export const VIEWER_SHORTCUTS: readonly ViewerShortcut[] = [
  { intent: 'prev-page',   keys: ['ArrowLeft'],       shown: '←',   label: 'Previous page', paged: true },
  { intent: 'next-page',   keys: ['ArrowRight'],      shown: '→',   label: 'Next page',     paged: true },
  { intent: 'first-page',  keys: ['Home'],            shown: 'Home', label: 'First page',   paged: true },
  { intent: 'last-page',   keys: ['End'],             shown: 'End',  label: 'Last page',    paged: true },
  { intent: 'zoom-in',     keys: ['+', '='],          shown: '+',   label: 'Zoom in' },
  { intent: 'zoom-out',    keys: ['-', '_'],          shown: '−',   label: 'Zoom out' },
  { intent: 'fit',         keys: ['0'],               shown: '0',   label: 'Fit the whole page' },
  { intent: 'actual-size', keys: ['1'],               shown: '1',   label: 'Actual size (100%)' },
  { intent: 'rotate-cw',   keys: ['r'],               shown: 'R',   label: 'Rotate right' },
  { intent: 'rotate-ccw',  keys: ['R'],               shown: '⇧R',  label: 'Rotate left' },
  { intent: 'fullscreen',  keys: ['f'],               shown: 'F',   label: 'Full screen' },
  { intent: 'download',    keys: ['d'],               shown: 'D',   label: 'Download this page' },
  { intent: 'close',       keys: ['Escape'],          shown: 'Esc', label: 'Close' },
];

export interface KeyEventLike {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
}

/**
 * Which viewer action a keypress means, or `null` for one that means nothing here.
 *
 * **Any of Ctrl, Meta or Alt returns `null`, and that is the important line.** `Ctrl+D` bookmarks,
 * `Cmd+F` opens find, `Ctrl+-` is the browser's own zoom, and `Ctrl+0` resets it. A viewer that
 * swallows those has broken the browser to add a feature nobody asked for — and it would do it
 * silently, because `preventDefault` on a shortcut somebody expected to work produces no error at
 * all. Shift is deliberately NOT in that list: it is how `R` and `+` are typed.
 */
export function viewerIntent(e: KeyEventLike): ViewerIntent | null {
  if (e.ctrlKey || e.metaKey || e.altKey) return null;
  for (const s of VIEWER_SHORTCUTS) if (s.keys.includes(e.key)) return s.intent;
  return null;
}

/**
 * Whether a keypress belongs to something being typed into, rather than to the viewer.
 *
 * The viewer's own toolbar carries a `<select>` for line width, and the annotation flow puts real
 * inputs on the page. `d` typed into a caption field must write a `d`, not download the scan.
 */
export function isTypingTarget(el: unknown): boolean {
  if (!el || typeof el !== 'object') return false;
  const node = el as { tagName?: string; isContentEditable?: boolean };
  if (node.isContentEditable) return true;
  const tag = (node.tagName ?? '').toUpperCase();
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

// lib/design/document.ts — what a design IS.
//
// Slice W2 of docs/planning/completed/DESIGN_STUDIO_2026-08-23.md.
//
// ── THE ONE STRUCTURAL DECISION ─────────────────────────────────────────────────────────────────
//
// Owner: *"We need a desktop view available with all of the desktop elements available to design
// with, and we need an independent mobile view of the same page that will have its own totally
// separate design."*
//
// So a document holds TWO VIEWS, each with its own element list, its own grid settings and its own
// size. They share a name, a target route and a version history, and nothing else. An earlier draft
// had the mobile view derive from the desktop one; that was wrong. A phone layout is not a squeezed
// desktop layout — it stacks differently, hides things, reorders them, and replaces a table with
// cards — and a tool that opens by guessing at that guess is a tool you spend your time undoing.
//
// The one convenience is `copyElementsToView`, which is a one-time COPY and not a link: the copies
// become ordinary elements of the other view with no memory of where they came from, so adjusting
// one view can never disturb the other.

export type ViewId = 'desktop' | 'mobile';

/** A placed thing. Three kinds, because they are edited differently:
 *   catalogue — an element from the app (a button, an input), rendered with its real classes
 *   shape     — a free primitive (§4.6): rectangle, ellipse, line, arrow…
 *   text      — free text placed anywhere, answering to no component
 */
export type ElementKind = 'catalogue' | 'shape' | 'text';

export interface DesignElement {
  id: string;
  kind: ElementKind;
  /** For `catalogue` — the entry id, e.g. `button.secondary`. */
  catalogId?: string;
  /** For `shape` — `rectangle` | `ellipse` | `line` | `arrow` | `triangle` | `sticky` | `callout`
   *  | `frame` | `image` | `measure`. */
  shape?: string;
  /** Chosen variant of the catalogue entry, if any. */
  variant?: string;
  /** A name you can set, shown in the layers panel. Falls back to the entry's label. */
  name?: string;
  /** The class signature this element was traced from, when it came from a real page (§13). Kept
   *  so an imported element can be told from a drawn one, and so a punch-list flag has something
   *  concrete to point at — `.jobs-page__btn` is findable; "the third button" is not. */
  importedFrom?: string;
  /** Defects seen on this element: broken, does-nothing, duplicate, looks-wrong (§14). These export
   *  as a punch list — see `lib/design/punchlist.ts` for why they are structured rather than notes. */
  flags?: Array<{ kind: 'broken' | 'non-functional' | 'duplicate' | 'ugly'; note?: string }>;

  x: number;
  y: number;
  w: number;
  h: number;
  /** Degrees, clockwise. Shapes and text only; components stay upright because a rotated button is
   *  a mockup nobody can build. */
  rotation?: number;
  z: number;

  /** Slot values — the text in the button, the placeholder in the input. */
  slots: Record<string, string>;
  /** Inspector overrides, as CSS declarations. Kept separate from slots so the export can say
   *  "this is `.admin-btn--primary` with these four properties changed" rather than dumping a
   *  style blob and leaving the builder to diff it by eye. */
  style: Record<string, string>;

  /** True for sticky notes, callouts, arrows and measure lines — anything that is a note ABOUT the
   *  design rather than part of it. Kept out of the build spec's `elements` array, because an arrow
   *  pointing at a button is an instruction, not a thing to build. */
  annotation?: boolean;
  /** Free text carried into the export: "this should open the viewer, not download". */
  note?: string;

  locked?: boolean;
  hidden?: boolean;
}

export interface GridSettings {
  /** Whether the grid is DRAWN. Independent of whether it snaps — you can snap to an invisible
   *  grid, and you can look at a grid you are not snapping to. */
  show: boolean;
  /** Whether dragging snaps. Off = free placement, which is what the owner asked for. */
  snap: boolean;
  /** Cell size in px. 8 by default because the token spacing scale is built on 4 and 8. */
  size: number;
  /** How close a snap target has to be, in px, before it pulls. Snapping should assist, not fight. */
  strength: number;
  /** Smart guides: align to other elements' edges and centres, not just to the grid. */
  guides: boolean;
}

export interface DesignView {
  /** The VIEWPORT size. The artboard itself grows downward as far as the design needs — a real page
   *  is not 900px tall, and a fixed-height canvas cannot show the thing that is wrong just below
   *  the fold. `contentHeight` is derived from the elements. */
  width: number;
  height: number;
  settings: GridSettings;
  elements: DesignElement[];
  /** Contract findings this view has been told are wrong, each with a reason (§10, Q3). Lives on
   *  the VIEW rather than on the document so it travels inside the `views` JSONB the server stores
   *  — a dismissal that did not survive a save would be a dismissal you had to make every time.
   *  Optional: designs written before this existed load without it. */
  dismissals?: Dismissal[];
  /** The sketch layer, as a PNG data URL. Raster because the fill bucket is a pixel operation —
   *  see the header of `lib/design/drawing.ts`. Lives on the view because a phone sketch and a
   *  desktop sketch are as independent as their layouts. */
  drawing?: string | null;
  /** Whether the sketch sits behind the elements rather than over them. Behind is right for tracing
   *  a layout you then build on top of; in front is right for marking one up. */
  drawingBelow?: boolean;
}

/** Answering a check: which finding, why, and when. The reason is required by the UI and carried
 *  into the exported brief — see `lib/design/checks.ts`. */
export interface Dismissal {
  findingId: string;
  reason: string;
  at: string;
}

export interface DesignDocument {
  id: string;
  name: string;
  /** The route this design is FOR, e.g. `/admin/jobs`. Null for a scratch idea. */
  route: string | null;
  /** Sibling designs of the same page: "Jobs list — A (dense)" vs "B (cards)". */
  variantOf?: string | null;
  /** What this page is and what it is for, in the designer's own words.
   *
   *  Owner: *"a place to write notes for each page to explain what is on the page and what the
   *  purpose for the page is."* On the DOCUMENT rather than per view, because the purpose of a page
   *  does not change between desktop and mobile — and it goes into the exported brief, where it is
   *  the first thing worth reading. */
  notes?: string;
  views: Record<ViewId, DesignView>;
  createdAt: string;
  updatedAt: string;
  /** Bumped on every save; the version list is keyed by it. */
  version: number;
}

export const VIEW_PRESETS: Record<ViewId, { width: number; height: number; label: string }> = {
  // 1440×900 is the office laptop and the width the alignment audits measure.
  desktop: { width: 1440, height: 900, label: 'Desktop' },
  // 390×844 is an iPhone 14/15 — the width the field crew actually holds.
  mobile: { width: 390, height: 844, label: 'Mobile' },
};

export const DEFAULT_GRID: GridSettings = {
  show: true,
  snap: true,
  size: 8,
  strength: 6,
  guides: true,
};

/** Phone safe areas, drawn on the mobile artboard. A control under either is a control nobody can
 *  tap, and it is invisible in a mockup that does not draw them. */
export const PHONE_SAFE_AREA = { top: 59, bottom: 34 };

let counter = 0;
/** Ids are readable and unique within a session. Not `crypto.randomUUID()` — an element id shows up
 *  in the exported spec, and `el-12` is something a person can talk about. */
export function newElementId(prefix = 'el'): string {
  counter += 1;
  return `${prefix}-${counter.toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

export function createDocument(input: { id: string; name: string; route?: string | null; now: string }): DesignDocument {
  const view = (id: ViewId): DesignView => ({
    width: VIEW_PRESETS[id].width,
    height: VIEW_PRESETS[id].height,
    settings: { ...DEFAULT_GRID },
    elements: [],
  });
  return {
    id: input.id,
    name: input.name,
    route: input.route ?? null,
    views: { desktop: view('desktop'), mobile: view('mobile') },
    createdAt: input.now,
    updatedAt: input.now,
    version: 1,
  };
}

/** How tall the artboard has to be to hold everything, plus a screen of room to keep working. */
export function contentHeight(view: DesignView): number {
  const lowest = view.elements.reduce((max, el) => Math.max(max, el.y + el.h), 0);
  return Math.max(view.height, Math.ceil((lowest + view.height * 0.4) / 100) * 100);
}

/** Where the fold lines go — every viewport-height multiple that the content reaches. Almost every
 *  "why did nobody see this" layout problem lives just below one. */
export function foldLines(view: DesignView): number[] {
  const total = contentHeight(view);
  const folds: number[] = [];
  for (let y = view.height; y < total; y += view.height) folds.push(y);
  return folds;
}

export function topZ(view: DesignView): number {
  return view.elements.reduce((max, el) => Math.max(max, el.z), 0);
}

/** Add an element to a view, on top. */
export function addElement(view: DesignView, element: Omit<DesignElement, 'z'> & { z?: number }): DesignView {
  return {
    ...view,
    elements: [...view.elements, { ...element, z: element.z ?? topZ(view) + 1 }],
  };
}

export function updateElement(view: DesignView, id: string, patch: Partial<DesignElement>): DesignView {
  return {
    ...view,
    elements: view.elements.map((el) => (el.id === id ? { ...el, ...patch } : el)),
  };
}

export function removeElements(view: DesignView, ids: string[]): DesignView {
  const gone = new Set(ids);
  return { ...view, elements: view.elements.filter((el) => !gone.has(el.id)) };
}

/**
 * Copy elements to the other view — the one deliberate bridge between two independent canvases.
 *
 * Scaled to the target's width and stacked in reading order, because the ninety per cent case for
 * a phone layout is "the same things, arranged down the page". The copies are ORDINARY elements of
 * the target view: no link, no sync, no memory. Nothing here can make editing one view disturb the
 * other, which is the property the whole two-view model exists to protect.
 */
export function copyElementsToView(
  source: DesignView,
  target: DesignView,
  ids: string[],
  options: { gap?: number; startY?: number } = {},
): DesignView {
  const gap = options.gap ?? 16;
  const picked = source.elements
    .filter((el) => ids.includes(el.id))
    .sort((a, b) => a.y - b.y || a.x - b.x);
  if (!picked.length) return target;

  const margin = 16;
  const maxWidth = target.width - margin * 2;
  let y = options.startY ?? (target.elements.length ? contentHeightOfElements(target) + gap : margin);
  let z = topZ(target);
  const copies: DesignElement[] = [];

  for (const el of picked) {
    const scale = el.w > maxWidth ? maxWidth / el.w : 1;
    const w = Math.round(el.w * scale);
    const h = Math.round(el.h * scale);
    z += 1;
    copies.push({
      ...el,
      id: newElementId('el'),
      x: margin,
      y,
      w,
      h,
      z,
    });
    y += h + gap;
  }
  return { ...target, elements: [...target.elements, ...copies] };
}

function contentHeightOfElements(view: DesignView): number {
  return view.elements.reduce((max, el) => Math.max(max, el.y + el.h), 0);
}

/** Bring/send, expressed as a reorder of z rather than a swap, so a stack stays gap-free. */
export function reorder(view: DesignView, ids: string[], direction: 'front' | 'back' | 'forward' | 'backward'): DesignView {
  const picked = new Set(ids);
  const sorted = [...view.elements].sort((a, b) => a.z - b.z);
  const moving = sorted.filter((el) => picked.has(el.id));
  const rest = sorted.filter((el) => !picked.has(el.id));
  let next: DesignElement[];

  if (direction === 'front') next = [...rest, ...moving];
  else if (direction === 'back') next = [...moving, ...rest];
  else {
    next = [...sorted];
    const step = direction === 'forward' ? 1 : -1;
    const order = direction === 'forward' ? [...next].reverse() : next;
    for (const el of order) {
      if (!picked.has(el.id)) continue;
      const i = next.indexOf(el);
      const j = i + step;
      if (j < 0 || j >= next.length || picked.has(next[j].id)) continue;
      [next[i], next[j]] = [next[j], next[i]];
    }
  }
  const zById = new Map(next.map((el, i) => [el.id, i + 1]));
  return { ...view, elements: view.elements.map((el) => ({ ...el, z: zById.get(el.id) ?? el.z })) };
}

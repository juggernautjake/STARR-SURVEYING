// lib/design/widget-palette.ts — the widgets a composition can be built from, as data.
//
// W2 of docs/planning/in-progress/DESIGN_STUDIO_SERVES_PAGES_2026-08-24.md.
//
// ── WHY A PROJECTION AND NOT THE REGISTRY ITSELF ────────────────────────────────────────────────
//
// `allWidgets()` returns `WidgetDefinition`s, and every one of them carries `Widget` — a React
// component — plus an optional `SettingsForm` and `Skeleton`. Handing those to the design studio
// would pull all 54 widget implementations, and everything they import, into the studio's bundle to
// draw a list of names and icons.
//
// It would also be a lie about what a palette IS. Placing a widget on a canvas records a CHOICE:
// "this widget, this size, here". The component is not part of that choice — it is what the page
// does with it later, at render time, where the real one is already available. A palette that
// carries components invites somebody to render one in the editor and then the editor and the page
// have two ways of drawing the same widget, which is the drift this whole plan is about.
//
// So: a pure, serialisable projection. It crosses the network as JSON, it can be tested without a
// DOM, and there is exactly one thing on it that a design can store — the `id`.
//
// ── AND WHY GATING LIVES HERE RATHER THAN IN THE UI ─────────────────────────────────────────────
//
// A widget declares who may see it (`allowedRoles`) and what the firm must be paying for
// (`requiresBundle`). §4 of the plan calls a composition "role-aware by construction" precisely
// because of that: the composition says which widgets and where, and each widget already knows its
// own audience.
//
// That only holds if the two questions stay separate. `allowedRoles` is about the VIEWER;
// `requiresBundle` is about the FIRM. Collapsing them into one boolean — "can I place this" — is
// what makes a designer building the employee portal unable to see a widget the employees can, or
// worse, able to place one that silently vanishes for every one of them.


export interface PaletteWidget {
  id: string;
  label: string;
  description: string;
  category: string;
  /** A Lucide icon NAME, not a component — the consumer maps it. Same rule as the registry. */
  iconName: string;
  defaultSize: { w: number; h: number };
  minSize: { w: number; h: number };
  maxSize: { w: number; h: number };
  /** Empty means everyone. Carried through so the editor can say who will actually see this. */
  allowedRoles: string[];
  requiresBundle?: string | null;
}

/** The shape this reads off a `WidgetDefinition`. Structural, so the registry is not imported. */
interface RegistryLike {
  id: string;
  label: string;
  description: string;
  category: string;
  iconName: string;
  defaultSize: { w: number; h: number };
  minSize: { w: number; h: number };
  maxSize: { w: number; h: number };
  allowedRoles: readonly string[];
  /** `| null` as well as optional, so a `PaletteWidget` can be fed back through `toPaletteWidget`.
   *  It projects `undefined` to `null`, so without this the output of the projection is not valid
   *  input to it — which a test found on the first run. */
  requiresBundle?: string | null;
}

/**
 * Strip a registry entry to what a palette needs.
 *
 * Field by field rather than `{ ...def, Widget: undefined }`: a spread would carry every future
 * field of `WidgetDefinition` into a JSON response by default, including the next component
 * somebody adds — which would fail to serialise and take the whole endpoint down with it. An
 * allowlist fails the other way, by omitting something, and an omission is visible.
 */
export function toPaletteWidget(def: RegistryLike): PaletteWidget {
  return {
    id: def.id,
    label: def.label,
    description: def.description,
    category: def.category,
    iconName: def.iconName,
    defaultSize: { ...def.defaultSize },
    minSize: { ...def.minSize },
    maxSize: { ...def.maxSize },
    allowedRoles: [...def.allowedRoles],
    requiresBundle: def.requiresBundle ?? null,
  };
}

// ── WHO WILL SEE IT ─────────────────────────────────────────────────────────────────────────────

/**
 * Will a viewer with these roles see this widget?
 *
 * Empty `allowedRoles` means everyone — the registry's own convention, and the common case.
 *
 * Note what this does NOT ask: whether the firm has the bundle. That is a different question with a
 * different owner and a different remedy (buy the bundle vs. change the role), and answering both
 * with one boolean is what makes "why is this widget missing" unanswerable.
 */
export function visibleToRoles(widget: PaletteWidget, roles: readonly string[]): boolean {
  if (widget.allowedRoles.length === 0) return true;
  const held = new Set(roles.map((r) => r.toLowerCase()));
  return widget.allowedRoles.some((r) => held.has(r.toLowerCase()));
}

/**
 * What the editor should warn about when this widget is placed on a composition for this audience.
 *
 * ── THE FAILURE THIS EXISTS TO PREVENT ──────────────────────────────────────────────────────────
 *
 * Somebody designs the employee portal, places the payroll-approvals widget on it, saves, and every
 * employee sees a gap where it should be — because that widget is `allowedRoles: ['admin']` and the
 * composition is for `employee`. Nothing errored. Nothing was invalid. The page is simply, quietly,
 * wrong for the only people who will ever open it.
 *
 * The editor cannot forbid it: a firm-scoped composition legitimately contains widgets that only
 * some viewers see, and that is the whole point of role-aware rendering. What it can do is SAY so,
 * at the moment of placing, in the person's own terms.
 *
 * Returns null when there is nothing to say — most placements — so a caller can render a warning
 * only when one exists rather than deciding for itself what an empty string means.
 */
export function placementWarning(
  widget: PaletteWidget,
  scope: 'firm' | 'role' | 'user',
  scopeKey: string,
  /** The roles held by the person the composition is for, when that is knowable. */
  audienceRoles: readonly string[] = [],
): string | null {
  if (widget.allowedRoles.length === 0) return null;

  if (scope === 'role') {
    if (visibleToRoles(widget, [scopeKey])) return null;
    return `${widget.label} is only shown to ${widget.allowedRoles.join(' or ')}. On a version for `
      + `${scopeKey}, nobody who sees this page will see this widget.`;
  }

  if (scope === 'user') {
    // Only answerable when the caller knows the person's roles. Silence beats a guess: telling
    // somebody a widget will be invisible when it will not is the fastest way to make every warning
    // in the editor get ignored.
    if (!audienceRoles.length) return null;
    if (visibleToRoles(widget, audienceRoles)) return null;
    return `${widget.label} is only shown to ${widget.allowedRoles.join(' or ')}, and ${scopeKey} `
      + 'does not have that role. It will not appear on their page.';
  }

  // Firm scope. Not a warning about nobody seeing it — a note about who will.
  return `${widget.label} only appears for ${widget.allowedRoles.join(' or ')}. Everyone else sees `
    + 'the rest of the page without it.';
}

// ── GROUPING, FOR A PALETTE THAT IS 54 ITEMS LONG ───────────────────────────────────────────────

/**
 * Widgets by category, categories in the order they first appear.
 *
 * Insertion order rather than alphabetical: the registry lists related widgets together, and
 * sorting the categories would scatter that arrangement for no gain. A palette is scanned, not
 * searched, and the order somebody arranged deliberately beats the order the alphabet imposes.
 */
export function groupByCategory(widgets: PaletteWidget[]): Array<{ category: string; widgets: PaletteWidget[] }> {
  const out: Array<{ category: string; widgets: PaletteWidget[] }> = [];
  const byName = new Map<string, PaletteWidget[]>();
  for (const w of widgets) {
    let bucket = byName.get(w.category);
    if (!bucket) {
      bucket = [];
      byName.set(w.category, bucket);
      out.push({ category: w.category, widgets: bucket });
    }
    bucket.push(w);
  }
  return out;
}

/** Everything a person could mean when typing into the palette's filter. */
export function searchWidgets(widgets: PaletteWidget[], query: string): PaletteWidget[] {
  const q = query.trim().toLowerCase();
  if (!q) return widgets;
  return widgets.filter((w) => `${w.label} ${w.description} ${w.category} ${w.id}`.toLowerCase().includes(q));
}

// ── PLACING ONE ─────────────────────────────────────────────────────────────────────────────────

/**
 * The element a placed widget becomes.
 *
 * ── WHY `catalogue` AND NOT A FOURTH `ElementKind` ──────────────────────────────────────────────
 *
 * `ElementKind` is `catalogue | shape | text`, and a widget is structurally a catalogue element:
 * an id plus a box. Adding a `widget` kind would mean every switch over element kinds in the
 * studio — the renderer, the layers panel, the exporter, the punch list, the conformance matcher —
 * gains a fourth arm, and the ones that are not updated fall through to a default that draws
 * nothing. That is a large surface for a distinction the design can already express.
 *
 * So the id is NAMESPACED instead: `widget:receipts-queue`. A catalogue entry id is dotted
 * (`button.secondary`) and never contains a colon, so the two cannot collide, and `isWidgetElement`
 * is the single place that knows the prefix.
 */
export const WIDGET_PREFIX = 'widget:';

export function widgetCatalogId(widgetId: string): string {
  return `${WIDGET_PREFIX}${widgetId}`;
}

export function isWidgetElement(catalogId: string | undefined): boolean {
  return !!catalogId?.startsWith(WIDGET_PREFIX);
}

/** The widget id back out of an element, or null if this element is not a widget. */
export function widgetIdOf(catalogId: string | undefined): string | null {
  return isWidgetElement(catalogId) ? catalogId!.slice(WIDGET_PREFIX.length) : null;
}

// ── HOW BIG A WIDGET IS ON AN ARTBOARD ──────────────────────────────────────────────────────────
//
// A widget's `defaultSize` is in HUB GRID CELLS — `{ w: 3, h: 2 }` means three columns of eight and
// two rows. An artboard is measured in pixels. The two have to be reconciled somewhere, and doing
// it at the call site would mean the palette's preview, the placed element and the served page each
// picking their own ratio.
//
// The desktop hub is 8 columns across the content area. `HUB_GRID_COLS` is the real constant and is
// imported by the caller rather than duplicated here — this module stays import-free so it can be
// tested and serialised, which is the same reason `RegistryLike` is structural.
//
// The row height is the honest approximation. `MOBILE_BASE_ROW_PX` is 88 and the desktop rows are
// taller; 120 is what a two-row widget needs to not look squashed beside a real one. A design is a
// drawing of a page, and being 10px out on a row is not the failure this system exists to prevent —
// serving the wrong widget to the wrong role is.
export const ARTBOARD_ROW_PX = 120;
export const ARTBOARD_GUTTER_PX = 16;

/** A widget's grid size in artboard pixels, given how wide the artboard is and how many columns. */
export function widgetPixelSize(
  size: { w: number; h: number },
  artboardWidth: number,
  columns: number,
): { w: number; h: number } {
  const colWidth = (artboardWidth - ARTBOARD_GUTTER_PX * (columns - 1)) / columns;
  return {
    // `Math.max(1, …)` because a widget that rounds to zero width is invisible on the canvas and
    // indistinguishable from one that failed to place.
    w: Math.max(1, Math.round(colWidth * size.w + ARTBOARD_GUTTER_PX * (size.w - 1))),
    h: Math.max(1, Math.round(ARTBOARD_ROW_PX * size.h + ARTBOARD_GUTTER_PX * (size.h - 1))),
  };
}

// ── A DESIGN VIEW, AS SOMETHING THE HUB GRID CAN RENDER — W3 ────────────────────────────────────
//
// The studio stores pixels: an element at x=332, y=80, 530×256. The hub renders a GRID: a widget at
// column 2, row 0, spanning 3×2. Serving a composition means going back the other way from the
// conversion `widgetPixelSize` did on the way in.
//
// ── WHY THIS IS LOSSY, AND WHY THAT IS RIGHT ────────────────────────────────────────────────────
//
// A canvas lets you put a widget at x=337. A grid has no such column. Rounding to the nearest one is
// not an approximation of the design — it is what the design MEANT, because the thing being designed
// is a grid layout and the canvas is only how it was drawn. A composition that preserved x=337 would
// render at a position the hub cannot express, and the served page would differ from the preview.
//
// So: round, then clamp into the widget's own `minSize`/`maxSize` envelope, then let the hub's
// existing reflow settle overlaps. Three rules, none of them invented here — the envelope is the
// registry's and the reflow is the hub's.

export interface PlacedWidget {
  /** The element's own id, so a round trip does not renumber anything. */
  id: string;
  type: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** One element back to grid coordinates, or null if it is not a widget. */
export function elementToGrid(
  element: { id: string; catalogId?: string; x: number; y: number; w: number; h: number },
  artboardWidth: number,
  columns: number,
  envelope?: { minSize: { w: number; h: number }; maxSize: { w: number; h: number } },
): PlacedWidget | null {
  const type = widgetIdOf(element.catalogId);
  if (!type) return null;

  const colWidth = (artboardWidth - ARTBOARD_GUTTER_PX * (columns - 1)) / columns;
  const step = colWidth + ARTBOARD_GUTTER_PX;
  const rowStep = ARTBOARD_ROW_PX + ARTBOARD_GUTTER_PX;

  // `+ GUTTER` on the spans because an n-cell widget swallowed n-1 gutters going out; adding one
  // back makes the division exact rather than consistently a fraction short, which would round a
  // 3-cell widget down to 2 at every size.
  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
  const w = clamp(
    Math.round((element.w + ARTBOARD_GUTTER_PX) / step),
    envelope?.minSize.w ?? 1,
    envelope?.maxSize.w ?? columns,
  );
  const h = clamp(
    Math.round((element.h + ARTBOARD_GUTTER_PX) / rowStep),
    envelope?.minSize.h ?? 1,
    envelope?.maxSize.h ?? 99,
  );
  return {
    id: element.id,
    type,
    // Clamped so a widget dragged past the right edge of the artboard does not land in a column that
    // does not exist — the hub would reflow it somewhere arbitrary and the served page would not
    // match the design.
    x: clamp(Math.round(element.x / step), 0, Math.max(0, columns - w)),
    y: Math.max(0, Math.round(element.y / rowStep)),
    w,
    h,
  };
}

/**
 * Every widget on a view, in grid coordinates, reading order.
 *
 * Sorted by row then column rather than by z or by insertion: the hub's reflow resolves overlaps by
 * walking the list, so the order decides who moves. Reading order is the one that matches what
 * somebody drew — the thing at the top-left stays at the top-left.
 */
export function viewToGrid(
  elements: Array<{ id: string; catalogId?: string; x: number; y: number; w: number; h: number }>,
  artboardWidth: number,
  columns: number,
  envelopes: Map<string, { minSize: { w: number; h: number }; maxSize: { w: number; h: number } }> = new Map(),
): PlacedWidget[] {
  return elements
    .map((el) => elementToGrid(el, artboardWidth, columns, envelopes.get(widgetIdOf(el.catalogId) ?? '')))
    .filter((p): p is PlacedWidget => p !== null)
    .sort((a, b) => a.y - b.y || a.x - b.x);
}

// ── WHAT THIS VIEWER ACTUALLY GETS — W5 ─────────────────────────────────────────────────────────
//
// ── THE PLAN SAID THIS CAME FREE. IT DOES NOT. ──────────────────────────────────────────────────
//
// W5 in DESIGN_STUDIO_SERVES_PAGES_2026-08-24.md reads:
//
//     "A composition stores widgets; each widget already declares `allowedRoles`; the served page
//      renders the intersection. … it comes free."
//
// The first half is true and the conclusion is false. `allowedRoles` is consulted in exactly one
// place in the hub — `widgetsForRoles()`, which filters the **Add Widget modal**. `WidgetCell`
// renders whatever instance it is handed and never looks at the definition's roles at all.
//
// That is correct for the hub, and only for the hub: a personal layout can only contain widgets you
// were allowed to add, so the modal IS the gate. A composition breaks that assumption completely —
// it is authored by one person and served to many, so nothing about what the AUTHOR could add says
// anything about what the VIEWER may see.
//
// Found by building it and looking: a firm composition carrying the admin-only pending-receipts
// widget rendered it in full for an account with no roles at all. Fifth premise in this project's
// planning docs to be false when checked rather than assumed.
//
// ── AND WHY THE FIX IS HERE AND NOT IN `WidgetCell` ─────────────────────────────────────────────
//
// Filtering inside `WidgetCell` would be more universally correct — a hub user whose role is revoked
// keeps rendering the widget they added while they had it. But it would change the behaviour of the
// personal hub, which is not what this plan is for, and a silent change to what 54 widgets do on
// somebody's home page is not a side effect to smuggle into a design slice.
//
// So the composition path filters what it PASSES IN. The hub keeps its own behaviour, and the gap in
// it is written down rather than quietly inherited.

/**
 * The subset of a composition this viewer may actually see.
 *
 * A widget the definitions do not know is KEPT: `WidgetCell` already renders a clear "no longer in
 * the catalog" frame for it, and dropping it here would turn a removed widget into a silent hole
 * that nobody could diagnose. Unknown is a different thing from forbidden, and they must not look
 * the same.
 */
export function visibleWidgets<T extends { type: string }>(
  placed: T[],
  viewerRoles: readonly string[],
  definitions: Map<string, { allowedRoles: readonly string[] }>,
): T[] {
  return placed.filter((p) => {
    const def = definitions.get(p.type);
    if (!def) return true;
    if (def.allowedRoles.length === 0) return true;
    const held = new Set(viewerRoles.map((r) => r.toLowerCase()));
    return def.allowedRoles.some((r) => held.has(r.toLowerCase()));
  });
}

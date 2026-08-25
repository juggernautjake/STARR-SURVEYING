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
  requiresBundle?: string;
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

// lib/design/import.ts — turning a real page back into an editable design.
//
// Slices M1–M2 of docs/planning/in-progress/DESIGN_STUDIO_2026-08-23.md (§13).
//
// ── WHY IMPORT AT ALL ───────────────────────────────────────────────────────────────────────────
//
// *"The fastest way to redesign an existing page is to start from it."* Drawing `/admin/jobs` from
// an empty artboard means re-placing forty elements that already exist and already have the right
// class names. Importing it means opening what is there and moving things.
//
// Two by-products are worth more than the feature:
//
//   · **A catalogue coverage check that cannot be fooled.** Anything on a real page that matches no
//     entry is a gap, named, with the route it came from. That list is not an opinion about what
//     the catalogue is missing — it is the page saying so.
//   · **"What it is today" next to "what I want".** The clearest brief there is, in one command.
//
// ── THE PART THAT DECIDES WHETHER THIS IS USEFUL OR NOISE ───────────────────────────────────────
//
// A real admin page has 1,200 DOM nodes and about 40 things a person would call an element. An
// import that faithfully reproduces the DOM produces an unusable canvas — nested wrappers stacked
// on top of each other, nothing draggable, and the actual controls buried under six layers of
// flex containers.
//
// So the walk is DELIBERATELY LOSSY, in one specific way: a node is kept only if the catalogue
// recognises it, or it is a leaf that carries text or takes input. Everything else — the layout
// scaffolding — is dropped, because in a mockup that scaffolding is exactly what is being redrawn.
// `keptOf` and `droppedOf` are reported so the loss is visible rather than silent.

import type { CatalogueEntry } from './catalogue/types';
import type { DesignDocument, DesignElement, DesignView, ViewId } from './document';
import { VIEW_PRESETS, DEFAULT_GRID } from './document';

/** One node as the browser found it. Produced by `scripts/design-import-page.mjs`. */
export interface CapturedNode {
  tag: string;
  classes: string[];
  /** The element's own text, not its descendants' — a wrapper's text is its children's. */
  text: string;
  rect: { x: number; y: number; w: number; h: number };
  /** Only what the studio can act on: everything else is the class's job. */
  styles: { fontSize?: string; fontWeight?: string; color?: string; background?: string; radius?: string };
  /** Does this element PAINT — a background or a visible border? A div that paints is a surface a
   *  person can see and would call an element (a card, a panel, a toolbar); a div that does not is
   *  layout. Without this the first import produced job cards with no card behind them: the number,
   *  the name and the address floating on the artboard with nothing holding them together. */
  paints?: boolean;
  /** How deep in the DOM, so a tie between two matches prefers the more specific one. */
  depth: number;
  /** Classes worn by every ancestor up to the content root. Used to tell an element the catalogue
   *  has never heard of from a PART of one it already knows — see `ImportedView.unmatched`. */
  ancestorClasses?: string[];
}

export interface Match {
  entry: CatalogueEntry;
  /** The variant that matched, when the node wore one — `primary`, `danger`. */
  variant?: string;
  /** 0–1. How much of the entry's class list this node actually wears. */
  score: number;
  /** The classes that made it match, for the report. */
  on: string[];
}

/**
 * The catalogue entry this node is an instance of, if any.
 *
 * The rule is deliberately strict: **every class the entry names must be present.** A looser rule
 * (any overlap) matches `.admin-btn--primary` against the plain `.admin-btn` entry and against
 * every other variant, and then the import is full of confidently wrong labels — which is worse
 * than an unmatched element, because an unmatched element is visibly a question.
 *
 * Among the entries that qualify, the most specific wins: `.admin-btn.admin-btn--primary` beats
 * `.admin-btn`, because it explains more of what the node is wearing.
 */
/**
 * The classes on an entry's OUTERMOST element.
 *
 * `entry.classes` lists every class the entry's markup uses, across all of its nodes — the empty
 * state declares `['admin-empty', 'admin-empty__icon', 'admin-empty__title', 'admin-empty__desc']`.
 * Requiring all four on one node means that entry can never match anything, and the first full
 * sweep duly reported `div.admin-empty` as an uncatalogued element on six routes while a catalogue
 * entry for it sat right there. Composite entries — cards, toolbars, dialogs, empty states — were
 * all invisible to matching for the same reason.
 *
 * What identifies an instance is the root, so that is what is compared.
 */
function rootClassesOf(entry: CatalogueEntry): string[] {
  const first = /<[a-z][a-z0-9]*\s[^>]*class=["']([^"']+)["']/i.exec(entry.html ?? '');
  const fromHtml = first?.[1].split(/\s+/).filter(Boolean).filter((c) => !c.includes('{{'));
  return fromHtml?.length ? fromHtml : entry.classes;
}

export function matchCatalogue(node: CapturedNode, entries: CatalogueEntry[]): Match | null {
  const worn = new Set(node.classes);
  let best: Match | null = null;

  const consider = (entry: CatalogueEntry, classes: string[], variant?: string) => {
    if (classes.length === 0 || !classes.every((c) => worn.has(c))) return;
    const score = classes.length / Math.max(worn.size, classes.length);
    if (!best || classes.length > best.on.length
      || (classes.length === best.on.length && score > best.score)) {
      best = { entry, variant, score, on: classes };
    }
  };

  for (const entry of entries) {
    consider(entry, rootClassesOf(entry));
    // Variants are how this catalogue models `--primary` / `--danger`, and an entry's own `classes`
    // are only ONE of them — `button.page` is declared as the secondary variant. Matching just
    // `entry.classes` therefore reported every primary button on the page as an uncatalogued
    // element, which is the opposite of what the coverage report is for: it would send somebody to
    // curate an entry that already exists.
    for (const v of entry.variants ?? []) consider(entry, v.classes, v.id);
  }
  return best;
}

/** Text-bearing or input-taking leaves, kept even when the catalogue does not know them — they are
 *  the content of the page, and a mockup without them is a wireframe of empty boxes. */
const LEAF_TAGS = new Set(['button', 'a', 'input', 'select', 'textarea', 'label', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'span', 'td', 'th', 'li', 'strong', 'code']);

function isWorthKeeping(node: CapturedNode, match: Match | null): boolean {
  if (match) return true;
  // A surface is a thing you can see, so it is a thing you can move. Only surfaces of a sensible
  // size, though — a 2px painted divider is a rule, not a panel.
  if (node.paints && node.rect.w >= 24 && node.rect.h >= 24) return true;
  if (!LEAF_TAGS.has(node.tag)) return false;
  // A 4px spacer span is not content. Nor is an element with neither text nor a usable size.
  if (node.rect.w < 8 || node.rect.h < 8) return false;
  return node.text.trim().length > 0 || ['input', 'select', 'textarea'].includes(node.tag);
}

/**
 * Drop a node that is entirely covered by a kept ancestor of the same size.
 *
 * A `<button class="admin-btn"><span>Save</span></button>` is one element, not two stacked exactly
 * on top of each other — and two coincident elements in a canvas means the top one is the only one
 * you can ever select.
 */
function isRedundantWith(node: CapturedNode, kept: CapturedNode[]): boolean {
  return kept.some((k) =>
    Math.abs(k.rect.x - node.rect.x) < 4 && Math.abs(k.rect.y - node.rect.y) < 4
    && Math.abs(k.rect.w - node.rect.w) < 8 && Math.abs(k.rect.h - node.rect.h) < 8);
}

export interface ImportedView {
  elements: Array<Omit<DesignElement, 'z'>>;
  kept: number;
  dropped: number;
  /** Nodes nothing in the catalogue recognised, grouped by their class signature.
   *
   *  `insideKnown` separates the two kinds, and the distinction is what makes this list workable:
   *  an element with no catalogued ancestor is a genuine gap, while one INSIDE a catalogued element
   *  is a part of it. `.admin-page-header__crumb` sits inside the catalogued
   *  `.admin-page-header__crumbs`; curating it would add an entry for a piece of an entry. */
  unmatched: Array<{ classes: string; tag: string; count: number; sample: string; insideKnown: boolean }>;
}

/** Turn one viewport's capture into placeable elements, plus the coverage gaps it revealed. */
export function elementsFromCapture(
  nodes: CapturedNode[],
  entries: CatalogueEntry[],
  idFor: (index: number) => string,
): ImportedView {
  const elements: Array<Omit<DesignElement, 'z'>> = [];
  const keptNodes: CapturedNode[] = [];
  const gaps = new Map<string, { classes: string; tag: string; count: number; sample: string; insideKnown: boolean }>();
  const catalogueClasses = new Set(entries.flatMap((e) => [...e.classes, ...(e.variants ?? []).flatMap((v) => v.classes)]));
  let dropped = 0;

  // Outermost first, so `isRedundantWith` compares against the container rather than the label.
  const ordered = [...nodes].sort((a, b) => a.depth - b.depth);

  for (const node of ordered) {
    const match = matchCatalogue(node, entries);
    if (!isWorthKeeping(node, match)) { dropped += 1; continue; }
    if (isRedundantWith(node, keptNodes)) { dropped += 1; continue; }

    if (!match && node.classes.length) {
      // A gap is recorded per class SIGNATURE, not per node: forty table cells with the same class
      // are one missing entry, and forty lines would bury the other gaps.
      const key = `${node.tag}.${node.classes.join('.')}`;
      const existing = gaps.get(key);
      if (existing) existing.count += 1;
      else {
        // Does anything the catalogue knows sit ABOVE this element? If so it is a part, not a gap.
        const insideKnown = (node.ancestorClasses ?? []).some((c) => catalogueClasses.has(c));
        gaps.set(key, {
          classes: node.classes.join(' '),
          tag: node.tag,
          count: 1,
          sample: node.text.slice(0, 40),
          insideKnown,
        });
      }
    }

    keptNodes.push(node);
    elements.push({
      id: idFor(elements.length),
      kind: match ? 'catalogue' : 'text',
      catalogId: match?.entry.id ?? 'shape.text',
      variant: match?.variant,
      // Slot values come from what the page actually says, so the import reads like the page rather
      // than like the catalogue's placeholder copy.
      slots: slotsFor(match?.entry, node),
      style: cleanStyles(node.styles),
      x: Math.round(node.rect.x),
      y: Math.round(node.rect.y),
      w: Math.max(8, Math.round(node.rect.w)),
      h: Math.max(8, Math.round(node.rect.h)),
      name: match?.entry.label ?? (node.text.trim().slice(0, 24) || node.tag),
      // Where it came from, so an imported element can be told from a drawn one — and so the
      // punch-list flags (§14) have something to point at.
      importedFrom: node.classes.join(' ') || node.tag,
    } as Omit<DesignElement, 'z'>);
  }

  return {
    elements,
    kept: elements.length,
    dropped,
    unmatched: [...gaps.values()].sort((a, b) => b.count - a.count),
  };
}

/** Fill the matched entry's slots from the node's own text; unknown entries become plain text. */
function slotsFor(entry: CatalogueEntry | undefined, node: CapturedNode): Record<string, string> {
  const text = node.text.replace(/\s+/g, ' ').trim();
  if (!entry) return { text };
  const slots: Record<string, string> = {};
  for (const slot of entry.slots) {
    slots[slot.name] = /text|label|title|name/i.test(slot.name) && text
      ? text
      : String(slot.default ?? '');
  }
  return slots;
}

/** Only the properties the inspector can edit, and only when they say something. */
function cleanStyles(styles: CapturedNode['styles']): Record<string, string> {
  const out: Record<string, string> = {};
  if (styles.fontSize) out.fontSize = styles.fontSize;
  if (styles.fontWeight && styles.fontWeight !== '400') out.fontWeight = styles.fontWeight;
  if (styles.color) out.color = styles.color;
  // A transparent background is the absence of one, and carrying it forward would make every
  // imported element paint over what is behind it.
  if (styles.background && !/^(transparent|rgba\(0,\s*0,\s*0,\s*0\))$/i.test(styles.background)) {
    out.background = styles.background;
  }
  if (styles.radius && styles.radius !== '0px') out.borderRadius = styles.radius;
  return out;
}

export interface ImportResult {
  doc: DesignDocument;
  coverage: {
    /** Per view: how much of the page survived the walk. */
    desktop: { kept: number; dropped: number };
    mobile: { kept: number; dropped: number };
    /** What the catalogue could not name. The point of the exercise, arguably. */
    gaps: Array<{ classes: string; tag: string; count: number; sample: string; insideKnown: boolean }>;
  };
}

/**
 * A whole design from a capture of both breakpoints.
 *
 * The two views are built INDEPENDENTLY from their own captures — which is the honest thing to do
 * and also the correct one: a responsive page genuinely is two different layouts, and importing the
 * desktop capture into both would produce a mobile view that never existed.
 */
export function documentFromCapture(input: {
  id: string;
  name: string;
  route: string;
  now: string;
  desktop: CapturedNode[];
  mobile: CapturedNode[];
  entries: CatalogueEntry[];
}): ImportResult {
  const views = {} as Record<ViewId, DesignView>;
  const perView: Record<ViewId, ImportedView> = {} as never;

  for (const viewId of ['desktop', 'mobile'] as ViewId[]) {
    const preset = VIEW_PRESETS[viewId];
    const imported = elementsFromCapture(
      viewId === 'desktop' ? input.desktop : input.mobile,
      input.entries,
      (i) => `el-${viewId[0]}${i + 1}-${input.id.slice(-4)}`,
    );
    perView[viewId] = imported;
    views[viewId] = {
      width: preset.width,
      height: preset.height,
      settings: { ...DEFAULT_GRID },
      elements: imported.elements.map((el, i) => ({ ...el, z: i + 1 })),
    };
  }

  // Gaps are merged across both views: an element missing from the catalogue is missing once, not
  // once per breakpoint.
  const merged = new Map<string, { classes: string; tag: string; count: number; sample: string; insideKnown: boolean }>();
  for (const view of [perView.desktop, perView.mobile]) {
    for (const gap of view.unmatched) {
      const existing = merged.get(gap.classes);
      if (existing) existing.count += gap.count;
      else merged.set(gap.classes, { ...gap });
    }
  }

  return {
    doc: {
      id: input.id,
      name: input.name,
      route: input.route,
      variantOf: null,
      views,
      createdAt: input.now,
      updatedAt: input.now,
      version: 0,
    },
    coverage: {
      desktop: { kept: perView.desktop.kept, dropped: perView.desktop.dropped },
      mobile: { kept: perView.mobile.kept, dropped: perView.mobile.dropped },
      gaps: [...merged.values()].sort((a, b) => b.count - a.count),
    },
  };
}

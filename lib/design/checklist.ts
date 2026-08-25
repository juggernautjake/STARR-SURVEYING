// lib/design/checklist.ts — what this page has to have, and how far this design has got.
//
// Phase C of docs/planning/in-progress/PAGE_VERSIONS_AND_PORTAL_THEMES_2026-08-23.md.
//
// Owner: *"I want that information available in the editor so that I can see what elements need to
// be on the page… like a checklist of the required and optional elements. The bare minimum elements
// needed, the optional but useful elements, and then the elements that the user adds themselves. As
// I build the page I can check the elements off and see what is left."*
//
// ── THREE TIERS, AND WHY THE FLOOR MUST STAY SHORT ──────────────────────────────────────────────
//
//   required     the page cannot do its job without it. Ticking every one of these is a claim.
//   recommended  it would be better with it. Optional, and marked so it can never be mistaken for
//                the floor — a checklist where everything is required is a checklist nobody
//                finishes, and one nobody finishes is one nobody reads.
//   custom       a person added it, for this page, for their own reasons.
//
// The generated tiers come from the DOSSIER, so "required" means "measured on the page that is
// actually served, and load-bearing" rather than "somebody's opinion in a spreadsheet". Generated
// items are marked as generated (`generated: true` here, `created_by IS NULL` in the table) because
// a reader has to be able to tell what the system inferred from what a person decided.
//
// ── AND WHY PROGRESS REPORTS TWO NUMBERS ────────────────────────────────────────────────────────
//
// "12 of 18" hides the only question worth asking, which is whether the required ones are done.
// A design with every optional flourish and no data table is not 67% finished; it is not started.
// So `Progress` carries both, and every surface that shows one shows the other.

import type { DesignDocument } from './document';
import type { DossierElement, PageDossier } from './dossier';
import { placedElements } from './dossier';

export type ChecklistTier = 'required' | 'recommended' | 'custom';

export interface ChecklistItem {
  id: string;
  route: string;
  /** Which state of the route this item is about — V6. `''` is the route as a whole. */
  stateKey: string;
  tier: ChecklistTier;
  label: string;
  detail: string | null;
  /** The catalogue entry id or class signature this is about. What makes auto-detection possible. */
  elementRef: string | null;
  sort: number;
  /** False for anything a person typed. Never inferred from the text — it comes from the row. */
  generated: boolean;
  createdBy: string | null;
}

export interface ChecklistState {
  itemId: string;
  checked: boolean;
  note: string | null;
  checkedBy: string | null;
  checkedAt: string | null;
}

/** An item joined to this design's state and to what is on the canvas. */
export interface ChecklistRow extends ChecklistItem {
  checked: boolean;
  note: string | null;
  checkedBy: string | null;
  checkedAt: string | null;
  /**
   * The design contains something that satisfies this, as far as matching can tell.
   *
   * Deliberately NOT the same field as `checked`. A checklist that ticks itself is one nobody
   * trusts — the first time it is confidently wrong, every other tick becomes suspect — and one
   * that ignores what is plainly on the canvas is one nobody uses. So detection is shown beside
   * the box, and the person still decides.
   */
  detected: boolean;
}

export const TIER_LABEL: Record<ChecklistTier, string> = {
  required: 'Must have',
  recommended: 'Worth having',
  custom: 'Yours',
};

export const TIER_MEANING: Record<ChecklistTier, string> = {
  required: 'The page cannot do its job without these.',
  recommended: 'Optional. The page works without them and is better with them.',
  custom: 'Items you added for this page.',
};

// ── GENERATION ──────────────────────────────────────────────────────────────────────────────────

/**
 * Items every admin page gets, whatever is on it.
 *
 * These are the states nobody draws and everybody ships: the empty list, the failed fetch, the page
 * on a phone. They are recommended rather than required — a page can be correct without an explicit
 * error state — except the phone layout, which is required because half this app is used outdoors
 * on a handset and a desktop-only design is not a design of this product.
 */
const UNIVERSAL: Array<Omit<ChecklistItem, 'id' | 'route' | 'stateKey' | 'sort' | 'generated' | 'createdBy'>> = [
  {
    tier: 'required',
    label: 'A mobile layout that is not the desktop one squeezed',
    detail: 'The crew opens this on a phone. Design the mobile view separately — stacked, fewer '
      + 'columns, the primary action reachable with a thumb.',
    elementRef: null,
  },
  {
    tier: 'required',
    label: 'A heading that says where you are',
    detail: 'Arriving from a link, the first question is which page this is.',
    elementRef: null,
  },
  {
    tier: 'recommended',
    label: 'An empty state with a way forward',
    detail: 'What the page looks like before there is any data, and what it invites you to do.',
    elementRef: 'feedback.empty',
  },
  {
    tier: 'recommended',
    label: 'A loading state',
    detail: 'What is on screen while the data is on its way. A blank page reads as a broken one.',
    elementRef: null,
  },
  {
    tier: 'recommended',
    label: 'What happens when it fails',
    detail: 'The fetch that does not come back. Draw the message and what it offers instead.',
    elementRef: null,
  },
];

/**
 * Generate the checklist for a route from its dossier.
 *
 * One item per dossier element, tiered by the dossier's own `required` judgement, plus the
 * universal items. Deterministic ids (`route + selector`) so regenerating does not orphan the state
 * somebody has already ticked — a checklist that forgets its ticks every time the page is
 * re-derived is a checklist that punishes you for keeping the measurement current.
 */
export function generateChecklist(dossier: PageDossier): ChecklistItem[] {
  const items: ChecklistItem[] = [];
  let sort = 0;

  const push = (
    tier: ChecklistTier,
    key: string,
    label: string,
    detail: string | null,
    elementRef: string | null,
  ) => {
    items.push({
      id: idFor(dossier.route, key, dossier.stateKey),
      route: dossier.route,
      stateKey: dossier.stateKey,
      tier,
      label,
      detail,
      elementRef,
      sort: (sort += 1),
      generated: true,
      createdBy: null,
    });
  };

  for (const el of dossier.elements) {
    // One-off decorations are noise in a checklist. An element that appeared once, has no catalogue
    // entry and is not required is almost always a wrapper the trace happened to keep.
    if (!el.required && !el.catalogId && el.count < 2) continue;
    push(
      el.required ? 'required' : 'recommended',
      el.selector,
      itemLabel(el),
      el.purpose,
      el.catalogId ?? el.selector,
    );
  }

  for (const [i, universal] of UNIVERSAL.entries()) {
    push(universal.tier, `universal-${i}`, universal.label, universal.detail ?? null, universal.elementRef);
  }

  // The page's own functions become required items when nothing on the element list covers them:
  // a page that CREATES something needs somewhere to start that, and if the trace missed the
  // button the checklist should still ask for it.
  for (const fn of dossier.functions) {
    if (fn.kind === 'view' || fn.kind === 'navigate') continue;
    const covered = items.some((it) => it.label.toLowerCase().includes(fn.label.toLowerCase().slice(0, 12)));
    if (covered) continue;
    push(
      fn.kind === 'delete' || fn.kind === 'create' ? 'required' : 'recommended',
      `fn-${fn.id}`,
      `Somewhere to: ${fn.label.toLowerCase()}`,
      `${fn.detail} Evidence: ${fn.evidence.slice(0, 2).join(', ') || 'none recorded'}.`,
      null,
    );
  }

  return items;
}

function itemLabel(el: DossierElement): string {
  const what = el.label.trim() || el.selector;
  if (el.count > 1) return `${what} (${el.count} on the page)`;
  return what;
}

/**
 * Stable, readable and unique per route AND STATE. Readable matters: this id shows up in an API
 * error.
 *
 * ── WHY THE STATE IS IN THE ID (V6) ───────────────────────────────────────────────────────────
 *
 * The id is the primary key of a checklist item and the foreign key of every tick against it. Left
 * keyed on the route alone, `/admin/settings`'s six tabs would generate SIX items called
 * `ck-admin-settings-universal-0` — one row, six writers. Three things would follow, none of them
 * visible:
 *
 *   · regenerating one tab's checklist would see the other five tabs' items as its own stale rows
 *     and delete them;
 *   · a tick on the invoices tab would appear, already ticked, on the overview tab;
 *   · and the count would say the page has one checklist when it has six.
 *
 * A shared tick reads as work already done. That is the worst possible failure for a checklist —
 * it does not lose the record, it produces a false one.
 *
 * The empty state keeps its historic id EXACTLY (`ck-admin-jobs-universal-0`, no trailing
 * separator) so the ticks on the 468 route-level dossiers that predate V6 still point at their
 * items. A new suffix on old ids would have silently reset the whole product's progress to zero.
 */
export function idFor(route: string, key: string, stateKey = ''): string {
  const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48);
  const state = slug(stateKey);
  return state ? `ck-${slug(route)}--${state}-${slug(key)}` : `ck-${slug(route)}-${slug(key)}`;
}

// ── JOINING AND PROGRESS ────────────────────────────────────────────────────────────────────────

export function joinChecklist(
  items: ChecklistItem[],
  state: ChecklistState[],
  doc: DesignDocument | null,
  elements: DossierElement[],
): ChecklistRow[] {
  const byItem = new Map(state.map((s) => [s.itemId, s]));
  const placed = doc ? placedElements(doc, elements) : new Set<string>();
  const placedIds = new Set<string>();
  if (doc) {
    for (const view of Object.values(doc.views ?? {})) {
      for (const el of view?.elements ?? []) if (el.catalogId) placedIds.add(el.catalogId);
    }
  }

  return items
    .map((item) => {
      const s = byItem.get(item.id);
      const ref = item.elementRef;
      return {
        ...item,
        checked: s?.checked ?? false,
        note: s?.note ?? null,
        checkedBy: s?.checkedBy ?? null,
        checkedAt: s?.checkedAt ?? null,
        detected: !!ref && (placedIds.has(ref) || placed.has(ref)),
      };
    })
    .sort((a, b) => TIER_ORDER[a.tier] - TIER_ORDER[b.tier] || a.sort - b.sort);
}

const TIER_ORDER: Record<ChecklistTier, number> = { required: 0, recommended: 1, custom: 2 };

export interface Progress {
  required: { done: number; total: number };
  all: { done: number; total: number };
  /** Percent of everything, for the bar. */
  percent: number;
  /** True only when every required item is ticked. The claim worth making. */
  floorMet: boolean;
  /** Items the canvas satisfies that nobody has ticked yet — the nudge, not the tick. */
  undetectedTicks: number;
  detectedUnticked: number;
}

export function progressOf(rows: ChecklistRow[]): Progress {
  const required = rows.filter((r) => r.tier === 'required');
  const doneRequired = required.filter((r) => r.checked).length;
  const done = rows.filter((r) => r.checked).length;
  return {
    required: { done: doneRequired, total: required.length },
    all: { done, total: rows.length },
    percent: rows.length ? Math.round((done / rows.length) * 100) : 0,
    // An empty required list is not a met floor. A page with no checklist has not proved anything,
    // and reporting `true` there would let "complete" mean "never measured".
    floorMet: required.length > 0 && doneRequired === required.length,
    undetectedTicks: rows.filter((r) => r.checked && r.elementRef && !r.detected).length,
    detectedUnticked: rows.filter((r) => !r.checked && r.detected).length,
  };
}

/** One line for a list row: says the floor first, because that is the part that is a claim. */
export function progressSummary(p: Progress): string {
  if (p.all.total === 0) return 'No checklist yet';
  const floor = p.required.total
    ? `${p.required.done}/${p.required.total} must-have`
    : 'nothing required';
  return `${floor} · ${p.all.done}/${p.all.total} in all`;
}

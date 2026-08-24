// lib/design/dossier.ts — what a page is, what it does, and what is on it.
//
// Phase D of docs/planning/in-progress/PAGE_VERSIONS_AND_PORTAL_THEMES_2026-08-23.md.
//
// Owner: *"I want you to evaluate/analyze each page and determine the purpose of the page and what
// all functions it serves. I want a clear comprehensive summary of the purpose of each page and
// every main element on the page and what it is for."*
//
// ── TWO HALVES, AND KEEPING THEM APART IS THE WHOLE DESIGN ──────────────────────────────────────
//
// **Derived** is measured: the walk in `scripts/derive-dossiers.mjs` visits the route, records every
// control, region, heading and network call, and posts the observation here. That half is replaced
// wholesale on every re-derive, because a description of a page that has since changed is worse
// than no description — it is a wrong answer delivered confidently.
//
// **Authored** is written: what this page is for, who opens it, what they are trying to do. No
// crawler produces that sentence. It is never touched by a re-derive, and the API paths that write
// each half are separate so that cannot happen by accident.
//
// Everything in this file is pure. The browser measures, the database stores, and the shaping —
// which is where a dossier is either useful or noise — happens here where a test can hold it.
//
// ── WHY "FUNCTIONS" ARE INFERRED FROM EVIDENCE AND NOT FROM A LIST ──────────────────────────────
//
// The tempting version is a hand-written list of what each of 176 pages does. It would be written
// once, be wrong within a month, and nothing would ever tell you which lines had rotted. So a
// function is INFERRED — a form plus a submit button means the page records something; a POST to
// `/api/admin/jobs` means it writes jobs; a table means it lists them — and every inference carries
// the evidence that produced it. A reader who disagrees can see exactly what the claim rests on,
// which is the difference between a summary you can correct and one you have to take on faith.

import type { CatalogueEntry } from './catalogue/types';
import type { DesignDocument } from './document';

// ── WHAT THE BROWSER SENDS ──────────────────────────────────────────────────────────────────────

/** A control a person can operate: a button, a link, a field, a tab. */
export interface ObservedControl {
  tag: string;
  classes: string[];
  /** Its visible words. A control with no words is a control nobody can describe. */
  text: string;
  kind: 'button' | 'link' | 'input' | 'select' | 'textarea' | 'checkbox' | 'tab';
  /** `type` for inputs, `href` for links — whichever tells you what the control is for. */
  detail?: string;
  disabled?: boolean;
}

/** A region of the page: a table, a form, a card grid, a toolbar, a dialog. */
export interface ObservedRegion {
  tag: string;
  classes: string[];
  kind: 'table' | 'form' | 'list' | 'card' | 'nav' | 'dialog' | 'toolbar' | 'surface' | 'empty';
  /** Its heading or aria-label, when it has one. */
  label?: string;
  /** Rows in a table, cards in a grid — how much of it there is. */
  count?: number;
}

/** One request the page made while it loaded and while it was poked. */
export interface ObservedRequest {
  method: string;
  /** Path only. A query string is one record's worth of accident. */
  path: string;
}

/** Everything one route walk saw. Produced in the browser; shaped here. */
export interface RouteObservation {
  route: string;
  title: string;
  headings: string[];
  controls: ObservedControl[];
  regions: ObservedRegion[];
  requests: ObservedRequest[];
  /** Set when the walk could not trust what it saw — an error page, a redirect, a spinner. */
  problem?: string | null;
}

// ── WHAT A DOSSIER IS ───────────────────────────────────────────────────────────────────────────

export type FunctionKind =
  | 'view' | 'create' | 'edit' | 'delete' | 'filter' | 'navigate' | 'export' | 'act' | 'configure';

export interface DossierFunction {
  id: string;
  label: string;
  detail: string;
  kind: FunctionKind;
  /** What the claim rests on: the classes, the endpoint, the button words. */
  evidence: string[];
}

/**
 * One element of the page, and what it is for.
 *
 * `required` is a JUDGEMENT the deriver makes and the checklist inherits, so it is deliberately
 * conservative: an element is required only when the page cannot do its stated job without it —
 * the heading that says where you are, the surface the data is in, the control that starts the
 * page's main action. Everything else is recommended, and being wrong in that direction costs an
 * unticked box rather than a false floor.
 */
export interface DossierElement {
  /** The class signature — `.jobs-page__filters` — or a tag when it has no classes worth naming. */
  selector: string;
  label: string;
  tag: string;
  kind: ObservedRegion['kind'] | ObservedControl['kind'] | 'heading';
  purpose: string;
  required: boolean;
  /** How many of it there are on the page. Three of something is a pattern; one is an element. */
  count: number;
  /** The catalogue entry this matches, when the palette has one. Null is a gap worth seeing: it
   *  means the page has something the editor cannot draw. */
  catalogId: string | null;
  /** Its words, so a reader can recognise it. */
  sample?: string;
}

export interface DossierEndpoint {
  method: string;
  path: string;
  count: number;
}

/** The measured half. Replaced wholesale on every re-derive. */
export interface DerivedDossier {
  functions: DossierFunction[];
  elements: DossierElement[];
  endpoints: DossierEndpoint[];
  elementCount: number;
  derivedAt: string;
  derivedFrom: string | null;
  problem?: string | null;
}

/** The written half. Never touched by a re-derive. */
export interface AuthoredDossier {
  purpose: string | null;
  summary: string | null;
  audience: string | null;
  authoredBy: string | null;
  authoredAt: string | null;
}

export interface PageDossier extends AuthoredDossier, DerivedDossier {
  route: string;
}

export const EMPTY_DERIVED: DerivedDossier = {
  functions: [], elements: [], endpoints: [], elementCount: 0, derivedAt: '', derivedFrom: null,
};

// ── DERIVING ────────────────────────────────────────────────────────────────────────────────────

/** The class that identifies a thing, ignoring the modifiers and the utility noise. */
function signatureOf(classes: string[], tag: string): string {
  const meaningful = classes.filter((c) => !/^(is-|has-|jsx-)/.test(c) && c.length > 2);
  // BEM: `.jobs-page__filters--open` and `.jobs-page__filters` are the same element in two states.
  const base = meaningful.find((c) => c.includes('__')) ?? meaningful[0];
  if (!base) return tag;
  return `.${base.split('--')[0]}`;
}

/** Words a person would use for it: the element's own text, then its class, then its tag. */
function labelFor(selector: string, tag: string, sample?: string): string {
  const words = (sample ?? '').trim();
  if (words && words.length <= 42) return words;
  const cls = selector.replace(/^\./, '');
  const tail = cls.includes('__') ? cls.split('__').pop()! : cls;
  const readable = tail.replace(/-/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());
  return readable || tag;
}

/**
 * What this element is FOR, in one line.
 *
 * Heuristics over kinds and words, not a lookup table: a lookup table for 176 pages' worth of
 * elements is a document nobody maintains. Where the evidence does not support a specific sentence
 * this says the general true thing rather than inventing a specific false one.
 */
function purposeOf(kind: DossierElement['kind'], label: string, sample?: string): string {
  const words = (sample ?? label).toLowerCase();
  switch (kind) {
    case 'heading': return 'Says which page this is — the first thing read on arrival.';
    case 'table': return 'The records themselves, in rows — the reason the page exists.';
    case 'list': return 'The records themselves, as a list.';
    case 'card': return 'One record, summarised, so a person can scan many at once.';
    case 'form': return 'Where a person enters or changes the page’s data.';
    case 'toolbar': return 'The page’s actions, kept together above the content.';
    case 'nav': return 'Moves between the sections of this page.';
    case 'dialog': return 'A step that has to be finished or abandoned before anything else.';
    case 'empty': return 'What is shown when there is nothing yet — the state most pages forget.';
    case 'input':
      if (/search|find|filter/.test(words)) return 'Narrows what is shown to what is being looked for.';
      return `Takes the “${label}” value.`;
    case 'select':
      if (/status|stage|filter|sort/.test(words)) return 'Filters or sorts the records shown.';
      return `Chooses the “${label}” value.`;
    case 'textarea': return `Takes a longer “${label}” — a note, a description.`;
    case 'checkbox': return `Turns “${label}” on or off.`;
    case 'tab': return 'Switches between the page’s sections without leaving it.';
    case 'link': return `Goes to ${label.toLowerCase()}.`;
    case 'button':
      if (/^(new|add|create|\+)/.test(words)) return 'Starts the page’s main creation flow.';
      if (/save|submit|update/.test(words)) return 'Commits what has been entered.';
      if (/delete|remove|archive/.test(words)) return 'Removes a record — the one action that needs a confirmation.';
      if (/export|download|print/.test(words)) return 'Takes the data off the screen and into a file.';
      return `Performs “${label}”.`;
    default: return 'Part of the page’s furniture.';
  }
}

/** Which elements the page cannot do its job without. Deliberately a short list. */
function isRequired(el: Omit<DossierElement, 'required'>): boolean {
  if (el.kind === 'heading') return true;
  if (el.kind === 'table' || el.kind === 'list') return true;
  if (el.kind === 'form') return true;
  if (el.kind === 'empty') return true;
  // The primary action: a create button is the page's reason for existing on half the admin.
  if (el.kind === 'button' && /^(new|add|create|\+)/i.test(el.sample ?? '')) return true;
  return false;
}

function matchCatalogId(classes: string[], entries: CatalogueEntry[]): string | null {
  const worn = new Set(classes);
  let best: { id: string; size: number } | null = null;
  for (const entry of entries) {
    const candidates = [entry.classes, ...(entry.variants ?? []).map((v) => v.classes)];
    for (const list of candidates) {
      if (!list.length || !list.every((c) => worn.has(c))) continue;
      if (!best || list.length > best.size) best = { id: entry.id, size: list.length };
    }
  }
  return best?.id ?? null;
}

/**
 * Turn one route walk into the measured half of a dossier.
 *
 * Elements are GROUPED by signature: a table with forty rows has forty `.job-row`s and that is one
 * element of the page repeated, not forty elements. Ungrouped, the inventory for `/admin/jobs`
 * would run to three hundred rows and be read by nobody.
 */
export function deriveDossier(
  observation: RouteObservation,
  entries: CatalogueEntry[],
  context: { now: string; base?: string | null },
): DerivedDossier {
  const grouped = new Map<string, DossierElement>();

  const add = (
    kind: DossierElement['kind'],
    tag: string,
    classes: string[],
    sample?: string,
  ) => {
    const selector = signatureOf(classes, tag);
    const existing = grouped.get(selector);
    if (existing) {
      existing.count += 1;
      // Keep the first sample: the first instance of a repeated element is the representative one,
      // and letting later ones overwrite it makes the label change every time the page's data does.
      return;
    }
    const label = labelFor(selector, tag, sample);
    const base: Omit<DossierElement, 'required'> = {
      selector,
      label,
      tag,
      kind,
      purpose: purposeOf(kind, label, sample),
      count: 1,
      catalogId: matchCatalogId(classes, entries),
      sample: sample?.slice(0, 80) || undefined,
    };
    grouped.set(selector, { ...base, required: isRequired(base) });
  };

  for (const [i, heading] of observation.headings.entries()) {
    // Only the first heading is the page's own name; the rest are section headings, which are
    // structure rather than identity.
    add(i === 0 ? 'heading' : 'heading', `h${Math.min(i + 1, 6)}`, [], heading);
  }
  for (const region of observation.regions) add(region.kind, region.tag, region.classes, region.label);
  for (const control of observation.controls) add(control.kind, control.tag, control.classes, control.text);

  const elements = [...grouped.values()].sort((a, b) => {
    if (a.required !== b.required) return a.required ? -1 : 1;
    return b.count - a.count || a.selector.localeCompare(b.selector);
  });

  return {
    functions: inferFunctions(observation, elements),
    elements,
    endpoints: foldEndpoints(observation.requests),
    elementCount: elements.length,
    derivedAt: context.now,
    derivedFrom: context.base ?? null,
    problem: observation.problem ?? null,
  };
}

function foldEndpoints(requests: ObservedRequest[]): DossierEndpoint[] {
  const seen = new Map<string, DossierEndpoint>();
  for (const r of requests) {
    // `/api/admin/jobs/abc123` and `/api/admin/jobs/def456` are one endpoint. Ids are the accident
    // of whichever record happened to be open when the walk ran.
    const path = r.path
      .replace(/\/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, '/:id')
      .replace(/\/\d+(?=\/|$)/g, '/:id');
    const key = `${r.method} ${path}`;
    const hit = seen.get(key);
    if (hit) hit.count += 1;
    else seen.set(key, { method: r.method, path, count: 1 });
  }
  return [...seen.values()].sort((a, b) => b.count - a.count || a.path.localeCompare(b.path));
}

/**
 * The jobs this page does, each with what says so.
 *
 * Order matters: the first function listed is the one a reader takes as the page's purpose, so the
 * page's own data surface comes before the things you can do to it.
 */
export function inferFunctions(
  observation: RouteObservation,
  elements: DossierElement[],
): DossierFunction[] {
  const out: DossierFunction[] = [];
  const has = (kind: DossierElement['kind']) => elements.filter((e) => e.kind === kind);
  const writes = observation.requests.filter((r) => r.method !== 'GET');
  const reads = observation.requests.filter((r) => r.method === 'GET' && r.path.startsWith('/api'));

  const tables = has('table');
  const lists = [...has('list'), ...has('card')];
  if (tables.length || lists.length) {
    const surface = tables[0] ?? lists[0];
    out.push({
      id: 'view',
      kind: 'view',
      label: 'Shows the records',
      detail: `Reads and displays ${surface.count > 1 ? `${surface.count} ` : ''}`
        + `${surface.label.toLowerCase()} — the page's main surface.`,
      evidence: [surface.selector, ...reads.slice(0, 3).map((r) => `GET ${r.path}`)],
    });
  }

  const forms = has('form');
  const creators = elements.filter((e) => e.kind === 'button' && /^(new|add|create|\+)/i.test(e.sample ?? ''));
  if (forms.length || creators.length) {
    const posts = writes.filter((w) => w.method === 'POST');
    out.push({
      id: 'create',
      kind: 'create',
      label: 'Creates a record',
      detail: creators.length
        ? `“${creators[0].sample ?? creators[0].label}” opens the flow that adds one.`
        : 'A form on the page takes a new record.',
      evidence: [
        ...creators.slice(0, 2).map((c) => c.selector),
        ...forms.slice(0, 1).map((f) => f.selector),
        ...posts.slice(0, 2).map((p) => `POST ${p.path}`),
      ].filter(Boolean),
    });
  }

  const edits = writes.filter((w) => w.method === 'PATCH' || w.method === 'PUT');
  if (edits.length) {
    out.push({
      id: 'edit',
      kind: 'edit',
      label: 'Changes a record in place',
      detail: 'The page writes back without a full-page form.',
      evidence: edits.slice(0, 3).map((e) => `${e.method} ${e.path}`),
    });
  }

  const deletes = writes.filter((w) => w.method === 'DELETE');
  if (deletes.length) {
    out.push({
      id: 'delete',
      kind: 'delete',
      label: 'Removes a record',
      detail: 'Destructive — this is the action that needs a confirmation and an undo story.',
      evidence: deletes.slice(0, 3).map((d) => `DELETE ${d.path}`),
    });
  }

  const filters = elements.filter((e) =>
    (e.kind === 'input' || e.kind === 'select')
    && /search|filter|status|stage|sort|from|to|find/i.test(`${e.label} ${e.sample ?? ''}`));
  if (filters.length) {
    out.push({
      id: 'filter',
      kind: 'filter',
      label: 'Narrows what is shown',
      detail: `${filters.length} control${filters.length === 1 ? '' : 's'} filter or sort the list.`,
      evidence: filters.slice(0, 4).map((f) => f.selector),
    });
  }

  const tabs = has('tab');
  if (tabs.length) {
    out.push({
      id: 'sections',
      kind: 'navigate',
      label: 'Switches between sections',
      detail: 'The page holds more than one view of the same subject.',
      evidence: tabs.map((t) => t.selector).slice(0, 3),
    });
  }

  const exports = elements.filter((e) => e.kind === 'button' && /export|download|print|csv|pdf/i.test(e.sample ?? ''));
  if (exports.length) {
    out.push({
      id: 'export',
      kind: 'export',
      label: 'Takes the data off the screen',
      detail: `“${exports[0].sample ?? exports[0].label}”.`,
      evidence: exports.map((e) => e.selector).slice(0, 3),
    });
  }

  // The catch-all is deliberate and last: a page whose evidence supports nothing specific should
  // say so plainly rather than be given an invented purpose.
  if (out.length === 0) {
    out.push({
      id: 'unclassified',
      kind: 'view',
      label: 'Shows information',
      detail: 'Nothing on the page looked like a table, a form or a write — so this is, as far as '
        + 'measurement can tell, a page you read. Worth a sentence from a person.',
      evidence: observation.headings.slice(0, 2),
    });
  }
  return out;
}

// ── MERGING, AND WHAT COUNTS AS COMPLETE ────────────────────────────────────────────────────────

export function mergeDossier(
  route: string,
  authored: Partial<AuthoredDossier> | null,
  derived: Partial<DerivedDossier> | null,
): PageDossier {
  return {
    route,
    purpose: authored?.purpose ?? null,
    summary: authored?.summary ?? null,
    audience: authored?.audience ?? null,
    authoredBy: authored?.authoredBy ?? null,
    authoredAt: authored?.authoredAt ?? null,
    functions: derived?.functions ?? [],
    elements: derived?.elements ?? [],
    endpoints: derived?.endpoints ?? [],
    elementCount: derived?.elementCount ?? derived?.elements?.length ?? 0,
    derivedAt: derived?.derivedAt ?? '',
    derivedFrom: derived?.derivedFrom ?? null,
    problem: derived?.problem ?? null,
  };
}

export type DossierState = 'none' | 'derived-only' | 'authored-only' | 'complete';

/** What exists for this page. The list uses it as a work queue, so "half done" is its own state. */
export function dossierState(d: Pick<PageDossier, 'purpose' | 'summary' | 'elementCount'>): DossierState {
  const authored = !!(d.purpose?.trim() || d.summary?.trim());
  const derived = d.elementCount > 0;
  if (authored && derived) return 'complete';
  if (derived) return 'derived-only';
  if (authored) return 'authored-only';
  return 'none';
}

export const DOSSIER_STATE_LABEL: Record<DossierState, string> = {
  none: 'Nothing yet',
  'derived-only': 'Measured — needs a sentence',
  'authored-only': 'Written — never measured',
  complete: 'Written and measured',
};

/**
 * How stale the measured half is.
 *
 * Not a boolean. A dossier derived this morning and one derived in March are both "derived", and
 * treating them the same is how an inventory quietly becomes fiction.
 */
export function derivedAgeDays(derivedAt: string | null | undefined, now: Date): number | null {
  if (!derivedAt) return null;
  const then = Date.parse(derivedAt);
  if (Number.isNaN(then)) return null;
  return Math.floor((now.getTime() - then) / 86_400_000);
}

/**
 * Which of a dossier's elements a design has actually placed.
 *
 * Matching is by catalogue id first — the reliable signal, since a placed element IS an entry —
 * and by class signature second, for elements imported from a trace which carry `importedFrom`.
 * Anything else would be guessing from geometry, and a guess here would tick a box nobody placed.
 */
export function placedElements(doc: DesignDocument, elements: DossierElement[]): Set<string> {
  const placedIds = new Set<string>();
  const placedSignatures = new Set<string>();
  for (const view of Object.values(doc.views ?? {})) {
    for (const el of view?.elements ?? []) {
      if (el.catalogId) placedIds.add(el.catalogId);
      if (el.importedFrom) {
        for (const cls of el.importedFrom.split(/\s+/)) if (cls) placedSignatures.add(`.${cls.split('--')[0]}`);
      }
    }
  }
  const found = new Set<string>();
  for (const el of elements) {
    if (el.catalogId && placedIds.has(el.catalogId)) found.add(el.selector);
    else if (placedSignatures.has(el.selector)) found.add(el.selector);
  }
  return found;
}

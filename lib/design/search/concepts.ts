// lib/design/search/concepts.ts — the graph that makes searching for "date" find a calendar.
//
// Slice C8c of docs/planning/in-progress/DESIGN_STUDIO_2026-08-23.md.
//
// ── THE REQUIREMENT ─────────────────────────────────────────────────────────────────────────────
//
// Owner: *"if I type 'date' into the element search bar, every element that deals with scheduling
// and dates and calendars and maybe even clocks and timers should show up in the search panel."*
//
// That is not a string match. `date` does not appear in "calendar month grid", "deadline chip",
// "shift row" or "stopwatch pill", and all four are things somebody typing `date` is looking for.
//
// So a query term is matched against this graph as well as against the entries. Any term that is a
// member of a concept expands to the whole concept, scored BELOW a direct hit — so the literal
// matches still come first and the related ones come after, which is the behaviour that makes a
// search feel helpful instead of noisy.
//
// ── HOW TO EXTEND IT ────────────────────────────────────────────────────────────────────────────
//
// Add the word somebody actually typed. This file is the right place for a search that disappointed
// somebody: the fix for "I searched X and did not find Y" is one line here, and it fixes that search
// for everybody, forever. Resist inventing concepts nobody would type — a concept that never matches
// is dead weight in the index and noise in the facet pills.

export interface Concept {
  id: string;
  /** Shown as a facet pill under the search box. */
  label: string;
  /** Every word that should expand to this concept. Lower-case, singular where natural; the matcher
   *  handles simple plurals. */
  terms: string[];
}

export const CONCEPTS: Concept[] = [
  {
    id: 'time',
    label: 'Time & scheduling',
    terms: [
      'date', 'dates', 'time', 'datetime', 'calendar', 'schedule', 'scheduling', 'scheduled',
      'deadline', 'due', 'clock', 'timer', 'stopwatch', 'duration', 'timestamp', 'shift',
      'appointment', 'availability', 'day', 'week', 'month', 'year', 'range', 'recurring',
      'reminder', 'when', 'today', 'overdue', 'expiry', 'expires', 'period', 'hours', 'timesheet',
      'clock-in', 'clock-out', 'punch', 'elapsed', 'countdown',
    ],
  },
  {
    id: 'money',
    label: 'Money',
    terms: [
      'money', 'currency', 'price', 'pricing', 'cost', 'amount', 'invoice', 'quote', 'bid',
      'payment', 'pay', 'payout', 'receipt', 'expense', 'tax', 'rate', 'total', 'balance',
      'dollar', 'usd', 'billing', 'charge', 'refund', 'payroll', 'wage', 'salary', 'budget',
      'outstanding', 'paid', 'unpaid', 'deposit',
    ],
  },
  {
    id: 'person',
    label: 'People',
    terms: [
      'person', 'people', 'user', 'users', 'employee', 'staff', 'crew', 'client', 'customer',
      'contact', 'avatar', 'profile', 'assignee', 'assigned', 'owner', 'role', 'permission',
      'team', 'member', 'account', 'initials', 'signature', 'who',
    ],
  },
  {
    id: 'place',
    label: 'Place',
    terms: [
      'place', 'address', 'location', 'map', 'gps', 'coordinates', 'coords', 'county', 'parcel',
      'site', 'route', 'directions', 'navigate', 'geofence', 'pin', 'marker', 'where', 'city',
      'state', 'zip', 'subdivision', 'lot', 'tract',
    ],
  },
  {
    id: 'status',
    label: 'Status',
    terms: [
      'status', 'state', 'stage', 'badge', 'pill', 'chip', 'tag', 'label', 'flag', 'progress',
      'health', 'phase', 'step', 'complete', 'pending', 'active', 'archived', 'draft', 'priority',
      'severity', 'indicator', 'dot',
    ],
  },
  {
    id: 'input',
    label: 'Input',
    terms: [
      'input', 'field', 'form', 'entry', 'control', 'text', 'textarea', 'number', 'picker',
      'upload', 'type', 'typing', 'search', 'email', 'password', 'phone', 'tel', 'url', 'note',
      'comment', 'placeholder', 'validation', 'required',
    ],
  },
  {
    id: 'choice',
    label: 'Choice',
    terms: [
      'choice', 'choose', 'select', 'dropdown', 'combobox', 'radio', 'checkbox', 'check', 'toggle',
      'switch', 'segmented', 'option', 'options', 'multi', 'multiselect', 'filter', 'pick',
    ],
  },
  {
    id: 'action',
    label: 'Action',
    terms: [
      'action', 'button', 'cta', 'submit', 'save', 'cancel', 'delete', 'remove', 'confirm', 'link',
      'menu', 'add', 'new', 'create', 'edit', 'update', 'send', 'export', 'download', 'upload',
      'print', 'share', 'copy', 'duplicate', 'archive', 'restore', 'approve', 'reject', 'click',
    ],
  },
  {
    id: 'container',
    label: 'Container',
    terms: [
      'container', 'card', 'panel', 'section', 'box', 'well', 'frame', 'group', 'accordion',
      'tabs', 'wrapper', 'surface', 'tile', 'block', 'shell', 'column', 'stack', 'grid', 'layout',
    ],
  },
  {
    id: 'data',
    label: 'Data',
    terms: [
      'data', 'table', 'list', 'row', 'rows', 'column', 'columns', 'cell', 'sort', 'sorting',
      'filter', 'paginate', 'pagination', 'export', 'report', 'record', 'entry', 'summary',
      'count', 'total', 'stat', 'metric', 'chart', 'graph',
    ],
  },
  {
    id: 'feedback',
    label: 'Feedback',
    terms: [
      'feedback', 'empty', 'nothing', 'blank', 'loading', 'skeleton', 'spinner', 'busy', 'error',
      'failed', 'warning', 'success', 'toast', 'banner', 'alert', 'message', 'notice', 'confirm',
      'progress', 'placeholder', 'retry',
    ],
  },
  {
    id: 'media',
    label: 'Media',
    terms: [
      'media', 'image', 'photo', 'picture', 'video', 'file', 'document', 'attachment', 'thumbnail',
      'gallery', 'preview', 'viewer', 'camera', 'audio', 'voice', 'recording', 'pdf', 'drawing',
      'scan', 'upload',
    ],
  },
  {
    id: 'navigation',
    label: 'Navigation',
    terms: [
      'navigation', 'nav', 'menu', 'sidebar', 'rail', 'topbar', 'header', 'breadcrumb', 'back',
      'link', 'tab', 'tabs', 'step', 'stepper', 'wizard', 'pagination', 'crumb', 'home', 'go',
    ],
  },
  {
    id: 'measure',
    label: 'Measurement',
    terms: [
      'measure', 'measurement', 'size', 'dimension', 'acreage', 'acres', 'distance', 'bearing',
      'azimuth', 'area', 'length', 'width', 'height', 'unit', 'feet', 'meters', 'scale', 'ruler',
      'elevation', 'coordinate',
    ],
  },
  {
    id: 'comms',
    label: 'Communication',
    terms: [
      'communication', 'comms', 'message', 'messaging', 'chat', 'comment', 'note', 'email', 'mail',
      'notification', 'alert', 'discussion', 'thread', 'reply', 'inbox', 'call', 'voicemail',
      'sms', 'push', 'announcement',
    ],
  },
  {
    id: 'job',
    label: 'Job & project',
    terms: [
      'job', 'jobs', 'project', 'projects', 'survey', 'boundary', 'topo', 'alta', 'plat', 'field',
      'crew', 'work', 'task', 'assignment', 'deliverable', 'scope', 'stage', 'lead', 'proposal',
      'change order', 'equipment', 'vehicle',
    ],
  },
  {
    // ── A CONCEPT IS WHAT A THING IS, NOT WHAT PROPERTIES IT HAS (narrowed 2026-08-23) ─────────
    //
    // This list used to include `box`, `border`, `fill`, `stroke`, `outline`, `corner`, `radius`
    // and `rounded`. Every one of those is a PROPERTY that half the catalogue has — a card's
    // keywords say "box", a button's say "border" — so searching "sticky" returned the card, the
    // empty state and the page button, all of them through a shared word about styling rather than
    // about what the thing is. A concept that most entries belong to cannot discriminate, and a
    // search that returns everything has not helped anybody.
    id: 'shape',
    label: 'Shapes & annotation',
    terms: [
      'shape', 'rectangle', 'rect', 'square', 'circle', 'ellipse', 'oval', 'line', 'arrow',
      'triangle', 'polygon', 'callout', 'bubble', 'sticky', 'annotation', 'highlight', 'draw',
      'sketch', 'diagram', 'marker',
    ],
  },
];

export const CONCEPT_BY_ID: Record<string, Concept> = Object.fromEntries(
  CONCEPTS.map((c) => [c.id, c]),
);

/**
 * term → concept ids. Built once; the matcher consults it for every query term.
 *
 * A term may belong to more than one concept on purpose — `filter` is both a choice and a data
 * operation, `upload` is both an action and media, `note` is both input and comms. Searching either
 * word should find both families, which is the whole reason this is a graph rather than a tree.
 */
export const CONCEPTS_BY_TERM: Map<string, string[]> = (() => {
  const map = new Map<string, string[]>();
  for (const concept of CONCEPTS) {
    for (const term of concept.terms) {
      const key = term.toLowerCase();
      map.set(key, [...(map.get(key) ?? []), concept.id]);
    }
  }
  return map;
})();

/** Concepts a single query term belongs to, tolerating a trailing plural. */
export function conceptsForTerm(term: string): string[] {
  const t = term.toLowerCase().trim();
  if (!t) return [];
  return CONCEPTS_BY_TERM.get(t)
    ?? CONCEPTS_BY_TERM.get(t.replace(/(ie)?s$/, ''))
    ?? CONCEPTS_BY_TERM.get(`${t}s`)
    ?? [];
}

/** Every term that should also be searched, given what was typed. Used to expand a query before it
 *  reaches the index — and to explain, in the result's "why" line, which concept did the work. */
export function expandTerm(term: string): { concepts: string[]; terms: string[] } {
  const concepts = conceptsForTerm(term);
  const terms = new Set<string>();
  for (const id of concepts) for (const t of CONCEPT_BY_ID[id]?.terms ?? []) terms.add(t);
  terms.delete(term.toLowerCase());
  return { concepts, terms: [...terms] };
}

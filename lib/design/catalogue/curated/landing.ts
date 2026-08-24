// lib/design/catalogue/curated/landing.ts — the workspace landing header, and two strays.
//
// Slice L1 of docs/planning/completed/DESIGN_THEMES_2026-08-23.md, closing B3 from the previous doc.
//
// ── CHOSEN BY MEASUREMENT, NOT BY TASTE ─────────────────────────────────────────────────────────
//
// `scripts/design-coverage-sweep.mjs` walked 133 admin routes and counted every element the palette
// could not name. The six classes at the top of that list were all one component — the workspace
// landing header, which appears on all five workspace roots (`/admin/work`, `/admin/office` and the
// rest) and was entirely uncatalogued apart from its quick-link card. Curating a component that
// renders on five routes beats curating six unrelated one-offs, which is what "top of the queue"
// meant in practice.
//
// ── ONE ENTRY OR SIX? ───────────────────────────────────────────────────────────────────────────
//
// The stat is a composite: a value over a label, inside a link, inside a list. Six separate palette
// entries would let somebody build a stat row from a bare `.ws-landing__stat-value` and get
// something that has never existed on any page — that class is only ever a child of
// `.ws-landing__stat`. So the stat ships as ONE entry with the shape it really has, and so does the
// header. The palette should only offer things you can point at on a real screen.

import {
  defineEntry, COLOUR_PROPS, COMMON_PROPS, INTERACTIVE_STATES, TEXT_ANCHORS, TYPE_PROPS,
} from '../define';
import type { CatalogueEntry } from '../types';

const BASIC = [...COMMON_PROPS, ...COLOUR_PROPS];
const WITH_TYPE = [...COMMON_PROPS, ...COLOUR_PROPS, ...TYPE_PROPS];

export const LANDING_ENTRIES: CatalogueEntry[] = [
  defineEntry({
    id: 'nav.workspace-header',
    category: 'nav',
    areas: ['admin'],
    label: 'Workspace header',
    description: 'The title of a workspace with its keyboard shortcut beside it.',
    keywords: ['workspace', 'landing', 'header', 'title', 'heading', 'shortcut', 'hotkey', 'section'],
    synonyms: ['workspace title', 'section header'],
    concepts: ['navigation', 'identity'],
    html:
      '<header class="ws-landing__header">'
      + '<h1 class="ws-landing__title">{{title}}</h1>'
      + '<span class="ws-landing__shortcut">{{shortcut}}</span>'
      + '</header>',
    classes: ['ws-landing__header', 'ws-landing__title', 'ws-landing__shortcut'],
    slots: [
      { name: 'title', kind: 'text', label: 'Workspace', default: 'Field Work' },
      { name: 'shortcut', kind: 'text', label: 'Shortcut', default: 'G then W' },
    ],
    props: WITH_TYPE,
    anchors: TEXT_ANCHORS,
    size: { default: { w: 420, h: 44 }, resize: 'both', min: { w: 220, h: 32 } },
    source: [{ file: 'app/admin/components/nav/WorkspaceLanding.css', line: 16, kind: 'css' }],
    usage: [{ route: '/admin/work', count: 5 }],
  }),

  defineEntry({
    id: 'nav.workspace-stat',
    category: 'nav',
    areas: ['admin'],
    label: 'Workspace stat',
    description: 'A number over its label, linking to the page that number came from.',
    keywords: ['stat', 'statistic', 'count', 'metric', 'number', 'kpi', 'glance', 'summary', 'workspace', 'attention'],
    synonyms: ['at a glance', 'stat tile', 'metric link'],
    concepts: ['measurement', 'navigation'],
    html:
      '<a class="ws-landing__stat" href="#">'
      + '<span class="ws-landing__stat-value">{{value}}</span>'
      + '<span class="ws-landing__stat-label">{{label}}</span>'
      + '</a>',
    classes: ['ws-landing__stat', 'ws-landing__stat-value', 'ws-landing__stat-label'],
    slots: [
      { name: 'value', kind: 'text', label: 'Value', default: '12' },
      { name: 'label', kind: 'text', label: 'Label', default: 'Open jobs' },
    ],
    props: WITH_TYPE,
    // The component also has a `--attention` modifier for a count that is both non-zero and
    // flagged as needing action. It is NOT listed as a state: `StateName` has no such member, and
    // adding one would be a promise the renderer does not keep — states are metadata here, nothing
    // consumes them to produce a variant yet. Named in the keywords so a search for it lands.
    states: INTERACTIVE_STATES,
    size: { default: { w: 132, h: 66 }, resize: 'both', min: { w: 88, h: 52 } },
    source: [{ file: 'app/admin/components/nav/WorkspaceLanding.css', line: 60, kind: 'css' }],
    usage: [{ route: '/admin/work', count: 5 }],
  }),

  defineEntry({
    id: 'text.workspace-subtitle',
    category: 'text',
    areas: ['admin'],
    label: 'Workspace subtitle',
    description: 'The quiet line under a workspace title that says how much is in it.',
    keywords: ['subtitle', 'caption', 'description', 'subheading', 'workspace', 'landing', 'count'],
    synonyms: ['sub-heading', 'lede'],
    concepts: ['explanation'],
    html: '<p class="ws-landing__subtitle">{{text}}</p>',
    classes: ['ws-landing__subtitle'],
    slots: [{ name: 'text', kind: 'text', label: 'Text', default: 'Every page in Field Work you can reach — 14 pages.' }],
    props: WITH_TYPE,
    anchors: TEXT_ANCHORS,
    size: { default: { w: 480, h: 22 }, resize: 'both', min: { w: 160, h: 18 } },
    source: [{ file: 'app/admin/components/nav/WorkspaceLanding.css', line: 42, kind: 'css' }],
    usage: [{ route: '/admin/work', count: 5 }],
  }),

  // ── The two strays, both on four routes ───────────────────────────────────────────────────────
  defineEntry({
    id: 'text.record-count',
    category: 'text',
    areas: ['admin'],
    label: 'Record count',
    description: 'The "12 total" that sits beside a page title.',
    keywords: ['count', 'total', 'records', 'results', 'tally', 'how many', 'header'],
    synonyms: ['result count', 'total badge'],
    concepts: ['measurement'],
    html: '<span class="jobs-page__count">{{text}}</span>',
    classes: ['jobs-page__count'],
    slots: [{ name: 'text', kind: 'text', label: 'Text', default: '12 total' }],
    props: WITH_TYPE,
    anchors: TEXT_ANCHORS,
    size: { default: { w: 96, h: 22 }, resize: 'both', min: { w: 48, h: 18 } },
    source: [{ file: 'app/admin/styles/AdminLayout.css', line: 1544, kind: 'css' }],
    usage: [{ route: '/admin/jobs', count: 4 }],
  }),

  defineEntry({
    id: 'nav.back-inline',
    category: 'nav',
    areas: ['admin'],
    label: 'Back link (inline)',
    // Not a duplicate of nav.back-link: that one is the chip in the page header, on 125 routes.
    // This is the inline text link inside the body, on four learn routes. Two elements, two
    // entries — but the labels have to say which is which or the palette makes you guess.
    description: 'An arrow and the place you came from, inline in the page body rather than the header.',
    keywords: ['back', 'return', 'previous', 'up', 'parent', 'arrow', 'navigation', 'breadcrumb'],
    synonyms: ['go back', 'return link'],
    concepts: ['navigation'],
    html: '<a class="admin-module-detail__back" href="#">{{text}}</a>',
    classes: ['admin-module-detail__back'],
    slots: [{ name: 'text', kind: 'text', label: 'Text', default: '← Back to Learning Hub' }],
    props: BASIC,
    states: INTERACTIVE_STATES,
    anchors: TEXT_ANCHORS,
    size: { default: { w: 152, h: 24 }, resize: 'both', min: { w: 100, h: 20 } },
    source: [{ file: 'app/admin/styles/AdminLearn.css', line: 536, kind: 'css' }],
    usage: [{ route: '/admin/learn/exam-prep', count: 4 }],
  }),
];

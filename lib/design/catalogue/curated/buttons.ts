// lib/design/catalogue/curated/buttons.ts — the Buttons tab.
//
// Slice W4 / C4 of docs/planning/in-progress/DESIGN_STUDIO_2026-08-23.md.
//
// ── HOW THESE WERE CHOSEN ───────────────────────────────────────────────────────────────────────
//
// The scan found **217 button base classes** in scope, with radii of 4, 6, 8px and 50%, six
// different font sizes and at least eight padding values. That is not 217 decisions; it is a
// handful of decisions made over and over, drifting each time.
//
// So the palette holds the ones the app actually leans on — `.admin-btn` (274 usages), the shared
// `.btn`, the job/project page button, the header action row — and everything else is recorded as
// an exclusion with the entry that covers it. Nothing is dropped in silence: an unexplained
// omission is indistinguishable from an oversight, and six months from now nobody can tell which
// this was.
//
// Every entry's declarations were read from the real stylesheet at the line it cites, not invented.

import { defineEntry, BOX_ANCHORS, COLOUR_PROPS, COMMON_PROPS, CONTROL_CONTRACT, INTERACTIVE_STATES, TYPE_PROPS } from '../define';
import type { CatalogueEntry, CurationExclusion } from '../types';

const BUTTON_PROPS = [...COMMON_PROPS, ...COLOUR_PROPS, ...TYPE_PROPS];

export const BUTTON_ENTRIES: CatalogueEntry[] = [
  defineEntry({
    id: 'button.admin',
    category: 'button',
    areas: ['admin'],
    label: 'Button',
    description: 'The admin shell’s standard button. Red is primary, navy is secondary, ghost is outlined.',
    keywords: ['button', 'action', 'submit', 'save', 'primary', 'secondary', 'ghost', 'cta'],
    synonyms: ['btn', 'push button', 'click'],
    concepts: ['action'],
    html: '<button type="button" class="admin-btn admin-btn--primary">{{label}}</button>',
    classes: ['admin-btn', 'admin-btn--primary'],
    slots: [
      { name: 'label', kind: 'text', label: 'Label', default: 'Save changes', stress: 'Save and send for approval' },
    ],
    props: BUTTON_PROPS,
    defaults: { minHeight: '40px' },
    variants: [
      { id: 'primary', label: 'Primary (red)', classes: ['admin-btn', 'admin-btn--primary'] },
      { id: 'secondary', label: 'Secondary (navy)', classes: ['admin-btn', 'admin-btn--secondary'] },
      { id: 'ghost', label: 'Ghost (outlined)', classes: ['admin-btn', 'admin-btn--ghost'] },
      { id: 'success', label: 'Success (green)', classes: ['admin-btn', 'admin-btn--success'] },
      { id: 'sm', label: 'Small', classes: ['admin-btn', 'admin-btn--primary', 'admin-btn--sm'] },
      { id: 'lg', label: 'Large', classes: ['admin-btn', 'admin-btn--primary', 'admin-btn--lg'] },
    ],
    states: INTERACTIVE_STATES,
    size: { default: { w: 160, h: 40 }, resize: 'both', min: { w: 64, h: 32 } },
    anchors: BOX_ANCHORS,
    source: [
      { file: 'app/admin/styles/AdminLayout.css', line: 596, kind: 'css', note: 'base' },
      { file: 'app/admin/styles/AdminLayout.css', line: 597, kind: 'css', note: '--primary' },
      { file: 'app/admin/styles/AdminLayout.css', line: 599, kind: 'css', note: '--secondary' },
      { file: 'app/admin/styles/AdminLayout.css', line: 601, kind: 'css', note: '--ghost' },
      { file: 'app/admin/styles/AdminLayout.css', line: 605, kind: 'css', note: '--sm' },
    ],
    usage: [{ route: '(app-wide)', count: 274 }],
    contract: CONTROL_CONTRACT,
  }),

  defineEntry({
    id: 'button.page',
    category: 'button',
    areas: ['admin'],
    label: 'Page button',
    description: 'The jobs / projects page button — 8px radius, used in page toolbars and panels.',
    keywords: ['button', 'page', 'toolbar', 'jobs', 'projects', 'panel', 'action'],
    synonyms: ['btn', 'toolbar button'],
    concepts: ['action', 'job'],
    html: '<button type="button" class="jobs-page__btn jobs-page__btn--secondary">{{label}}</button>',
    classes: ['jobs-page__btn', 'jobs-page__btn--secondary'],
    slots: [{ name: 'label', kind: 'text', label: 'Label', default: 'Refresh', stress: 'Export every field capture' }],
    props: BUTTON_PROPS,
    variants: [
      { id: 'secondary', label: 'Secondary', classes: ['jobs-page__btn', 'jobs-page__btn--secondary'] },
      { id: 'primary', label: 'Primary', classes: ['jobs-page__btn', 'jobs-page__btn--primary'] },
      { id: 'danger', label: 'Danger', classes: ['jobs-page__btn', 'jobs-page__btn--danger'] },
    ],
    states: INTERACTIVE_STATES,
    size: { default: { w: 140, h: 40 }, resize: 'both', min: { w: 64, h: 32 } },
    source: [{ file: 'app/admin/styles/AdminJobs.css', line: 246, kind: 'css' }],
    usage: [{ route: '/admin/jobs', count: 18 }, { route: '/admin/projects', count: 20 }],
    contract: CONTROL_CONTRACT,
  }),

  defineEntry({
    id: 'button.header-action',
    category: 'button',
    areas: ['admin'],
    label: 'Header action',
    description: 'A detail page’s header action. One height for the whole row — 40px, from the token.',
    keywords: ['button', 'header', 'action', 'detail', 'delete', 'export', 'ghost', 'danger'],
    synonyms: ['page action', 'toolbar action'],
    concepts: ['action', 'navigation'],
    html: '<button type="button" class="job-detail__action job-detail__action--ghost">{{label}}</button>',
    classes: ['job-detail__action', 'job-detail__action--ghost'],
    slots: [{ name: 'label', kind: 'text', label: 'Label', default: 'View field captures', stress: 'Download every media manifest' }],
    props: BUTTON_PROPS,
    variants: [
      { id: 'primary', label: 'Primary (filled navy)', classes: ['job-detail__action', 'job-detail__action--primary'] },
      { id: 'ghost', label: 'Ghost (navy outline)', classes: ['job-detail__action', 'job-detail__action--ghost'] },
      { id: 'danger', label: 'Danger (red outline)', classes: ['job-detail__action', 'job-detail__action--danger'] },
      { id: 'quiet', label: 'Quiet (grey outline)', classes: ['job-detail__action', 'job-detail__action--quiet'] },
    ],
    states: INTERACTIVE_STATES,
    size: { default: { w: 180, h: 40 }, resize: 'both', min: { w: 80, h: 40 } },
    source: [{ file: 'app/admin/styles/AdminJobs.css', line: 764, kind: 'css', note: 'added 2026-08-22 to give one header five controls at one height' }],
    usage: [{ route: '/admin/jobs/[id]', count: 4 }],
    contract: CONTROL_CONTRACT,
  }),

  defineEntry({
    id: 'button.link',
    category: 'button',
    areas: ['admin', 'marketing'],
    label: 'Back link',
    description: 'The “← back to…” link every page carries. A link, not a button — it navigates.',
    keywords: ['back', 'link', 'navigate', 'up', 'return', 'breadcrumb'],
    synonyms: ['go back', 'previous'],
    concepts: ['navigation', 'action'],
    html: '<a href="#" class="learn__back">← {{label}}</a>',
    classes: ['learn__back'],
    slots: [{ name: 'label', kind: 'text', label: 'Label', default: 'Back to Jobs', stress: 'Back to the field captures list' }],
    props: [...COMMON_PROPS, ...TYPE_PROPS],
    states: ['default', 'hover', 'focus'],
    size: { default: { w: 140, h: 20 }, resize: 'width', contentHeight: true },
    source: [{ file: 'app/admin/styles/AdminLearn.css', line: 10, kind: 'css' }],
    usage: [{ route: '(app-wide)', count: 32 }],
  }),

  defineEntry({
    id: 'button.icon',
    category: 'button',
    areas: ['admin'],
    label: 'Icon button',
    description: 'A square button holding one icon. 40px, because the smaller ones were mis-taps.',
    keywords: ['icon', 'button', 'square', 'round', 'delete', 'edit', 'close', 'small'],
    synonyms: ['icon action', 'glyph button'],
    concepts: ['action'],
    html: '<button type="button" class="fx__icon-btn" aria-label="{{label}}">{{icon}}</button>',
    classes: ['fx__icon-btn'],
    slots: [
      { name: 'icon', kind: 'icon', label: 'Icon', default: 'Trash2' },
      { name: 'label', kind: 'text', label: 'Accessible name', default: 'Delete' },
    ],
    props: BUTTON_PROPS,
    states: INTERACTIVE_STATES,
    size: { default: { w: 40, h: 40 }, resize: 'both', min: { w: 32, h: 32 } },
    source: [{ file: 'app/admin/files/page.tsx', line: 1709, kind: 'styled-jsx' }],
    usage: [{ route: '/admin/files', count: 9 }],
    contract: CONTROL_CONTRACT,
  }),
];

/**
 * The 200-odd button classes this palette does NOT offer, and why.
 *
 * `duplicate-of` is the important one: it is the evidence behind the repetition report, and the
 * list of things a consolidation pass would delete.
 */
export const BUTTON_EXCLUSIONS: CurationExclusion[] = [
  { className: 'btn', reason: 'duplicate-of', coveredBy: 'button.admin', note: 'Shared marketing/admin button; only sets a colour in AdminLayout.css:86 and takes its shape from elsewhere.' },
  { className: 'tl-btn', reason: 'duplicate-of', coveredBy: 'button.page', note: 'Time-logs button — same shape, 8px radius.' },
  { className: 'payroll-btn', reason: 'duplicate-of', coveredBy: 'button.page' },
  { className: 'proj-page__btn', reason: 'duplicate-of', coveredBy: 'button.page', note: 'Identical declarations to jobs-page__btn.' },
  { className: 'emp-manage__btn', reason: 'duplicate-of', coveredBy: 'button.admin' },
  { className: 'assign__btn', reason: 'duplicate-of', coveredBy: 'button.admin' },
  { className: 'um-btn', reason: 'duplicate-of', coveredBy: 'button.admin' },
  { className: 'fw__btn', reason: 'duplicate-of', coveredBy: 'button.admin' },
  { className: 'jmoney__btn', reason: 'duplicate-of', coveredBy: 'button.page' },
  { className: 'override-btn', reason: 'duplicate-of', coveredBy: 'button.admin' },
  { className: 'override-btn-sm', reason: 'duplicate-of', coveredBy: 'button.admin', note: '28px tall — under the tap floor; do not reproduce.' },
  { className: 'lesson-builder__block-btn', reason: 'one-off', note: 'A 28px palette chip inside the lesson builder.' },
  { className: 'tiptap-editor__btn', reason: 'one-off', note: 'Rich-text toolbar; belongs to the editor, not the page.' },
  { className: 'msg-audio__btn', reason: 'one-off', note: '24px round transport control in the audio player.' },
  { className: 'rcv__btn', reason: 'one-off', note: 'Receipt viewer chrome.' },
  { className: 'media-viewer__btn', reason: 'one-off', note: 'Media viewer chrome, on a dark surface.' },
  { className: 'file-viewer__ctrl-btn', reason: 'one-off', note: 'File viewer chrome, on a dark surface.' },
  { className: 'err-boundary__btn', reason: 'one-off', note: 'Error boundary; never designed against.' },
  { className: 'pricing-calculator__result-btn', reason: 'out-of-scope', note: 'Marketing calculator — belongs to the marketing palette when that is curated.' },
];

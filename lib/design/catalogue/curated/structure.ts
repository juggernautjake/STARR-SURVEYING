// lib/design/catalogue/curated/structure.ts — navigation, overlays, toggles, media and feedback.
//
// Slices C6 + C7 of docs/planning/in-progress/DESIGN_STUDIO_2026-08-23.md.
//
// The second curation pass, filling the categories a page needs once it is more than a form: the
// tabs across the top, the modal over it, the switch inside it, the avatar beside a name, and the
// three states — loading, error, empty — that a page spends most of its life in.
//
// A note on where these came from. The scan was asked for the real classes in each family and the
// most-used one won, except where the most-used one belongs to an area outside the palette's scope:
// `.research-modal__*` is used 18 times but lives in the research workspace, which has its own
// visual language (§0.1), so the dialog here is built from the app's shared surfaces instead. That
// choice is recorded rather than made silently — an entry that quietly borrows another product's
// look would produce mockups nobody can build from.

import {
  defineEntry, BOX_ANCHORS, COLOUR_PROPS, COMMON_PROPS, CONTROL_CONTRACT, INTERACTIVE_STATES,
  TEXT_ANCHORS, TYPE_PROPS,
} from '../define';
import type { CatalogueEntry } from '../types';

const BASIC = [...COMMON_PROPS, ...COLOUR_PROPS];
const WITH_TYPE = [...COMMON_PROPS, ...COLOUR_PROPS, ...TYPE_PROPS];

export const STRUCTURE_ENTRIES: CatalogueEntry[] = [
  // ── NAVIGATION ────────────────────────────────────────────────────────────────────────────────
  defineEntry({
    id: 'nav.tabs',
    category: 'nav',
    areas: ['admin'],
    label: 'Tabs',
    description: 'A row of tabs across the top of a section. The current one is filled.',
    keywords: ['tabs', 'tab', 'switch', 'section', 'navigation', 'segment', 'view'],
    synonyms: ['tab bar', 'segmented'],
    concepts: ['navigation', 'choice'],
    html:
      '<div class="tl-tabs">'
      + '<button class="tl-tabs__btn is-on">{{first}}</button>'
      + '<button class="tl-tabs__btn">{{second}}</button>'
      + '<button class="tl-tabs__btn">{{third}}</button>'
      + '</div>',
    classes: ['tl-tabs', 'tl-tabs__btn'],
    slots: [
      { name: 'first', kind: 'text', label: 'Tab 1', default: 'Overview' },
      { name: 'second', kind: 'text', label: 'Tab 2', default: 'Files' },
      { name: 'third', kind: 'text', label: 'Tab 3', default: 'Activity' },
    ],
    props: WITH_TYPE,
    states: [...INTERACTIVE_STATES, 'selected'],
    size: { default: { w: 400, h: 44 }, resize: 'both' },
    source: [{ file: 'app/admin/styles/AdminTimeLogs.css', line: 142, kind: 'css' }],
    usage: [{ route: '/admin/hours-approval', count: 9 }],
    contract: CONTROL_CONTRACT,
  }),

  defineEntry({
    id: 'nav.breadcrumb',
    category: 'nav',
    areas: ['admin'],
    label: 'Breadcrumb',
    description: 'Where you are, and the way back up. Every admin page carries one.',
    keywords: ['breadcrumb', 'crumb', 'path', 'trail', 'back', 'up', 'navigation', 'where'],
    synonyms: ['trail', 'path'],
    concepts: ['navigation'],
    html:
      '<nav class="admin-page-header__crumbs">'
      + '<a class="admin-page-header__crumb" href="#">{{first}}</a>'
      + '<span class="admin-page-header__crumb-sep">›</span>'
      + '<a class="admin-page-header__crumb" href="#">{{second}}</a>'
      + '<span class="admin-page-header__crumb-sep">›</span>'
      + '<span class="admin-page-header__crumb admin-page-header__crumb--active">{{current}}</span>'
      + '</nav>',
    classes: ['admin-page-header__crumbs', 'admin-page-header__crumb', 'admin-page-header__crumb--active'],
    slots: [
      { name: 'first', kind: 'text', label: 'Level 1', default: 'Work' },
      { name: 'second', kind: 'text', label: 'Level 2', default: 'All Jobs' },
      { name: 'current', kind: 'text', label: 'Current', default: 'Job Detail' },
    ],
    props: WITH_TYPE,
    size: { default: { w: 340, h: 24 }, resize: 'width', contentHeight: true },
    anchors: TEXT_ANCHORS,
    source: [{ file: 'app/admin/components/nav/AdminPageHeader.css', line: 83, kind: 'css' }],
    usage: [{ route: '(app-wide)', count: 2 }],
    contract: { minFontPx: 12 },
  }),

  // ── OVERLAYS ──────────────────────────────────────────────────────────────────────────────────
  defineEntry({
    id: 'overlay.dialog',
    category: 'overlay',
    areas: ['admin'],
    label: 'Dialog',
    description: 'A modal over the page — a title, a body, and the two buttons that end it.',
    keywords: ['modal', 'dialog', 'popup', 'overlay', 'confirm', 'prompt', 'sheet', 'window'],
    synonyms: ['popup', 'lightbox', 'confirm box'],
    concepts: ['container', 'feedback', 'action'],
    html:
      '<div class="admin-card ds-dialog">'
      + '<h3 class="job-form__section-title">{{title}}</h3>'
      + '<p class="ds-text-body">{{body}}</p>'
      + '<div class="ds-dialog__actions">'
      + '<button class="admin-btn admin-btn--ghost">{{cancel}}</button>'
      + '<button class="admin-btn admin-btn--primary">{{confirm}}</button>'
      + '</div></div>',
    classes: ['admin-card', 'ds-dialog', 'job-form__section-title', 'admin-btn'],
    slots: [
      { name: 'title', kind: 'text', label: 'Title', default: 'Delete this job?' },
      { name: 'body', kind: 'rich', label: 'Body', default: 'It stays recoverable for 30 days from Jobs → Deleted.' },
      { name: 'cancel', kind: 'text', label: 'Cancel label', default: 'Cancel' },
      { name: 'confirm', kind: 'text', label: 'Confirm label', default: 'Delete job' },
    ],
    props: BASIC,
    states: ['default'],
    size: { default: { w: 440, h: 210 }, resize: 'both' },
    source: [
      { file: 'app/admin/styles/AdminLayout.css', line: 585, kind: 'css', note: 'the card surface it sits on' },
      { file: 'lib/design/export.ts', line: 1, kind: 'tsx', note: 'the dialog composition is a studio primitive — the app writes this per page' },
    ],
  }),

  // ── TOGGLES ───────────────────────────────────────────────────────────────────────────────────
  defineEntry({
    id: 'toggle.switch',
    category: 'toggle',
    areas: ['admin'],
    label: 'Switch',
    description: 'On or off, decided the moment you touch it. No save button.',
    keywords: ['switch', 'toggle', 'on', 'off', 'enable', 'disable', 'setting', 'boolean'],
    synonyms: ['flip', 'checkbox switch'],
    concepts: ['choice'],
    html:
      '<label class="ds-switch"><span class="ds-switch__track"><span class="ds-switch__knob"></span></span>'
      + '<span class="ds-switch__label">{{label}}</span></label>',
    classes: ['ds-switch'],
    slots: [{ name: 'label', kind: 'text', label: 'Label', default: 'Notify me about new leads' }],
    props: WITH_TYPE,
    states: [...INTERACTIVE_STATES, 'selected'],
    size: { default: { w: 260, h: 32 }, resize: 'width' },
    source: [{ file: 'lib/design/export.ts', line: 1, kind: 'tsx', note: 'a studio primitive — the app writes its switches per page (msg-settings, research-prefs), which is itself a finding' }],
    contract: CONTROL_CONTRACT,
  }),

  defineEntry({
    id: 'toggle.checkbox',
    category: 'toggle',
    areas: ['admin'],
    label: 'Checkbox',
    description: 'A box and a label, as the job form writes it.',
    keywords: ['checkbox', 'check', 'tick', 'option', 'select', 'agree', 'flag'],
    synonyms: ['tickbox'],
    concepts: ['choice', 'input'],
    html: '<label class="job-form__checkbox-label"><input type="checkbox" /> {{label}}</label>',
    classes: ['job-form__checkbox-label'],
    slots: [{ name: 'label', kind: 'text', label: 'Label', default: 'Priority Job' }],
    props: WITH_TYPE,
    states: [...INTERACTIVE_STATES, 'selected'],
    size: { default: { w: 220, h: 24 }, resize: 'width', contentHeight: true },
    source: [{ file: 'app/admin/styles/AdminJobs.css', line: 546, kind: 'css' }],
    usage: [{ route: '/admin/jobs/new', count: 2 }],
    contract: { minFontPx: 12 },
  }),

  // ── MEDIA ─────────────────────────────────────────────────────────────────────────────────────
  defineEntry({
    id: 'media.avatar',
    category: 'media',
    areas: ['admin'],
    label: 'Avatar',
    description: 'A person, as a circle with their initials. The app has no photos of staff.',
    keywords: ['avatar', 'person', 'user', 'initials', 'profile', 'photo', 'who', 'crew'],
    synonyms: ['profile picture', 'headshot'],
    concepts: ['person', 'media'],
    html: '<span class="ds-avatar">{{initials}}</span>',
    classes: ['ds-avatar'],
    slots: [{ name: 'initials', kind: 'text', label: 'Initials', default: 'HM' }],
    props: WITH_TYPE,
    size: { default: { w: 40, h: 40 }, resize: 'both' },
    source: [{ file: 'lib/design/export.ts', line: 1, kind: 'tsx', note: 'InitialAvatar.tsx renders this shape; the studio primitive matches it' }],
  }),

  defineEntry({
    id: 'media.file-row',
    category: 'media',
    areas: ['admin'],
    label: 'File row',
    description: 'One file in a list — icon, name, size, and what you can do with it.',
    keywords: ['file', 'document', 'attachment', 'row', 'list', 'upload', 'download', 'pdf'],
    synonyms: ['attachment row', 'document row'],
    concepts: ['media', 'data'],
    html:
      '<div class="ds-file-row"><span class="ds-file-row__icon">📄</span>'
      + '<span class="ds-file-row__name">{{name}}</span>'
      + '<span class="ds-file-row__meta">{{meta}}</span></div>',
    classes: ['ds-file-row'],
    slots: [
      { name: 'name', kind: 'text', label: 'File name', default: 'Boundary plat — final.pdf', stress: 'Cabaniss boundary and improvement survey — signed and sealed final.pdf' },
      { name: 'meta', kind: 'text', label: 'Meta', default: '2.4 MB' },
    ],
    props: WITH_TYPE,
    states: [...INTERACTIVE_STATES],
    size: { default: { w: 440, h: 48 }, resize: 'width' },
    source: [{ file: 'lib/design/export.ts', line: 1, kind: 'tsx', note: 'the shape the File Explorer and the job files panel both draw' }],
    contract: CONTROL_CONTRACT,
  }),

  // ── FEEDBACK ──────────────────────────────────────────────────────────────────────────────────
  defineEntry({
    id: 'feedback.skeleton',
    category: 'feedback',
    areas: ['admin'],
    label: 'Loading skeleton',
    description: 'The grey bars a list shows while it is fetching. Better than a spinner.',
    keywords: ['loading', 'skeleton', 'placeholder', 'shimmer', 'busy', 'waiting', 'fetch'],
    synonyms: ['ghost', 'shimmer'],
    concepts: ['feedback'],
    html: '<div class="ds-skeleton"><span></span><span></span><span></span></div>',
    classes: ['ds-skeleton'],
    props: BASIC,
    states: ['loading'],
    size: { default: { w: 420, h: 76 }, resize: 'both' },
    // A studio primitive, and deliberately so: the app has FOUR separate skeleton implementations
    // (`.skeleton` in AdminLearn.css with 7 usages, `.research-card__skeleton-line` with 11,
    // `.pay-skeleton__line`, `.job-card__skeleton-header`) and no shared one. Citing any of them
    // would tell a builder to reach for one page's private class. The repetition is the finding.
    source: [{ file: 'lib/design/export.ts', line: 1, kind: 'tsx', note: 'dsPrimitiveStyles() — the app has four skeletons and no shared class' }],
    usage: [{ route: '(app-wide)', count: 7 }],
  }),

  defineEntry({
    id: 'feedback.banner',
    category: 'feedback',
    areas: ['admin'],
    label: 'Banner',
    description: 'A message across the top of a section — a warning, a note, something to act on.',
    keywords: ['banner', 'alert', 'notice', 'warning', 'message', 'callout', 'info', 'error'],
    synonyms: ['alert bar', 'notice'],
    concepts: ['feedback', 'status'],
    html: '<div class="ds-banner"><span class="ds-banner__icon">{{icon}}</span><span>{{message}}</span></div>',
    classes: ['ds-banner'],
    slots: [
      { name: 'icon', kind: 'emoji', label: 'Icon', default: '⚠️' },
      { name: 'message', kind: 'rich', label: 'Message', default: 'No property research is attached to this job.' },
    ],
    props: WITH_TYPE,
    states: ['default', 'error'],
    size: { default: { w: 560, h: 52 }, resize: 'both' },
    source: [{ file: 'lib/design/export.ts', line: 1, kind: 'tsx', note: 'the shape the job page draws for its research notice' }],
    contract: { minFontPx: 12 },
  }),

  defineEntry({
    id: 'feedback.toast',
    category: 'feedback',
    areas: ['admin'],
    label: 'Toast',
    description: 'A brief confirmation in the corner. Says what happened, then leaves.',
    keywords: ['toast', 'snackbar', 'notification', 'confirmation', 'saved', 'success', 'message'],
    synonyms: ['snackbar', 'flash'],
    concepts: ['feedback'],
    html: '<div class="notif-toast"><div class="notif-toast__body">{{message}}</div></div>',
    classes: ['notif-toast', 'notif-toast__body'],
    slots: [{ name: 'message', kind: 'text', label: 'Message', default: 'Saved — v4' }],
    props: WITH_TYPE,
    states: ['default'],
    size: { default: { w: 280, h: 56 }, resize: 'both' },
    source: [{ file: 'app/admin/styles/AdminLayout.css', line: 1305, kind: 'css' }],
    usage: [{ route: '(app-wide)', count: 1 }],
  }),

  // ── CARDS ─────────────────────────────────────────────────────────────────────────────────────
  defineEntry({
    id: 'card.stat',
    category: 'card',
    areas: ['admin'],
    label: 'Stat',
    description: 'One number and what it counts. Four of these across a card is the app’s stat strip.',
    keywords: ['stat', 'metric', 'number', 'count', 'kpi', 'total', 'summary', 'figure'],
    synonyms: ['metric tile', 'kpi'],
    concepts: ['data'],
    html:
      '<div class="job-detail__stat">'
      + '<span class="job-detail__stat-value">{{value}}</span>'
      + '<span class="job-detail__stat-label">{{label}}</span>'
      + '</div>',
    classes: ['job-detail__stat', 'job-detail__stat-value', 'job-detail__stat-label'],
    slots: [
      { name: 'value', kind: 'text', label: 'Value', default: '$950.00', stress: '$1,234,567.89' },
      { name: 'label', kind: 'text', label: 'Label', default: 'Quote' },
    ],
    props: WITH_TYPE,
    size: { default: { w: 150, h: 56 }, resize: 'both' },
    anchors: BOX_ANCHORS,
    source: [{ file: 'app/admin/styles/AdminJobs.css', line: 742, kind: 'css', note: 'made a grid on 2026-08-22 — as a flex row it huddled four numbers at the left of a 1318px card' }],
    usage: [{ route: '/admin/jobs/[id]', count: 4 }],
    contract: { minFontPx: 12 },
  }),
];

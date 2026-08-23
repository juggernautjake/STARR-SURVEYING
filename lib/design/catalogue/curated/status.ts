// lib/design/catalogue/curated/status.ts — tags, badges, and the things that carry a date.
//
// Slice C5 of docs/planning/in-progress/DESIGN_STUDIO_2026-08-23.md.
//
// ── WHY THIS FILE EXISTS AT ALL ─────────────────────────────────────────────────────────────────
//
// It was written because a test failed. The owner's acceptance criterion is that typing "date"
// finds "every element that deals with scheduling and dates and calendars and maybe even clocks and
// timers" — and with only a date FIELD in the catalogue, it found exactly one thing and was
// technically correct.
//
// The honest fix was not to loosen the search until one entry looked like several. It was to
// catalogue the elements that genuinely carry a date in this app: the deadline line on a job card,
// the stage badge, the stage-timeline step, the timestamp caption. They all exist, they are all
// used, and the palette was simply missing them.

import { defineEntry, COLOUR_PROPS, COMMON_PROPS, CONTROL_CONTRACT, INTERACTIVE_STATES, TEXT_ANCHORS, TYPE_PROPS } from '../define';
import type { CatalogueEntry } from '../types';

const CHIP_PROPS = [...COMMON_PROPS, ...COLOUR_PROPS, ...TYPE_PROPS];

export const STATUS_ENTRIES: CatalogueEntry[] = [
  defineEntry({
    id: 'tag.stage',
    category: 'tag',
    areas: ['admin'],
    label: 'Stage badge',
    description: 'Which stage a job is in — quote, research, field work, drawing, delivery.',
    keywords: ['stage', 'status', 'badge', 'pill', 'phase', 'state', 'progress', 'quote', 'drawing'],
    synonyms: ['status pill', 'stage chip'],
    concepts: ['status', 'job'],
    html: '<span class="job-detail__stage-badge">{{emoji}} {{label}}</span>',
    classes: ['job-detail__stage-badge'],
    slots: [
      { name: 'emoji', kind: 'emoji', label: 'Icon', default: '💰' },
      { name: 'label', kind: 'text', label: 'Label', default: 'Quote', stress: 'Drawing & deliverables' },
    ],
    props: CHIP_PROPS,
    states: ['default', 'selected'],
    size: { default: { w: 110, h: 28 }, resize: 'both', contentHeight: true },
    source: [{ file: 'app/admin/styles/AdminJobs.css', line: 732, kind: 'css' }],
    usage: [{ route: '/admin/jobs/[id]', count: 1 }],
    contract: { minFontPx: 12 },
  }),

  defineEntry({
    id: 'tag.chip',
    category: 'tag',
    areas: ['admin'],
    label: 'Tag chip',
    description: 'A job’s own words — “residential”, “rural”. Grey, small, several to a row.',
    keywords: ['tag', 'chip', 'label', 'keyword', 'category', 'filter'],
    synonyms: ['pill', 'token'],
    concepts: ['status'],
    html: '<span class="job-card__tag">{{label}}</span>',
    classes: ['job-card__tag'],
    slots: [{ name: 'label', kind: 'text', label: 'Label', default: 'residential', stress: 'commercial subdivision' }],
    props: CHIP_PROPS,
    size: { default: { w: 88, h: 22 }, resize: 'both', contentHeight: true },
    source: [{ file: 'app/admin/styles/AdminJobs.css', line: 125, kind: 'css', note: 'raised from 0.65rem to 0.75rem on 2026-08-22 — 10.4px is under what a phone can carry' }],
    usage: [{ route: '/admin/jobs', count: 3 }],
    contract: { minFontPx: 12 },
  }),

  defineEntry({
    id: 'tag.deadline',
    category: 'tag',
    areas: ['admin'],
    label: 'Deadline',
    description: 'When a job is due, in the warning colour. The date a card is really about.',
    keywords: ['deadline', 'due', 'date', 'when', 'overdue', 'schedule', 'target'],
    synonyms: ['due date', 'due by'],
    concepts: ['time', 'status', 'job'],
    html: '<div class="job-card__deadline">Due: {{date}}</div>',
    classes: ['job-card__deadline'],
    slots: [{ name: 'date', kind: 'text', label: 'Date', default: '8/20/2026', stress: 'Wednesday 20 August 2026' }],
    props: CHIP_PROPS,
    states: ['default', 'error'],
    size: { default: { w: 130, h: 18 }, resize: 'width', contentHeight: true },
    anchors: TEXT_ANCHORS,
    source: [{ file: 'app/admin/styles/AdminJobs.css', line: 139, kind: 'css' }],
    usage: [{ route: '/admin/jobs', count: 1 }],
    contract: { minFontPx: 12 },
  }),

  defineEntry({
    id: 'nav.stage-step',
    category: 'nav',
    areas: ['admin'],
    label: 'Stage timeline step',
    description: 'One step of the job’s stage timeline, with the date it happened and a way to move there.',
    keywords: ['timeline', 'stage', 'step', 'progress', 'schedule', 'stepper', 'phase', 'history'],
    synonyms: ['milestone', 'stage step'],
    concepts: ['time', 'status', 'navigation', 'job'],
    html:
      '<div class="job-timeline__setrow">'
      + '<span class="job-timeline__label">{{label}}</span>'
      + '<button class="job-timeline__set">{{action}}</button>'
      + '</div>',
    classes: ['job-timeline__setrow', 'job-timeline__label', 'job-timeline__set'],
    slots: [
      { name: 'label', kind: 'text', label: 'Stage', default: 'Field Work' },
      { name: 'action', kind: 'text', label: 'Action', default: 'Set as current' },
    ],
    props: CHIP_PROPS,
    states: INTERACTIVE_STATES,
    size: { default: { w: 120, h: 64 }, resize: 'both' },
    source: [{ file: 'app/admin/styles/AdminJobs.css', line: 1994, kind: 'css', note: 'raised to the 32px token on 2026-08-22 — it was 23px, half a tap target, on the control that moves a job between stages' }],
    usage: [{ route: '/admin/jobs/[id]', count: 3 }],
    contract: CONTROL_CONTRACT,
  }),

  defineEntry({
    id: 'text.timestamp',
    category: 'text',
    areas: ['admin'],
    label: 'Timestamp',
    description: 'When something happened — “47m ago”, “8/22/2026”. Quiet, secondary.',
    keywords: ['timestamp', 'time', 'date', 'ago', 'when', 'updated', 'created', 'last seen', 'clock'],
    synonyms: ['datetime', 'age'],
    concepts: ['time'],
    html: '<span class="job-detail__meta">{{text}}</span>',
    classes: ['job-detail__meta'],
    slots: [{ name: 'text', kind: 'text', label: 'Text', default: 'Updated 47m ago', stress: 'Last updated Wednesday 20 August 2026 at 4:32 pm by Hank Maddux' }],
    props: CHIP_PROPS,
    size: { default: { w: 180, h: 20 }, resize: 'width', contentHeight: true },
    anchors: TEXT_ANCHORS,
    source: [{ file: 'app/admin/styles/AdminJobs.css', line: 718, kind: 'css' }],
    contract: { minFontPx: 12 },
  }),

  defineEntry({
    id: 'toggle.status-chip',
    category: 'toggle',
    areas: ['admin'],
    label: 'Filter chip',
    description: 'A filter that carries its own count — “2 Awaiting review”. Click to narrow.',
    keywords: ['filter', 'chip', 'toggle', 'count', 'status', 'segment', 'narrow', 'facet'],
    synonyms: ['filter pill', 'status filter'],
    concepts: ['choice', 'status', 'data'],
    html: '<button class="tl-status-chip">{{count}} {{label}}</button>',
    classes: ['tl-status-chip'],
    slots: [
      { name: 'count', kind: 'number', label: 'Count', default: '2' },
      { name: 'label', kind: 'text', label: 'Label', default: 'Awaiting review', stress: 'Awaiting review by the bookkeeper' },
    ],
    props: CHIP_PROPS,
    states: [...INTERACTIVE_STATES, 'selected'],
    size: { default: { w: 150, h: 32 }, resize: 'both' },
    source: [{ file: 'app/admin/styles/AdminTimeLogs.css', line: 268, kind: 'css' }],
    usage: [{ route: '/admin/hours-approval', count: 1 }],
    contract: { minFontPx: 12 },
  }),
];

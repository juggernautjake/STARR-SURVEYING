// lib/design/catalogue/curated/bubbles.ts — the little coloured pills that say what state a thing is in.
//
// Slice B1 of docs/planning/completed/DESIGN_STUDIO_QUALITY_2026-08-23.md.
//
// Owner: *"I want all of the little role bubbles and pending/accepted/rejected/denied/etc bubbles.
// I want all of the tags and emojis and literally everything you can put in there."*
//
// ── WHY THESE ARE THEIR OWN FILE ────────────────────────────────────────────────────────────────
//
// A status pill is the smallest element in the app and one of the most repeated: every list of
// anything ends in a coloured bubble saying where that thing has got to. They were missing from the
// catalogue entirely, which meant no mockup of any list page could show the one column people
// actually read.
//
// Each family here is a REAL class family with REAL variants, and the variants are the app's own
// state vocabulary rather than a set somebody invented for the palette:
//
//   role       employee / teacher / admin        `.um-role-badge--*`   AdminUsers.css:50
//   account    active / inactive / banned        `.emp-card__status--*` EmployeePond.css:1234
//   progress   pending / in progress / completed / cancelled
//                                                `.assign__status--*`  AdminLearn.css:2310
//
// Where the app has no class for a state the owner named — "accepted", "rejected", "denied" — the
// nearest real one is offered rather than a new colour being invented. A palette that hands out
// classes the stylesheets do not have is the defect the drift ratchet exists to catch, and
// `nav.breadcrumb` already shipped that mistake once.

import {
  defineEntry, COLOUR_PROPS, COMMON_PROPS, TEXT_ANCHORS, TYPE_PROPS,
} from '../define';
import type { CatalogueEntry } from '../types';

const PILL_PROPS = [...COMMON_PROPS, ...COLOUR_PROPS, ...TYPE_PROPS];

export const BUBBLE_ENTRIES: CatalogueEntry[] = [
  defineEntry({
    id: 'tag.role',
    category: 'tag',
    areas: ['admin'],
    label: 'Role badge',
    description: 'The rounded badge naming somebody\'s role. Purple for admin, blue for teacher, grey for everyone else.',
    keywords: ['role', 'badge', 'bubble', 'pill', 'permission', 'admin', 'teacher', 'employee', 'user', 'access', 'who'],
    synonyms: ['role pill', 'role bubble', 'permission badge'],
    concepts: ['status', 'person'],
    html: '<span class="um-role-badge um-role-badge--admin">{{role}}</span>',
    classes: ['um-role-badge', 'um-role-badge--admin'],
    slots: [{ name: 'role', kind: 'text', label: 'Role', default: 'admin', stress: 'equipment_manager' }],
    props: PILL_PROPS,
    variants: [
      { id: 'admin', label: 'Admin', classes: ['um-role-badge', 'um-role-badge--admin'] },
      { id: 'teacher', label: 'Teacher', classes: ['um-role-badge', 'um-role-badge--teacher'] },
      { id: 'employee', label: 'Employee', classes: ['um-role-badge', 'um-role-badge--employee'] },
    ],
    size: { default: { w: 72, h: 20 }, resize: 'width', contentHeight: true, min: { w: 40, h: 18 } },
    anchors: TEXT_ANCHORS,
    source: [{ file: 'app/admin/styles/AdminUsers.css', line: 50, kind: 'css' }],
    usage: [{ route: '/admin/users', count: 6 }, { route: '/admin/employees', count: 4 }],
  }),

  defineEntry({
    id: 'tag.account-status',
    category: 'tag',
    areas: ['admin'],
    label: 'Account status',
    description: 'ACTIVE / INACTIVE / BANNED — the uppercase pill on a person\'s card.',
    keywords: ['status', 'active', 'inactive', 'banned', 'account', 'badge', 'bubble', 'pill', 'state', 'enabled', 'disabled', 'suspended'],
    synonyms: ['state pill', 'account bubble'],
    concepts: ['status', 'person'],
    html: '<span class="emp-card__status emp-card__status--active">{{status}}</span>',
    classes: ['emp-card__status', 'emp-card__status--active'],
    slots: [{ name: 'status', kind: 'text', label: 'Status', default: 'Active' }],
    props: PILL_PROPS,
    variants: [
      { id: 'active', label: 'Active', classes: ['emp-card__status', 'emp-card__status--active'] },
      { id: 'inactive', label: 'Inactive', classes: ['emp-card__status', 'emp-card__status--inactive'] },
      { id: 'banned', label: 'Banned', classes: ['emp-card__status', 'emp-card__status--banned'] },
    ],
    size: { default: { w: 64, h: 18 }, resize: 'width', contentHeight: true, min: { w: 40, h: 16 } },
    anchors: TEXT_ANCHORS,
    source: [{ file: 'app/admin/styles/EmployeePond.css', line: 1234, kind: 'css' }],
    usage: [{ route: '/admin/employees', count: 5 }],
  }),

  defineEntry({
    id: 'tag.progress-status',
    category: 'tag',
    areas: ['admin'],
    label: 'Progress status',
    description: 'Pending, in progress, completed, cancelled — the amber/blue/green/grey pill on anything that moves through stages.',
    keywords: ['pending', 'progress', 'completed', 'cancelled', 'done', 'waiting', 'approved', 'rejected', 'denied', 'accepted', 'status', 'badge', 'bubble', 'pill', 'state', 'stage', 'queue'],
    synonyms: ['state bubble', 'workflow pill', 'approval badge'],
    concepts: ['status', 'time'],
    html: '<span class="assign__status assign__status--pending">{{status}}</span>',
    classes: ['assign__status', 'assign__status--pending'],
    slots: [{ name: 'status', kind: 'text', label: 'Status', default: 'Pending', stress: 'Awaiting client signature' }],
    props: PILL_PROPS,
    // The owner asked for accepted / rejected / denied. The app's vocabulary is pending /
    // in_progress / completed / cancelled, and those are the classes that exist — so the LABEL is
    // free text (write "Rejected" if that is the word) while the COLOUR comes from a real variant.
    // Inventing `--rejected` would put a class in an export that no stylesheet defines.
    variants: [
      { id: 'pending', label: 'Pending (amber)', classes: ['assign__status', 'assign__status--pending'] },
      { id: 'in_progress', label: 'In progress (blue)', classes: ['assign__status', 'assign__status--in_progress'] },
      { id: 'completed', label: 'Completed (green)', classes: ['assign__status', 'assign__status--completed'] },
      { id: 'cancelled', label: 'Cancelled / denied (grey)', classes: ['assign__status', 'assign__status--cancelled'] },
    ],
    size: { default: { w: 76, h: 20 }, resize: 'width', contentHeight: true, min: { w: 44, h: 18 } },
    anchors: TEXT_ANCHORS,
    source: [{ file: 'app/admin/styles/AdminLearn.css', line: 2310, kind: 'css' }],
    usage: [{ route: '/admin/learn', count: 8 }],
  }),

  defineEntry({
    id: 'tag.title-chip',
    category: 'tag',
    areas: ['admin'],
    label: 'Job title chip',
    description: 'The small navy chip carrying somebody\'s job title, next to their name.',
    keywords: ['title', 'chip', 'job title', 'position', 'badge', 'label', 'person', 'navy'],
    synonyms: ['title badge'],
    concepts: ['person', 'status'],
    html: '<span class="emp-card__title-chip">{{title}}</span>',
    classes: ['emp-card__title-chip'],
    slots: [{ name: 'title', kind: 'text', label: 'Title', default: 'Party Chief', stress: 'Senior Survey Technician' }],
    props: PILL_PROPS,
    size: { default: { w: 88, h: 18 }, resize: 'width', contentHeight: true, min: { w: 40, h: 16 } },
    anchors: TEXT_ANCHORS,
    source: [{ file: 'app/admin/styles/EmployeePond.css', line: 1262, kind: 'css' }],
    usage: [{ route: '/admin/employees', count: 3 }],
  }),
];

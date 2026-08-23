// lib/design/catalogue/curated/core.ts — text, inputs, cards, feedback, layout and shapes.
//
// Slice W4 of docs/planning/completed/DESIGN_STUDIO_2026-08-23.md — the starter palette: enough
// to lay out a real page on day one. The deeper per-category curation (C4–C8) fills in around it.
//
// Everything here cites a real stylesheet line, except the Shapes group, which is the one part of
// the palette that answers to nothing in the app by design (§4.6).

import {
  defineEntry, BOX_ANCHORS, COLOUR_PROPS, COMMON_PROPS, CONTROL_CONTRACT, INTERACTIVE_STATES,
  TEXT_ANCHORS, TYPE_PROPS,
} from '../define';
import type { CatalogueEntry, PropDef } from '../types';

const TEXT_PROPS = [...COMMON_PROPS, ...TYPE_PROPS, ...COLOUR_PROPS];

/** Shape-only properties. Corner radius is `corners` rather than `length` so the inspector can
 *  offer one control that rounds all four and a disclosure that breaks it into four — a card with
 *  two square corners and two round ones is a real thing to want. */
const SHAPE_PROPS: PropDef[] = [
  { name: 'fill', label: 'Fill', kind: 'color', css: 'background-color', group: 'shape' },
  { name: 'strokeColor', label: 'Stroke', kind: 'color', css: 'border-color', group: 'shape' },
  { name: 'strokeWidth', label: 'Stroke width', kind: 'length', css: 'border-width', min: 0, max: 24, step: 1, unit: 'px', group: 'shape' },
  { name: 'strokeStyle', label: 'Stroke style', kind: 'select', css: 'border-style', group: 'shape',
    options: [
      { value: 'solid', label: 'Solid' },
      { value: 'dashed', label: 'Dashed' },
      { value: 'dotted', label: 'Dotted' },
      { value: 'none', label: 'None' },
    ] },
  { name: 'radius', label: 'Corner radius', kind: 'corners', css: 'border-radius', min: 0, max: 400, step: 1, unit: 'px', group: 'shape' },
  { name: 'rotation', label: 'Rotation', kind: 'number', css: 'transform', min: -180, max: 180, step: 1, unit: '°', group: 'shape' },
  { name: 'opacity', label: 'Opacity', kind: 'percent', css: 'opacity', min: 0, max: 100, step: 1, group: 'effects' },
  { name: 'shadow', label: 'Shadow', kind: 'shadow', css: 'box-shadow', group: 'effects' },
];

export const CORE_ENTRIES: CatalogueEntry[] = [
  // ── TEXT ──────────────────────────────────────────────────────────────────────────────────────
  defineEntry({
    id: 'text.page-title',
    category: 'text',
    areas: ['admin'],
    label: 'Page title',
    description: 'The h1 at the top of a page. Sora, 1.35rem, 700.',
    keywords: ['title', 'heading', 'h1', 'page', 'name'],
    synonyms: ['header', 'headline'],
    concepts: ['container', 'navigation'],
    html: '<h1 class="job-detail__name">{{text}}</h1>',
    classes: ['job-detail__name'],
    slots: [{ name: 'text', kind: 'text', label: 'Text', default: 'Anthony ProTech Survey', stress: 'Cabaniss Boundary & Improvement Survey — Phase 2' }],
    props: TEXT_PROPS,
    size: { default: { w: 420, h: 34 }, resize: 'width', contentHeight: true },
    anchors: TEXT_ANCHORS,
    source: [{ file: 'app/admin/styles/AdminJobs.css', line: 712, kind: 'css' }],
    usage: [{ route: '/admin/jobs/[id]', count: 1 }],
    contract: { minFontPx: 12 },
  }),

  defineEntry({
    id: 'text.section-title',
    category: 'text',
    areas: ['admin'],
    label: 'Section title',
    description: 'The heading inside a card or a form section.',
    keywords: ['section', 'title', 'heading', 'h3', 'card', 'panel'],
    synonyms: ['subheading', 'card title'],
    concepts: ['container'],
    html: '<h3 class="job-form__section-title">{{text}}</h3>',
    classes: ['job-form__section-title'],
    slots: [{ name: 'text', kind: 'text', label: 'Text', default: 'Project files', stress: 'Equipment assigned to this job' }],
    props: TEXT_PROPS,
    size: { default: { w: 240, h: 22 }, resize: 'width', contentHeight: true },
    anchors: TEXT_ANCHORS,
    // Was cited as `.pd__card-title` — a class that does not exist. The projects card styles its
    // heading with the descendant selector `.pd__card h3`, which is not a thing the palette can
    // hand somebody. The drift ratchet caught it before it ever reached an export.
    source: [{ file: 'app/admin/styles/AdminJobs.css', line: 480, kind: 'css' }],
    usage: [{ route: '/admin/jobs/new', count: 10 }],
    contract: { minFontPx: 12 },
  }),

  defineEntry({
    id: 'text.body',
    category: 'text',
    areas: ['admin', 'marketing'],
    label: 'Body text',
    description: 'A paragraph. Inter, 0.9rem.',
    keywords: ['text', 'body', 'paragraph', 'copy', 'description', 'blurb'],
    synonyms: ['prose', 'content'],
    concepts: ['container'],
    html: '<p class="ds-text-body">{{text}}</p>',
    classes: ['ds-text-body'],
    slots: [{
      name: 'text', kind: 'rich', label: 'Text',
      default: 'Find and or set all corners, shoot all improvements.',
      stress: 'Find and or set all corners, shoot all improvements, locate the existing fence line, and tie to the county monument at the north-east corner of the tract.',
    }],
    props: TEXT_PROPS,
    size: { default: { w: 420, h: 48 }, resize: 'both', contentHeight: true },
    anchors: TEXT_ANCHORS,
    // A studio primitive: the app has no reusable body-text class, so this one is defined by
    // `dsPrimitiveStyles()` and says so rather than citing a stylesheet it is not in.
    source: [{ file: 'lib/design/export.ts', line: 1, kind: 'tsx', note: 'dsPrimitiveStyles() — the app has no named body-text class.' }],
    contract: { minFontPx: 12 },
  }),

  defineEntry({
    id: 'text.caption',
    category: 'text',
    areas: ['admin'],
    label: 'Caption / meta',
    description: 'Secondary metadata under a title — type, acreage, client.',
    keywords: ['caption', 'meta', 'small', 'secondary', 'subtitle', 'detail'],
    synonyms: ['subtext', 'helper'],
    concepts: ['container', 'status'],
    html: '<p class="job-detail__meta">{{text}}</p>',
    classes: ['job-detail__meta'],
    slots: [{ name: 'text', kind: 'text', label: 'Text', default: 'Boundary · 2.15 acres · Anthony', stress: 'ALTA/NSPS Land Title Survey · 412.88 acres · ProTech Construction' }],
    props: TEXT_PROPS,
    size: { default: { w: 320, h: 20 }, resize: 'width', contentHeight: true },
    anchors: TEXT_ANCHORS,
    source: [{ file: 'app/admin/styles/AdminJobs.css', line: 718, kind: 'css' }],
    contract: { minFontPx: 12 },
  }),

  // ── INPUTS ────────────────────────────────────────────────────────────────────────────────────
  defineEntry({
    id: 'input.text',
    category: 'input',
    areas: ['admin'],
    label: 'Text field',
    description: 'A labelled text input, as the job form writes it.',
    keywords: ['input', 'text', 'field', 'form', 'entry', 'type'],
    synonyms: ['textbox', 'text input'],
    concepts: ['input'],
    html:
      '<div class="job-form__field">'
      + '<label class="job-form__label">{{label}}</label>'
      + '<input class="job-form__input" placeholder="{{placeholder}}" />'
      + '</div>',
    classes: ['job-form__field', 'job-form__label', 'job-form__input'],
    slots: [
      { name: 'label', kind: 'text', label: 'Label', default: 'Job Name' },
      { name: 'placeholder', kind: 'text', label: 'Placeholder', default: 'e.g. Smith Boundary Survey', stress: 'e.g. Cabaniss Boundary & Improvement Survey — Phase 2' },
    ],
    props: [...COMMON_PROPS, ...COLOUR_PROPS],
    states: [...INTERACTIVE_STATES, 'error'],
    size: { default: { w: 320, h: 64 }, resize: 'width' },
    source: [
      { file: 'app/admin/styles/AdminJobs.css', line: 517, kind: 'css', note: 'label' },
      { file: 'app/admin/styles/AdminJobs.css', line: 525, kind: 'css', note: 'input' },
    ],
    usage: [{ route: '/admin/jobs/new', count: 49 }],
    contract: CONTROL_CONTRACT,
  }),

  defineEntry({
    id: 'input.date',
    category: 'input',
    areas: ['admin'],
    label: 'Date field',
    description: 'A date picker. The browser’s own, wearing the app’s field styling.',
    keywords: ['date', 'calendar', 'deadline', 'due', 'schedule', 'when', 'day', 'picker'],
    synonyms: ['datepicker', 'day picker', 'date input'],
    concepts: ['time', 'input'],
    html:
      '<div class="job-form__field">'
      + '<label class="job-form__label">{{label}}</label>'
      + '<input type="date" class="job-form__input" />'
      + '</div>',
    classes: ['job-form__field', 'job-form__label', 'job-form__input'],
    slots: [{ name: 'label', kind: 'text', label: 'Label', default: 'Deadline' }],
    props: [...COMMON_PROPS, ...COLOUR_PROPS],
    states: [...INTERACTIVE_STATES, 'error'],
    size: { default: { w: 220, h: 64 }, resize: 'width' },
    source: [{ file: 'app/admin/styles/AdminJobs.css', line: 525, kind: 'css' }],
    usage: [{ route: '/admin/jobs/new', count: 2 }],
    contract: CONTROL_CONTRACT,
  }),

  defineEntry({
    id: 'input.textarea',
    category: 'input',
    areas: ['admin'],
    label: 'Text area',
    description: 'Multi-line input for notes and descriptions.',
    keywords: ['textarea', 'notes', 'description', 'multiline', 'comment', 'long text'],
    synonyms: ['multi-line', 'note field'],
    concepts: ['input', 'comms'],
    html:
      '<div class="job-form__field">'
      + '<label class="job-form__label">{{label}}</label>'
      + '<textarea class="job-form__textarea" rows="3" placeholder="{{placeholder}}"></textarea>'
      + '</div>',
    classes: ['job-form__field', 'job-form__label', 'job-form__textarea'],
    slots: [
      { name: 'label', kind: 'text', label: 'Label', default: 'Description' },
      { name: 'placeholder', kind: 'text', label: 'Placeholder', default: 'Job description and scope of work…' },
    ],
    props: [...COMMON_PROPS, ...COLOUR_PROPS],
    states: [...INTERACTIVE_STATES, 'error'],
    size: { default: { w: 420, h: 110 }, resize: 'both' },
    source: [{ file: 'app/admin/styles/AdminJobs.css', line: 525, kind: 'css' }],
    contract: CONTROL_CONTRACT,
  }),

  defineEntry({
    id: 'select.dropdown',
    category: 'select',
    areas: ['admin'],
    label: 'Dropdown',
    description: 'A select. Its widest option decides its natural width — which is why the field caps it.',
    keywords: ['select', 'dropdown', 'choose', 'option', 'picker', 'list'],
    synonyms: ['combo', 'chooser'],
    concepts: ['choice', 'input'],
    html:
      '<div class="job-form__field">'
      + '<label class="job-form__label">{{label}}</label>'
      + '<select class="job-form__input"><option>{{option}}</option></select>'
      + '</div>',
    classes: ['job-form__field', 'job-form__label', 'job-form__input'],
    slots: [
      { name: 'label', kind: 'text', label: 'Label', default: 'Survey Type' },
      { name: 'option', kind: 'text', label: 'Selected option', default: 'Boundary', stress: 'ALTA/NSPS Land Title Survey with Table A items 1-4, 6-11' },
    ],
    props: [...COMMON_PROPS, ...COLOUR_PROPS],
    states: INTERACTIVE_STATES,
    size: { default: { w: 260, h: 64 }, resize: 'width' },
    source: [{ file: 'app/admin/styles/AdminJobs.css', line: 525, kind: 'css' }],
    contract: CONTROL_CONTRACT,
  }),

  // ── CARDS, FEEDBACK, LAYOUT ───────────────────────────────────────────────────────────────────
  defineEntry({
    id: 'card.basic',
    category: 'card',
    areas: ['admin'],
    label: 'Card',
    description: 'A white surface with a border and 1.25rem of padding.',
    keywords: ['card', 'panel', 'surface', 'box', 'container', 'section'],
    synonyms: ['tile', 'well'],
    concepts: ['container'],
    html: '<div class="admin-card">{{content}}</div>',
    classes: ['admin-card'],
    slots: [{ name: 'content', kind: 'text', label: 'Content', default: '' }],
    props: [...COMMON_PROPS, ...COLOUR_PROPS],
    size: { default: { w: 400, h: 200 }, resize: 'both', min: { w: 80, h: 60 } },
    source: [{ file: 'app/admin/styles/AdminLayout.css', line: 585, kind: 'css' }],
    usage: [{ route: '(app-wide)', count: 30 }],
  }),

  defineEntry({
    id: 'feedback.empty',
    category: 'feedback',
    areas: ['admin'],
    label: 'Empty state',
    description: 'What a page says when it has nothing. Dashed border, icon, title, description.',
    keywords: ['empty', 'nothing', 'blank', 'no results', 'zero', 'placeholder', 'first run'],
    synonyms: ['no data', 'nothing here'],
    concepts: ['feedback'],
    html:
      '<div class="admin-empty">'
      + '<div class="admin-empty__icon">{{icon}}</div>'
      + '<div class="admin-empty__title">{{title}}</div>'
      + '<div class="admin-empty__desc">{{description}}</div>'
      + '</div>',
    classes: ['admin-empty', 'admin-empty__icon', 'admin-empty__title', 'admin-empty__desc'],
    slots: [
      { name: 'icon', kind: 'emoji', label: 'Icon', default: '📋' },
      { name: 'title', kind: 'text', label: 'Title', default: 'No jobs yet' },
      { name: 'description', kind: 'text', label: 'Description', default: 'Try widening the filter or pinning yourself to a job.' },
    ],
    props: [...COMMON_PROPS, ...COLOUR_PROPS],
    states: ['default', 'empty'],
    size: { default: { w: 480, h: 220 }, resize: 'both' },
    source: [
      { file: 'app/admin/styles/AdminLayout.css', line: 1117, kind: 'css' },
      { file: 'app/admin/styles/AdminLayout.css', line: 1119, kind: 'css', note: 'title' },
    ],
    usage: [{ route: '(app-wide)', count: 76 }],
  }),

  defineEntry({
    id: 'layout.table-wrap',
    category: 'table',
    areas: ['admin'],
    label: 'Table',
    description: 'A table in the wrapper that lets it scroll sideways on a phone instead of clipping.',
    keywords: ['table', 'rows', 'columns', 'grid', 'data', 'list', 'report'],
    synonyms: ['datatable', 'spreadsheet'],
    concepts: ['data'],
    html:
      '<div class="admin-table-wrap"><table class="ds-table">'
      + '<thead><tr><th>{{col1}}</th><th>{{col2}}</th><th>{{col3}}</th></tr></thead>'
      + '<tbody><tr><td>26135</td><td>Anthony ProTech Survey</td><td>Quote</td></tr>'
      + '<tr><td>26134</td><td>Armondo Espinosa</td><td>Drawing</td></tr></tbody>'
      + '</table></div>',
    classes: ['admin-table-wrap'],
    slots: [
      { name: 'col1', kind: 'text', label: 'Column 1', default: 'Job' },
      { name: 'col2', kind: 'text', label: 'Column 2', default: 'Name' },
      { name: 'col3', kind: 'text', label: 'Column 3', default: 'Stage' },
    ],
    props: [...COMMON_PROPS, ...COLOUR_PROPS],
    states: ['default', 'empty', 'loading'],
    size: { default: { w: 640, h: 160 }, resize: 'both' },
    source: [{ file: 'app/admin/styles/AdminResponsive.css', line: 11, kind: 'css' }],
    usage: [{ route: '(app-wide)', count: 48 }],
  }),

  defineEntry({
    id: 'layout.toolbar',
    category: 'layout',
    areas: ['admin'],
    label: 'Toolbar row',
    description: 'A row of controls with a gap — the shape every filter row starts from.',
    keywords: ['toolbar', 'row', 'filter', 'controls', 'actions', 'bar', 'header'],
    synonyms: ['action bar', 'filter row'],
    concepts: ['container', 'action'],
    html: '<div class="ds-toolbar">{{content}}</div>',
    classes: ['ds-toolbar'],
    slots: [{ name: 'content', kind: 'text', label: 'Content', default: '' }],
    props: [...COMMON_PROPS, ...COLOUR_PROPS],
    size: { default: { w: 640, h: 56 }, resize: 'both' },
    source: [{ file: 'lib/design/export.ts', line: 1, kind: 'tsx', note: 'dsPrimitiveStyles() — the toolbar pattern generalised; every page writes its own today.' }],
  }),

  // ── SHAPES (§4.6) ─────────────────────────────────────────────────────────────────────────────
  defineEntry({
    id: 'shape.rectangle',
    category: 'shape',
    areas: ['shared'],
    label: 'Rectangle',
    description: 'A box. Fill it, stroke it, round any corner as much or as little as you like.',
    keywords: ['rectangle', 'square', 'box', 'block', 'shape', 'fill', 'rounded', 'corner', 'radius'],
    synonyms: ['rect', 'panel', 'frame'],
    concepts: ['shape', 'container'],
    html: '<div class="ds-shape ds-shape--rect">{{label}}</div>',
    classes: ['ds-shape', 'ds-shape--rect'],
    slots: [{ name: 'label', kind: 'text', label: 'Label', default: '', optional: true }],
    props: SHAPE_PROPS,
    defaults: { fill: '#EF4444', strokeWidth: 0, radius: 8 },
    size: { default: { w: 200, h: 120 }, resize: 'both', min: { w: 4, h: 4 } },
    anchors: BOX_ANCHORS,
    source: [{ file: 'lib/design/catalogue/curated/core.ts', line: 1, kind: 'tsx', note: 'A free primitive — deliberately not a component from the app.' }],
  }),

  defineEntry({
    id: 'shape.ellipse',
    category: 'shape',
    areas: ['shared'],
    label: 'Ellipse',
    description: 'A circle or oval. Hold shift while resizing for a true circle.',
    keywords: ['circle', 'ellipse', 'oval', 'round', 'dot', 'shape'],
    synonyms: ['round', 'disc'],
    concepts: ['shape'],
    html: '<div class="ds-shape ds-shape--ellipse">{{label}}</div>',
    classes: ['ds-shape', 'ds-shape--ellipse'],
    slots: [{ name: 'label', kind: 'text', label: 'Label', default: '', optional: true }],
    props: SHAPE_PROPS,
    defaults: { fill: '#1D3095', strokeWidth: 0 },
    size: { default: { w: 120, h: 120 }, resize: 'both', min: { w: 4, h: 4 } },
    source: [{ file: 'lib/design/catalogue/curated/core.ts', line: 1, kind: 'tsx' }],
  }),

  defineEntry({
    id: 'shape.line',
    category: 'shape',
    areas: ['shared'],
    label: 'Line',
    description: 'A rule. Use it as a divider, or point at something with an arrowhead.',
    keywords: ['line', 'divider', 'rule', 'separator', 'stroke', 'arrow'],
    synonyms: ['hr', 'separator'],
    concepts: ['shape'],
    html: '<div class="ds-shape ds-shape--line"></div>',
    classes: ['ds-shape', 'ds-shape--line'],
    props: SHAPE_PROPS,
    defaults: { strokeColor: '#1F2937', strokeWidth: 2 },
    size: { default: { w: 240, h: 2 }, resize: 'both', min: { w: 8, h: 1 } },
    source: [{ file: 'lib/design/catalogue/curated/core.ts', line: 1, kind: 'tsx' }],
  }),

  defineEntry({
    id: 'shape.text',
    category: 'shape',
    areas: ['shared'],
    label: 'Free text',
    description: 'Text anywhere, answering to no component. Full typography control.',
    keywords: ['text', 'label', 'write', 'type', 'annotate', 'free'],
    synonyms: ['label', 'caption'],
    concepts: ['shape', 'container'],
    html: '<div class="ds-shape ds-shape--text">{{text}}</div>',
    classes: ['ds-shape', 'ds-shape--text'],
    slots: [{ name: 'text', kind: 'text', label: 'Text', default: 'Text' }],
    props: [...SHAPE_PROPS, ...TYPE_PROPS],
    defaults: { fontSize: '16px', color: '#0F1419' },
    size: { default: { w: 160, h: 24 }, resize: 'both', contentHeight: true },
    anchors: TEXT_ANCHORS,
    source: [{ file: 'lib/design/catalogue/curated/core.ts', line: 1, kind: 'tsx' }],
  }),

  defineEntry({
    id: 'shape.sticky',
    category: 'shape',
    areas: ['shared'],
    label: 'Sticky note',
    description: 'A note ABOUT the design. Never exported as something to build.',
    keywords: ['note', 'sticky', 'comment', 'annotation', 'todo', 'remark'],
    synonyms: ['post-it', 'memo'],
    concepts: ['shape', 'comms'],
    html: '<div class="ds-shape ds-shape--sticky">{{text}}</div>',
    classes: ['ds-shape', 'ds-shape--sticky'],
    slots: [{ name: 'text', kind: 'text', label: 'Note', default: 'This button should open the viewer, not download.' }],
    props: [...SHAPE_PROPS, ...TYPE_PROPS],
    defaults: { fill: '#FEF3C7', radius: 4 },
    size: { default: { w: 200, h: 120 }, resize: 'both' },
    source: [{ file: 'lib/design/catalogue/curated/core.ts', line: 1, kind: 'tsx', note: 'Annotation layer — kept out of the build spec.' }],
  }),

  defineEntry({
    id: 'shape.arrow',
    category: 'shape',
    areas: ['shared'],
    label: 'Arrow',
    description: 'Points at the thing you are talking about. Annotation, not content.',
    keywords: ['arrow', 'point', 'callout', 'annotation', 'indicate', 'direction'],
    synonyms: ['pointer'],
    concepts: ['shape'],
    html: '<div class="ds-shape ds-shape--arrow"><span class="ds-shape__arrow-line"></span><span class="ds-shape__arrow-head"></span></div>',
    classes: ['ds-shape', 'ds-shape--arrow'],
    props: SHAPE_PROPS,
    defaults: { strokeColor: '#DC2626', strokeWidth: 2 },
    size: { default: { w: 160, h: 16 }, resize: 'both' },
    source: [{ file: 'lib/design/catalogue/curated/core.ts', line: 1, kind: 'tsx', note: 'Annotation layer.' }],
  }),
];

/** Which entries are annotation by nature — the studio marks these automatically so they land in
 *  the export's `annotations` array rather than its `elements` array. */
export const ANNOTATION_ENTRY_IDS = new Set(['shape.sticky', 'shape.arrow']);

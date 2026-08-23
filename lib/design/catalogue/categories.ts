// lib/design/catalogue/categories.ts — the palette's tabs.
//
// Slice C3 of docs/planning/completed/DESIGN_STUDIO_2026-08-23.md.
//
// Sixteen categories. Every entry belongs to exactly one, and the choice is by WHAT THE THING IS,
// not where it appears — a status pill on the jobs list and a status pill on a receipt are one
// entry, because they are one thing. Categorising by page is how you end up with a palette that has
// the same button in nine tabs.
//
// `order` is the tab order, and it is deliberate rather than alphabetical: the things reached for
// most often are nearest the top. Buttons, text and inputs are most of what anybody places.

import type { CategoryId } from './types';

export interface CategoryMeta {
  id: CategoryId;
  label: string;
  /** lucide icon name, kept as a string so this file stays pure data (same convention as
   *  `lib/admin/route-registry.ts`). */
  iconName: string;
  order: number;
  /** One line, shown under the tab when the category is empty or being searched. */
  blurb: string;
  /** What belongs here, for the curator. The line that settles an argument about where something
   *  goes six months from now. */
  scope: string;
}

export const CATEGORIES: CategoryMeta[] = [
  {
    id: 'button',
    label: 'Buttons',
    iconName: 'MousePointerClick',
    order: 1,
    blurb: 'Anything you click to make something happen.',
    scope:
      'Primary / secondary / ghost / danger / icon-only / split / FAB / segmented, in every size. '
      + 'A link styled as a button lives here; a link styled as a link lives in Text.',
  },
  {
    id: 'text',
    label: 'Text',
    iconName: 'Type',
    order: 2,
    blurb: 'Headings, body, labels, captions — and free text you place anywhere.',
    scope:
      'Every type style the app defines, plus the free text tool. Inline links belong here. A label '
      + 'that is part of a form control belongs to that control, not here.',
  },
  {
    id: 'input',
    label: 'Inputs',
    iconName: 'TextCursorInput',
    order: 3,
    blurb: 'Fields somebody types into.',
    scope:
      'text, email, number, password, search, date, time, currency, textarea, file, address '
      + 'autocomplete — with their labels, helper text and error states.',
  },
  {
    id: 'select',
    label: 'Pickers',
    iconName: 'ListFilter',
    order: 4,
    blurb: 'Choosing from a set the app knows about.',
    scope:
      'select, multi-select, combobox, date range, colour picker, and the app-specific pickers '
      + '(job, client, employee, file). Split from Inputs because choosing and typing are different '
      + 'acts with different failure modes.',
  },
  {
    id: 'toggle',
    label: 'Toggles',
    iconName: 'ToggleLeft',
    order: 5,
    blurb: 'Binary and small-set choices.',
    scope: 'switch, checkbox, radio, radio group, segmented control, star / favourite.',
  },
  {
    id: 'tag',
    label: 'Tags & badges',
    iconName: 'Tag',
    order: 6,
    blurb: 'Small pieces of state, wearing a colour.',
    scope:
      'status pills, stage chips, role badges, count badges, filter chips, tag inputs. If it is '
      + 'clickable and changes a filter it is still a tag; if it performs an action it is a button.',
  },
  {
    id: 'card',
    label: 'Cards & panels',
    iconName: 'Square',
    order: 7,
    blurb: 'Surfaces that hold other things.',
    scope: 'stat card, list card, detail panel, section card, accordion, well, callout banner.',
  },
  {
    id: 'table',
    label: 'Tables & lists',
    iconName: 'Table',
    order: 8,
    blurb: 'Rows of the same kind of thing.',
    scope:
      'table head / row / cell, sortable header, zebra list, definition list, empty row, '
      + 'pagination. The phone-shaped form of a table (a stack of cards) is a VARIANT of the table '
      + 'entry, not a separate entry — that is the decision the mobile view exists to make.',
  },
  {
    id: 'nav',
    label: 'Navigation',
    iconName: 'Compass',
    order: 9,
    blurb: 'Getting from here to there.',
    scope:
      'sidebar, icon rail, topbar, breadcrumb, tabs, back link, pagination, stepper, stage timeline.',
  },
  {
    id: 'overlay',
    label: 'Overlays',
    iconName: 'Layers',
    order: 10,
    blurb: 'Things that sit on top.',
    scope: 'modal, sheet, drawer, popover, tooltip, dropdown menu, confirm dialog, lightbox.',
  },
  {
    id: 'feedback',
    label: 'Feedback',
    iconName: 'MessageSquareWarning',
    order: 11,
    blurb: 'What the screen says when it has nothing, is working, or has failed.',
    scope:
      'empty state, loading skeleton, spinner, toast, inline error, banner, progress bar. The scan '
      + 'found NINE separate definitions of loading/error/empty written per page — this category '
      + 'exists partly to make that visible.',
  },
  {
    id: 'media',
    label: 'Media',
    iconName: 'Image',
    order: 12,
    blurb: 'Pictures, files and charts.',
    scope: 'avatar, initial avatar, thumbnail, image tile, file row, video player, chart, sparkline.',
  },
  {
    id: 'layout',
    label: 'Layout',
    iconName: 'LayoutGrid',
    order: 13,
    blurb: 'The bones a page hangs on.',
    scope:
      'page shell, content container, card grid, two-column split, stack, spacer, divider, toolbar '
      + 'row, filter row. Without these a mockup floats in a void and tells you nothing about '
      + 'rhythm or gutters.',
  },
  {
    id: 'shape',
    label: 'Shapes',
    iconName: 'Shapes',
    order: 14,
    blurb: 'Rectangles, circles, arrows, notes — answering to nothing.',
    scope:
      'The free primitives of §4.6: shapes with per-corner radius, fills and strokes; free text '
      + 'labels; and the annotation layer (sticky notes, callouts, arrows, measure lines) which is '
      + 'kept OUT of the build spec because an arrow pointing at a button is an instruction, not a '
      + 'thing to build.',
  },
  {
    id: 'icon',
    label: 'Icons',
    iconName: 'Sparkles',
    order: 15,
    blurb: 'The lucide set, starting with the ones this app already uses.',
    scope:
      'Every lucide icon imported anywhere in the app, by name and searchable, then the full set '
      + 'behind a toggle. Emoji are NOT icons here — see the contract: lucide for function and '
      + 'navigation, emoji decorative only.',
  },
  {
    id: 'emoji',
    label: 'Emoji',
    iconName: 'Smile',
    order: 16,
    blurb: 'The full picker, with this app’s own stage and status emoji first.',
    scope:
      'The complete Unicode set, grouped and searchable, with skin-tone variants. The first group is '
      + '"used in this app" — the stage, status and section emoji that already carry meaning here.',
  },
];

export const CATEGORY_BY_ID: Record<CategoryId, CategoryMeta> = Object.fromEntries(
  CATEGORIES.map((c) => [c.id, c]),
) as Record<CategoryId, CategoryMeta>;

export const CATEGORY_ORDER: CategoryId[] = [...CATEGORIES]
  .sort((a, b) => a.order - b.order)
  .map((c) => c.id);

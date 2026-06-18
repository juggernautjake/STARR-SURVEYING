// lib/hub/widget-options.ts
//
// Slice 12 of employee-hub-overhaul-2026-05-30.md. Per-widget options
// registry. Every registered widget id maps to an entry that tells
// `WidgetOptionsPanel` (Slice 11) how to render its "Widget options"
// section. Three shapes:
//
//   - { source: 'settings-form' }
//       The widget definition's own `SettingsForm` already renders
//       the right controls. The panel hosts it directly.
//
//   - { source: 'schema', fields: WidgetOptionsField[] }
//       The widget doesn't ship a SettingsForm yet; the panel renders
//       a generic form from this declarative schema (Slice 13–15 wires
//       the generic renderer). Each field is a key in
//       `customization.content`.
//
//   - { source: 'none' }
//       The widget has no editable content options. The panel still
//       lets the surveyor edit Size + Header color + Title; it just
//       skips the Widget-options section.
//
// Slice 12 ships the registry + the coverage spec. Slices 13–15 wire
// the schema-driven render path inside the panel + add per-widget
// renderers for the families that need them.

import type { ComponentType } from 'react';
import { allWidgets, type WidgetSettingsFormProps } from './widget-registry';

export type WidgetOptionFieldType =
  | 'text'
  | 'number'
  | 'toggle'
  | 'select'
  | 'multiselect'
  // hub-widget-excellence-02 Slice 4 — order-preserving multi-select for
  // widgets that need to CHOOSE AND ORDER items (quick-actions,
  // bookmarks). The stored value is the ordered list of selected values.
  | 'orderedmultiselect'
  | 'color';

export interface WidgetOptionsFieldBase {
  /** Key in `customization.content`. */
  key: string;
  /** Surveyor-facing label rendered above the input. */
  label: string;
  /** Short description / hint shown below the input. */
  description?: string;
  type: WidgetOptionFieldType;
}

export interface WidgetOptionsTextField extends WidgetOptionsFieldBase {
  type: 'text';
  defaultValue: string;
  placeholder?: string;
}

export interface WidgetOptionsNumberField extends WidgetOptionsFieldBase {
  type: 'number';
  defaultValue: number;
  min?: number;
  max?: number;
  step?: number;
}

export interface WidgetOptionsToggleField extends WidgetOptionsFieldBase {
  type: 'toggle';
  defaultValue: boolean;
}

export interface WidgetOptionsSelectField extends WidgetOptionsFieldBase {
  type: 'select';
  defaultValue: string;
  options: ReadonlyArray<{ value: string; label: string }>;
}

export interface WidgetOptionsMultiSelectField extends WidgetOptionsFieldBase {
  type: 'multiselect';
  defaultValue: ReadonlyArray<string>;
  options: ReadonlyArray<{ value: string; label: string }>;
}

/** Order-preserving multi-select. `defaultValue` is the ordered list of
 *  selected option values; the editor lets the surveyor add/remove +
 *  move items up/down. Use for "pick which, and in what order" content
 *  (quick-actions, bookmarks). */
export interface WidgetOptionsOrderedMultiSelectField extends WidgetOptionsFieldBase {
  type: 'orderedmultiselect';
  defaultValue: ReadonlyArray<string>;
  options: ReadonlyArray<{ value: string; label: string }>;
  /** Optional cap on how many items can be selected at once. */
  maxSelected?: number;
}

export interface WidgetOptionsColorField extends WidgetOptionsFieldBase {
  type: 'color';
  defaultValue: string;
}

export type WidgetOptionsField =
  | WidgetOptionsTextField
  | WidgetOptionsNumberField
  | WidgetOptionsToggleField
  | WidgetOptionsSelectField
  | WidgetOptionsMultiSelectField
  | WidgetOptionsOrderedMultiSelectField
  | WidgetOptionsColorField;

export type WidgetOptionsEntry =
  | { source: 'settings-form' }
  | { source: 'schema'; fields: ReadonlyArray<WidgetOptionsField> }
  | { source: 'none' };

// ─── The registry ────────────────────────────────────────────────────

/** Lookup by widget id. Spec asserts every registered widget has an
 *  entry — `getWidgetOptionsEntry` falls back to `{ source: 'none' }`
 *  when a future widget is added without updating the registry. */
export const WIDGET_OPTIONS_REGISTRY: Readonly<Record<string, WidgetOptionsEntry>> = Object.freeze({
  // ── Widgets with their own SettingsForm (29) ──────────────────────
  'active-research-projects': { source: 'settings-form' },
  'assignments-due':          { source: 'settings-form' },
  'bookmarks':                { source: 'settings-form' },
  'class-assignments':        { source: 'settings-form' },
  // contacts plan Slice 5 (2026-05-30) — Contacts hub widget.
  'contacts':                 { source: 'settings-form' },
  // Slice W8 (hub-cad-roles-polish-2026-06-18) — consolidated
  // comms inbox. The widget has no SettingsForm yet (only a
  // single `showOpenLink` boolean in its defaults); register
  // it as `none` so the schema test stays clean.
  'comms-inbox':              { source: 'none' },
  'crew-calendar':            { source: 'settings-form' },
  'drawings-in-progress':     { source: 'settings-form' },
  // consolidation Slice 4 (2026-05-30) — unified Drawings widget.
  'drawings':                 { source: 'settings-form' },
  'equipment-out-today':      { source: 'settings-form' },
  'field-data-pending':       { source: 'settings-form' },
  'hours-this-week':          { source: 'settings-form' },
  'job-activity-feed':        { source: 'settings-form' },
  // consolidation Slice 5 (2026-05-30) — unified Activity widget.
  'activity':                 { source: 'settings-form' },
  'low-consumables':          { source: 'settings-form' },
  'maintenance-due':          { source: 'settings-form' },
  'mentions-inbox':           { source: 'settings-form' },
  'messages':                 { source: 'settings-form' },
  'mileage-tracker':          { source: 'settings-form' },
  'my-jobs':                  { source: 'settings-form' },
  'my-pay':                   { source: 'settings-form' },
  'open-discussions':         { source: 'settings-form' },
  'pinned-pages':             { source: 'settings-form' },
  'pipeline-status':          { source: 'settings-form' },
  'pto-balance':              { source: 'settings-form' },
  'quick-actions':            { source: 'settings-form' },
  'recent-activity':          { source: 'settings-form' },
  'recent-announcements':     { source: 'settings-form' },
  'recent-drawings':          { source: 'settings-form' },
  'team-status':              { source: 'settings-form' },
  'today-schedule':           { source: 'settings-form' },
  'vehicles-status':          { source: 'settings-form' },
  'weather':                  { source: 'settings-form' },

  // ── Widgets without a SettingsForm yet — schema-driven (12) ────────
  'daily-briefing': {
    source: 'schema',
    fields: [
      { key: 'showWeather', type: 'toggle', label: 'Show weather summary',
        description: 'Tucks the day\'s forecast into the briefing.',
        defaultValue: true },
      { key: 'showSchedule', type: 'toggle', label: 'Show today\'s jobs',
        defaultValue: true },
      { key: 'maxJobs', type: 'number', label: 'Max jobs to list',
        defaultValue: 3, min: 1, max: 10, step: 1 },
    ],
  },
  'flashcards-due': {
    source: 'schema',
    fields: [
      { key: 'maxCards', type: 'number', label: 'Cards to show',
        defaultValue: 5, min: 1, max: 25, step: 1 },
      { key: 'hideEmpty', type: 'toggle', label: 'Hide the widget when no cards are due',
        description: 'Skips the empty-state card on the hub.',
        defaultValue: false },
    ],
  },
  'monthly-revenue': {
    source: 'schema',
    fields: [
      { key: 'period', type: 'select', label: 'Period',
        defaultValue: 'month',
        options: [
          { value: 'month', label: 'Month' },
          { value: 'quarter', label: 'Quarter' },
          { value: 'year', label: 'Year' },
        ] },
      { key: 'showTrend', type: 'toggle', label: 'Show trend arrow',
        defaultValue: true },
      { key: 'showComparison', type: 'toggle', label: 'Compare to previous period',
        defaultValue: true },
    ],
  },
  'outstanding-invoices': {
    source: 'schema',
    fields: [
      { key: 'maxItems', type: 'number', label: 'Invoices to list',
        defaultValue: 5, min: 1, max: 20, step: 1 },
      { key: 'sortBy', type: 'select', label: 'Sort by',
        defaultValue: 'due-date',
        options: [
          { value: 'due-date', label: 'Due date' },
          { value: 'amount',  label: 'Amount' },
          { value: 'customer', label: 'Customer' },
        ] },
      { key: 'showAging', type: 'toggle', label: 'Show aging buckets (30/60/90)',
        defaultValue: true },
    ],
  },
  'pending-hours': {
    source: 'schema',
    fields: [
      { key: 'maxItems', type: 'number', label: 'Entries to list',
        defaultValue: 5, min: 1, max: 20, step: 1 },
      { key: 'groupByPerson', type: 'toggle', label: 'Group by submitter',
        defaultValue: false },
    ],
  },
  // consolidation Slice 3 (2026-05-30) — unified Approvals widget.
  'approvals': {
    source: 'schema',
    fields: [
      { key: 'defaultMode', type: 'select', label: 'Default tab',
        defaultValue: 'auto',
        options: [
          { value: 'auto',     label: 'Auto (busiest queue)' },
          { value: 'hours',    label: 'Hours' },
          { value: 'receipts', label: 'Receipts' },
          { value: 'time-off', label: 'Time off' },
        ] },
      { key: 'maxItems', type: 'number', label: 'Entries per tab',
        defaultValue: 5, min: 1, max: 20, step: 1 },
    ],
  },
  'pending-receipts': {
    source: 'schema',
    fields: [
      { key: 'maxItems', type: 'number', label: 'Receipts to list',
        defaultValue: 5, min: 1, max: 20, step: 1 },
      { key: 'showAmount', type: 'toggle', label: 'Show amount column',
        defaultValue: true },
    ],
  },
  'pending-time-off': {
    source: 'schema',
    fields: [
      { key: 'maxItems', type: 'number', label: 'Requests to list',
        defaultValue: 5, min: 1, max: 20, step: 1 },
      { key: 'showStartDate', type: 'toggle', label: 'Show start date column',
        defaultValue: true },
    ],
  },
  'quiz-history': {
    source: 'schema',
    fields: [
      { key: 'maxItems', type: 'number', label: 'Quizzes to list',
        defaultValue: 5, min: 1, max: 25, step: 1 },
      { key: 'showScore', type: 'toggle', label: 'Show score column',
        defaultValue: true },
      { key: 'onlyFailed', type: 'toggle', label: 'Only show quizzes you failed',
        defaultValue: false },
    ],
  },
  'recommended-lessons': {
    source: 'schema',
    fields: [
      { key: 'maxItems', type: 'number', label: 'Lessons to suggest',
        defaultValue: 4, min: 1, max: 10, step: 1 },
      { key: 'category', type: 'select', label: 'Category filter',
        defaultValue: 'all',
        options: [
          { value: 'all', label: 'All categories' },
          { value: 'survey', label: 'Surveying' },
          { value: 'tech', label: 'Technical' },
          { value: 'safety', label: 'Safety' },
        ] },
    ],
  },
  // Slice 15b — schema revised to match what the widget actually
  // renders. Pre-revision fields (showCompleted/showInProgress/
  // showUpcoming) described per-phase visibility, but the widget
  // displays a single roadmap rollup (percent + name + current
  // module + progress bar). Toggles now gate the three visible sub-
  // sections instead.
  'roadmap-progress': {
    source: 'schema',
    fields: [
      { key: 'showName', type: 'toggle', label: 'Show roadmap name',
        defaultValue: true },
      { key: 'showCurrent', type: 'toggle', label: 'Show current module',
        description: 'Surfaces the "Now on: …" line under the progress percent.',
        defaultValue: true },
      { key: 'showBar', type: 'toggle', label: 'Show progress bar',
        defaultValue: true },
    ],
  },
  'streak-counter': {
    source: 'schema',
    fields: [
      { key: 'kind', type: 'select', label: 'What to count',
        defaultValue: 'clockin',
        options: [
          { value: 'clockin', label: 'Clock-in streak' },
          { value: 'study',   label: 'Study streak' },
          { value: 'quiz',    label: 'Quiz streak' },
        ] },
      { key: 'goal', type: 'number', label: 'Goal (days)',
        description: 'A trophy icon appears when you hit this many days in a row.',
        defaultValue: 7, min: 1, max: 365, step: 1 },
    ],
  },
  'sun-calculator': {
    source: 'schema',
    fields: [
      { key: 'latitude', type: 'text', label: 'Latitude',
        placeholder: 'e.g. 43.6150',
        defaultValue: '' },
      { key: 'longitude', type: 'text', label: 'Longitude',
        placeholder: 'e.g. -116.2023',
        defaultValue: '' },
      { key: 'units', type: 'select', label: 'Time zone',
        defaultValue: 'local',
        options: [
          { value: 'local', label: 'Local time' },
          { value: 'utc',   label: 'UTC' },
        ] },
      { key: 'showTwilight', type: 'toggle', label: 'Include civil twilight',
        defaultValue: false },
    ],
  },
} as const);

/** Lookup a widget's options entry. Falls back to `{ source: 'none' }`
 *  for any registered widget not yet added to the table (the coverage
 *  spec asserts no such gaps in shipped code; the fallback exists so
 *  a brand-new widget added between commits doesn't crash the panel). */
export function getWidgetOptionsEntry(widgetId: string): WidgetOptionsEntry {
  return WIDGET_OPTIONS_REGISTRY[widgetId] ?? { source: 'none' };
}

/** Built from the schema's `defaultValue`s. Useful for seeding fresh
 *  customization.content when a widget is added from the palette. */
export function defaultContentForSchema(
  fields: ReadonlyArray<WidgetOptionsField>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of fields) {
    out[f.key] = f.defaultValue;
  }
  return out;
}

/** Convenience: returns the schema fields for a widget id, or `null`
 *  when the widget uses its own SettingsForm or has no options. */
export function getSchemaFields(widgetId: string): ReadonlyArray<WidgetOptionsField> | null {
  const entry = getWidgetOptionsEntry(widgetId);
  return entry.source === 'schema' ? entry.fields : null;
}

/** Coverage helper used by the spec — returns the registered widget
 *  ids that don't appear in WIDGET_OPTIONS_REGISTRY. */
export function findMissingRegistryEntries(): string[] {
  return allWidgets()
    .map((w) => w.id)
    .filter((id) => !(id in WIDGET_OPTIONS_REGISTRY));
}

// ─── Re-exports for the panel's render path (Slice 13+) ──────────────

export type { ComponentType, WidgetSettingsFormProps };

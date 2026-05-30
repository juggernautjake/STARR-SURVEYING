// __tests__/hub/widget-options-schema.test.ts
//
// Slice 12 of employee-hub-overhaul-2026-05-30.md. Locks the
// per-widget options registry's coverage + shape invariants:
//   - Every registered widget id has an entry (settings-form / schema
//     / none).
//   - Widgets whose definition exposes a SettingsForm have a
//     settings-form entry; we don't waste effort writing a parallel
//     schema for them.
//   - Schema entries have at least one field; defaults type-match
//     their declared `type`.
//   - The 12 known-no-SettingsForm widgets have schema entries.
//   - defaultContentForSchema produces a record of every key.

import { describe, it, expect } from 'vitest';
import '@/lib/hub/widgets/register-all';
import { allWidgets } from '@/lib/hub/widget-registry';
import {
  WIDGET_OPTIONS_REGISTRY,
  defaultContentForSchema,
  findMissingRegistryEntries,
  getSchemaFields,
  getWidgetOptionsEntry,
  type WidgetOptionsField,
} from '@/lib/hub/widget-options';

describe('Slice 12 — registry covers every registered widget id', () => {
  it('every widget definition has a registry entry', () => {
    expect(findMissingRegistryEntries()).toEqual([]);
  });

  it('the registry contains no extra entries (catalog and registry agree)', () => {
    const catalogIds = new Set(allWidgets().map((w) => w.id));
    const registryIds = Object.keys(WIDGET_OPTIONS_REGISTRY);
    const extras = registryIds.filter((id) => !catalogIds.has(id));
    expect(extras).toEqual([]);
  });
});

describe('Slice 12 — settings-form entries match widgets that ship a SettingsForm', () => {
  // A widget that ships a SettingsForm has a `SettingsForm` field on
  // its definition. The registry must point to it (don't duplicate
  // effort).
  it('every settings-form entry maps to a widget that actually has a SettingsForm', () => {
    const catalog = new Map(allWidgets().map((w) => [w.id, w]));
    const settingsFormIds = Object.entries(WIDGET_OPTIONS_REGISTRY)
      .filter(([, entry]) => entry.source === 'settings-form')
      .map(([id]) => id);
    const missingForms = settingsFormIds.filter((id) => !catalog.get(id)?.SettingsForm);
    expect(missingForms).toEqual([]);
  });

  it('every widget that ships a SettingsForm is registered as settings-form (no parallel schema)', () => {
    const widgetsWithForms = allWidgets().filter((w) => Boolean(w.SettingsForm));
    const mismatches = widgetsWithForms.filter((w) => {
      const entry = WIDGET_OPTIONS_REGISTRY[w.id];
      return entry?.source !== 'settings-form';
    });
    expect(mismatches.map((w) => w.id)).toEqual([]);
  });
});

describe('Slice 12 — schema entries are well-formed', () => {
  it('every schema entry has at least one field', () => {
    const empty = Object.entries(WIDGET_OPTIONS_REGISTRY)
      .filter(([, e]) => e.source === 'schema')
      .filter(([, e]) => e.source === 'schema' && e.fields.length === 0)
      .map(([id]) => id);
    expect(empty).toEqual([]);
  });

  it('every schema field defaultValue matches its declared type', () => {
    const mismatches: string[] = [];
    for (const [id, entry] of Object.entries(WIDGET_OPTIONS_REGISTRY)) {
      if (entry.source !== 'schema') continue;
      for (const field of entry.fields) {
        if (!defaultValueMatchesType(field)) {
          mismatches.push(`${id}/${field.key}`);
        }
      }
    }
    expect(mismatches).toEqual([]);
  });

  it('schema field keys are unique within their widget', () => {
    const dupes: string[] = [];
    for (const [id, entry] of Object.entries(WIDGET_OPTIONS_REGISTRY)) {
      if (entry.source !== 'schema') continue;
      const seen = new Set<string>();
      for (const field of entry.fields) {
        if (seen.has(field.key)) dupes.push(`${id}/${field.key}`);
        seen.add(field.key);
      }
    }
    expect(dupes).toEqual([]);
  });
});

describe('Slice 12 — the 12 known-no-SettingsForm widgets have schema entries', () => {
  const expected = [
    'daily-briefing',
    'flashcards-due',
    'monthly-revenue',
    'outstanding-invoices',
    'pending-hours',
    'pending-receipts',
    'pending-time-off',
    'quiz-history',
    'recommended-lessons',
    'roadmap-progress',
    'streak-counter',
    'sun-calculator',
  ];

  for (const id of expected) {
    it(`${id} has a schema entry`, () => {
      const entry = getWidgetOptionsEntry(id);
      expect(entry.source).toBe('schema');
      const fields = getSchemaFields(id);
      expect(fields).not.toBeNull();
      expect(fields!.length).toBeGreaterThan(0);
    });
  }
});

describe('Slice 12 — helpers', () => {
  it('getWidgetOptionsEntry returns "none" for unknown ids', () => {
    expect(getWidgetOptionsEntry('totally-not-a-widget')).toEqual({ source: 'none' });
  });

  it('defaultContentForSchema returns a record with each field key set to its defaultValue', () => {
    const fields: WidgetOptionsField[] = [
      { key: 'a', type: 'toggle', label: 'A', defaultValue: true },
      { key: 'b', type: 'number', label: 'B', defaultValue: 7, min: 1, max: 10 },
      { key: 's', type: 'select', label: 'S', defaultValue: 'one',
        options: [{ value: 'one', label: 'One' }, { value: 'two', label: 'Two' }] },
    ];
    const out = defaultContentForSchema(fields);
    expect(out).toEqual({ a: true, b: 7, s: 'one' });
  });
});

function defaultValueMatchesType(field: WidgetOptionsField): boolean {
  switch (field.type) {
    case 'text':
    case 'color':
    case 'select':
      return typeof field.defaultValue === 'string';
    case 'number':
      return typeof field.defaultValue === 'number' && Number.isFinite(field.defaultValue);
    case 'toggle':
      return typeof field.defaultValue === 'boolean';
    case 'multiselect':
      return Array.isArray(field.defaultValue) && field.defaultValue.every((v) => typeof v === 'string');
    default:
      return false;
  }
}

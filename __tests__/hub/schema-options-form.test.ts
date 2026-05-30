// __tests__/hub/schema-options-form.test.ts
//
// Slice 13 of employee-hub-overhaul-2026-05-30.md. Locks the generic
// schema-driven renderer + its wiring inside WidgetOptionsPanel.
// Source-regex assertions on the two files because the panel reads
// zustand state (SSR-snapshot caching limitation applies) and the
// renderer accepts arbitrary field types it can't be exhaustively
// rendered against without a host story.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const FORM = fs.readFileSync(
  path.join(__dirname, '..', '..', 'lib', 'hub', 'components', 'SchemaOptionsForm.tsx'),
  'utf8',
);

const PANEL = fs.readFileSync(
  path.join(__dirname, '..', '..', 'lib', 'hub', 'components', 'WidgetOptionsPanel.tsx'),
  'utf8',
);

describe('Slice 13 — SchemaOptionsForm renders the six field types', () => {
  // Render dispatcher: a switch on field.type → the appropriate control.
  it('declares a renderControl switch covering text / number / toggle / select / multiselect / color', () => {
    expect(FORM).toMatch(/switch \(field\.type\) \{/);
    expect(FORM).toMatch(/case 'text':[\s\S]*?<TextControl/);
    expect(FORM).toMatch(/case 'number':[\s\S]*?<NumberControl/);
    expect(FORM).toMatch(/case 'toggle':[\s\S]*?<ToggleControl/);
    expect(FORM).toMatch(/case 'select':[\s\S]*?<SelectControl/);
    expect(FORM).toMatch(/case 'multiselect':[\s\S]*?<MultiSelectControl/);
    expect(FORM).toMatch(/case 'color':[\s\S]*?<ColorControl/);
  });

  it('declares a control component for each field type', () => {
    expect(FORM).toMatch(/function TextControl\(/);
    expect(FORM).toMatch(/function NumberControl\(/);
    expect(FORM).toMatch(/function ToggleControl\(/);
    expect(FORM).toMatch(/function SelectControl\(/);
    expect(FORM).toMatch(/function MultiSelectControl\(/);
    expect(FORM).toMatch(/function ColorControl\(/);
  });
});

describe('Slice 13 — controls coerce missing or wrong-typed values to the schema defaultValue', () => {
  it('text falls back to field.defaultValue', () => {
    expect(FORM).toMatch(
      /typeof rawValue === 'string' \? rawValue : field\.defaultValue/,
    );
  });

  it('number requires a finite number, else defaultValue', () => {
    expect(FORM).toMatch(
      /typeof rawValue === 'number' && Number\.isFinite\(rawValue\)\s*\?\s*rawValue\s*:\s*field\.defaultValue/,
    );
  });

  it('toggle requires a boolean, else defaultValue', () => {
    expect(FORM).toMatch(
      /typeof rawValue === 'boolean' \? rawValue : field\.defaultValue/,
    );
  });

  it('select requires the value to be one of the options, else defaultValue', () => {
    expect(FORM).toMatch(
      /typeof rawValue === 'string'\s*&&\s*field\.options\.some\(\(o\) => o\.value === rawValue\)/,
    );
  });
});

describe('Slice 13 — number control clamps onChange to min / max', () => {
  it('reads e.target.valueAsNumber then clamps with Math.max + Math.min', () => {
    expect(FORM).toMatch(
      /const raw = e\.target\.valueAsNumber;[\s\S]*?if \(!Number\.isFinite\(raw\)\) return;[\s\S]*?const lo = field\.min \?\? -Infinity;[\s\S]*?const hi = field\.max \?\? Infinity;[\s\S]*?onChange\(Math\.max\(lo, Math\.min\(hi, raw\)\)\);/,
    );
  });
});

describe('Slice 13 — multiselect emits the OPTION-order subset', () => {
  it('rebuilds the next value by filtering field.options to the toggled set', () => {
    expect(FORM).toMatch(
      /onChange\(field\.options\.filter\(\(o\) => next\.has\(o\.value\)\)\.map\(\(o\) => o\.value\)\);/,
    );
  });
});

describe('Slice 13 — public props + testid surface', () => {
  it('exports SchemaOptionsForm with { fields, value, onChange }', () => {
    expect(FORM).toMatch(
      /export interface SchemaOptionsFormProps \{[\s\S]*?fields: ReadonlyArray<WidgetOptionsField>;[\s\S]*?value: Record<string, unknown>;[\s\S]*?onChange: \(next: Record<string, unknown>\) => void;[\s\S]*?\}/,
    );
  });

  it('every field row is testable via data-testid="schema-options-field-{key}"', () => {
    expect(FORM).toMatch(/data-testid=\{`schema-options-field-\$\{field\.key\}`\}/);
  });

  it('every field row exposes data-field-type for selector targeting', () => {
    expect(FORM).toMatch(/data-field-type=\{field\.type\}/);
  });

  it('multiselect chips are individually testable', () => {
    expect(FORM).toMatch(/data-testid=\{`schema-options-\$\{field\.key\}-\$\{opt\.value\}`\}/);
  });
});

describe('Slice 13 — WidgetOptionsPanel routes schema entries through the new renderer', () => {
  it('imports SchemaOptionsForm + getWidgetOptionsEntry + defaultContentForSchema', () => {
    expect(PANEL).toMatch(/import \{[\s\S]*?defaultContentForSchema,[\s\S]*?getWidgetOptionsEntry,[\s\S]*?\} from '@\/lib\/hub\/widget-options';/);
    expect(PANEL).toMatch(/import SchemaOptionsForm from '\.\/SchemaOptionsForm';/);
  });

  it('resolves entry via getWidgetOptionsEntry(instance.type)', () => {
    expect(PANEL).toMatch(/const entry = getWidgetOptionsEntry\(instance\.type\);/);
  });

  it('renders SettingsForm when entry.source === "settings-form" and the definition has one', () => {
    expect(PANEL).toMatch(
      /if \(entry\.source === 'settings-form' && SettingsForm\) \{[\s\S]*?<SettingsForm[\s\S]*?value=\{formValue\}/,
    );
  });

  it('renders SchemaOptionsForm when entry.source === "schema", seeded with defaults', () => {
    expect(PANEL).toMatch(
      /if \(entry\.source === 'schema'\) \{[\s\S]*?const seeded = \{\s*\.\.\.defaultContentForSchema\(entry\.fields\),\s*\.\.\.formValue,\s*\};[\s\S]*?<SchemaOptionsForm[\s\S]*?fields=\{entry\.fields\}[\s\S]*?value=\{seeded\}[\s\S]*?onChange=\{\(next\) => commitCustomization\(\{ content: next \}\)\}/,
    );
  });

  it('keeps the friendly empty-state fallback for "none" entries', () => {
    expect(PANEL).toMatch(/This widget doesn&apos;t have any extra options yet\./);
  });
});

'use client';
// lib/hub/components/SchemaOptionsForm.tsx
//
// Slice 13 of employee-hub-overhaul-2026-05-30.md. Generic form
// renderer for the per-widget options schemas added in Slice 12. The
// 12 widgets without a `SettingsForm` (daily-briefing, monthly-
// revenue, sun-calculator, etc.) declare their fields in
// WIDGET_OPTIONS_REGISTRY; this component walks that schema and emits
// the right control for each field type (text / number / toggle /
// select / multiselect / color).
//
// API mirrors the per-widget SettingsForm contract so a parent can
// swap one for the other:
//   <SchemaOptionsForm fields={…} value={content} onChange={next => …} />
//
// `value` is the typed `customization.content` bag; `onChange` is
// called with the full next bag (we shallow-merge the patch with the
// current value before calling). Fields whose key is absent from
// `value` render their schema-provided defaultValue, so a fresh widget
// hydrates cleanly even before the user opens the panel.

import React from 'react';

import type {
  WidgetOptionsField,
  WidgetOptionsMultiSelectField,
  WidgetOptionsNumberField,
  WidgetOptionsSelectField,
  WidgetOptionsTextField,
  WidgetOptionsToggleField,
  WidgetOptionsColorField,
} from '@/lib/hub/widget-options';

export interface SchemaOptionsFormProps {
  fields: ReadonlyArray<WidgetOptionsField>;
  value: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
}

export default function SchemaOptionsForm({
  fields,
  value,
  onChange,
}: SchemaOptionsFormProps) {
  function patch(key: string, next: unknown) {
    onChange({ ...value, [key]: next });
  }

  return (
    <div
      style={formStyle}
      role="group"
      data-testid="schema-options-form"
    >
      {fields.map((field) => (
        <SchemaFieldRow
          key={field.key}
          field={field}
          value={value[field.key]}
          onChange={(next) => patch(field.key, next)}
        />
      ))}
    </div>
  );
}

function SchemaFieldRow({
  field,
  value,
  onChange,
}: {
  field: WidgetOptionsField;
  value: unknown;
  onChange: (next: unknown) => void;
}) {
  return (
    <div
      style={rowStyle}
      data-testid={`schema-options-field-${field.key}`}
      data-field-type={field.type}
    >
      <label style={labelStyle} htmlFor={`schema-options-${field.key}`}>
        {field.label}
      </label>
      {renderControl(field, value, onChange)}
      {field.description ? (
        <p style={hintStyle}>{field.description}</p>
      ) : null}
    </div>
  );
}

function renderControl(
  field: WidgetOptionsField,
  rawValue: unknown,
  onChange: (next: unknown) => void,
): React.ReactNode {
  const id = `schema-options-${field.key}`;
  switch (field.type) {
    case 'text':       return <TextControl       id={id} field={field} rawValue={rawValue} onChange={onChange} />;
    case 'number':     return <NumberControl     id={id} field={field} rawValue={rawValue} onChange={onChange} />;
    case 'toggle':     return <ToggleControl     id={id} field={field} rawValue={rawValue} onChange={onChange} />;
    case 'select':     return <SelectControl     id={id} field={field} rawValue={rawValue} onChange={onChange} />;
    case 'multiselect':return <MultiSelectControl id={id} field={field} rawValue={rawValue} onChange={onChange} />;
    case 'color':      return <ColorControl      id={id} field={field} rawValue={rawValue} onChange={onChange} />;
    default:
      return null;
  }
}

// ─── Per-type controls ───────────────────────────────────────────────

function TextControl({
  id, field, rawValue, onChange,
}: { id: string; field: WidgetOptionsTextField; rawValue: unknown; onChange: (next: unknown) => void; }) {
  const value = typeof rawValue === 'string' ? rawValue : field.defaultValue;
  return (
    <input
      id={id}
      type="text"
      value={value}
      placeholder={field.placeholder}
      onChange={(e) => onChange(e.target.value)}
      style={textInputStyle}
    />
  );
}

function NumberControl({
  id, field, rawValue, onChange,
}: { id: string; field: WidgetOptionsNumberField; rawValue: unknown; onChange: (next: unknown) => void; }) {
  const value = typeof rawValue === 'number' && Number.isFinite(rawValue)
    ? rawValue
    : field.defaultValue;
  return (
    <input
      id={id}
      type="number"
      value={value}
      min={field.min}
      max={field.max}
      step={field.step ?? 1}
      onChange={(e) => {
        const raw = e.target.valueAsNumber;
        if (!Number.isFinite(raw)) return;
        const lo = field.min ?? -Infinity;
        const hi = field.max ?? Infinity;
        onChange(Math.max(lo, Math.min(hi, raw)));
      }}
      style={numberInputStyle}
    />
  );
}

function ToggleControl({
  id, field, rawValue, onChange,
}: { id: string; field: WidgetOptionsToggleField; rawValue: unknown; onChange: (next: unknown) => void; }) {
  const value = typeof rawValue === 'boolean' ? rawValue : field.defaultValue;
  return (
    <label style={toggleLabelStyle} htmlFor={id}>
      <input
        id={id}
        type="checkbox"
        checked={value}
        onChange={(e) => onChange(e.target.checked)}
        style={toggleInputStyle}
      />
      <span style={toggleHintStyle}>{value ? 'On' : 'Off'}</span>
    </label>
  );
}

function SelectControl({
  id, field, rawValue, onChange,
}: { id: string; field: WidgetOptionsSelectField; rawValue: unknown; onChange: (next: unknown) => void; }) {
  const value = typeof rawValue === 'string'
    && field.options.some((o) => o.value === rawValue)
    ? rawValue
    : field.defaultValue;
  return (
    <select
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={selectStyle}
    >
      {field.options.map((opt) => (
        <option key={opt.value} value={opt.value}>{opt.label}</option>
      ))}
    </select>
  );
}

function MultiSelectControl({
  id, field, rawValue, onChange,
}: { id: string; field: WidgetOptionsMultiSelectField; rawValue: unknown; onChange: (next: unknown) => void; }) {
  const arr: ReadonlyArray<string> = Array.isArray(rawValue)
    && rawValue.every((v) => typeof v === 'string')
    ? (rawValue as ReadonlyArray<string>)
    : field.defaultValue;
  const set = new Set(arr);
  function toggle(v: string) {
    const next = new Set(set);
    if (next.has(v)) next.delete(v);
    else next.add(v);
    onChange(field.options.filter((o) => next.has(o.value)).map((o) => o.value));
  }
  return (
    <div id={id} style={multiSelectStyle} role="group" aria-label={field.label}>
      {field.options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => toggle(opt.value)}
          style={set.has(opt.value) ? multiSelectChipOnStyle : multiSelectChipOffStyle}
          aria-pressed={set.has(opt.value)}
          data-testid={`schema-options-${field.key}-${opt.value}`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function ColorControl({
  id, field, rawValue, onChange,
}: { id: string; field: WidgetOptionsColorField; rawValue: unknown; onChange: (next: unknown) => void; }) {
  const value = typeof rawValue === 'string' ? rawValue : field.defaultValue;
  return (
    <input
      id={id}
      type="color"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={colorInputStyle}
    />
  );
}

// ─── Styles ──────────────────────────────────────────────────────────

const formStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
};

const rowStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
};

const labelStyle: React.CSSProperties = {
  fontSize: '0.78rem',
  fontWeight: 600,
  color: 'var(--theme-fg-primary)',
};

const textInputStyle: React.CSSProperties = {
  padding: '6px 10px',
  borderRadius: 6,
  border: '1px solid var(--theme-border)',
  background: 'var(--theme-bg-elevated)',
  color: 'var(--theme-fg-primary)',
  fontSize: '0.9rem',
};

const numberInputStyle: React.CSSProperties = {
  ...textInputStyle,
  width: 96,
};

const toggleLabelStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
  cursor: 'pointer',
  fontSize: '0.85rem',
};

const toggleInputStyle: React.CSSProperties = {
  width: 16,
  height: 16,
  cursor: 'pointer',
};

const toggleHintStyle: React.CSSProperties = {
  color: 'var(--theme-fg-secondary)',
  fontSize: '0.78rem',
};

const selectStyle: React.CSSProperties = {
  padding: '6px 10px',
  borderRadius: 6,
  border: '1px solid var(--theme-border)',
  background: 'var(--theme-bg-elevated)',
  color: 'var(--theme-fg-primary)',
  fontSize: '0.9rem',
};

const multiSelectStyle: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 6,
};

const multiSelectChipOnStyle: React.CSSProperties = {
  padding: '4px 10px',
  borderRadius: 999,
  border: '1px solid var(--theme-accent, #3b82f6)',
  background: 'var(--theme-accent, #3b82f6)',
  color: 'var(--theme-accent-fg, #ffffff)',
  cursor: 'pointer',
  fontSize: '0.78rem',
  fontWeight: 600,
};

const multiSelectChipOffStyle: React.CSSProperties = {
  ...multiSelectChipOnStyle,
  background: 'transparent',
  color: 'var(--theme-fg-secondary)',
  fontWeight: 500,
};

const colorInputStyle: React.CSSProperties = {
  width: 64,
  height: 32,
  borderRadius: 6,
  border: '1px solid var(--theme-border)',
  padding: 2,
  cursor: 'pointer',
};

const hintStyle: React.CSSProperties = {
  fontSize: '0.74rem',
  color: 'var(--theme-fg-muted, var(--theme-fg-secondary))',
};

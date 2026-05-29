'use client';
// lib/hub/components/settings/components/MultiSelect.tsx
//
// Checkbox-list multi-select. Used by widgets that let the user pick a
// subset of items (e.g., which stats to show on the My Pay widget,
// which job statuses to include in a queue widget).

import React from 'react';

interface MultiSelectOption<T extends string> {
  value: T;
  label: string;
  description?: string;
}

interface MultiSelectProps<T extends string> {
  options: ReadonlyArray<MultiSelectOption<T>>;
  /** Currently-selected values. Render order follows `options`, not
   *  `value` — the picker doesn't track order. */
  value: T[];
  onChange: (next: T[]) => void;
  ariaLabel?: string;
}

export default function MultiSelect<T extends string>({ options, value, onChange, ariaLabel }: MultiSelectProps<T>) {
  function toggle(v: T) {
    if (value.includes(v)) {
      onChange(value.filter((x) => x !== v));
    } else {
      onChange([...value, v]);
    }
  }

  return (
    <div role="group" aria-label={ariaLabel} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {options.map((opt) => (
        <label key={opt.value} style={rowStyle}>
          <input
            type="checkbox"
            checked={value.includes(opt.value)}
            onChange={() => toggle(opt.value)}
          />
          <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontSize: 'var(--hub-font-sm, 0.875rem)' }}>{opt.label}</span>
            {opt.description && (
              <span style={{ fontSize: 'var(--hub-font-xs, 0.75rem)', color: 'var(--theme-fg-secondary)' }}>
                {opt.description}
              </span>
            )}
          </span>
        </label>
      ))}
    </div>
  );
}

const rowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: 8,
};

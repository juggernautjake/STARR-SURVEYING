'use client';
// lib/hub/components/settings/components/FilterDropdown.tsx
//
// Native-select dropdown used by widget settings forms that need a
// single-value choice with more than 4-5 options (where ToggleGroup
// would wrap awkwardly).

import React from 'react';

interface FilterDropdownOption<T extends string> {
  value: T;
  label: string;
}

interface FilterDropdownProps<T extends string> {
  options: ReadonlyArray<FilterDropdownOption<T>>;
  value: T;
  onChange: (next: T) => void;
  ariaLabel?: string;
}

export default function FilterDropdown<T extends string>({ options, value, onChange, ariaLabel }: FilterDropdownProps<T>) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as T)}
      aria-label={ariaLabel}
      style={selectStyle}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

const selectStyle: React.CSSProperties = {
  padding: '6px 10px',
  borderRadius: 6,
  border: '1px solid var(--theme-border)',
  background: 'var(--theme-bg-elevated)',
  color: 'var(--theme-fg-primary)',
  fontSize: 'var(--hub-font-sm, 0.875rem)',
};

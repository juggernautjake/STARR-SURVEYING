'use client';
// lib/hub/components/settings/components/ToggleGroup.tsx
//
// Segmented control / pill group — a radio styled as a row of buttons.
// Used by the Interaction tab's clickAction picker + future widget
// settings that need a 2-4 option toggle.

import React from 'react';

interface ToggleGroupOption<T extends string> {
  value: T;
  label: string;
}

interface ToggleGroupProps<T extends string> {
  options: ReadonlyArray<ToggleGroupOption<T>>;
  value: T;
  onChange: (next: T) => void;
  ariaLabel?: string;
}

export default function ToggleGroup<T extends string>({ options, value, onChange, ariaLabel }: ToggleGroupProps<T>) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} style={wrapperStyle}>
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(opt.value)}
            style={active ? buttonActiveStyle : buttonStyle}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

const wrapperStyle: React.CSSProperties = {
  display: 'inline-flex',
  borderRadius: 6,
  border: '1px solid var(--theme-border)',
  overflow: 'hidden',
};

const buttonStyle: React.CSSProperties = {
  padding: '6px 12px',
  background: 'transparent',
  border: 'none',
  borderRight: '1px solid var(--theme-border)',
  color: 'var(--theme-fg-secondary)',
  cursor: 'pointer',
  fontSize: 'var(--hub-font-sm, 0.875rem)',
};

const buttonActiveStyle: React.CSSProperties = {
  ...buttonStyle,
  background: 'var(--theme-accent)',
  color: 'var(--theme-accent-fg)',
};

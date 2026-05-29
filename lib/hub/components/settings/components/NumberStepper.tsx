'use client';
// lib/hub/components/settings/components/NumberStepper.tsx
//
// Number input with − / + buttons. Used by the Interaction tab's
// refresh-interval input + future widget settings.

import React from 'react';

interface NumberStepperProps {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  step?: number;
  ariaLabel?: string;
  /** Optional suffix label rendered after the value (e.g. "sec"). */
  suffix?: string;
}

export default function NumberStepper({
  value,
  onChange,
  min,
  max,
  step = 1,
  ariaLabel,
  suffix,
}: NumberStepperProps) {
  function commit(next: number) {
    let n = Number.isFinite(next) ? next : value;
    if (typeof min === 'number') n = Math.max(min, n);
    if (typeof max === 'number') n = Math.min(max, n);
    onChange(n);
  }

  return (
    <div role="group" aria-label={ariaLabel} style={wrapperStyle}>
      <button
        type="button"
        onClick={() => commit(value - step)}
        aria-label="Decrease"
        disabled={typeof min === 'number' && value <= min}
        style={buttonStyle}
      >
        −
      </button>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => commit(Number(e.target.value))}
        style={inputStyle}
        aria-label={ariaLabel}
      />
      {suffix && (
        <span style={{ fontSize: 'var(--hub-font-sm, 0.875rem)', color: 'var(--theme-fg-secondary)' }}>{suffix}</span>
      )}
      <button
        type="button"
        onClick={() => commit(value + step)}
        aria-label="Increase"
        disabled={typeof max === 'number' && value >= max}
        style={buttonStyle}
      >
        +
      </button>
    </div>
  );
}

const wrapperStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
};

const buttonStyle: React.CSSProperties = {
  width: 28,
  height: 28,
  borderRadius: 4,
  border: '1px solid var(--theme-border)',
  background: 'var(--theme-bg-elevated)',
  color: 'var(--theme-fg-primary)',
  cursor: 'pointer',
  fontSize: '1rem',
  lineHeight: 1,
};

const inputStyle: React.CSSProperties = {
  width: 64,
  padding: '4px 6px',
  textAlign: 'center',
  borderRadius: 4,
  border: '1px solid var(--theme-border)',
  background: 'var(--theme-bg-elevated)',
  color: 'var(--theme-fg-primary)',
};

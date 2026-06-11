'use client';
// app/admin/cad/components/ColorSwatchInput.tsx
//
// cad-ux-cleanup-pass Slice 4 — shared color-picker control. Every
// site that used a bare `<input type="color">` with `bg-transparent`
// rendered the native browser swatch INSIDE its input box and showed
// up as "a small dot in a box" instead of a solid color preview. This
// component wraps the native input in a label whose background IS the
// chosen color, with the input overlaid transparent so click + tab +
// keyboard still open the native picker — every site now reads as a
// proper solid color swatch, identical across browsers.
//
// Default footprint is `w-8 h-6` to match the historical sizing.
// Callers can override via `className` (size / margin only — the
// rounded border + cursor / overflow are baked in here).

import { type CSSProperties } from 'react';

interface Props {
  value: string;
  onChange: (color: string) => void;
  onFocus?: () => void;
  onBlur?: () => void;
  /** Extra classes — typically size overrides like `w-5 h-5` or
   *  `h-7 w-10`. Do NOT pass `bg-*` (the swatch IS the background). */
  className?: string;
  disabled?: boolean;
  title?: string;
  'aria-label'?: string;
  'data-testid'?: string;
}

const BASE_CLASSES =
  'relative inline-block rounded border border-gray-600 cursor-pointer overflow-hidden';
const DEFAULT_SIZE = 'h-6 w-8';

export default function ColorSwatchInput({
  value,
  onChange,
  onFocus,
  onBlur,
  className,
  disabled = false,
  title,
  'aria-label': ariaLabel,
  'data-testid': dataTestId,
}: Props) {
  const swatch = value || '#000000';
  const style: CSSProperties = { backgroundColor: swatch };
  const sizing = className && className.trim().length > 0 ? className : DEFAULT_SIZE;
  return (
    <label
      className={`${BASE_CLASSES} ${disabled ? 'opacity-50 cursor-not-allowed' : ''} ${sizing}`}
      style={style}
      title={title}
    >
      <input
        type="color"
        value={swatch}
        disabled={disabled}
        onFocus={onFocus}
        onBlur={onBlur}
        onChange={(e) => onChange(e.target.value)}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
        aria-label={ariaLabel}
        data-testid={dataTestId}
      />
    </label>
  );
}

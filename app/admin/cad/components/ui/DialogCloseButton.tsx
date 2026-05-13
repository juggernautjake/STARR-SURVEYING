// app/admin/cad/components/ui/DialogCloseButton.tsx
//
// UX_POLISH §2.1 — single close-button primitive for every CAD
// dialog / modal / dismissible panel. Standardises on:
//   * lucide `<X size={14} />` glyph (was a 50/50 mix of `✕` and
//     `<X size={10..18}>` across 30+ sites)
//   * `text-gray-400 hover:text-white transition-colors` styling
//   * `aria-label="Close"` so screen readers don't read the icon
//     glyph as content
//
// Use this in dialog headers; in-row dismiss buttons that need
// non-standard sizing (e.g. ToolOptionsBar's tag-style chips) can
// keep their bespoke `<X size={N}>` for context.

import React from 'react';
import { X } from 'lucide-react';

interface DialogCloseButtonProps {
  onClick: () => void;
  /** Optional extra classes appended after the defaults. */
  className?: string;
  /** Override the default `aria-label`. */
  label?: string;
  /** Override the default glyph size (default 14 px). */
  size?: number;
}

export default function DialogCloseButton({
  onClick,
  className = '',
  label = 'Close',
  size = 14,
}: DialogCloseButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={`text-gray-400 hover:text-white transition-colors ${className}`.trim()}
    >
      <X size={size} />
    </button>
  );
}

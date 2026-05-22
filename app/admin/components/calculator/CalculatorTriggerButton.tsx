// app/admin/components/calculator/CalculatorTriggerButton.tsx
//
// Inline pill that opens the approved-exam-calculator modal. Embed on
// any admin page that benefits from a calculator handy (exam-prep
// modules, quiz answer fields, etc.). Goes alongside the FAB (C-22a) —
// the FAB is always-available, this pill is contextual.

'use client';

import type { ModelKey } from './CalculatorProvider';
import { useCalculator } from './CalculatorProvider';

interface CalculatorTriggerButtonProps {
  /** Optionally pre-select a calculator when opening. */
  model?: ModelKey;
  /** Visible label override. Defaults to "🧮 Calculator". */
  label?: string;
  /** Compact pill vs. larger button. */
  size?: 'sm' | 'md';
  /** Inline title attribute for tooltip; defaults to a context-aware string. */
  title?: string;
  /** Optional className for callers that need to position the pill. */
  className?: string;
}

export function CalculatorTriggerButton({
  model,
  label = '🧮 Calculator',
  size = 'md',
  title,
  className = '',
}: CalculatorTriggerButtonProps) {
  const { openCalculator } = useCalculator();
  const computedTitle = title ?? (model ? `Open ${model} calculator` : 'Open approved-exam calculator');
  return (
    <button
      type="button"
      className={`calc-trigger calc-trigger--${size} ${className}`.trim()}
      onClick={() => openCalculator(model)}
      title={computedTitle}
    >
      {label}
    </button>
  );
}

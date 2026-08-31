'use client';

// app/admin/research/components/SpendLimitSlider.tsx — the money question, asked once, visibly.
//
// ── WHY THIS EXISTS ─────────────────────────────────────────────────────────────────────────────
//
// The per-run spend ceiling was enforceable in the worker before it was askable anywhere. The owner
// was told a run could be capped between $0 and $10 and then could not find the control, because
// there was not one. A limit nobody can set is a constant with extra steps.
//
// ── WHY A SLIDER AND NOT A NUMBER BOX ───────────────────────────────────────────────────────────
//
// The range is small, bounded and meaningful at every point — $0 means "free sources only" and $10
// is the hard ceiling. A slider shows the whole space at a glance and makes the two ends
// discoverable; a text input hides them and invites a typo of 100 that a clamp then silently
// rewrites. The number is still shown, and still typeable for anyone who wants an exact value,
// because a slider alone cannot express "$3.50" without fiddling.
//
// ── $0 IS A REAL SETTING, NOT AN EMPTY ONE ──────────────────────────────────────────────────────
//
// Zero means "search everything free, buy nothing", which is a legitimate and common choice. It is
// deliberately reachable as the left-hand stop and labelled, because a control whose minimum reads
// as "unset" gets treated as a bug.

import { useId } from 'react';

export interface SpendLimitSliderProps {
  value: number;
  onChange: (next: number) => void;
  /** Hard ceiling. Mirrors MAX_COST_CEILING_USD in worker/src/infra/run-budget.ts. */
  max?: number;
  disabled?: boolean;
  /** Shown under the control. Say where the limit applies, not just what it is. */
  hint?: string;
}

export const SPEND_LIMIT_MAX_USD = 10;

/** What this amount means, in words. The number alone does not tell you what you have chosen. */
export function describeSpendLimit(value: number): string {
  if (value <= 0) {
    return 'Free sources only — the run will not buy any documents.';
  }
  if (value <= 2) {
    return 'Enough for one or two paid documents. This is the default and covers most runs.';
  }
  if (value < SPEND_LIMIT_MAX_USD) {
    return 'Room for a longer chain of title in a county with no free portal.';
  }
  return 'The maximum a single run may spend.';
}

export default function SpendLimitSlider({
  value,
  onChange,
  max = SPEND_LIMIT_MAX_USD,
  disabled = false,
  hint,
}: SpendLimitSliderProps) {
  const id = useId();
  // Clamped for display as well as on change: a value arriving from a stale draft or an API should
  // render inside the track rather than pinning the thumb off the end with no explanation.
  const safe = Math.min(max, Math.max(0, Number.isFinite(value) ? value : 0));
  const pct = max > 0 ? (safe / max) * 100 : 0;

  return (
    <div className="spend-limit" data-testid="spend-limit">
      <div className="spend-limit__head">
        <label className="spend-limit__label" htmlFor={id}>
          Spend limit for this run
        </label>
        <div className="spend-limit__value">
          <span className="spend-limit__currency">$</span>
          <input
            className="spend-limit__number"
            type="number"
            min={0}
            max={max}
            step={0.5}
            value={safe}
            disabled={disabled}
            aria-label="Spend limit in dollars"
            onChange={(e) => {
              const n = parseFloat(e.target.value);
              onChange(Number.isFinite(n) ? Math.min(max, Math.max(0, n)) : 0);
            }}
          />
        </div>
      </div>

      <input
        id={id}
        className="spend-limit__slider"
        type="range"
        min={0}
        max={max}
        step={0.5}
        value={safe}
        disabled={disabled}
        // The filled portion is drawn with a gradient rather than a second element so the track
        // stays one control for a screen reader.
        style={{ background: `linear-gradient(to right, var(--color-brand-blue, #2563EB) ${pct}%, var(--theme-bg-subtle, #E5E7EB) ${pct}%)` }}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        aria-describedby={`${id}-desc`}
      />

      <div className="spend-limit__scale" aria-hidden="true">
        <span>$0 · free only</span>
        <span>${max} · max</span>
      </div>

      <p className="spend-limit__desc" id={`${id}-desc`}>
        {describeSpendLimit(safe)}
        {hint ? ` ${hint}` : ''}
      </p>
    </div>
  );
}

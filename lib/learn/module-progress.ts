// lib/learn/module-progress.ts
// Doc 07 — module-card progress bar. Pure helpers so the color/label logic is
// unit-testable and reused across the modules listing + roadmap cards.
//
// Color model (the owner's spec): 0% = neutral grey ("no color"); between 1–99%
// the fill walks a CONTINUOUS gradient yellow → green → blue (many intermediate
// shades, not 3 buckets); 100% = full blue. We interpolate the HSL hue
// monotonically from ~50° (yellow) through ~140° (green) to ~215° (blue) as the
// percentage climbs, so each extra percent shifts the color a little.

export interface ModuleProgressInput {
  percentage?: number | null;
  total_lessons?: number | null;
  user_status?: string | null;
}

/** Clamp + round a raw percentage into 0–100. */
export function normalizePct(pct: number | null | undefined): number {
  if (pct == null || !Number.isFinite(pct)) return 0;
  return Math.max(0, Math.min(100, Math.round(pct)));
}

// Hue stops the gradient passes through, keyed by percentage.
const HUE_YELLOW = 50;
const HUE_GREEN = 140;
const HUE_BLUE = 215;

/**
 * Continuous fill color for a completion percentage.
 *  - pct <= 0      → neutral grey (no color)
 *  - 0 < pct < 100 → yellow→green→blue interpolation (monotonic hue)
 *  - pct >= 100    → full blue
 * Returns an `hsl(...)` string.
 */
export function progressColor(pctRaw: number): string {
  const pct = normalizePct(pctRaw);
  if (pct <= 0) return 'hsl(220, 9%, 82%)'; // neutral grey track-fill
  if (pct >= 100) return `hsl(${HUE_BLUE}, 80%, 48%)`;

  // First half (1–50%): yellow → green. Second half (50–100%): green → blue.
  let hue: number;
  if (pct <= 50) {
    const t = (pct - 1) / (50 - 1); // 0..1 across the lower half
    hue = HUE_YELLOW + (HUE_GREEN - HUE_YELLOW) * t;
  } else {
    const t = (pct - 50) / (100 - 50); // 0..1 across the upper half
    hue = HUE_GREEN + (HUE_BLUE - HUE_GREEN) * t;
  }
  // Saturation/lightness nudge so yellow isn't blinding and blue stays rich.
  const sat = 70 + (pct / 100) * 12;   // 70 → 82
  const light = 52 - (pct / 100) * 6;  // 52 → 46
  return `hsl(${Math.round(hue)}, ${Math.round(sat)}%, ${Math.round(light)}%)`;
}

/** The text shown on/under the bar. */
export function progressLabel(input: ModuleProgressInput): string {
  const pct = normalizePct(input.percentage);
  if (pct >= 100) return 'COMPLETED!';
  if (pct <= 0) {
    return input.user_status === 'enrolled' ? 'Enrolled' : 'Not Started';
  }
  return `${pct}%`;
}

/** True at 100% — the bar shows a white checkmark + "COMPLETED!". */
export function isComplete(input: ModuleProgressInput): boolean {
  return normalizePct(input.percentage) >= 100;
}

/** Readable text color (dark vs white) for a label sitting on the fill. */
export function progressLabelColor(pctRaw: number): string {
  const pct = normalizePct(pctRaw);
  // Grey (0) and the mid yellow/green band read better with dark text; the
  // deeper blue end (and 100%) reads better with white.
  if (pct <= 0) return '#4B5563';
  if (pct >= 78) return '#FFFFFF';
  return '#1F2937';
}

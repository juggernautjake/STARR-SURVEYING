// lib/hub/widgets/_shared/content-resolvers.ts
//
// Slice 15 of employee-hub-overhaul-2026-05-30.md. Shared resolver
// helpers for widgets whose Slice-12 schemas use the common
// "list cap + boolean toggle" shape (pending-hours, pending-receipts,
// pending-time-off, quiz-history, recommended-lessons, etc.). Keeps
// each widget body DRY without each having to re-derive its own
// type-coercion logic.
//
// Pure; never throws. Spec lives at
// __tests__/hub/widget-content-resolvers.test.ts.

/** Coerce an arbitrary value into an integer in `[lo, hi]`. Returns
 *  `fallback` when the value is missing / NaN / outside the range. */
export function resolveBoundedInt(
  raw: unknown,
  lo: number,
  hi: number,
  fallback: number | null,
): number | null {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return fallback;
  const v = Math.floor(raw);
  if (v < lo || v > hi) return fallback;
  return Math.max(lo, Math.min(hi, v));
}

/** Coerce an arbitrary value into a boolean. Returns `fallback` when
 *  the value is anything other than `true` / `false`. */
export function resolveBool(raw: unknown, fallback: boolean): boolean {
  return typeof raw === 'boolean' ? raw : fallback;
}

/** Coerce an arbitrary value into a string that's one of `allowed`.
 *  Returns `fallback` when the value isn't one of the allowed options. */
export function resolveEnum<T extends string>(
  raw: unknown,
  allowed: ReadonlyArray<T>,
  fallback: T,
): T {
  return typeof raw === 'string' && (allowed as ReadonlyArray<string>).includes(raw)
    ? (raw as T)
    : fallback;
}

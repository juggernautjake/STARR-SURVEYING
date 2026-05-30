// lib/hub/widgets/_shared/ordered-list.ts
//
// Slice 4 of hub-widget-excellence-02-shared-infra. Pure helpers behind
// the reorderable "ordered multi-select" editor primitive (the missing
// control the audit found — quick-actions + bookmarks need to CHOOSE
// AND ORDER their items, which the existing order-agnostic multiselect
// chip-picker can't do).
//
// The editor value is the ORDERED list of selected option values. These
// helpers do the add / remove / move-up / move-down transforms + a
// normalizer that coerces a persisted raw value back to a clean ordered
// subset of the current options. All pure + immutable (return new
// arrays), so they're trivially unit-testable.

/** Move the item at `index` one slot earlier. No-op at the top / for an
 *  out-of-range index. Returns a new array. */
export function moveUp<T>(arr: readonly T[], index: number): T[] {
  if (index <= 0 || index >= arr.length) return arr.slice();
  const next = arr.slice();
  [next[index - 1], next[index]] = [next[index], next[index - 1]];
  return next;
}

/** Move the item at `index` one slot later. No-op at the bottom / for an
 *  out-of-range index. Returns a new array. */
export function moveDown<T>(arr: readonly T[], index: number): T[] {
  if (index < 0 || index >= arr.length - 1) return arr.slice();
  const next = arr.slice();
  [next[index], next[index + 1]] = [next[index + 1], next[index]];
  return next;
}

/** Append `value` to the ordered list if it isn't already present.
 *  Returns a new array. */
export function addOrdered(arr: readonly string[], value: string): string[] {
  if (arr.includes(value)) return arr.slice();
  return [...arr, value];
}

/** Remove `value` from the ordered list. Returns a new array. */
export function removeOrdered(arr: readonly string[], value: string): string[] {
  return arr.filter((v) => v !== value);
}

/**
 * Coerce a persisted raw value into a clean ordered subset of the
 * currently-valid option values:
 *   - keep only entries that are valid option values (drops removed
 *     options),
 *   - de-dupe while preserving first-seen order,
 *   - fall back to `fallback` when the raw value isn't a string array.
 */
export function normalizeOrdered(
  rawValue: unknown,
  validValues: readonly string[],
  fallback: readonly string[],
): string[] {
  const valid = new Set(validValues);
  const source = Array.isArray(rawValue) && rawValue.every((v) => typeof v === 'string')
    ? (rawValue as string[])
    : fallback;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of source) {
    if (!valid.has(v) || seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}

/** The option values NOT yet selected, in option order — the "add"
 *  candidates for the editor. */
export function unselectedOptions(
  selected: readonly string[],
  optionValues: readonly string[],
): string[] {
  const chosen = new Set(selected);
  return optionValues.filter((v) => !chosen.has(v));
}

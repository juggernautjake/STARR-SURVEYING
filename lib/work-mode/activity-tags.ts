// lib/work-mode/activity-tags.ts
//
// Helpers for the activity-tag system. Mirrors the seed in
// seeds/302_activity_tags.sql.
//
// Slice 180 of customizable-hub-and-work-mode-2026-05-28.md.

export interface ActivityTag {
  id: string;
  label: string;
  color: string;
  system: boolean;
  work_type_key?: string | null;
}

// activity-tag-dedupe-2026-06-22 — early seed runs of 302 inserted the
// same system tags multiple times because `ON CONFLICT DO NOTHING` was
// a no-op without a matching constraint. Until seed 375 cleans the
// table, the API defensively dedupes the result it returns. Pure +
// exported so the rule is unit-testable. Keys are case-insensitive +
// trimmed so "  Drafting" / "DRAFTING" / "Drafting" collapse. When two
// rows share a label we prefer the system row, then the lower id
// (stable for tests). */
export function dedupeTagsByLabel<T extends { id: string; label: string; system: boolean }>(
  tags: ReadonlyArray<T>,
): T[] {
  const byKey = new Map<string, T>();
  for (const t of tags) {
    const key = (t.label ?? '').trim().toLowerCase();
    if (!key) continue;
    const prev = byKey.get(key);
    if (!prev) { byKey.set(key, t); continue; }
    const better =
      (t.system && !prev.system) ||
      (t.system === prev.system && t.id < prev.id);
    if (better) byKey.set(key, t);
  }
  return Array.from(byKey.values());
}

/** Resolves a list of selected tag ids to a pay multiplier. Tags
 *  without a work_type_key default to 1.0. Multiple tags multiply
 *  together — e.g. Travel (0.5x) + Field (1.2x) = 0.6x. The widget /
 *  payroll integration applies this to the time entry's effective
 *  hourly rate. */
export function resolvePayMultiplier(
  tagIds: string[],
  catalog: ActivityTag[],
  multipliers: Record<string, number>,
): number {
  if (tagIds.length === 0) return 1.0;
  const lookup = new Map(catalog.map((t) => [t.id, t]));
  let mult = 1.0;
  for (const id of tagIds) {
    const tag = lookup.get(id);
    if (!tag?.work_type_key) continue;
    const m = multipliers[tag.work_type_key];
    if (Number.isFinite(m) && m > 0) mult *= m;
  }
  return mult;
}

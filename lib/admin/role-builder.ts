// lib/admin/role-builder.ts
//
// Slice W7 — pure helpers for the role builder. Validation lives
// here so the API + the UI form share the contract.

/** Same regex as the migration's CHECK constraint. Lower-snake,
 *  2–41 chars, must start with a letter. */
const KEY_RE = /^[a-z][a-z0-9_]{1,40}$/;

export type RoleKeyValidation =
  | { ok: true; key: string }
  | { ok: false; error: string };

/** Slugify a free-text label into a candidate role key. Lower
 *  cases, collapses non-alpha-numeric runs to `_`, trims leading
 *  digits / underscores, and caps at 41 chars. Returns null when
 *  there's nothing to slug. */
export function slugifyRoleKey(label: string): string | null {
  if (typeof label !== 'string') return null;
  const lower = label.toLowerCase();
  // Normalize: replace any non a-z0-9 run with a single underscore.
  const collapsed = lower.replace(/[^a-z0-9]+/g, '_');
  // Strip leading non-alpha so it satisfies the CHECK regex.
  const trimmedFront = collapsed.replace(/^[^a-z]+/, '');
  const trimmed = trimmedFront.replace(/_+$/, '');
  if (!trimmed) return null;
  return trimmed.slice(0, 41);
}

/** Validate the key the caller wants to register. Either accepts
 *  it, or returns a human-readable error the API surfaces. */
export function validateRoleKey(key: unknown): RoleKeyValidation {
  if (typeof key !== 'string') return { ok: false, error: 'Role key must be a string.' };
  const trimmed = key.trim();
  if (!trimmed) return { ok: false, error: 'Role key is required.' };
  if (!KEY_RE.test(trimmed)) {
    return { ok: false, error: 'Role key must be lower-snake (e.g. dispatcher_lead), 2–41 chars.' };
  }
  return { ok: true, key: trimmed };
}

/** Normalize a label — trims, caps at 80 chars, blank → null. */
export function normalizeLabel(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const t = input.trim();
  if (!t) return null;
  return t.slice(0, 80);
}

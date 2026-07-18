// app/dnd/_sheet/lib/log-edit.ts — the ONE client path for recording a manual sheet edit to the
// audit log (`dnd_sheet_edits`, Phase C11a), so the DM's "what changed" view stays true no matter
// which surface made the change. DmOverridePanel's scalar overrides and the in-place element editors
// (AttackEditor, …) both go through here — one audit vocabulary, not a parallel path (DND_RULES Slice 20).
//
// Fire-and-forget by design: an edit that already succeeded in the store must never be blocked or
// undone by an audit-log hiccup, so failures are swallowed. Server-side `POST /edits` re-checks
// write access and stamps the editor + is_dm; the client only supplies the diff.

export type EditScope = 'temp' | 'permanent';

/** A single field's before/after, addressed by a human-readable `path` the review queue displays. */
export interface FieldChange {
  path: string;
  old: unknown;
  new: unknown;
}

/**
 * The changed subset of `fields` between two versions of an object, each addressed as `${prefix}.${field}`.
 * Pure. Unchanged fields (strict-equal) are dropped, so a save that touched nothing logs nothing — the same
 * "no-op → no row" guard DmOverridePanel has always applied, now shared. `undefined`/`null` are compared as
 * distinct from `0`/`''` (a real transition from "unset" to a value is a change worth auditing).
 */
export function diffFields<T extends object>(before: T, after: T, prefix: string, fields: (keyof T)[]): FieldChange[] {
  const out: FieldChange[] = [];
  for (const f of fields) {
    const a = before[f];
    const b = after[f];
    if (a === b) continue;
    out.push({ path: `${prefix}.${String(f)}`, old: a ?? null, new: b ?? null });
  }
  return out;
}

/**
 * Record one field change to the audit log. Fire-and-forget; a no-op when the sheet isn't DB-backed
 * (`characterId` is null — a standalone/localStorage sheet has no server log) or the value didn't move.
 */
export function logManualEdit(
  characterId: string | null | undefined,
  fieldPath: string,
  oldValue: unknown,
  newValue: unknown,
  scope: EditScope = 'permanent',
): void {
  if (!characterId || oldValue === newValue) return;
  void fetch(`/api/dnd/characters/${characterId}/edits`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ field_path: fieldPath, old_value: oldValue ?? null, new_value: newValue ?? null, scope }),
  }).catch(() => {});
}

/** Record a batch of field changes (e.g. every field an in-place editor touched in one save). */
export function logManualEdits(characterId: string | null | undefined, changes: FieldChange[], scope: EditScope = 'permanent'): void {
  for (const c of changes) logManualEdit(characterId, c.path, c.old, c.new, scope);
}

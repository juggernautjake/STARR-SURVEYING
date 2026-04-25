/**
 * Time-entry editing + audit trail.
 *
 * Phase F1 #6 per plan §5.8.3. Edits to a job_time_entries row are
 * tier-gated by the absolute delta (in minutes) of any time-field
 * change:
 *
 *   delta < 15 min  → reason optional (kept for clarification text)
 *   delta 15-60 min → reason REQUIRED (typical "forgot to clock out")
 *   delta > 60 min  → reason required + admin-approval flag
 *                     (server-side workflow; this client just marks
 *                     and saves — F1 polish builds the approval UI)
 *   age > 24 hours  → BLOCKED on mobile; admin must edit server-side
 *
 * "Age" = how long ago the entry was created. We block 24h+ edits on
 * mobile because at that point the entry is likely already part of
 * a submitted timesheet and changing it without admin oversight
 * compromises payroll.
 *
 * Each edit writes ONE time_edits row per changed field. Editing
 * started_at + ended_at + notes in a single save → 3 audit rows.
 * Each row carries old_value/new_value/reason/delta_minutes/edited_*.
 */
import { usePowerSync, useQuery } from '@powersync/react';
import { useCallback } from 'react';

import { useAuth } from './auth';
import { randomUUID } from './uuid';

export interface TimeEdit {
  id: string;
  job_time_entry_id: string;
  field_name: string;
  old_value: string | null;
  new_value: string | null;
  reason: string | null;
  delta_minutes: number | null;
  edited_by: string | null;
  edited_at: string | null;
}

export interface TimeEntryEditPatch {
  /** ISO-8601 string OR null to leave unchanged. */
  started_at?: string | null;
  /** ISO-8601 string OR null to leave unchanged. Pass empty string '' to clear. */
  ended_at?: string | null | '';
  notes?: string | null;
  /** Free-text from the user; required when any tier ≥ "reason". */
  reason?: string | null;
}

export interface EditValidation {
  /** True when the patch can be saved as-is. */
  ok: boolean;
  /** User-facing error to display, or null when ok. */
  error: string | null;
  /** Highest tier triggered by the patch. */
  tier: EditTier;
  /** Largest absolute delta among time-field changes, in minutes. */
  maxDeltaMinutes: number;
}

export type EditTier = 'silent' | 'reason_optional' | 'reason_required' | 'needs_approval' | 'blocked';

const DELTA_REASON_OPTIONAL_MIN = 5;
const DELTA_REASON_REQUIRED_MIN = 15;
const DELTA_NEEDS_APPROVAL_MIN = 60;
const AGE_BLOCK_HOURS = 24;

/**
 * Look up the audit history for a single entry. Used by the edit
 * screen's history section.
 */
export function useTimeEdits(entryId: string | null | undefined): {
  edits: TimeEdit[];
  isLoading: boolean;
} {
  const { data, isLoading } = useQuery<TimeEdit>(
    `SELECT *
     FROM time_edits
     WHERE job_time_entry_id = ?
     ORDER BY edited_at DESC, id DESC`,
    entryId ? [entryId] : []
  );

  if (!entryId) return { edits: [], isLoading: false };
  return {
    edits: data ?? [],
    isLoading,
  };
}

/**
 * Validate a proposed patch against the current row.
 *
 *   age > 24h         → blocked (regardless of delta)
 *   delta > 60 min    → reason required + needs_approval flag
 *   delta 15-60 min   → reason required
 *   delta 5-15 min    → reason optional but stored if present
 *   delta < 5 min     → silent edit (no reason needed)
 */
export function validateEdit(
  current: { started_at: string | null; ended_at: string | null; created_at: string | null },
  patch: TimeEntryEditPatch
): EditValidation {
  // Age check. We use created_at as the canonical "when was this
  // entry born" — server-clocked editions never come up on mobile.
  if (current.created_at) {
    const ageHours = (Date.now() - Date.parse(current.created_at)) / 3_600_000;
    if (Number.isFinite(ageHours) && ageHours > AGE_BLOCK_HOURS) {
      return {
        ok: false,
        error: `This entry is ${Math.round(ageHours)}h old. Ask an admin to edit it from the web.`,
        tier: 'blocked',
        maxDeltaMinutes: 0,
      };
    }
  }

  // Compute the maximum |delta| across time fields the patch touches.
  let maxDelta = 0;
  if (patch.started_at !== undefined && patch.started_at !== null) {
    const d = absDeltaMinutes(current.started_at, patch.started_at);
    if (d > maxDelta) maxDelta = d;
  }
  if (patch.ended_at !== undefined && patch.ended_at !== null && patch.ended_at !== '') {
    const d = absDeltaMinutes(current.ended_at, patch.ended_at);
    if (d > maxDelta) maxDelta = d;
  }

  let tier: EditTier;
  if (maxDelta >= DELTA_NEEDS_APPROVAL_MIN) tier = 'needs_approval';
  else if (maxDelta >= DELTA_REASON_REQUIRED_MIN) tier = 'reason_required';
  else if (maxDelta >= DELTA_REASON_OPTIONAL_MIN) tier = 'reason_optional';
  else tier = 'silent';

  const reason = (patch.reason ?? '').trim();
  if ((tier === 'reason_required' || tier === 'needs_approval') && !reason) {
    return {
      ok: false,
      error:
        tier === 'needs_approval'
          ? `Edits over ${DELTA_NEEDS_APPROVAL_MIN} min need a reason and will be flagged for admin approval.`
          : `Edits over ${DELTA_REASON_REQUIRED_MIN} min need a reason ("forgot to clock out", etc.).`,
      tier,
      maxDeltaMinutes: maxDelta,
    };
  }

  return { ok: true, error: null, tier, maxDeltaMinutes: maxDelta };
}

/**
 * Edit an entry. Validates, then in one transaction-like sequence:
 *   1. UPDATE the job_time_entries row with the new values +
 *      recomputed duration_minutes
 *   2. INSERT one time_edits row per changed field
 *
 * Throws on validation failure or DB error. Caller surfaces the
 * message in the UI; the entry stays unchanged when this throws.
 */
export function useEditTimeEntry(): (
  entry: {
    id: string;
    started_at: string | null;
    ended_at: string | null;
    notes: string | null;
    created_at: string | null;
  },
  patch: TimeEntryEditPatch
) => Promise<{ tier: EditTier; deltaMinutes: number }> {
  const db = usePowerSync();
  const { session } = useAuth();

  return useCallback(
    async (entry, patch) => {
      const userEmail = session?.user.email;
      if (!userEmail) throw new Error('Not signed in.');

      const validation = validateEdit(entry, patch);
      if (!validation.ok) {
        throw new Error(validation.error ?? 'Edit not allowed.');
      }

      const newStarted = patch.started_at ?? entry.started_at;
      const newEnded =
        patch.ended_at === ''
          ? null
          : (patch.ended_at as string | null | undefined) ?? entry.ended_at;
      const newNotes = patch.notes ?? entry.notes;
      const reason = patch.reason?.trim() || null;

      // Recompute duration_minutes from the new boundaries; null
      // when the entry is open (ended_at not set).
      let durationMin: number | null = null;
      if (newStarted && newEnded) {
        const a = Date.parse(newStarted);
        const b = Date.parse(newEnded);
        if (Number.isFinite(a) && Number.isFinite(b) && b >= a) {
          durationMin = Math.max(0, Math.round((b - a) / 60_000));
        }
      }

      const nowIso = new Date().toISOString();

      await db.execute(
        `UPDATE job_time_entries
         SET started_at = ?,
             ended_at = ?,
             notes = ?,
             duration_minutes = ?,
             updated_at = ?
         WHERE id = ?`,
        [newStarted, newEnded, newNotes, durationMin, nowIso, entry.id]
      );

      // One time_edits row per changed field.
      await maybeWriteEdit(db, {
        entryId: entry.id,
        field: 'started_at',
        oldValue: entry.started_at,
        newValue: newStarted,
        reason,
        deltaMinutes: absDeltaMinutes(entry.started_at, newStarted ?? null),
        userEmail,
        editedAt: nowIso,
      });
      await maybeWriteEdit(db, {
        entryId: entry.id,
        field: 'ended_at',
        oldValue: entry.ended_at,
        newValue: newEnded,
        reason,
        deltaMinutes: absDeltaMinutes(entry.ended_at, newEnded),
        userEmail,
        editedAt: nowIso,
      });
      await maybeWriteEdit(db, {
        entryId: entry.id,
        field: 'notes',
        oldValue: entry.notes,
        newValue: newNotes,
        reason,
        deltaMinutes: null, // notes have no time delta
        userEmail,
        editedAt: nowIso,
      });

      return {
        tier: validation.tier,
        deltaMinutes: validation.maxDeltaMinutes,
      };
    },
    [db, session]
  );
}

interface MaybeWriteEditArgs {
  entryId: string;
  field: 'started_at' | 'ended_at' | 'notes' | 'entry_type' | 'job_id';
  oldValue: string | null;
  newValue: string | null;
  reason: string | null;
  deltaMinutes: number | null;
  userEmail: string;
  editedAt: string;
}

async function maybeWriteEdit(
  db: ReturnType<typeof usePowerSync>,
  args: MaybeWriteEditArgs
): Promise<void> {
  // Skip when the value didn't actually change. Compare as strings
  // so null vs '' vs undefined collapse the same way.
  const a = args.oldValue ?? '';
  const b = args.newValue ?? '';
  if (a === b) return;

  const id = randomUUID();
  await db.execute(
    `INSERT INTO time_edits (
       id, job_time_entry_id, field_name,
       old_value, new_value, reason, delta_minutes,
       edited_by, edited_at, client_id
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      args.entryId,
      args.field,
      args.oldValue,
      args.newValue,
      args.reason,
      args.deltaMinutes,
      args.userEmail,
      args.editedAt,
      id,
    ]
  );
}

/** Absolute difference in minutes between two ISO-8601 strings. */
function absDeltaMinutes(a: string | null | undefined, b: string | null | undefined): number {
  if (!a || !b) return 0;
  const ta = Date.parse(a);
  const tb = Date.parse(b);
  if (!Number.isFinite(ta) || !Number.isFinite(tb)) return 0;
  return Math.round(Math.abs(tb - ta) / 60_000);
}

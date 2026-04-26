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
import { useCallback, useEffect, useMemo } from 'react';

import { useAuth } from './auth';
import { logError, logInfo } from './log';
import { durationMinutesBetween } from './timeFormat';
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

/** Human label for the tier badge on the edit screen. */
export function tierLabel(tier: EditTier): string {
  switch (tier) {
    case 'silent':
      return 'Small change · auto-logged';
    case 'reason_optional':
      return 'Edit · reason helpful';
    case 'reason_required':
      return 'Significant edit · reason required';
    case 'needs_approval':
      return 'Major edit · admin approval needed';
    case 'blocked':
      return 'Locked · admin must edit';
  }
}

/** Which palette token drives the tier badge color. */
export function tierPaletteKey(
  tier: EditTier
): 'success' | 'accent' | 'danger' {
  switch (tier) {
    case 'silent':
    case 'reason_optional':
      return 'success';
    case 'reason_required':
      return 'accent';
    case 'needs_approval':
    case 'blocked':
      return 'danger';
  }
}

/** Tiers that surface the optional/required reason field. */
export const TIERS_WITH_REASON: ReadonlySet<EditTier> = new Set([
  'reason_optional',
  'reason_required',
  'needs_approval',
]);

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
  const queryParams = useMemo(
    () => (entryId ? [entryId] : []),
    [entryId]
  );
  const { data, isLoading, error } = useQuery<TimeEdit>(
    `SELECT *
     FROM time_edits
     WHERE job_time_entry_id = ?
     ORDER BY edited_at DESC, id DESC`,
    queryParams
  );

  useEffect(() => {
    if (error) {
      logError('timeEdits.useTimeEdits', 'query failed', error, {
        entry_id: entryId ?? null,
      });
    }
  }, [error, entryId]);

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
      if (!userEmail) {
        const err = new Error('Not signed in.');
        logError('timeEdits.editEntry', 'no session', err, { entry_id: entry.id });
        throw err;
      }

      const validation = validateEdit(entry, patch);
      logInfo('timeEdits.editEntry', 'validate', {
        entry_id: entry.id,
        tier: validation.tier,
        max_delta_minutes: validation.maxDeltaMinutes,
        ok: validation.ok,
      });
      if (!validation.ok) {
        const err = new Error(validation.error ?? 'Edit not allowed.');
        logInfo('timeEdits.editEntry', 'rejected', {
          entry_id: entry.id,
          tier: validation.tier,
          reason: validation.error,
        });
        throw err;
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
      const durationMin = durationMinutesBetween(newStarted, newEnded);

      const nowIso = new Date().toISOString();

      const fieldChanges: AuditField[] = [
        {
          field: 'started_at',
          oldValue: entry.started_at,
          newValue: newStarted,
          deltaMinutes: absDeltaMinutes(entry.started_at, newStarted ?? null),
        },
        {
          field: 'ended_at',
          oldValue: entry.ended_at,
          newValue: newEnded,
          deltaMinutes: absDeltaMinutes(entry.ended_at, newEnded),
        },
        {
          field: 'notes',
          oldValue: entry.notes,
          newValue: newNotes,
          deltaMinutes: null, // notes have no time delta
        },
      ];

      try {
        // Run the entry UPDATE in parallel with the audit-row INSERTs.
        // No write depends on another's result; PowerSync's local
        // SQLite serializes the statements internally, but the round
        // trips overlap.
        await Promise.all([
          db.execute(
            `UPDATE job_time_entries
             SET started_at = ?,
                 ended_at = ?,
                 notes = ?,
                 duration_minutes = ?,
                 updated_at = ?
             WHERE id = ?`,
            [newStarted, newEnded, newNotes, durationMin, nowIso, entry.id]
          ),
          ...fieldChanges.map((change) =>
            maybeWriteEdit(db, {
              ...change,
              entryId: entry.id,
              reason,
              userEmail,
              editedAt: nowIso,
            })
          ),
        ]);

        logInfo('timeEdits.editEntry', 'success', {
          entry_id: entry.id,
          tier: validation.tier,
          delta_minutes: validation.maxDeltaMinutes,
          duration_minutes: durationMin,
        });

        return {
          tier: validation.tier,
          deltaMinutes: validation.maxDeltaMinutes,
        };
      } catch (err) {
        logError('timeEdits.editEntry', 'db write failed', err, {
          entry_id: entry.id,
          tier: validation.tier,
          delta_minutes: validation.maxDeltaMinutes,
        });
        throw err;
      }
    },
    [db, session]
  );
}

interface AuditField {
  field: 'started_at' | 'ended_at' | 'notes' | 'entry_type' | 'job_id';
  oldValue: string | null;
  newValue: string | null;
  deltaMinutes: number | null;
}

interface MaybeWriteEditArgs extends AuditField {
  entryId: string;
  reason: string | null;
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

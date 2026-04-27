/**
 * Field notes — free-text + structured templates attached to a point
 * or job (per plan §5.5).
 *
 * Backed by the existing `fieldbook_notes` table (shared with the
 * web learning-fieldbook surface). Mobile uses a different column
 * subset:
 *   - body            — the free-text note (or a JSON-encoded
 *                       structured template payload).
 *   - job_id          — required.
 *   - data_point_id   — optional; null = job-level note.
 *   - note_template   — null for free-text, e.g. 'offset_shot' /
 *                       'monument_found' / 'hazard' / 'correction'
 *                       for structured.
 *   - structured_data — JSON-encoded payload for the named template.
 *   - is_current      — defaults to true; soft-archive flips to
 *                       false (the web admin's `/admin/notes` already
 *                       respects this column).
 *   - voice_transcript_media_id — optional FK to a `field_media`
 *                       voice memo whose transcript dictated this
 *                       note (F4 polish).
 *
 * The standard field-template flavors per plan §5.5:
 *
 *   offset_shot      — { offset_distance_ft, offset_direction,
 *                        notes }
 *   monument_found   — { monument_type ('rebar' | 'pipe' | 'stone'),
 *                        condition, depth_in, notes }
 *   hazard           — { hazard_type, severity ('low' | 'med' |
 *                        'high'), notes }
 *   correction       — { what_changed, why, notes }
 *
 * Mobile renders a per-template form; the structured fields land
 * in `structured_data` (JSON) AND a human-readable summary lands
 * in `body` so the existing admin grep/sort works without parsing
 * the JSON. The admin viewer parses structured_data when it wants
 * the rich detail.
 */
import { useEffect, useMemo } from 'react';
import { useCallback } from 'react';
import { usePowerSync, useQuery } from '@powersync/react';
import type { AbstractPowerSyncDatabase } from '@powersync/react-native';

import { useAuth } from './auth';
import type { AppDatabase } from './db/schema';
import { logError, logInfo } from './log';
import { randomUUID } from './uuid';

export type FieldNote = AppDatabase['fieldbook_notes'];

/** Known template ids — kept narrow so the UI can render a per-
 *  template form. Adding a new one requires updating both ends. */
export type NoteTemplate =
  | 'offset_shot'
  | 'monument_found'
  | 'hazard'
  | 'correction';

/** Per-template payload shapes. Mirror the plan §5.5 doc; the JSON
 *  blob in `structured_data` is one of these. */
export interface OffsetShotPayload {
  offset_distance_ft: number | null;
  offset_direction: string | null; // 'N' | 'NE' | … | free text
  notes?: string | null;
}

export interface MonumentFoundPayload {
  monument_type: 'rebar' | 'pipe' | 'stone' | 'concrete' | 'other';
  condition: 'good' | 'damaged' | 'buried' | 'destroyed' | string;
  depth_in: number | null;
  notes?: string | null;
}

export interface HazardPayload {
  hazard_type: string; // free text — fence wire, snake nest, etc.
  severity: 'low' | 'med' | 'high';
  notes?: string | null;
}

export interface CorrectionPayload {
  what_changed: string;
  why: string;
  notes?: string | null;
}

export type NoteTemplatePayload =
  | OffsetShotPayload
  | MonumentFoundPayload
  | HazardPayload
  | CorrectionPayload;

export const NOTE_TEMPLATE_LABELS: Record<NoteTemplate, string> = {
  offset_shot: 'Offset shot',
  monument_found: 'Monument found',
  hazard: 'Hazard',
  correction: 'Correction',
};

// ── Read hooks ───────────────────────────────────────────────────────────────

/**
 * Reactive list of notes for a point. Returns active notes only
 * (`is_current = 1`) sorted newest first. Empty array when pointId
 * is falsy.
 */
export function usePointNotes(
  pointId: string | null | undefined
): { notes: FieldNote[]; isLoading: boolean } {
  const queryParams = useMemo(() => (pointId ? [pointId] : []), [pointId]);
  const { data, isLoading, error } = useQuery<FieldNote>(
    `SELECT * FROM fieldbook_notes
      WHERE data_point_id = ?
        AND COALESCE(is_current, 1) = 1
      ORDER BY COALESCE(created_at, '') DESC`,
    queryParams
  );

  useEffect(() => {
    if (error) {
      logError('fieldNotes.usePointNotes', 'query failed', error, {
        point_id: pointId ?? null,
      });
    }
  }, [error, pointId]);

  return { notes: data ?? [], isLoading: !!pointId && isLoading };
}

/**
 * Job-level notes (no point attached). Powers a future "Day's notes"
 * surface on the job detail page.
 */
export function useJobLevelNotes(
  jobId: string | null | undefined
): { notes: FieldNote[]; isLoading: boolean } {
  const queryParams = useMemo(() => (jobId ? [jobId] : []), [jobId]);
  const { data, isLoading, error } = useQuery<FieldNote>(
    `SELECT * FROM fieldbook_notes
      WHERE job_id = ?
        AND data_point_id IS NULL
        AND COALESCE(is_current, 1) = 1
      ORDER BY COALESCE(created_at, '') DESC`,
    queryParams
  );

  useEffect(() => {
    if (error) {
      logError('fieldNotes.useJobLevelNotes', 'query failed', error, {
        job_id: jobId ?? null,
      });
    }
  }, [error, jobId]);

  return { notes: data ?? [], isLoading: !!jobId && isLoading };
}

// ── Write hooks ──────────────────────────────────────────────────────────────

export interface AddNoteInput {
  /** Required — every note belongs to a job. */
  jobId: string;
  /** Optional — the data point the note attaches to. Null = job-
   *  level note (free-floating thought about the day). */
  dataPointId: string | null;
  /** Free-text body. Required for free-text notes; for structured
   *  templates we auto-summarise the payload into `body` so the
   *  existing admin grep keeps working without parsing JSON. */
  body: string;
  /** Optional — when set, `payload` MUST be set too. Drives the
   *  per-template UI rendering on the admin side. */
  template?: NoteTemplate | null;
  /** Optional — JSON payload matching the template shape. Stored
   *  as a JSON-encoded string in `structured_data`. */
  payload?: NoteTemplatePayload | null;
  /** Optional — link to a voice memo whose transcript dictated this
   *  note. F4 polish populates this; v1 leaves null. */
  voiceTranscriptMediaId?: string | null;
}

export interface AddedNote {
  id: string;
}

/** Convert a structured payload to a one-line body summary. The web
 *  admin's `/admin/notes` grep + the F4 search-across-notes feature
 *  both work against `body` — leaving body blank when a template is
 *  used would make those flows broken. Centralised here so the
 *  format stays consistent across templates. */
export function summariseStructuredPayload(
  template: NoteTemplate,
  payload: NoteTemplatePayload
): string {
  switch (template) {
    case 'offset_shot': {
      const p = payload as OffsetShotPayload;
      const parts: string[] = ['Offset shot'];
      if (p.offset_distance_ft != null) {
        parts.push(`${p.offset_distance_ft} ft`);
      }
      if (p.offset_direction) parts.push(p.offset_direction);
      if (p.notes) parts.push(`— ${p.notes}`);
      return parts.join(' ');
    }
    case 'monument_found': {
      const p = payload as MonumentFoundPayload;
      const parts: string[] = ['Monument', p.monument_type];
      if (p.condition) parts.push(`(${p.condition})`);
      if (p.depth_in != null) parts.push(`${p.depth_in}″ deep`);
      if (p.notes) parts.push(`— ${p.notes}`);
      return parts.join(' ');
    }
    case 'hazard': {
      const p = payload as HazardPayload;
      const sev = p.severity ? `[${p.severity.toUpperCase()}]` : '';
      return [
        'Hazard',
        sev,
        p.hazard_type,
        p.notes ? `— ${p.notes}` : '',
      ]
        .filter(Boolean)
        .join(' ');
    }
    case 'correction': {
      const p = payload as CorrectionPayload;
      return [
        'Correction:',
        p.what_changed,
        p.why ? `(${p.why})` : '',
        p.notes ? `— ${p.notes}` : '',
      ]
        .filter(Boolean)
        .join(' ');
    }
    default:
      return 'Note';
  }
}

/**
 * Insert a note. Idempotent via `client_id = note id` so a
 * PowerSync replay can't double-insert. Best-effort — failures
 * surface to the caller; the admin can correct via /admin/notes
 * if a row is malformed.
 */
export function useAddFieldNote(): (
  input: AddNoteInput
) => Promise<AddedNote | null> {
  const db = usePowerSync();
  const { session } = useAuth();

  return useCallback(
    async ({
      jobId,
      dataPointId,
      body,
      template,
      payload,
      voiceTranscriptMediaId,
    }) => {
      const userEmail = session?.user.email;
      if (!userEmail) {
        const err = new Error('Not signed in.');
        logError('fieldNotes.add', 'no session', err);
        throw err;
      }
      if (!jobId) {
        throw new Error('jobId is required');
      }
      const finalBody =
        body?.trim() ||
        (template && payload
          ? summariseStructuredPayload(template, payload)
          : '');
      if (!finalBody) {
        throw new Error('Note body or template payload required.');
      }
      // Defence-in-depth: payload required when template is set.
      if (template && !payload) {
        throw new Error('payload is required when template is set');
      }

      const id = randomUUID();
      const nowIso = new Date().toISOString();
      const structuredJson =
        template && payload ? JSON.stringify(payload) : null;

      try {
        await db.execute(
          `INSERT INTO fieldbook_notes (
             id, user_email, body,
             is_public, is_current,
             job_id, data_point_id,
             note_template, structured_data,
             voice_transcript_media_id,
             created_at, updated_at, client_id
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            id,
            userEmail,
            finalBody,
            0, // is_public defaults to crew-private
            1, // is_current = true
            jobId,
            dataPointId,
            template ?? null,
            structuredJson,
            voiceTranscriptMediaId ?? null,
            nowIso,
            nowIso,
            id, // client_id
          ]
        );
        logInfo('fieldNotes.add', 'inserted', {
          note_id: id,
          job_id: jobId,
          point_id: dataPointId,
          template: template ?? null,
        });
        return { id };
      } catch (err) {
        logError('fieldNotes.add', 'insert failed', err, {
          note_id: id,
          job_id: jobId,
          point_id: dataPointId,
          template: template ?? null,
        });
        throw err;
      }
    },
    [db, session]
  );
}

/**
 * Soft-delete (archive) a note — flips is_current=0. The web admin
 * still sees archived notes; mobile lists hide them.
 */
export function useArchiveFieldNote(): (
  noteId: string
) => Promise<void> {
  const db = usePowerSync();

  return useCallback(
    async (noteId) => {
      try {
        await db.execute(
          `UPDATE fieldbook_notes
              SET is_current = 0, updated_at = ?
            WHERE id = ?`,
          [new Date().toISOString(), noteId]
        );
        logInfo('fieldNotes.archive', 'archived', { note_id: noteId });
      } catch (err) {
        logError('fieldNotes.archive', 'failed', err, { note_id: noteId });
        throw err;
      }
    },
    [db]
  );
}

/**
 * Parse a note's `structured_data` JSON safely. Returns null when
 * the column is empty OR the JSON is malformed (shouldn't happen
 * but defensive — a bad row shouldn't crash the renderer).
 */
export function parseStructuredPayload(
  structured: string | null | undefined
): NoteTemplatePayload | null {
  if (!structured) return null;
  try {
    return JSON.parse(structured) as NoteTemplatePayload;
  } catch {
    return null;
  }
}

/**
 * Helper used by tests + future imports — re-derive the body
 * summary from a note row. Useful when migrating older notes that
 * had freeform body text into the structured form.
 */
export function deriveNoteBody(
  template: NoteTemplate | null | undefined,
  structured: string | null | undefined,
  fallback: string
): string {
  if (!template) return fallback;
  const payload = parseStructuredPayload(structured);
  if (!payload) return fallback;
  return summariseStructuredPayload(template, payload);
}

/**
 * Force-export the imperative type for tests + the future
 * timeline-import path. Not used at runtime.
 */
export type AddNoteFn = ReturnType<typeof useAddFieldNote>;

// Re-export AbstractPowerSyncDatabase so the future server-import
// helpers can typecheck without a deep PowerSync import.
export type { AbstractPowerSyncDatabase };

// lib/calendar/phase-event.ts
//
// job-calendar Slice C4 — per-job phase scheduler. Pure helpers for
// turning the user's "I want to do field work Tuesday + Wednesday +
// Thursday" intent into one `schedule_events` row per day (or a
// single all-day row spanning the range) the calendar can render.
//
// Three phases: research / field_work / drawing_deliverables. Each
// phase POSTs to /api/admin/schedule.

/** Stable enum the calendar + the scheduler + the reminder cron all
 *  share. Adding a phase here without updating the calendar's
 *  PHASE_COLORS map would render the new phase as 'other' grey;
 *  source-locked in the calendar test. */
export const PHASES = ['research', 'field_work', 'drawing_deliverables'] as const;
export type Phase = (typeof PHASES)[number];

export const PHASE_TITLE_PREFIX: Record<Phase, string> = {
  research: 'Research',
  field_work: 'Field Work',
  drawing_deliverables: 'Drawing & Deliverables',
};

export interface PhaseEventDraft {
  jobId: string;
  jobName: string;
  phase: Phase;
  /** Local YYYY-MM-DD string for the day this phase runs. The helper
   *  converts to a UTC start_time at 8am local + end_time at 5pm
   *  local — the default "work day" assumption. Callers can override
   *  via explicit `startTimeIso` / `endTimeIso`. */
  dayIso: string;
  /** Email the event is assigned to. */
  assignedTo: string;
  /** Optional location override (defaults to the job address — caller
   *  passes when available). */
  location?: string | null;
  /** Optional notes. */
  notes?: string | null;
  /** Optional override of the start/end. When provided, `dayIso` is
   *  ignored. Useful for callers that need a multi-day span on a
   *  single row. */
  startTimeIso?: string;
  endTimeIso?: string;
  /** Default true — phases default to all-day so they sit on the
   *  day-square of the calendar at full width. Override for an
   *  hour-precise event. */
  allDay?: boolean;
}

export interface PhaseEventRow {
  title: string;
  event_type: Phase;
  start_time: string;
  end_time: string;
  all_day: boolean;
  location: string | null;
  notes: string | null;
  job_id: string;
  assigned_to: string;
}

/** Build the POST body for /api/admin/schedule from a phase intent.
 *  Pure — no Supabase, no fetch. The slice test locks the shape. */
export function buildPhaseEventRow(draft: PhaseEventDraft): PhaseEventRow {
  const { jobId, jobName, phase, dayIso, assignedTo } = draft;
  const allDay = draft.allDay ?? true;

  let startTimeIso = draft.startTimeIso;
  let endTimeIso = draft.endTimeIso;
  if (!startTimeIso || !endTimeIso) {
    // Defaults: 8am → 5pm America/Chicago, expressed as a local-naive
    // ISO so a server in any TZ writes the same wall-clock to the DB.
    // We store as `<dayIso>T08:00:00` and let TIMESTAMPTZ interpret
    // it as Central via `+ 'America/Chicago'`. The simpler path: use
    // the day's midnight UTC as start + +9h as end. Acceptable
    // because the calendar reads back by local-day grouping anyway,
    // and the scheduler's reminder logic uses the day boundary not
    // the hour.
    const start = new Date(`${dayIso}T13:00:00Z`); // ~8am CDT / 7am CST
    const end = new Date(`${dayIso}T22:00:00Z`);   // ~5pm CDT / 4pm CST
    startTimeIso = start.toISOString();
    endTimeIso = end.toISOString();
  }

  return {
    title: `${PHASE_TITLE_PREFIX[phase]} — ${jobName}`,
    event_type: phase,
    start_time: startTimeIso,
    end_time: endTimeIso,
    all_day: allDay,
    location: draft.location ?? null,
    notes: draft.notes ?? null,
    job_id: jobId,
    assigned_to: assignedTo,
  };
}

/** Fan a multi-day range out into one row per day. The user picks
 *  Tuesday + Wednesday + Thursday in the picker; the scheduler POSTs
 *  three rows so each shows up on its own calendar square. */
export function buildPhaseEventRowsForDays(
  base: Omit<PhaseEventDraft, 'dayIso'>,
  dayIsoList: string[],
): PhaseEventRow[] {
  return dayIsoList.map((dayIso) => buildPhaseEventRow({ ...base, dayIso }));
}

/** Validate that a draft has every required field. Returns the error
 *  message string on failure, null on success. Used by the form
 *  before POST so the user sees a clear message rather than a 400. */
export function validatePhaseDraft(
  draft: Partial<PhaseEventDraft> & { dayIsoList?: string[] },
): string | null {
  if (!draft.jobId) return 'Missing job id';
  if (!draft.jobName?.trim()) return 'Missing job name';
  if (!draft.phase) return 'Missing phase';
  if (!PHASES.includes(draft.phase as Phase)) return `Unknown phase: ${draft.phase}`;
  if (!draft.assignedTo?.trim()) return 'Assign at least one person';
  const days = draft.dayIsoList ?? (draft.dayIso ? [draft.dayIso] : []);
  if (days.length === 0) return 'Pick at least one day';
  for (const iso of days) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return `Invalid day: ${iso}`;
  }
  return null;
}

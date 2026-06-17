// lib/calendar/phase-reminder.ts
//
// job-calendar Slice C5 — pure helper for the day-before + day-of
// phase reminder cron. Takes the universe of phase-typed
// `schedule_events` rows + a clock and returns the notifications to
// fan out. Source-locked at this boundary so the cron route stays a
// thin shell around the helper.

import type { Phase } from './phase-event';
import { PHASE_TITLE_PREFIX } from './phase-event';

export interface PhaseEventRow {
  id: string;
  title: string;
  event_type: Phase | string;
  start_time: string;
  end_time: string;
  job_id: string | null;
  assigned_to: string;
  location: string | null;
  notes: string | null;
}

export interface PhaseReminderRow {
  user_email: string;
  type: 'phase.reminder';
  title: string;
  body: string;
  icon: string;
  link: string;
  source_type: 'schedule_events';
  source_id: string;
  escalation_level: 'normal' | 'high';
}

/** When (relative to event start) the cron is allowed to fire a
 *  reminder. `day-before` fires when the event starts tomorrow in
 *  America/Chicago; `day-of` fires when the event starts today. */
export type ReminderKind = 'day-before' | 'day-of';

function localDayChicagoIso(d: Date): string {
  // Take a Date and return YYYY-MM-DD as observed in America/Chicago.
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Chicago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d);
  const m: Record<string, string> = {};
  for (const p of parts) m[p.type] = p.value;
  return `${m.year}-${m.month}-${m.day}`;
}

/** Classify an event by when it starts relative to `now` in Central
 *  time. Returns `null` for events that fall outside the
 *  day-before / day-of windows so the cron skips them silently. */
export function classifyReminder(
  startTimeIso: string,
  now: Date,
): ReminderKind | null {
  const todayIso = localDayChicagoIso(now);
  const tomorrow = new Date(now.getTime() + 24 * 3600 * 1000);
  const tomorrowIso = localDayChicagoIso(tomorrow);
  const eventDayIso = localDayChicagoIso(new Date(startTimeIso));
  if (eventDayIso === todayIso) return 'day-of';
  if (eventDayIso === tomorrowIso) return 'day-before';
  return null;
}

const PHASE_ICON: Record<string, string> = {
  research: '🔍',
  field_work: '🏗️',
  drawing_deliverables: '📐',
  other: '🗓️',
};

function jobNameFromTitle(eventTitle: string): string {
  // The phase scheduler stores titles as "<PhaseLabel> — <jobName>".
  // The em-dash is the structured separator; split on it. Fall back to
  // the whole title when the separator isn't present (e.g. legacy
  // rows hand-created by the existing SchedulePanel).
  const idx = eventTitle.indexOf('—');
  if (idx === -1) return eventTitle;
  return eventTitle.slice(idx + 1).trim();
}

/** Build the notification payload for one (event, kind) pair. Pure. */
export function buildPhaseReminderRow(
  ev: PhaseEventRow,
  kind: ReminderKind,
): PhaseReminderRow {
  const phaseLabel = PHASE_TITLE_PREFIX[ev.event_type as Phase] ?? 'Phase';
  const icon = PHASE_ICON[ev.event_type as Phase] ?? PHASE_ICON.other;
  const jobName = jobNameFromTitle(ev.title);
  const dayWord = kind === 'day-of' ? 'Today' : 'Tomorrow';
  const titleEmoji = kind === 'day-of' ? '📍' : '🔔';
  return {
    user_email: ev.assigned_to,
    type: 'phase.reminder',
    title: `${titleEmoji} ${dayWord}: ${phaseLabel} — ${jobName}`,
    body: [
      `${icon} ${phaseLabel} for ${jobName}`,
      ev.location ? `📍 ${ev.location}` : null,
      ev.notes ? ev.notes : null,
    ]
      .filter(Boolean)
      .join('\n'),
    icon: 'calendar',
    link: ev.job_id ? `/admin/jobs/${ev.job_id}` : '/admin/calendar',
    source_type: 'schedule_events',
    source_id: ev.id,
    escalation_level: kind === 'day-of' ? 'high' : 'normal',
  };
}

/** Walk the candidate events + return one reminder row per matching
 *  event. Caller `notifyMany`s the result. Events with no `assigned_to`
 *  are silently skipped (the schedule API guarantees the column is
 *  non-null at insert time; the guard is defensive). */
export function buildPhaseReminderRows(
  events: PhaseEventRow[],
  now: Date,
): PhaseReminderRow[] {
  const out: PhaseReminderRow[] = [];
  for (const ev of events) {
    if (!ev.assigned_to) continue;
    const kind = classifyReminder(ev.start_time, now);
    if (!kind) continue;
    out.push(buildPhaseReminderRow(ev, kind));
  }
  return out;
}

/** The three event_type values the cron polls + the column whitelist.
 *  Exported so the cron route uses the same source of truth as the
 *  helper. */
export const PHASE_EVENT_TYPES = ['research', 'field_work', 'drawing_deliverables'] as const;

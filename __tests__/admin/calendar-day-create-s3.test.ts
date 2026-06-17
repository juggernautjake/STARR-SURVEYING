// __tests__/admin/calendar-day-create-s3.test.ts
//
// Slice S3 (calendar-day-create-and-alerts-2026-06-17) — custom
// reminder lead times. Per the user spec: "We need a whole alert
// system so that we can set reminders for events coming up.
// Please build out all of the settings and dialogue menu options
// for this."
//
// Coverage:
//   • dueReminderLeads pure helper (the cron's core decision).
//   • normalizeReminderLeads pure helper (dedupe + sort + drop
//     non-positive).
//   • buildSchedulePayload defaults reminder_minutes_before to
//     [60] when the form omits the field.
//   • Migration 309 adds the column + default.
//   • API SELECT_COLS picks up the new field and POST/PATCH
//     sanitize the array.
//   • AddEventForm surfaces the canonical lead-time picker.
//   • Cron route iterates dueReminderLeads + uses the widened
//     scan window.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  buildSchedulePayload,
  normalizeReminderLeads,
  type AddEventForm,
} from '../../lib/hub/calendar/schedule-payload';
import {
  dueReminderLeads,
  REMINDER_LEAD_CHOICES,
  REMINDER_SCAN_AHEAD_MIN,
} from '../../lib/notifications/event-reminder';

const repoRoot = path.join(__dirname, '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

describe('REMINDER_LEAD_CHOICES enum', () => {
  it('locks the four canonical picks: 5 min, 15 min, 1 hour, 1 day', () => {
    expect(REMINDER_LEAD_CHOICES).toEqual([5, 15, 60, 1440]);
  });
});

describe('REMINDER_SCAN_AHEAD_MIN', () => {
  it('covers the longest configured lead (1 day) plus the cron hour window', () => {
    expect(REMINDER_SCAN_AHEAD_MIN).toBe(1440 + 60);
  });
});

describe('normalizeReminderLeads (pure helper)', () => {
  it('returns [60] when the input is undefined (legacy 1-hour reminder)', () => {
    expect(normalizeReminderLeads(undefined)).toEqual([60]);
  });

  it('returns [] when the input is an empty array (explicit opt-out)', () => {
    expect(normalizeReminderLeads([])).toEqual([]);
  });

  it('drops non-positive + non-finite entries', () => {
    expect(normalizeReminderLeads([60, 0, -5, Number.NaN, 15])).toEqual([15, 60]);
  });

  it('dedupes + sorts ascending', () => {
    expect(normalizeReminderLeads([60, 5, 60, 15])).toEqual([5, 15, 60]);
  });

  it('rounds fractional minutes to the nearest integer', () => {
    expect(normalizeReminderLeads([4.6, 14.4])).toEqual([5, 14]);
  });
});

describe('dueReminderLeads (pure helper)', () => {
  const nowMs = Date.parse('2026-06-17T09:00:00Z');

  it('all-day events never fire reminders', () => {
    expect(dueReminderLeads({ start_time: '2026-06-17T10:00:00Z', all_day: true, reminder_minutes_before: [60] }, nowMs))
      .toEqual([]);
  });

  it('returns the 60-min lead when the event is exactly an hour from now', () => {
    expect(dueReminderLeads({ start_time: '2026-06-17T10:00:00Z', reminder_minutes_before: [60] }, nowMs))
      .toEqual([60]);
  });

  it('returns multiple leads when several "ready to fire" moments fall in this hour', () => {
    // Event at 9:05 with leads 5min + 15min → 5min ready at 9:00,
    // 15min ready at 8:50 (already past) → only 5 fires.
    expect(dueReminderLeads({ start_time: '2026-06-17T09:05:00Z', reminder_minutes_before: [5, 15] }, nowMs))
      .toEqual([5]);
  });

  it('returns the 1-day lead when the event is 24-25 hours out', () => {
    // Event 24h+30m out, lead 1440 (1 day) → ready at 9:30 today
    // → in [9:00, 10:00] → fires.
    const event = { start_time: '2026-06-18T09:30:00Z', reminder_minutes_before: [1440] };
    expect(dueReminderLeads(event, nowMs)).toEqual([1440]);
  });

  it('returns [] when no lead lands in the hour window', () => {
    expect(dueReminderLeads({ start_time: '2026-06-17T11:00:00Z', reminder_minutes_before: [60] }, nowMs))
      .toEqual([]);
  });

  it('defaults to [60] when reminder_minutes_before is null/undefined', () => {
    expect(dueReminderLeads({ start_time: '2026-06-17T10:00:00Z' }, nowMs)).toEqual([60]);
  });

  it('drops invalid leads (non-positive, non-finite)', () => {
    expect(dueReminderLeads({ start_time: '2026-06-17T10:00:00Z', reminder_minutes_before: [60, 0, -10, NaN] }, nowMs))
      .toEqual([60]);
  });
});

describe('buildSchedulePayload — reminder leads (S3)', () => {
  const BASE: AddEventForm = {
    title: 'Site visit',
    date: '2026-05-30',
    allDay: false,
    startTime: '09:00',
    endTime: '10:00',
  };

  it("defaults to [60] when the form omits reminderMinutesBefore", () => {
    const r = buildSchedulePayload(BASE);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.payload.reminder_minutes_before).toEqual([60]);
  });

  it("carries explicit empty list as 'no reminders'", () => {
    const r = buildSchedulePayload({ ...BASE, reminderMinutesBefore: [] });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.payload.reminder_minutes_before).toEqual([]);
  });

  it("normalizes (dedupe + sort) on the way through the builder", () => {
    const r = buildSchedulePayload({ ...BASE, reminderMinutesBefore: [60, 5, 60, 15] });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.payload.reminder_minutes_before).toEqual([5, 15, 60]);
  });
});

describe('Migration 309_schedule_reminders.sql', () => {
  const SQL = read('seeds/309_schedule_reminders.sql');

  it("adds reminder_minutes_before as a NOT NULL INTEGER[] DEFAULT '{60}'", () => {
    expect(SQL).toMatch(/ADD COLUMN IF NOT EXISTS reminder_minutes_before INTEGER\[\] NOT NULL DEFAULT '\{60\}'/);
  });
});

describe('API /api/admin/schedule — reminder_minutes_before wiring (S3)', () => {
  const SRC = read('app/api/admin/schedule/route.ts');

  it("SELECT_COLS includes 'reminder_minutes_before'", () => {
    expect(SRC).toMatch(/SELECT_COLS[\s\S]*?reminder_minutes_before/);
  });

  it('POST sanitizes the array (positive ints only, dedupe, sort, default [60])', () => {
    expect(SRC).toMatch(/const reminderMinutesBefore = Array\.isArray\(body\.reminder_minutes_before\)/);
    expect(SRC).toMatch(/typeof n === 'number' && Number\.isFinite\(n\) && n > 0/);
    expect(SRC).toMatch(/: \[60\];/);
  });

  it('POST includes reminder_minutes_before in the insert payload', () => {
    expect(SRC).toMatch(/reminder_minutes_before: reminderMinutesBefore/);
  });

  it('PATCH adds reminder_minutes_before to the patch-fields list + re-sanitizes', () => {
    expect(SRC).toMatch(/'visibility', 'viewer_emails', 'reminder_minutes_before'/);
    expect(SRC).toMatch(/if \(Array\.isArray\(patch\.reminder_minutes_before\)\)/);
  });
});

describe('AddEventForm — surfaces the reminder picker (S3)', () => {
  const SRC = read('lib/hub/calendar/AddEventForm.tsx');

  it('imports REMINDER_LEAD_CHOICES from the cron-shared module', () => {
    expect(SRC).toMatch(/REMINDER_LEAD_CHOICES/);
    expect(SRC).toMatch(/from '@\/lib\/notifications\/event-reminder'/);
  });

  it('seeds the form with reminderMinutesBefore: [60]', () => {
    expect(SRC).toMatch(/reminderMinutesBefore:\s*\[60\]/);
  });

  it('renders one chip per canonical lead choice inside the picker', () => {
    expect(SRC).toMatch(/data-testid="reminder-lead-picker"/);
    expect(SRC).toMatch(/REMINDER_LEAD_CHOICES\.map\(\(m\) =>/);
  });

  it('toggling a chip adds/removes from the picker state', () => {
    expect(SRC).toMatch(/if \(cur\.has\(m\)\) cur\.delete\(m\); else cur\.add\(m\);/);
  });

  it('shows a "No reminders for this event" hint when the user clears every chip', () => {
    expect(SRC).toMatch(/\(form\.reminderMinutesBefore \?\? \[\]\)\.length === 0/);
    expect(SRC).toMatch(/No reminders for this event/);
  });
});

describe('Cron schedule-event-reminders — per-lead fan-out (S3)', () => {
  const SRC = read('app/api/cron/schedule-event-reminders/route.ts');

  it('imports dueReminderLeads + REMINDER_SCAN_AHEAD_MIN', () => {
    expect(SRC).toMatch(/dueReminderLeads/);
    expect(SRC).toMatch(/REMINDER_SCAN_AHEAD_MIN/);
  });

  it('uses the widened scan window for the DB query', () => {
    expect(SRC).toMatch(/REMINDER_SCAN_AHEAD_MIN \* 60_000/);
  });

  it('fetches reminder_minutes_before alongside the other fields', () => {
    expect(SRC).toMatch(/\.select\('[^']*reminder_minutes_before[^']*'\)/);
  });

  it('iterates dueReminderLeads and notifies once per due lead', () => {
    expect(SRC).toMatch(/const dueLeads = dueReminderLeads\(row, nowMs, REMINDER_LOOKAHEAD_MIN\)/);
    expect(SRC).toMatch(/for \(const _lead of dueLeads\)/);
  });
});

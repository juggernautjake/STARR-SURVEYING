// __tests__/calendar/c5-phase-reminders.test.ts
//
// job-calendar Slice C5 — day-before + day-of phase reminder cron.
// Locks the pure helper + the cron-route wiring + the vercel.json
// schedule registration.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  classifyReminder,
  buildPhaseReminderRow,
  buildPhaseReminderRows,
  PHASE_EVENT_TYPES,
  type PhaseEventRow,
} from '@/lib/calendar/phase-reminder';

const repoRoot = path.join(__dirname, '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

function fakeRow(overrides: Partial<PhaseEventRow> = {}): PhaseEventRow {
  return {
    id: 'EV-1',
    title: 'Field Work — Johnson Boundary',
    event_type: 'field_work',
    start_time: '2026-06-17T13:00:00Z',
    end_time: '2026-06-17T22:00:00Z',
    job_id: 'JOB-1',
    assigned_to: 'hank@example.com',
    location: '123 FM 436',
    notes: null,
    ...overrides,
  };
}

// 2026-06-16 13:00 UTC ≈ 2026-06-16 08:00 CDT
const NOW = new Date('2026-06-16T13:00:00Z');

describe('classifyReminder', () => {
  it('returns day-of for an event starting today (Central time)', () => {
    // 2026-06-16 in Central = events with start_time on 2026-06-16 local
    // 2026-06-16T18:00:00Z = ~1pm Central same day
    expect(classifyReminder('2026-06-16T18:00:00Z', NOW)).toBe('day-of');
  });

  it('returns day-before for an event starting tomorrow (Central time)', () => {
    // 2026-06-17T13:00:00Z = ~8am Central next day
    expect(classifyReminder('2026-06-17T13:00:00Z', NOW)).toBe('day-before');
  });

  it('returns null for an event >1 day out', () => {
    expect(classifyReminder('2026-06-20T13:00:00Z', NOW)).toBeNull();
  });

  it('returns null for an event that already started yesterday', () => {
    expect(classifyReminder('2026-06-15T13:00:00Z', NOW)).toBeNull();
  });
});

describe('buildPhaseReminderRow', () => {
  it('day-of carries 📍 + escalation=high + link to /admin/jobs/<id>', () => {
    const r = buildPhaseReminderRow(fakeRow(), 'day-of');
    expect(r.title.startsWith('📍 Today:')).toBe(true);
    expect(r.escalation_level).toBe('high');
    expect(r.link).toBe('/admin/jobs/JOB-1');
    expect(r.type).toBe('phase.reminder');
    expect(r.source_type).toBe('schedule_events');
    expect(r.source_id).toBe('EV-1');
  });

  it('day-before carries 🔔 + escalation=normal', () => {
    const r = buildPhaseReminderRow(fakeRow(), 'day-before');
    expect(r.title.startsWith('🔔 Tomorrow:')).toBe(true);
    expect(r.escalation_level).toBe('normal');
  });

  it('preserves the phase label + job name from the event title', () => {
    const r = buildPhaseReminderRow(fakeRow(), 'day-of');
    expect(r.title).toContain('Field Work');
    expect(r.title).toContain('Johnson Boundary');
  });

  it('falls back to /admin/calendar when no job_id is set', () => {
    expect(buildPhaseReminderRow(fakeRow({ job_id: null }), 'day-of').link).toBe('/admin/calendar');
  });

  it('includes location and notes in the body when present', () => {
    const r = buildPhaseReminderRow(
      fakeRow({ location: '123 FM 436', notes: 'Bring the total station.' }),
      'day-of',
    );
    expect(r.body).toContain('123 FM 436');
    expect(r.body).toContain('Bring the total station.');
  });

  it('omits empty location / notes', () => {
    const r = buildPhaseReminderRow(
      fakeRow({ location: null, notes: null }),
      'day-of',
    );
    expect(r.body).not.toContain('📍');
  });

  it('handles a legacy title without the em-dash separator', () => {
    const r = buildPhaseReminderRow(
      fakeRow({ title: 'Ad-hoc field check' }),
      'day-of',
    );
    expect(r.title).toContain('Ad-hoc field check');
  });
});

describe('buildPhaseReminderRows — fan-out', () => {
  it('emits one row per qualifying event', () => {
    const rows = buildPhaseReminderRows(
      [
        fakeRow({ id: 'EV-1', start_time: '2026-06-16T18:00:00Z' }), // day-of
        fakeRow({ id: 'EV-2', start_time: '2026-06-17T13:00:00Z' }), // day-before
        fakeRow({ id: 'EV-3', start_time: '2026-06-20T13:00:00Z' }), // skip
      ],
      NOW,
    );
    expect(rows.length).toBe(2);
    expect(rows.map((r) => r.source_id)).toEqual(['EV-1', 'EV-2']);
  });

  it('drops rows with no assigned_to', () => {
    const rows = buildPhaseReminderRows(
      [fakeRow({ assigned_to: '' })],
      NOW,
    );
    expect(rows).toEqual([]);
  });

  it('PHASE_EVENT_TYPES matches the three phase event_type values', () => {
    expect(PHASE_EVENT_TYPES).toEqual(['research', 'field_work', 'drawing_deliverables']);
  });
});

describe('cron route + vercel.json wiring', () => {
  const ROUTE = read('app/api/cron/phase-reminders/route.ts');
  const VERCEL = read('vercel.json');

  it('cron route admin-gates via CRON_SECRET bearer', () => {
    expect(ROUTE).toMatch(/expected = process\.env\.CRON_SECRET/);
    expect(ROUTE).toMatch(/authHeader !== `Bearer \$\{expected\}`/);
  });

  it('cron route pulls only the three phase event types from a ±2d window', () => {
    expect(ROUTE).toMatch(/\.in\('event_type', PHASE_EVENT_TYPES/);
    expect(ROUTE).toMatch(/\.gte\('start_time', fromIso\)/);
    expect(ROUTE).toMatch(/\.lte\('start_time', toIso\)/);
  });

  it('cron route hands off to the pure helper + calls notify per row', () => {
    expect(ROUTE).toMatch(/buildPhaseReminderRows\(\(data \?\? \[\]\) as PhaseEventRow\[\], now\)/);
    expect(ROUTE).toMatch(/await notify\(r\);/);
  });

  it("cron route reports the candidate count + sent count so the dashboard can lock health", () => {
    expect(ROUTE).toMatch(/candidate_events:/);
    expect(ROUTE).toMatch(/reminders_sent:/);
  });

  it('vercel.json registers /api/cron/phase-reminders at 0 13 * * *', () => {
    expect(VERCEL).toMatch(/"path": "\/api\/cron\/phase-reminders"[\s\S]*?"schedule": "0 13 \* \* \*"/);
  });
});

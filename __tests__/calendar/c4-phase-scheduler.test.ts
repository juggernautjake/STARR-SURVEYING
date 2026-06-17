// __tests__/calendar/c4-phase-scheduler.test.ts
//
// job-calendar Slice C4 — per-job 3-phase scheduler. Locks the pure
// mapper invariants + the panel + tab wiring on the job detail page.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  PHASES,
  PHASE_TITLE_PREFIX,
  buildPhaseEventRow,
  buildPhaseEventRowsForDays,
  validatePhaseDraft,
} from '@/lib/calendar/phase-event';

const repoRoot = path.join(__dirname, '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

describe('PHASES + PHASE_TITLE_PREFIX', () => {
  it('declares the three required phases', () => {
    expect(PHASES).toEqual(['research', 'field_work', 'drawing_deliverables']);
  });

  it('every phase has a human-readable title prefix', () => {
    for (const p of PHASES) {
      expect(PHASE_TITLE_PREFIX[p].length).toBeGreaterThan(0);
    }
  });
});

describe('buildPhaseEventRow — pure mapper', () => {
  const base = {
    jobId: 'JOB-1',
    jobName: 'Johnson Boundary',
    assignedTo: 'hank@example.com',
  };

  it('produces a Title — JobName composite title', () => {
    const row = buildPhaseEventRow({ ...base, phase: 'field_work', dayIso: '2026-06-20' });
    expect(row.title).toBe('Field Work — Johnson Boundary');
  });

  it('carries the phase as event_type so the calendar reads it', () => {
    expect(buildPhaseEventRow({ ...base, phase: 'research', dayIso: '2026-06-20' }).event_type).toBe('research');
    expect(buildPhaseEventRow({ ...base, phase: 'drawing_deliverables', dayIso: '2026-06-20' }).event_type).toBe('drawing_deliverables');
  });

  it('defaults all_day to true so the event sits on the day square at full width', () => {
    const row = buildPhaseEventRow({ ...base, phase: 'research', dayIso: '2026-06-20' });
    expect(row.all_day).toBe(true);
  });

  it('respects an explicit allDay override', () => {
    const row = buildPhaseEventRow({ ...base, phase: 'research', dayIso: '2026-06-20', allDay: false });
    expect(row.all_day).toBe(false);
  });

  it('falls back to 8am→5pm Central when no explicit start/end given', () => {
    const row = buildPhaseEventRow({ ...base, phase: 'research', dayIso: '2026-06-20' });
    // We stored as Z; just verify the start is BEFORE the end and
    // both anchor to the same calendar day.
    expect(new Date(row.start_time).getTime()).toBeLessThan(new Date(row.end_time).getTime());
    expect(row.start_time.startsWith('2026-06-20')).toBe(true);
    expect(row.end_time.startsWith('2026-06-20')).toBe(true);
  });

  it('respects explicit startTimeIso / endTimeIso overrides', () => {
    const row = buildPhaseEventRow({
      ...base,
      phase: 'field_work',
      dayIso: 'ignored',
      startTimeIso: '2026-06-20T14:00:00Z',
      endTimeIso: '2026-06-22T22:00:00Z',
    });
    expect(row.start_time).toBe('2026-06-20T14:00:00Z');
    expect(row.end_time).toBe('2026-06-22T22:00:00Z');
  });

  it('carries job_id + assigned_to + location/notes', () => {
    const row = buildPhaseEventRow({
      ...base,
      phase: 'field_work',
      dayIso: '2026-06-20',
      location: '123 FM 436',
      notes: 'Bring the total station.',
    });
    expect(row.job_id).toBe('JOB-1');
    expect(row.assigned_to).toBe('hank@example.com');
    expect(row.location).toBe('123 FM 436');
    expect(row.notes).toBe('Bring the total station.');
  });

  it('null-coalesces location + notes when absent', () => {
    const row = buildPhaseEventRow({ ...base, phase: 'research', dayIso: '2026-06-20' });
    expect(row.location).toBeNull();
    expect(row.notes).toBeNull();
  });
});

describe('buildPhaseEventRowsForDays — multi-day fan-out', () => {
  const base = {
    jobId: 'JOB-1',
    jobName: 'Johnson Boundary',
    assignedTo: 'hank@example.com',
    phase: 'field_work' as const,
  };

  it('produces one row per day', () => {
    const rows = buildPhaseEventRowsForDays(base, ['2026-06-20', '2026-06-21', '2026-06-22']);
    expect(rows.length).toBe(3);
    expect(rows[0].start_time.startsWith('2026-06-20')).toBe(true);
    expect(rows[1].start_time.startsWith('2026-06-21')).toBe(true);
    expect(rows[2].start_time.startsWith('2026-06-22')).toBe(true);
  });

  it('every row carries the same phase + job + assignee', () => {
    const rows = buildPhaseEventRowsForDays(base, ['2026-06-20', '2026-06-21']);
    for (const r of rows) {
      expect(r.event_type).toBe('field_work');
      expect(r.job_id).toBe('JOB-1');
      expect(r.assigned_to).toBe('hank@example.com');
    }
  });

  it('empty list returns empty array', () => {
    expect(buildPhaseEventRowsForDays(base, [])).toEqual([]);
  });
});

describe('validatePhaseDraft — input guards', () => {
  const good = {
    jobId: 'JOB-1',
    jobName: 'Johnson Boundary',
    phase: 'field_work' as const,
    assignedTo: 'hank@example.com',
    dayIsoList: ['2026-06-20'],
  };

  it('accepts a complete draft', () => {
    expect(validatePhaseDraft(good)).toBeNull();
  });

  it('rejects a missing day list', () => {
    expect(validatePhaseDraft({ ...good, dayIsoList: [] })).toBe('Pick at least one day');
  });

  it('rejects a malformed day string', () => {
    expect(validatePhaseDraft({ ...good, dayIsoList: ['2026/06/20'] })).toMatch(/Invalid day/);
  });

  it('rejects an unknown phase', () => {
    expect(
      validatePhaseDraft({ ...good, phase: 'unknown-phase' as never }),
    ).toMatch(/Unknown phase/);
  });

  it('rejects an empty assignee', () => {
    expect(validatePhaseDraft({ ...good, assignedTo: '  ' })).toMatch(/Assign at least one person/);
  });

  it('rejects a missing job name', () => {
    expect(validatePhaseDraft({ ...good, jobName: '' })).toMatch(/Missing job name/);
  });
});

describe('JobPhaseScheduler.tsx — panel wiring', () => {
  const SRC = read('app/admin/jobs/[id]/JobPhaseScheduler.tsx');

  it('imports the pure helpers', () => {
    expect(SRC).toMatch(/from '@\/lib\/calendar\/phase-event'/);
    expect(SRC).toMatch(/buildPhaseEventRowsForDays/);
    expect(SRC).toMatch(/validatePhaseDraft/);
  });

  it('renders one section per phase via PHASES.map', () => {
    expect(SRC).toMatch(/\{PHASES\.map\(\(phase\)/);
  });

  it('each section carries data-phase for color + e2e targeting', () => {
    expect(SRC).toMatch(/data-phase=\{phase\}/);
  });

  it('inputs for days + assignee per phase get stable testIDs', () => {
    expect(SRC).toMatch(/data-testid=\{`phase-days-\$\{phase\}`\}/);
    expect(SRC).toMatch(/data-testid=\{`phase-assignee-\$\{phase\}`\}/);
  });

  it('schedule button per phase wires through data-action', () => {
    expect(SRC).toMatch(/data-action=\{`schedule-\$\{phase\}`\}/);
  });

  it('POSTs every row sequentially via /api/admin/schedule and skips conflicts', () => {
    expect(SRC).toMatch(/fetch\('\/api\/admin\/schedule'/);
    expect(SRC).toMatch(/body\.error === 'schedule_conflict'/);
  });

  it('links to /admin/calendar from the intro', () => {
    expect(SRC).toMatch(/href="\/admin\/calendar"/);
  });

  it('explicit loading / empty / scheduled states (no blank screens)', () => {
    expect(SRC).toMatch(/data-state="loading"/);
    expect(SRC).toMatch(/data-state="empty"/);
    expect(SRC).toMatch(/data-state="error"/);
  });
});

describe('job detail page — Schedule tab wired in', () => {
  const SRC = read('app/admin/jobs/[id]/page.tsx');

  it('imports JobPhaseScheduler', () => {
    expect(SRC).toMatch(/import JobPhaseScheduler from '\.\/JobPhaseScheduler';/);
  });

  it("declares a 'schedule' tab option between Overview and Research", () => {
    expect(SRC).toMatch(
      /key: 'overview'[\s\S]*?key: 'schedule'[\s\S]*?key: 'research'/,
    );
  });

  it('renders the panel when activeTab === schedule', () => {
    expect(SRC).toMatch(/activeTab === 'schedule' && \(/);
    expect(SRC).toMatch(/<JobPhaseScheduler[\s\S]*?jobId=\{jobId\}[\s\S]*?jobName=\{job\.name\}/);
  });
});

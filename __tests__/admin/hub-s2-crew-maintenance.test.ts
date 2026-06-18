// __tests__/admin/hub-s2-crew-maintenance.test.ts
//
// Slice S2 of widget-size-responsive-content-2026-06-18 — adds
// per-bucket growth to the two non-legacy work/team widgets:
//   - crew-calendar: day headers + today highlight at medium+,
//     legend strip at large+, summary line at xlarge.
//   - maintenance-due: overdue/upcoming summary chip strip at
//     medium+, status pill on rows at large+, "Open schedule"
//     CTA at xlarge.
// The four legacy field-* widgets (team-status, vehicles-status,
// equipment-out, low-consumables) intentionally defer per the
// plan: their consolidated replacement `field-pulse` already
// follows the W5 exemplary pattern.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  cellColor,
  countOnShiftToday,
  dayCountForBucket,
  legendLabel,
} from '@/lib/hub/widgets/crew-calendar';
import {
  countOverdueVsUpcoming,
  filterByDue,
} from '@/lib/hub/widgets/maintenance-due';

const repoRoot = path.join(__dirname, '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

describe('crew-calendar pure helpers (S2)', () => {
  it('dayCountForBucket scales 3 → 5 → 7 → 7 → 14', () => {
    expect(dayCountForBucket('tiny')).toBe(3);
    expect(dayCountForBucket('small')).toBe(5);
    expect(dayCountForBucket('medium')).toBe(7);
    expect(dayCountForBucket('large')).toBe(7);
    expect(dayCountForBucket('xlarge')).toBe(14);
  });

  it('countOnShiftToday counts users whose today state is on-shift-ish', () => {
    const users = [
      { user_email: 'a@x', cells: { '2026-06-18': { state: 'confirmed' } } },
      { user_email: 'b@x', cells: { '2026-06-18': { state: 'open' } } },
      { user_email: 'c@x', cells: { '2026-06-18': { state: 'time_off' } } },
      { user_email: 'd@x', cells: { '2026-06-18': { state: 'proposed' } } },
      { user_email: 'e@x', cells: {} },
    ];
    expect(countOnShiftToday(users, '2026-06-18')).toBe(2);
  });

  it('legendLabel maps each state to a human label', () => {
    expect(legendLabel('confirmed')).toBe('Confirmed');
    expect(legendLabel('proposed')).toBe('Proposed');
    expect(legendLabel('unconfirmed_overdue')).toBe('Overdue');
    expect(legendLabel('time_off')).toBe('Time off');
    expect(legendLabel('open')).toBe('Open');
  });

  it('cellColor still maps the five canonical states', () => {
    expect(cellColor('confirmed')).toBe('var(--theme-success)');
    expect(cellColor('proposed')).toBe('var(--theme-accent)');
    expect(cellColor('unconfirmed_overdue')).toBe('var(--theme-danger)');
    expect(cellColor('time_off')).toBe('var(--theme-warning)');
    expect(cellColor('open')).toBe('var(--theme-fg-muted)');
  });
});

describe('crew-calendar rendering contract (S2)', () => {
  const SRC = read('lib/hub/widgets/crew-calendar/index.tsx');

  it('per-bucket dynamic testid', () => {
    expect(SRC).toMatch(/data-testid=\{`crew-calendar-\$\{bucket\}`\}/);
  });

  it('day headers render at medium+', () => {
    expect(SRC).toMatch(/const showHeaders = bucket === 'medium' \|\| bucket === 'large' \|\| bucket === 'xlarge'/);
    expect(SRC).toMatch(/data-testid="crew-calendar-day-headers"/);
  });

  it("today's column gets an accent outline ring", () => {
    expect(SRC).toMatch(/outline: '1\.5px solid var\(--theme-accent\)'/);
  });

  it('state legend renders at large+', () => {
    expect(SRC).toMatch(/const showLegend = bucket === 'large' \|\| bucket === 'xlarge'/);
    expect(SRC).toMatch(/data-testid="crew-calendar-legend"/);
  });

  it('"on shift today" summary is xlarge-only', () => {
    expect(SRC).toMatch(/const showSummary = bucket === 'xlarge'/);
    expect(SRC).toMatch(/data-testid="crew-calendar-summary"/);
  });
});

describe('maintenance-due pure helpers (S2)', () => {
  it('filterByDue still respects window + overdue rules', () => {
    const now = Date.parse('2026-06-18T12:00:00Z');
    const items = [
      { id: '1', asset_name: 'A', task_type: 'X', due_at: '2026-06-10T00:00:00Z' }, // overdue
      { id: '2', asset_name: 'B', task_type: 'X', due_at: '2026-06-20T00:00:00Z' }, // 2 days out
      { id: '3', asset_name: 'C', task_type: 'X', due_at: '2026-07-15T00:00:00Z' }, // 27 days out
      { id: '4', asset_name: 'D', task_type: 'X', due_at: '2026-09-01T00:00:00Z' }, // far
    ];
    expect(filterByDue(items, 'week', now).map((x) => x.id)).toEqual(['1', '2']);
    expect(filterByDue(items, 'month', now).map((x) => x.id)).toEqual(['1', '2', '3']);
    expect(filterByDue(items, 'overdue-only', now).map((x) => x.id)).toEqual(['1']);
  });

  it('countOverdueVsUpcoming returns overdue / thisWeek / thisMonth counts', () => {
    const now = Date.parse('2026-06-18T12:00:00Z');
    const items = [
      { id: '1', asset_name: 'A', task_type: 'X', due_at: '2026-06-10T00:00:00Z' }, // overdue
      { id: '2', asset_name: 'B', task_type: 'X', due_at: '2026-06-20T00:00:00Z' }, // wk + mo
      { id: '3', asset_name: 'C', task_type: 'X', due_at: '2026-07-10T00:00:00Z' }, // mo only
      { id: '4', asset_name: 'D', task_type: 'X', due_at: null }, // dateless
    ];
    expect(countOverdueVsUpcoming(items, now)).toEqual({ overdue: 1, thisWeek: 1, thisMonth: 2 });
  });
});

describe('maintenance-due rendering contract (S2)', () => {
  const SRC = read('lib/hub/widgets/maintenance-due/index.tsx');

  it('tiny + per-bucket dynamic testids', () => {
    expect(SRC).toMatch(/data-testid="maintenance-due-tiny"/);
    expect(SRC).toMatch(/data-testid=\{`maintenance-due-\$\{bucket\}`\}/);
  });

  it('summary chip strip renders at medium+', () => {
    expect(SRC).toMatch(/const showSummary = bucket === 'medium' \|\| bucket === 'large' \|\| bucket === 'xlarge'/);
    expect(SRC).toMatch(/data-testid="maintenance-due-summary"/);
  });

  it('per-row status pill renders at large+', () => {
    expect(SRC).toMatch(/const showStatusPill = bucket === 'large' \|\| bucket === 'xlarge'/);
    expect(SRC).toMatch(/data-testid="maintenance-due-status-pill"/);
  });

  it('"Open maintenance schedule" CTA renders at xlarge', () => {
    expect(SRC).toMatch(/const showScheduleCta = bucket === 'xlarge'/);
    expect(SRC).toMatch(/data-testid="maintenance-due-cta"/);
  });
});

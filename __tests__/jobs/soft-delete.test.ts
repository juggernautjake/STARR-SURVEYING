// __tests__/jobs/soft-delete.test.ts
//
// job-soft-delete plan Slice 1 — locks the pure 30-day recovery-window
// helpers used by the trash view + the purge cron.

import { describe, it, expect } from 'vitest';
import {
  RECOVERY_WINDOW_DAYS,
  daysUntilPurge,
  daysSinceDeleted,
  isRecoverable,
  purgeCutoffIso,
} from '@/lib/jobs/soft-delete';

const NOW = Date.parse('2026-05-30T12:00:00Z');

describe('daysUntilPurge', () => {
  it('is the full window on the day of deletion', () => {
    expect(daysUntilPurge('2026-05-30T12:00:00Z', NOW)).toBe(30);
  });
  it('counts down as time passes', () => {
    expect(daysUntilPurge('2026-05-20T12:00:00Z', NOW)).toBe(20);
    expect(daysUntilPurge('2026-05-01T12:00:00Z', NOW)).toBe(1);
  });
  it('clamps at 0 once past the window (never negative)', () => {
    expect(daysUntilPurge('2026-04-01T12:00:00Z', NOW)).toBe(0);
  });
  it('returns null on missing / unparseable input', () => {
    expect(daysUntilPurge(null, NOW)).toBeNull();
    expect(daysUntilPurge(undefined, NOW)).toBeNull();
    expect(daysUntilPurge('not-a-date', NOW)).toBeNull();
  });
});

describe('daysSinceDeleted', () => {
  it('is 0 on the day of deletion', () => {
    expect(daysSinceDeleted('2026-05-30T00:00:00Z', NOW)).toBe(0);
  });
  it('counts up', () => {
    expect(daysSinceDeleted('2026-05-20T12:00:00Z', NOW)).toBe(10);
  });
  it('null on bad input', () => {
    expect(daysSinceDeleted('', NOW)).toBeNull();
  });
});

describe('isRecoverable', () => {
  it('true inside the window', () => {
    expect(isRecoverable('2026-05-29T12:00:00Z', NOW)).toBe(true);
  });
  it('false at/after the window edge', () => {
    expect(isRecoverable('2026-04-30T12:00:00Z', NOW)).toBe(false);
    expect(isRecoverable('2026-04-01T12:00:00Z', NOW)).toBe(false);
  });
  it('false on bad input', () => {
    expect(isRecoverable(null, NOW)).toBe(false);
  });
});

describe('purgeCutoffIso', () => {
  it('is exactly the window before now', () => {
    const cutoff = purgeCutoffIso(NOW);
    // 30 days before 2026-05-30 = 2026-04-30
    expect(cutoff).toBe(new Date(Date.parse('2026-04-30T12:00:00Z')).toISOString());
  });
  it('respects a custom window', () => {
    const cutoff = purgeCutoffIso(NOW, 7);
    expect(cutoff).toBe(new Date(Date.parse('2026-05-23T12:00:00Z')).toISOString());
  });
});

describe('RECOVERY_WINDOW_DAYS', () => {
  it('is 30', () => {
    expect(RECOVERY_WINDOW_DAYS).toBe(30);
  });
});

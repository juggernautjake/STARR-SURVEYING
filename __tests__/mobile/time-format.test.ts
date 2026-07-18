import { describe, it, expect } from 'vitest';
import { formatDuration, durationMinutesBetween, localISODate } from '../../mobile/lib/timeFormat';

// mobile/lib/timeFormat.ts — duration/date formatters for the time-tracking (Work Mode "Time" tab). These
// three are fully deterministic (no Date.now / locale), so they're pinned here; the Date.now- and
// timezone-dependent formatters in the same file are left to on-device verification. A wrong duration or
// a wrong clock-out minute count is a payroll error, so the tier boundaries matter.

describe('formatDuration — the tiered field-glance format', () => {
  const min = (n: number) => n * 60_000;
  const hr = (n: number) => n * 3_600_000;

  it('guards non-finite and negative input to "0m"', () => {
    expect(formatDuration(NaN)).toBe('0m');
    expect(formatDuration(-1)).toBe('0m');
    expect(formatDuration(Infinity)).toBe('0m');
  });

  it('under a minute reads "<1m"', () => {
    expect(formatDuration(0)).toBe('<1m');
    expect(formatDuration(59_000)).toBe('<1m');
  });

  it('under an hour reads whole minutes (floored)', () => {
    expect(formatDuration(min(1))).toBe('1m');
    expect(formatDuration(min(1) + 59_000)).toBe('1m'); // seconds floored off
    expect(formatDuration(min(59))).toBe('59m');
  });

  it('one to ten hours reads "{h}h {m}m"', () => {
    expect(formatDuration(hr(1))).toBe('1h 0m');
    expect(formatDuration(hr(1) + min(30))).toBe('1h 30m');
    expect(formatDuration(hr(9) + min(45))).toBe('9h 45m');
  });

  it('ten hours or more drops the minutes ("go home")', () => {
    expect(formatDuration(hr(10))).toBe('10h');
    expect(formatDuration(hr(10) + min(30))).toBe('10h'); // minutes intentionally dropped
    expect(formatDuration(hr(23) + min(59))).toBe('23h');
  });
});

describe('durationMinutesBetween — the clock-out stamp', () => {
  it('returns whole minutes between two ISO timestamps', () => {
    expect(durationMinutesBetween('2026-07-18T09:00:00Z', '2026-07-18T10:30:00Z')).toBe(90);
    expect(durationMinutesBetween('2026-07-18T09:00:00Z', '2026-07-18T09:00:00Z')).toBe(0);
  });

  it('rounds to the nearest minute', () => {
    // 90 seconds → 1.5 min → 2 (round half up)
    expect(durationMinutesBetween('2026-07-18T09:00:00Z', '2026-07-18T09:01:30Z')).toBe(2);
  });

  it('returns null for missing, malformed, or reversed ranges (end before start)', () => {
    expect(durationMinutesBetween(null, '2026-07-18T10:00:00Z')).toBeNull();
    expect(durationMinutesBetween('2026-07-18T10:00:00Z', null)).toBeNull();
    expect(durationMinutesBetween('not-a-date', '2026-07-18T10:00:00Z')).toBeNull();
    expect(durationMinutesBetween('2026-07-18T10:00:00Z', '2026-07-18T09:00:00Z')).toBeNull();
  });
});

describe('localISODate — YYYY-MM-DD in local time', () => {
  it('formats and zero-pads a local Date (TZ-safe: built and read with local components)', () => {
    expect(localISODate(new Date(2026, 6, 18))).toBe('2026-07-18'); // month is 0-based: 6 = July
    expect(localISODate(new Date(2026, 0, 5))).toBe('2026-01-05');  // pads single-digit month + day
    expect(localISODate(new Date(1999, 11, 31))).toBe('1999-12-31');
  });
});

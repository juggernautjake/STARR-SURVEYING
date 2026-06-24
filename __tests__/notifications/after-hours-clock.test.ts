// __tests__/notifications/after-hours-clock.test.ts
//
// Locks the H7 still-clocked-in reminder builder: one per user, earliest
// start wins, elapsed formatting, and the skip-without-email guard.

import { describe, it, expect } from 'vitest';
import {
  buildAfterHoursClockReminders,
  formatElapsed,
} from '@/lib/notifications/after-hours-clock';

const NOW = Date.parse('2026-06-24T23:30:00Z');

describe('formatElapsed', () => {
  it('formats hours+minutes, hours only, minutes only, and empty', () => {
    expect(formatElapsed(495)).toBe('8h 15m');
    expect(formatElapsed(120)).toBe('2h');
    expect(formatElapsed(45)).toBe('45m');
    expect(formatElapsed(0)).toBe('');
    expect(formatElapsed(-5)).toBe('');
  });
});

describe('buildAfterHoursClockReminders', () => {
  it('builds one reminder per still-clocked-in user with elapsed time', () => {
    const out = buildAfterHoursClockReminders(
      [{ user_email: 'a@x.com', start_time: '2026-06-24T15:30:00Z' }],
      NOW,
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      user_email: 'a@x.com',
      type: 'reminder',
      icon: '⏰',
      link: '/admin/me?tab=hours',
      source_type: 'clock_reminder',
    });
    expect(out[0].title).toContain('Still clocked in');
    expect(out[0].body).toContain('8h'); // 15:30 → 23:30 = 8h
    expect(out[0].body).toContain('clock out');
  });

  it('collapses multiple open entries per user, earliest start wins', () => {
    const out = buildAfterHoursClockReminders(
      [
        { user_email: 'a@x.com', start_time: '2026-06-24T20:00:00Z' },
        { user_email: 'a@x.com', start_time: '2026-06-24T14:00:00Z' },
        { user_email: 'b@x.com', start_time: '2026-06-24T22:00:00Z' },
      ],
      NOW,
    );
    expect(out).toHaveLength(2);
    const a = out.find((n) => n.user_email === 'a@x.com')!;
    expect(a.body).toContain('9h'); // earliest 14:00 → 23:30 = 9.5h → "9h 30m"
  });

  it('skips rows without a user_email', () => {
    const out = buildAfterHoursClockReminders(
      [
        { user_email: null, start_time: '2026-06-24T14:00:00Z' },
        { user_email: '   ', start_time: '2026-06-24T14:00:00Z' },
      ],
      NOW,
    );
    expect(out).toEqual([]);
  });
});

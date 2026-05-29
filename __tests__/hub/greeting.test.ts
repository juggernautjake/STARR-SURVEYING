// __tests__/hub/greeting.test.ts
//
// Coverage for the pure helpers used by HubGreeting: partOfDay,
// firstName, formatElapsed. The component itself is tested
// indirectly via render in the hub integration suite (lands once
// the persona-default seeder is in place in Slice 93).

import { describe, it, expect } from 'vitest';
import {
  partOfDay,
  firstName,
  formatElapsed,
} from '@/app/admin/me/components/HubGreeting';

describe('partOfDay', () => {
  it('returns "Good night" before 5 AM', () => {
    expect(partOfDay(new Date(2026, 4, 28, 3, 0))).toBe('Good night');
    expect(partOfDay(new Date(2026, 4, 28, 4, 59))).toBe('Good night');
  });

  it('returns "Good morning" 5 AM – 11:59 AM', () => {
    expect(partOfDay(new Date(2026, 4, 28, 5, 0))).toBe('Good morning');
    expect(partOfDay(new Date(2026, 4, 28, 11, 59))).toBe('Good morning');
  });

  it('returns "Good afternoon" 12 PM – 5:59 PM', () => {
    expect(partOfDay(new Date(2026, 4, 28, 12, 0))).toBe('Good afternoon');
    expect(partOfDay(new Date(2026, 4, 28, 17, 59))).toBe('Good afternoon');
  });

  it('returns "Good evening" 6 PM onwards', () => {
    expect(partOfDay(new Date(2026, 4, 28, 18, 0))).toBe('Good evening');
    expect(partOfDay(new Date(2026, 4, 28, 23, 59))).toBe('Good evening');
  });

  it('honours a custom prefix override regardless of hour', () => {
    expect(partOfDay(new Date(2026, 4, 28, 3, 0), 'Howdy')).toBe('Howdy');
    expect(partOfDay(new Date(2026, 4, 28, 14, 0), 'Yo')).toBe('Yo');
  });
});

describe('firstName', () => {
  it('returns the first whitespace-delimited token', () => {
    expect(firstName('Jacob Maddux')).toBe('Jacob');
    expect(firstName('Mary Jane Watson')).toBe('Mary');
  });

  it('trims surrounding whitespace', () => {
    expect(firstName('  Jacob ')).toBe('Jacob');
  });

  it('falls back to "there" when name is null/undefined/empty', () => {
    expect(firstName(null)).toBe('there');
    expect(firstName(undefined)).toBe('there');
    expect(firstName('')).toBe('there');
    expect(firstName('   ')).toBe('there');
  });

  it('handles single names', () => {
    expect(firstName('Cher')).toBe('Cher');
  });
});

describe('formatElapsed', () => {
  it('returns "X min" for under one hour', () => {
    const start = new Date('2026-05-28T09:00:00Z').toISOString();
    const now = new Date('2026-05-28T09:42:00Z').getTime();
    expect(formatElapsed(start, now)).toBe('42 min');
  });

  it('returns "Xh YYm" for over one hour', () => {
    const start = new Date('2026-05-28T09:00:00Z').toISOString();
    const now = new Date('2026-05-28T11:07:00Z').getTime();
    expect(formatElapsed(start, now)).toBe('2h 07m');
  });

  it('zero-pads the minute portion', () => {
    const start = new Date('2026-05-28T09:00:00Z').toISOString();
    const now = new Date('2026-05-28T10:05:00Z').getTime();
    expect(formatElapsed(start, now)).toBe('1h 05m');
  });

  it('returns "0 min" when "now" is at or before the start (defensive)', () => {
    const start = new Date('2026-05-28T09:00:00Z').toISOString();
    const now = new Date('2026-05-28T08:00:00Z').getTime();
    expect(formatElapsed(start, now)).toBe('0 min');
  });

  it('returns empty string when startedAt is unparseable', () => {
    expect(formatElapsed('not an iso string')).toBe('');
  });
});

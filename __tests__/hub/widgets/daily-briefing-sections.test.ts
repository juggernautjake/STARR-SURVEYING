// __tests__/hub/widgets/daily-briefing-sections.test.ts
//
// hub-widget-excellence-15 — daily-briefing. Locks the pure summarizers
// behind each live section + the UTC today range used to query the
// schedule endpoint. The widget's own fetch / render path is exercised
// at the playwright level (vitest's node env has no DOM); these specs
// cover the math/string composition.

import { describe, it, expect } from 'vitest';
import {
  summarizeSchedule,
  summarizeCrew,
  summarizeActions,
  summarizeWeather,
  todayRange,
} from '@/lib/hub/widgets/daily-briefing/sections';

describe('summarizeSchedule', () => {
  it('empty list reads as "No events today"', () => {
    expect(summarizeSchedule([])).toEqual({ headline: 'No events today', detail: '' });
  });
  it('count + first maxJobs titles for non-empty', () => {
    const out = summarizeSchedule(
      [{ title: 'Stake corners' }, { title: 'Drive to job site' }, { title: 'Office sync' }],
      2,
    );
    expect(out.headline).toBe('3 events today');
    expect(out.detail).toBe('Stake corners · Drive to job site');
  });
  it('singular event copy', () => {
    expect(summarizeSchedule([{ title: 'One' }]).headline).toBe('1 event today');
  });
});

describe('summarizeCrew', () => {
  it('counts clocked-in + on-break members, names the first three', () => {
    const out = summarizeCrew([
      { user_name: 'Ana', status: 'clocked-in' },
      { user_email: 'b@x.com', status: 'on-break' },
      { user_name: 'Cora', status: 'clocked-in' },
      { user_name: 'Drew', status: 'clocked-out' },
    ]);
    expect(out.headline).toBe('3 on the clock');
    expect(out.detail).toBe('Ana, b@x.com, Cora');
  });
  it('empty reads as "No one clocked in"', () => {
    expect(summarizeCrew([{ user_name: 'Off', status: 'clocked-out' }])).toEqual({ headline: 'No one clocked in', detail: '' });
  });
});

describe('summarizeActions', () => {
  it('"All caught up" when nothing open', () => {
    expect(summarizeActions([{ title: 'X', status: 'completed' }])).toEqual({ headline: 'All caught up', detail: '' });
  });
  it('counts open tasks + shows the first title', () => {
    const out = summarizeActions([
      { title: 'Submit photos', status: 'open' },
      { title: 'Call client', status: 'in-progress' },
    ]);
    expect(out.headline).toBe('2 tasks due');
    expect(out.detail).toBe('Submit photos');
  });
});

describe('summarizeWeather', () => {
  it('rounds the temp + composes description + label', () => {
    expect(summarizeWeather({ temperature_f: 71.6, description: 'Clear sky', location_label: 'Central Texas' }))
      .toEqual({ headline: '72° Clear sky', detail: 'Central Texas' });
  });
  it('null degrades to "Weather unavailable"', () => {
    expect(summarizeWeather(null)).toEqual({ headline: 'Weather unavailable', detail: '' });
  });
});

describe('todayRange', () => {
  it('returns the [today, tomorrow) UTC window as ISO strings', () => {
    const r = todayRange(new Date('2026-05-30T17:00:00Z'));
    expect(r.from).toBe('2026-05-30T00:00:00.000Z');
    expect(r.to).toBe('2026-05-31T00:00:00.000Z');
  });
});

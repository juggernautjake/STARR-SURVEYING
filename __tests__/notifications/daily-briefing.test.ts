// __tests__/notifications/daily-briefing.test.ts
//
// notifications-completeness-pass Slice 4 — locks the pure daily-
// briefing composer + the 5-business-day window math.

import { describe, it, expect } from 'vitest';
import {
  buildDailyBriefingNotification,
  fiveBusinessDayWindow,
} from '@/lib/notifications/daily-briefing';

describe('fiveBusinessDayWindow', () => {
  it('Monday → 5 calendar days (Mon–Fri)', () => {
    const w = fiveBusinessDayWindow(new Date('2026-06-01T17:00:00Z'));
    expect(w.fromIso).toBe('2026-06-01T00:00:00.000Z');
    expect(w.days).toBe(5);
    expect(w.toIso).toBe('2026-06-06T00:00:00.000Z');
  });

  it('Wednesday → 7 calendar days (Wed–Sun spans the weekend to reach 5 weekdays)', () => {
    const w = fiveBusinessDayWindow(new Date('2026-06-03T17:00:00Z'));
    expect(w.fromIso).toBe('2026-06-03T00:00:00.000Z');
    expect(w.days).toBe(7);
    expect(w.toIso).toBe('2026-06-10T00:00:00.000Z');
  });

  it('Friday → 7 calendar days (Fri + skip Sat/Sun + Mon–Thu)', () => {
    const w = fiveBusinessDayWindow(new Date('2026-06-05T17:00:00Z'));
    expect(w.days).toBe(7);
    expect(w.toIso).toBe('2026-06-12T00:00:00.000Z');
  });
});

describe('buildDailyBriefingNotification', () => {
  const baseInput = {
    user_email: 'crew@x.com',
    first_name: 'Jacob',
    today_events: [],
    upcoming_tasks: [],
    recent_notes: [],
  };

  it('returns null on a truly-empty day (no spam)', () => {
    expect(buildDailyBriefingNotification(baseInput)).toBeNull();
  });

  it('returns null when the email is missing', () => {
    expect(buildDailyBriefingNotification({
      ...baseInput, user_email: '', today_events: [{ title: 'X' }],
    })).toBeNull();
  });

  it('composes a friendly greeting with events only', () => {
    const out = buildDailyBriefingNotification({
      ...baseInput,
      today_events: [
        { title: 'Stake corners @ Hill Rd' },
        { title: 'Office sync' },
      ],
    });
    expect(out!.title).toBe('🌅 Good morning, Jacob');
    expect(out!.body).toBe('2 events today: Stake corners @ Hill Rd, Office sync.');
    expect(out!.link).toBe('/admin/me');
  });

  it('truncates the events list to 2 with a +N more suffix', () => {
    const out = buildDailyBriefingNotification({
      ...baseInput,
      today_events: [
        { title: 'A' }, { title: 'B' }, { title: 'C' }, { title: 'D' },
      ],
    });
    expect(out!.body).toContain('4 events today: A, B +2 more.');
  });

  it('singular task copy', () => {
    const out = buildDailyBriefingNotification({
      ...baseInput,
      upcoming_tasks: [{ title: 'Submit photos' }],
    });
    expect(out!.body).toContain('1 task due this week: Submit photos.');
  });

  it('mentions distinct authors, capped at 2', () => {
    const out = buildDailyBriefingNotification({
      ...baseInput,
      recent_notes: [
        { author_email: 'boss@x.com', body_preview: 'check the south boundary' },
        { author_email: 'boss@x.com', body_preview: 'and the east one too' },
        { author_email: 'rpls@x.com', body_preview: 'sign off when done' },
        { author_email: 'student@x.com', body_preview: 'q about the traverse' },
      ],
    });
    expect(out!.body).toContain('4 notes from boss@x.com, rpls@x.com.');
  });

  it('composes a packed day (events + tasks + notes) into one body', () => {
    const out = buildDailyBriefingNotification({
      ...baseInput,
      today_events: [{ title: 'Site visit' }],
      upcoming_tasks: [{ title: 'Submit field data' }, { title: 'CAD revisions' }],
      recent_notes: [{ author_email: 'boss@x.com', body_preview: 'safety vest reminder' }],
    });
    expect(out!.body).toBe(
      '1 event today: Site visit. 2 tasks due this week: Submit field data, CAD revisions. 1 note from boss@x.com.',
    );
  });

  it('drops events/tasks/notes whose title or preview is blank', () => {
    const out = buildDailyBriefingNotification({
      ...baseInput,
      today_events: [{ title: '   ' }, { title: 'Real one' }],
      upcoming_tasks: [{ title: '' }],
      recent_notes: [{ author_email: 'a@x.com', body_preview: '' }],
    });
    expect(out!.body).toBe('1 event today: Real one.');
  });

  it('falls back to "there" when first_name is blank', () => {
    const out = buildDailyBriefingNotification({
      ...baseInput, first_name: '', today_events: [{ title: 'X' }],
    });
    expect(out!.title).toBe('🌅 Good morning, there');
  });
});

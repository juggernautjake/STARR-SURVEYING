// __tests__/notifications/event-reminder.test.ts
//
// Slice 4 of hub-widget-excellence-04-calendar. Locks the pure event
// reminder window check + payload builder.

import { describe, it, expect } from 'vitest';
import {
  minutesUntilStart,
  isInReminderWindow,
  buildEventReminder,
  REMINDER_LOOKAHEAD_MIN,
  type ReminderEvent,
} from '@/lib/notifications/event-reminder';

const NOW = Date.parse('2026-05-30T08:00:00.000Z');

function eventAt(offsetMin: number, over: Partial<ReminderEvent> = {}): ReminderEvent {
  return {
    id: 'ev1',
    title: 'Site visit',
    assigned_to: 'crew@x.com',
    start_time: new Date(NOW + offsetMin * 60_000).toISOString(),
    all_day: false,
    location: 'North parcel',
    ...over,
  };
}

describe('minutesUntilStart', () => {
  it('computes minutes to the start', () => {
    expect(minutesUntilStart(eventAt(30), NOW)).toBeCloseTo(30, 5);
    expect(minutesUntilStart(eventAt(-10), NOW)).toBeCloseTo(-10, 5);
  });

  it('returns null for a missing/unparseable start', () => {
    expect(minutesUntilStart({ start_time: null }, NOW)).toBeNull();
    expect(minutesUntilStart({ start_time: 'nope' }, NOW)).toBeNull();
  });
});

describe('isInReminderWindow', () => {
  it('is true for events starting within the look-ahead window', () => {
    expect(isInReminderWindow(eventAt(1), NOW)).toBe(true);
    expect(isInReminderWindow(eventAt(REMINDER_LOOKAHEAD_MIN), NOW)).toBe(true);
  });

  it('is false for events further out, already started, or all-day', () => {
    expect(isInReminderWindow(eventAt(REMINDER_LOOKAHEAD_MIN + 1), NOW)).toBe(false);
    expect(isInReminderWindow(eventAt(0), NOW)).toBe(false); // exactly now → started
    expect(isInReminderWindow(eventAt(-5), NOW)).toBe(false);
    expect(isInReminderWindow(eventAt(30, { all_day: true }), NOW)).toBe(false);
  });
});

describe('buildEventReminder', () => {
  it('builds a reminder addressed to the assignee with the lead + location', () => {
    const n = buildEventReminder(eventAt(30), NOW)!;
    expect(n).toMatchObject({
      user_email: 'crew@x.com',
      type: 'reminder',
      icon: '⏰',
      link: '/admin/schedule',
      source_type: 'event_reminder',
      source_id: 'ev1',
    });
    expect(n.title).toContain('Starting soon: Site visit');
    expect(n.body).toContain('starts in 30 minutes');
    expect(n.body).toContain('at North parcel');
  });

  it('singularizes "1 minute" + omits location when absent', () => {
    const n = buildEventReminder(eventAt(1, { location: null }), NOW)!;
    expect(n.body).toContain('starts in 1 minute.');
    expect(n.body).not.toContain(' at ');
  });

  it('returns null without an assignee/id or for a started event', () => {
    expect(buildEventReminder(eventAt(30, { assigned_to: null }), NOW)).toBeNull();
    expect(buildEventReminder(eventAt(30, { id: null }), NOW)).toBeNull();
    expect(buildEventReminder(eventAt(-5), NOW)).toBeNull();
  });
});

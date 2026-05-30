// __tests__/hub/schedule-payload.test.ts
//
// Slice 3 of hub-widget-excellence-04-calendar. Locks the add-event
// validation + payload builder.

import { describe, it, expect } from 'vitest';
import { buildSchedulePayload, type AddEventForm } from '@/lib/hub/calendar/schedule-payload';

const TIMED: AddEventForm = {
  title: 'Site visit',
  date: '2026-05-30',
  allDay: false,
  startTime: '09:00',
  endTime: '10:30',
  location: 'North parcel',
  eventType: 'field_work',
  color: '#15803d',
};

describe('buildSchedulePayload — happy paths', () => {
  it('builds a timed-event payload', () => {
    const r = buildSchedulePayload(TIMED);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.payload).toEqual({
      title: 'Site visit',
      start_time: '2026-05-30T09:00',
      end_time: '2026-05-30T10:30',
      all_day: false,
      event_type: 'field_work',
      location: 'North parcel',
      color: '#15803d',
    });
  });

  it('builds an all-day payload spanning 00:00–23:59', () => {
    const r = buildSchedulePayload({ title: 'Holiday', date: '2026-07-04', allDay: true });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.payload.start_time).toBe('2026-07-04T00:00');
    expect(r.payload.end_time).toBe('2026-07-04T23:59');
    expect(r.payload.all_day).toBe(true);
    expect(r.payload.event_type).toBe('other'); // default
    expect(r.payload.location).toBeNull();
    expect(r.payload.color).toBeNull();
  });

  it('trims the title + location and defaults the event type', () => {
    const r = buildSchedulePayload({ title: '  Meet  ', date: '2026-05-30', allDay: true, location: '  HQ  ' });
    expect(r.ok && r.payload.title).toBe('Meet');
    expect(r.ok && r.payload.location).toBe('HQ');
  });
});

describe('buildSchedulePayload — validation', () => {
  it('rejects a blank title', () => {
    expect(buildSchedulePayload({ ...TIMED, title: '   ' })).toEqual({ ok: false, error: 'Title is required.' });
  });

  it('rejects a missing/invalid date', () => {
    expect(buildSchedulePayload({ ...TIMED, date: '' }).ok).toBe(false);
    expect(buildSchedulePayload({ ...TIMED, date: '05/30/2026' })).toEqual({ ok: false, error: 'A valid date is required.' });
  });

  it('requires valid start + end times for a timed event', () => {
    expect(buildSchedulePayload({ ...TIMED, startTime: '' }).ok).toBe(false);
    expect(buildSchedulePayload({ ...TIMED, endTime: '25:99' }).ok).toBe(false);
  });

  it('requires end after start', () => {
    expect(buildSchedulePayload({ ...TIMED, startTime: '10:00', endTime: '10:00' }))
      .toEqual({ ok: false, error: 'End time must be after the start time.' });
    expect(buildSchedulePayload({ ...TIMED, startTime: '11:00', endTime: '10:00' }).ok).toBe(false);
  });
});

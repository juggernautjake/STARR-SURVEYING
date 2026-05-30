// __tests__/hub/today-schedule-options.test.ts
//
// Slice 5 of hub-widget-excellence-04-calendar. Locks the specialized
// editor's two new behaviors: the default-view override resolution and
// the event-type filter.

import { describe, it, expect } from 'vitest';
import {
  resolveScheduleView,
  filterEventsByType,
} from '@/lib/hub/widgets/today-schedule';

describe('resolveScheduleView', () => {
  it('auto follows the size bucket', () => {
    expect(resolveScheduleView('auto', 'small')).toBe('agenda');
    expect(resolveScheduleView('auto', 'medium')).toBe('agenda-wide');
    expect(resolveScheduleView('auto', 'large')).toBe('grid');
  });

  it('agenda override always lists, even when large', () => {
    expect(resolveScheduleView('agenda', 'xlarge')).toBe('agenda');
    expect(resolveScheduleView('agenda', 'tiny')).toBe('agenda');
  });

  it('grid override renders the grid at medium+, falls back to agenda when too small', () => {
    expect(resolveScheduleView('grid', 'medium')).toBe('grid');
    expect(resolveScheduleView('grid', 'large')).toBe('grid');
    expect(resolveScheduleView('grid', 'small')).toBe('agenda');
    expect(resolveScheduleView('grid', 'tiny')).toBe('agenda');
  });
});

describe('filterEventsByType', () => {
  const events = [
    { id: 'a', event_type: 'field_work' },
    { id: 'b', event_type: 'meeting' },
    { id: 'c', event_type: null }, // treated as 'other'
  ];

  it('returns everything when no types selected', () => {
    expect(filterEventsByType(events, []).map((e) => e.id)).toEqual(['a', 'b', 'c']);
  });

  it('keeps only the selected types', () => {
    expect(filterEventsByType(events, ['meeting']).map((e) => e.id)).toEqual(['b']);
  });

  it('treats a null event_type as "other"', () => {
    expect(filterEventsByType(events, ['other']).map((e) => e.id)).toEqual(['c']);
  });
});

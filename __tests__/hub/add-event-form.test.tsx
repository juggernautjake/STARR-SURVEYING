// __tests__/hub/add-event-form.test.tsx
//
// Slice 3 of hub-widget-excellence-04-calendar. SSR render of the
// inline add-event form: the fields the surveyor needs are present and
// the date pre-fills. (The POST/refresh flow is exercised through the
// pure buildSchedulePayload builder in schedule-payload.test.ts; the
// node test env has no DOM to drive the submit interactively.)

import { describe, it, expect } from 'vitest';
import React from 'react';
import * as ReactDOMServer from 'react-dom/server';
import AddEventForm from '@/lib/hub/calendar/AddEventForm';

function render(): string {
  return ReactDOMServer.renderToStaticMarkup(
    <AddEventForm defaultDate="2026-05-30" onCreated={() => {}} onCancel={() => {}} />,
  );
}

describe('AddEventForm', () => {
  const html = render();

  it('is a labeled form', () => {
    expect(html).toContain('aria-label="Add event"');
    expect(html).toMatch(/<form/);
  });

  it('has title, date, time, location, and type fields', () => {
    expect(html).toContain('aria-label="Event title"');
    expect(html).toContain('aria-label="Date"');
    expect(html).toContain('aria-label="Start time"');
    expect(html).toContain('aria-label="End time"');
    expect(html).toContain('aria-label="Location"');
    expect(html).toContain('aria-label="Event type"');
  });

  it('pre-fills the date from defaultDate', () => {
    expect(html).toMatch(/aria-label="Date"[^>]*value="2026-05-30"/);
  });

  it('offers an all-day toggle + Add/Cancel actions', () => {
    expect(html).toContain('All day');
    expect(html).toContain('Add event');
    expect(html).toContain('Cancel');
  });
});

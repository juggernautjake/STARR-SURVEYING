// __tests__/hub/schema-options-ordered.test.tsx
//
// Slice 4 of hub-widget-excellence-02-shared-infra. Locks the new
// reorderable "orderedmultiselect" control inside SchemaOptionsForm:
// selected items render in stored order with move/remove controls, the
// unselected options render as add-chips, the empty + cap states show,
// and a persisted-but-stale value is normalized.

import { describe, it, expect } from 'vitest';
import React from 'react';
import * as ReactDOMServer from 'react-dom/server';
import SchemaOptionsForm from '@/lib/hub/components/SchemaOptionsForm';
import type { WidgetOptionsField } from '@/lib/hub/widget-options';

const FIELD: WidgetOptionsField = {
  key: 'actions',
  type: 'orderedmultiselect',
  label: 'Quick actions',
  defaultValue: ['new-job', 'log-hours'],
  options: [
    { value: 'new-job', label: 'New job' },
    { value: 'log-hours', label: 'Log hours' },
    { value: 'add-receipt', label: 'Add receipt' },
    { value: 'new-message', label: 'New message' },
  ],
};

function render(value: Record<string, unknown>, field: WidgetOptionsField = FIELD): string {
  return ReactDOMServer.renderToStaticMarkup(
    <SchemaOptionsForm fields={[field]} value={value} onChange={() => {}} />,
  );
}

describe('orderedmultiselect — selected items in order', () => {
  it('renders selected items in the stored order with their labels', () => {
    const html = render({ actions: ['log-hours', 'new-job'] });
    const first = html.indexOf('data-ordered-item="log-hours"');
    const second = html.indexOf('data-ordered-item="new-job"');
    expect(first).toBeGreaterThan(-1);
    expect(second).toBeGreaterThan(first); // order honored
    expect(html).toContain('Log hours');
    expect(html).toContain('New job');
  });

  it('renders move-up / move-down / remove controls per item', () => {
    const html = render({ actions: ['new-job', 'log-hours'] });
    expect(html).toContain('aria-label="Move New job up"');
    expect(html).toContain('aria-label="Move New job down"');
    expect(html).toContain('aria-label="Remove New job"');
  });

  it('disables move-up on the first item and move-down on the last', () => {
    const html = render({ actions: ['new-job', 'log-hours'] });
    expect(html).toMatch(/aria-label="Move New job up"[^>]*disabled/);
    expect(html).toMatch(/aria-label="Move Log hours down"[^>]*disabled/);
  });
});

describe('orderedmultiselect — add candidates + states', () => {
  it('renders unselected options as add-chips', () => {
    const html = render({ actions: ['new-job'] });
    expect(html).toContain('data-ordered-add="log-hours"');
    expect(html).toContain('data-ordered-add="add-receipt"');
    // already-selected options are not offered as add-chips
    expect(html).not.toContain('data-ordered-add="new-job"');
  });

  it('shows the empty state when nothing is selected', () => {
    const html = render({ actions: [] });
    expect(html).toContain('Nothing selected yet');
  });

  it('normalizes a stale persisted value (drops unknowns, de-dupes)', () => {
    const html = render({ actions: ['gone', 'new-job', 'new-job'] });
    const items = html.match(/data-ordered-item="new-job"/g) ?? [];
    expect(items.length).toBe(1);
    expect(html).not.toContain('data-ordered-item="gone"');
  });

  it('hides the add row + shows a cap hint at maxSelected', () => {
    const capped: WidgetOptionsField = { ...FIELD, maxSelected: 2 };
    const html = render({ actions: ['new-job', 'log-hours'] }, capped);
    expect(html).toContain('Maximum of 2 selected');
    expect(html).not.toContain('data-ordered-add=');
  });
});

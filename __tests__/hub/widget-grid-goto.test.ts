// __tests__/hub/widget-grid-goto.test.ts
//
// hub-widget-excellence-04 Slice 2 — WidgetGrid wires each widget's
// canonical "Go to…" footer link from the central registry into its
// WidgetFrame, so every domain widget surfaces the link with no
// per-widget code. Source-regex (the SSR snapshot-caching limitation
// rules out interactive store-mutation render assertions for the grid).

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { widgetGoToTarget } from '@/lib/hub/widgets/_shared/widget-links';

const GRID_SRC = fs.readFileSync(
  path.join(__dirname, '..', '..', 'lib', 'hub', 'components', 'WidgetGrid.tsx'),
  'utf8',
);

describe('WidgetGrid — registry-driven Go-to footer wiring', () => {
  it('imports widgetGoToTarget from the shared registry', () => {
    expect(GRID_SRC).toMatch(/import \{ widgetGoToTarget \} from '@\/lib\/hub\/widgets\/_shared\/widget-links'/);
  });

  it('resolves the target from the widget instance type', () => {
    expect(GRID_SRC).toMatch(/widgetGoToTarget\(instance\.type\)\s*\?\?\s*undefined/);
  });

  it('passes goTo through to WidgetFrame', () => {
    expect(GRID_SRC).toMatch(/<WidgetFrame[\s\S]*?goTo=\{goTo\}[\s\S]*?>/);
  });
});

describe('WidgetGrid — the registry it relies on stays consistent', () => {
  it('linked widgets resolve a target; link-less widgets resolve null', () => {
    // today-schedule (this doc's widget) links to the schedule.
    expect(widgetGoToTarget('today-schedule')).toEqual({ href: '/admin/schedule', label: 'the schedule' });
    // a launcher widget is intentionally link-less → no footer.
    expect(widgetGoToTarget('quick-actions')).toBeNull();
  });
});

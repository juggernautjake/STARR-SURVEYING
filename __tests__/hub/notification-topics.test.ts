// __tests__/hub/notification-topics.test.ts
//
// The spine of the hub notification badge: which widget/quick-action does an event belong on.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  NOTIFICATION_TOPICS,
  BADGE_ELIGIBLE_WIDGETS,
  typesForWidget,
  typesForQuickAction,
  badgeCountsForWidgets,
} from '@/lib/hub/notification-topics';

const ROOT = process.cwd();

describe('the map points at tiles that exist', () => {
  // A topic that names a widget the registry does not have is a badge that can never render — the
  // built-but-unreachable defect, in a lookup table. This reads the real ids and fails on drift.
  const realWidgetIds = new Set<string>();
  const widgetDir = path.join(ROOT, 'lib/hub/widgets');
  for (const dir of fs.readdirSync(widgetDir, { withFileTypes: true })) {
    if (!dir.isDirectory()) continue;
    const idx = path.join(widgetDir, dir.name, 'index.tsx');
    if (!fs.existsSync(idx)) continue;
    const m = fs.readFileSync(idx, 'utf8').match(/\n {2}id:\s*'([a-z-]+)'/);
    if (m) realWidgetIds.add(m[1]);
  }

  const realQaIds = new Set(
    [...fs.readFileSync(path.join(ROOT, 'lib/hub/quick-actions-catalog.ts'), 'utf8')
      .matchAll(/\n {4}id:\s*'([a-z-]+)'/g)].map((m) => m[1]),
  );

  it('every widget id in the map is a real widget', () => {
    const bad = [...BADGE_ELIGIBLE_WIDGETS].filter((id) => !realWidgetIds.has(id));
    expect(bad, `these widget ids in the topic map do not exist: ${bad.join(', ')}`).toEqual([]);
  });

  it('every quick-action id in the map is a real quick action', () => {
    const mapped = new Set(Object.values(NOTIFICATION_TOPICS).flatMap((t) => t.quickActionIds));
    const bad = [...mapped].filter((id) => !realQaIds.has(id));
    expect(bad, `these quick-action ids do not exist: ${bad.join(', ')}`).toEqual([]);
  });

  it('the map is not empty and covers the owner’s five areas', () => {
    // hours, pay, invoice, job, employee — named explicitly, so shrinking the map to nothing fails.
    expect(typesForWidget('pending-hours')).toContain('hours_submitted');
    expect(typesForWidget('my-pay').length).toBeGreaterThan(0);
    expect(typesForWidget('outstanding-invoices').length).toBeGreaterThan(0);
    expect(typesForWidget('my-jobs')).toContain('job_assignment');
    expect(typesForWidget('active-research-projects')).toContain('research_complete');
  });
});

describe('an event can belong to more than one widget', () => {
  it('hours submitted lights the pending queue AND the approvals widget', () => {
    // Different views of the same thing; both should reflect it.
    const widgets = NOTIFICATION_TOPICS.hours_submitted.widgetIds;
    expect(widgets).toContain('pending-hours');
    expect(widgets).toContain('approvals');
  });

  it('research completion maps to the research widget', () => {
    // The type W-2 writes. The badge feature is why W-2 used a real `type` rather than a generic one.
    expect(NOTIFICATION_TOPICS.research_complete.widgetIds).toContain('active-research-projects');
  });
});

describe('typesForWidget / typesForQuickAction — the inverse', () => {
  it('finds every type that badges a widget', () => {
    const types = typesForWidget('my-pay');
    expect(types).toContain('payout_queued');
    expect(types).toContain('hours_pay_decided');
  });

  it('returns nothing for a widget no topic maps to', () => {
    // The weather widget is not a notification surface. It gets no badge, and that is correct.
    expect(typesForWidget('weather')).toEqual([]);
  });

  it('maps quick actions too', () => {
    expect(typesForQuickAction('capture-receipt')).toContain('missing_receipt');
    expect(typesForQuickAction('clock-in-out')).toEqual([]);
  });
});

describe('badgeCountsForWidgets — the arithmetic', () => {
  const unread = [
    { type: 'hours_submitted', count: 3 },
    { type: 'research_complete', count: 1 },
    { type: 'payout_queued', count: 2 },
  ];

  it('totals only the types that belong to each widget the person HAS', () => {
    const counts = badgeCountsForWidgets(unread, ['pending-hours', 'my-pay']);
    expect(counts['pending-hours']).toBe(3);   // hours_submitted
    expect(counts['my-pay']).toBe(2);           // payout_queued
  });

  it('a widget the person does not have contributes nothing', () => {
    // A badge is per-person and per-widget. Events exist, but not on a hub without that tile.
    const counts = badgeCountsForWidgets(unread, ['pending-hours']);
    expect(counts['active-research-projects']).toBeUndefined();
  });

  it('omits a widget with a zero total rather than showing a 0 badge', () => {
    const counts = badgeCountsForWidgets([{ type: 'hours_submitted', count: 0 }], ['pending-hours']);
    expect(counts['pending-hours']).toBeUndefined();
  });

  it('counts the same type under every widget it belongs to', () => {
    // hours_submitted maps to pending-hours AND approvals AND hours-this-week. Each is its own view.
    const counts = badgeCountsForWidgets([{ type: 'hours_submitted', count: 4 }], ['pending-hours', 'approvals']);
    expect(counts['pending-hours']).toBe(4);
    expect(counts['approvals']).toBe(4);
  });

  it('ignores negative or nonsense counts rather than subtracting', () => {
    const counts = badgeCountsForWidgets(
      [{ type: 'hours_submitted', count: -5 }, { type: 'hours_submitted', count: 2 }],
      ['pending-hours'],
    );
    expect(counts['pending-hours']).toBe(2);
  });

  it('returns an empty object when there is nothing unread', () => {
    expect(badgeCountsForWidgets([], ['pending-hours', 'my-pay'])).toEqual({});
  });
});

describe('the badge is actually drawn and fed (W-5)', () => {
  const read = (...p: string[]) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');

  it('the widget frame renders a badge from its count', () => {
    const frame = read('lib', 'hub', 'components', 'WidgetFrame.tsx');
    expect(frame).toContain('badgeCount');
    expect(frame).toMatch(/badgeCount > 0/);
  });

  it('each cell reads its count from the shared feed, not its own fetch', () => {
    // One provider fetch, not one per widget — a dozen calls for one number split twelve ways.
    const grid = read('lib', 'hub', 'components', 'WidgetGrid.tsx');
    expect(grid).toContain('useWidgetBadge(instance.type)');
    expect(grid).toContain('badgeCount={badgeCount}');
  });

  it('the canvas provides the badge feed once, around the grid', () => {
    expect(read('lib', 'hub', 'components', 'HubCanvas.tsx')).toContain('<HubBadgeProvider>');
  });

  it('quick actions badge individual actions by id', () => {
    const qa = read('lib', 'hub', 'widgets', 'quick-actions', 'index.tsx');
    expect(qa).toContain('useQuickActionBadges()');
    expect(qa).toContain('badge={actionBadges[a.id] ?? 0}');
  });

  it('the badge feed pauses while editing the hub', () => {
    // A badge over a drag handle is clutter, and dragging widgets does not change the counts.
    expect(read('lib', 'hub', 'use-hub-badges.tsx')).toMatch(/if \(isEditMode\) return;/);
  });
});

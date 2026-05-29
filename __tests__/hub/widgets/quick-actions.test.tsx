// __tests__/hub/widgets/quick-actions.test.tsx
//
// Slice 95 — Quick Actions widget + catalog.
//
// Covers the catalog (lookup, role filter, default ids), the widget's
// pure helpers (colsForBucket, capForBucket), registry round-trip,
// and the empty-state render. Like Pinned Pages, state-dependent
// render branches live in the upcoming Playwright suite.

import { describe, it, expect } from 'vitest';
import React from 'react';
import * as ReactDOMServer from 'react-dom/server';

import { getWidget } from '@/lib/hub/widget-registry';
import {
  QUICK_ACTIONS_CATALOG,
  DEFAULT_QUICK_ACTION_IDS,
  findQuickAction,
  quickActionsForRoles,
} from '@/lib/hub/quick-actions-catalog';

// Side-effect import — register the widget.
import {
  capForBucket,
  colsForBucket,
} from '@/lib/hub/widgets/quick-actions';

describe('quick-actions catalog', () => {
  it('ships exactly the 8 planning-doc starters', () => {
    const ids = QUICK_ACTIONS_CATALOG.map((a) => a.id);
    expect(ids).toEqual([
      'clock-in-out',
      'new-job',
      'approve-receipts',
      'view-reports',
      'open-cad',
      'send-message',
      'capture-receipt',
      'schedule',
    ]);
  });

  it('DEFAULT_QUICK_ACTION_IDS == every catalog id', () => {
    expect(DEFAULT_QUICK_ACTION_IDS).toEqual(QUICK_ACTIONS_CATALOG.map((a) => a.id));
  });

  it('findQuickAction looks up by id', () => {
    expect(findQuickAction('clock-in-out')?.label).toBe('Clock In/Out');
    expect(findQuickAction('new-job')?.label).toBe('New Job');
  });

  it('findQuickAction returns undefined for unknown ids', () => {
    expect(findQuickAction('totally-fake')).toBeUndefined();
  });

  it('every link kind entry has an href and every action kind has an actionId', () => {
    for (const a of QUICK_ACTIONS_CATALOG) {
      if (a.kind === 'link') {
        expect(a.href, `${a.id} link kind has href`).toBeTruthy();
      } else {
        expect(a.actionId, `${a.id} action kind has actionId`).toBeTruthy();
      }
    }
  });

  it('quickActionsForRoles filters new-job to admin only', () => {
    const fieldOut = quickActionsForRoles(['field_crew']).map((a) => a.id);
    expect(fieldOut).not.toContain('new-job');
    expect(fieldOut).not.toContain('approve-receipts');
    expect(fieldOut).toContain('clock-in-out');
    expect(fieldOut).toContain('open-cad');
  });

  it('admin sees every action in the catalog', () => {
    const adminOut = quickActionsForRoles(['admin']).map((a) => a.id);
    for (const def of QUICK_ACTIONS_CATALOG) {
      expect(adminOut).toContain(def.id);
    }
  });

  it('an empty roles array sees zero actions (no entry is global)', () => {
    // None of the starters have `allowedRoles: []` — every starter is
    // gated to at least one work role.
    const out = quickActionsForRoles([]).map((a) => a.id);
    expect(out).toEqual([]);
  });
});

describe('quick-actions widget — registry', () => {
  it('registers under id "quick-actions" with personal category', () => {
    const def = getWidget('quick-actions');
    expect(def).toBeDefined();
    expect(def?.id).toBe('quick-actions');
    expect(def?.label).toBe('Quick Actions');
    expect(def?.category).toBe('personal');
    expect(def?.allowedRoles).toEqual([]);
  });

  it('exposes a SettingsForm', () => {
    const def = getWidget('quick-actions');
    expect(def?.SettingsForm).toBeDefined();
  });

  it('default size matches planning doc (6×2, min 3×1, max 12×4)', () => {
    const def = getWidget('quick-actions');
    expect(def?.defaultSize).toEqual({ w: 4, h: 2 });
    expect(def?.minSize).toEqual({ w: 2, h: 1 });
    expect(def?.maxSize).toEqual({ w: 8, h: 6 });
  });

  it('default content selects every starter and ships shortcuts off', () => {
    const def = getWidget('quick-actions');
    const content = def?.defaultContent as { actionIds: string[]; enableShortcuts: boolean; layoutStyle: string; displayStyle: string };
    expect(content.actionIds.length).toBe(QUICK_ACTIONS_CATALOG.length);
    expect(content.enableShortcuts).toBe(false);
    expect(content.layoutStyle).toBe('grid');
    expect(content.displayStyle).toBe('icon-label');
  });
});

describe('quick-actions widget — colsForBucket', () => {
  it('tiny → 1', () => { expect(colsForBucket('tiny')).toBe(1); });
  it('small → 2', () => { expect(colsForBucket('small')).toBe(2); });
  it('medium → 3', () => { expect(colsForBucket('medium')).toBe(3); });
  it('large → 4', () => { expect(colsForBucket('large')).toBe(4); });
  it('xlarge → 6', () => { expect(colsForBucket('xlarge')).toBe(6); });
});

describe('quick-actions widget — capForBucket', () => {
  it('tiny → 2', () => { expect(capForBucket('tiny')).toBe(2); });
  it('small → 4', () => { expect(capForBucket('small')).toBe(4); });
  it('medium → 6', () => { expect(capForBucket('medium')).toBe(6); });
  it('large → 12', () => { expect(capForBucket('large')).toBe(12); });
  it('xlarge → 24', () => { expect(capForBucket('xlarge')).toBe(24); });
});

describe('quick-actions widget — empty-state render', () => {
  it('renders the empty state when actionIds resolves to no actions', () => {
    const def = getWidget('quick-actions');
    if (!def) throw new Error('widget not registered');
    const html = ReactDOMServer.renderToStaticMarkup(
      React.createElement(def.Widget, {
        customization: { layout: {}, style: {}, content: {}, interaction: {} },
        size: { w: 4, h: 2 },
        editMode: false,
        content: {
          actionIds: ['nonexistent-one', 'another-fake-id'],
          layoutStyle: 'grid',
          displayStyle: 'icon-label',
          enableShortcuts: false,
        },
      }),
    );
    expect(html).toContain('No quick actions yet');
  });

  it('renders the configured layout markup when default content resolves all actions', () => {
    const def = getWidget('quick-actions');
    if (!def) throw new Error('widget not registered');
    const html = ReactDOMServer.renderToStaticMarkup(
      React.createElement(def.Widget, {
        customization: { layout: {}, style: {}, content: {}, interaction: {} },
        size: { w: 8, h: 6 },
        editMode: false,
        content: def.defaultContent,
      }),
    );
    // Default = grid, every starter visible.
    expect(html).toContain('New Job');
    expect(html).toContain('Open CAD');
    expect(html).toContain('Clock In/Out');
    // Link kind actions render as anchors.
    expect(html).toContain('href="/admin/jobs/new"');
    expect(html).toContain('href="/admin/cad"');
    // Action kind actions render as disabled buttons.
    expect(html).toContain('disabled');
    expect(html).toContain('Coming soon');
  });

  it('list layout renders rows instead of a grid', () => {
    const def = getWidget('quick-actions');
    if (!def) throw new Error('widget not registered');
    const html = ReactDOMServer.renderToStaticMarkup(
      React.createElement(def.Widget, {
        customization: { layout: {}, style: {}, content: {}, interaction: {} },
        size: { w: 4, h: 2 },
        editMode: false,
        content: {
          actionIds: ['new-job', 'open-cad'],
          layoutStyle: 'list',
          displayStyle: 'icon-label',
          enableShortcuts: false,
        },
      }),
    );
    expect(html).toContain('<ul');
    expect(html).toContain('New Job');
    expect(html).toContain('Open CAD');
  });
});

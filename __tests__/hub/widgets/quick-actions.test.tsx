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
  // ── THE CATALOGUE AND THE DEFAULTS CAME APART (2026-08-19) ─────────────────────────────────
  //
  // Owner: "make sure that the quick actions widget on the hub has new project instead of new job
  // as the option." A job cannot be created without a project now, so a one-click New Job led to a
  // form whose first question is "which project?" — and when the answer was "a new one", it was the
  // wrong starting point.
  //
  // `new-job` is KEPT in the catalogue: hubs with a saved layout already name it, and removing the
  // entry would leave those tiles rendering nothing. It is simply no longer a default. So the
  // catalogue is 9, the default set is 8, and these are no longer the same assertion.
  it('ships the 9 catalogue entries, with new-project ahead of new-job', () => {
    const ids = QUICK_ACTIONS_CATALOG.map((a) => a.id);
    expect(ids).toEqual([
      'clock-in-out',
      'new-project',
      'new-job',
      'approve-receipts',
      'view-reports',
      'open-cad',
      'send-message',
      'capture-receipt',
      'schedule',
    ]);
  });

  it('defaults to 8, offering New Project and NOT New Job', () => {
    expect(DEFAULT_QUICK_ACTION_IDS).toEqual([
      'clock-in-out',
      'new-project',
      'approve-receipts',
      'view-reports',
      'open-cad',
      'send-message',
      'capture-receipt',
      'schedule',
    ]);
    expect(DEFAULT_QUICK_ACTION_IDS).not.toContain('new-job');
  });

  it('every default id is a real catalogue entry', () => {
    // The default list is hand-written now rather than a slice of the catalogue — which is what
    // stopped an insertion silently pushing the last default out. This is the assertion that stops
    // a typo in that list becoming a tile which renders as nothing.
    const ids = new Set(QUICK_ACTIONS_CATALOG.map((a) => a.id));
    for (const id of DEFAULT_QUICK_ACTION_IDS) expect(ids.has(id), id).toBe(true);
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
    expect(def?.minSize).toEqual({ w: 1, h: 1 });  // Slice 217
    expect(def?.maxSize).toEqual({ w: 8, h: 6 });
  });

  it('default content selects every starter and ships shortcuts off', () => {
    const def = getWidget('quick-actions');
    const content = def?.defaultContent as { actionIds: string[]; enableShortcuts: boolean; layoutStyle: string; displayStyle: string };
    // The default set is a deliberate subset now — `new-job` is in the catalogue but is not a
    // starter (2026-08-19), so this is DEFAULT_QUICK_ACTION_IDS, not the catalogue's length.
    expect(content.actionIds).toEqual([...DEFAULT_QUICK_ACTION_IDS]);
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
    // Default = grid, every starter visible. New PROJECT is the starter now; New Job stays in the
    // catalogue for anyone who adds it back, but a fresh hub does not ship it.
    expect(html).toContain('New Project');
    expect(html).not.toContain('New Job');
    expect(html).toContain('Open CAD');
    // quick-actions-wiring-2026-06-22 — the clock tile flips its
    // visible label based on session state. At SSR, no clock session
    // is read yet so the label reads "Clock In". The catalog label
    // ("Clock In/Out") still surfaces in aria-label / sr text.
    expect(html).toContain('Clock In');
    // Link kind actions render as anchors. The create-tile points at the PROJECT form now.
    expect(html).toContain('href="/admin/projects/new"');
    expect(html).toContain('href="/admin/cad"');
    // quick-actions-wiring-2026-06-22 — Capture Receipt now points at
    // /admin/receipts/new instead of rendering as a "Coming soon" stub.
    expect(html).toContain('href="/admin/receipts/new"');
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

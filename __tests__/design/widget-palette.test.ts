// __tests__/design/widget-palette.test.ts
//
// W2 of docs/planning/in-progress/DESIGN_STUDIO_SERVES_PAGES_2026-08-24.md.
//
// Owner: *"The payment portal would look different depending on which role the user has… I want it
// so that pages load elements dynamically based on the role of the user."*
//
// ── THE FAILURE THIS FILE IS ABOUT ──────────────────────────────────────────────────────────────
//
// Somebody designs the employee portal, places the payroll-approvals widget on it, saves, and every
// employee sees a gap where it should be — because that widget is `allowedRoles: ['admin']` and the
// composition is for `employee`. Nothing errored. Nothing was invalid. The page is simply, quietly,
// wrong for the only people who will ever open it.
//
// The editor must not FORBID that: a firm-scoped composition legitimately contains widgets only
// some viewers see, and that is what role-aware rendering means. It has to SAY so, at the moment of
// placing, in the person's own terms.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  toPaletteWidget, visibleToRoles, placementWarning, groupByCategory, searchWidgets,
  widgetCatalogId, isWidgetElement, widgetIdOf, WIDGET_PREFIX,
  type PaletteWidget,
} from '@/lib/design/widget-palette';

const widget = (over: Partial<PaletteWidget> & { id: string }): PaletteWidget => ({
  label: over.id, description: '', category: 'work', iconName: 'Square',
  defaultSize: { w: 2, h: 2 }, minSize: { w: 1, h: 1 }, maxSize: { w: 4, h: 4 },
  allowedRoles: [], requiresBundle: null, ...over,
});

// ── THE PROJECTION ──────────────────────────────────────────────────────────────────────────────

describe('a palette entry is data, never a component', () => {
  it('keeps only the named fields', () => {
    // Field by field rather than a spread. A spread would carry every FUTURE field of
    // `WidgetDefinition` into a JSON payload by default — including the next React component
    // somebody adds, which would fail to serialise and take the whole palette down. An allowlist
    // fails the other way, by omitting something, and an omission is visible.
    const def = {
      id: 'my-pay', label: 'My pay', description: 'What you earned', category: 'time-pay',
      iconName: 'Wallet', defaultSize: { w: 3, h: 2 }, minSize: { w: 2, h: 2 },
      maxSize: { w: 6, h: 4 }, allowedRoles: ['employee'] as const,
      Widget: () => null, SettingsForm: () => null, Skeleton: () => null,
    };
    const got = toPaletteWidget(def) as Record<string, unknown>;
    expect(Object.keys(got).sort()).toEqual([
      'allowedRoles', 'category', 'defaultSize', 'description', 'iconName', 'id', 'label',
      'maxSize', 'minSize', 'requiresBundle',
    ]);
    expect(JSON.stringify(got)).toContain('my-pay');
  });

  it('copies the size objects rather than aliasing the registry\'s', () => {
    // The registry is a module-level Map that lives for the process. Handing out its own objects
    // means a resize in the studio mutates the definition every other consumer reads.
    const size = { w: 3, h: 2 };
    const got = toPaletteWidget(widget({ id: 'w', defaultSize: size }));
    got.defaultSize.w = 99;
    expect(size.w).toBe(3);
  });
});

// ── WHO SEES IT ─────────────────────────────────────────────────────────────────────────────────

describe('visibility is about the viewer, and only the viewer', () => {
  it('no declared roles means everyone', () => {
    expect(visibleToRoles(widget({ id: 'w' }), [])).toBe(true);
    expect(visibleToRoles(widget({ id: 'w' }), ['guest'])).toBe(true);
  });

  it('one matching role is enough', () => {
    const w = widget({ id: 'w', allowedRoles: ['admin', 'finance'] });
    expect(visibleToRoles(w, ['employee', 'finance'])).toBe(true);
    expect(visibleToRoles(w, ['employee'])).toBe(false);
  });

  it('and case does not decide it', () => {
    expect(visibleToRoles(widget({ id: 'w', allowedRoles: ['Admin'] }), ['admin'])).toBe(true);
  });

  it('never consults the bundle', () => {
    // Two questions with two owners and two remedies — buy the bundle, or change the role.
    // Answering both with one boolean is what makes "why is this widget missing" unanswerable.
    const w = widget({ id: 'w', requiresBundle: 'surveying-pro' });
    expect(visibleToRoles(w, ['guest'])).toBe(true);
  });
});

describe('the editor says who will see a placement', () => {
  const ADMIN_ONLY = widget({ id: 'approvals', label: 'Approvals', allowedRoles: ['admin'] });
  const OPEN = widget({ id: 'clock', label: 'Clock' });

  it('warns plainly when NOBODY on this version will see it', () => {
    // The case in the header. An admin-only widget on a version built for employees reaches zero of
    // the people who open that page.
    const warning = placementWarning(ADMIN_ONLY, 'role', 'employee');
    expect(warning).toMatch(/nobody who sees this page will see this widget/);
  });

  it('says nothing when the audience does have the role', () => {
    expect(placementWarning(ADMIN_ONLY, 'role', 'admin')).toBeNull();
  });

  it('says nothing at all about an ungated widget', () => {
    // Most placements. A warning on every one of them is a warning nobody reads.
    expect(placementWarning(OPEN, 'role', 'employee')).toBeNull();
    expect(placementWarning(OPEN, 'firm', '')).toBeNull();
  });

  it('on a firm version it is a note about who WILL see it, not a warning', () => {
    // A firm composition legitimately holds widgets only some viewers see — that is role-aware
    // rendering working. Calling it a problem would train people to ignore the real warning above.
    const note = placementWarning(ADMIN_ONLY, 'firm', '');
    expect(note).toMatch(/only appears for admin/);
    expect(note).not.toMatch(/nobody/);
  });

  it('and stays silent about a person whose roles it does not know', () => {
    // Telling somebody a widget will be invisible when it will not is the fastest way to make every
    // warning in the editor get ignored. Silence beats a guess.
    expect(placementWarning(ADMIN_ONLY, 'user', 'jacob@starr.com')).toBeNull();
    expect(placementWarning(ADMIN_ONLY, 'user', 'jacob@starr.com', ['employee']))
      .toMatch(/does not have that role/);
    expect(placementWarning(ADMIN_ONLY, 'user', 'jacob@starr.com', ['admin'])).toBeNull();
  });
});

// ── THE PALETTE AS SOMETHING TO SCAN ────────────────────────────────────────────────────────────

describe('grouping and searching', () => {
  const WIDGETS = [
    widget({ id: 'a', category: 'work', label: 'My jobs' }),
    widget({ id: 'b', category: 'time-pay', label: 'My pay' }),
    widget({ id: 'c', category: 'work', label: 'Today' }),
  ];

  it('keeps the registry\'s own order rather than imposing the alphabet', () => {
    // The registry lists related widgets together on purpose. Sorting categories would scatter that
    // arrangement for no gain — a palette is scanned, not searched.
    expect(groupByCategory(WIDGETS).map((g) => g.category)).toEqual(['work', 'time-pay']);
    expect(groupByCategory(WIDGETS)[0].widgets.map((w) => w.id)).toEqual(['a', 'c']);
  });

  it('searches the words a person would actually type', () => {
    expect(searchWidgets(WIDGETS, 'pay').map((w) => w.id)).toEqual(['b']);
    expect(searchWidgets(WIDGETS, 'WORK').map((w) => w.id)).toEqual(['a', 'c']);
    expect(searchWidgets(WIDGETS, '')).toHaveLength(3);
  });
});

// ── A PLACED WIDGET IS STILL AN ELEMENT ─────────────────────────────────────────────────────────

describe('a widget on the canvas', () => {
  it('is a catalogue element with a namespaced id', () => {
    // `ElementKind` is `catalogue | shape | text`. A fourth kind would give every switch in the
    // studio — renderer, layers panel, exporter, punch list, conformance matcher — a new arm, and
    // the ones nobody updated would fall through to a default that draws nothing.
    expect(widgetCatalogId('receipts-queue')).toBe('widget:receipts-queue');
    expect(WIDGET_PREFIX).toBe('widget:');
  });

  it('cannot be confused with a catalogue entry', () => {
    // Catalogue ids are dotted and never contain a colon, which is what makes the namespace safe.
    expect(isWidgetElement('button.secondary')).toBe(false);
    expect(isWidgetElement('widget:my-pay')).toBe(true);
    expect(isWidgetElement(undefined)).toBe(false);
  });

  it('and gives the widget id back', () => {
    expect(widgetIdOf('widget:my-pay')).toBe('my-pay');
    expect(widgetIdOf('button.secondary')).toBeNull();
  });
});

// ── WHERE THE PALETTE IS READ FROM, AND WHY IT MOVED ────────────────────────────────────────────

describe('the palette is read on the client, because that is where the registry exists', () => {
  const ROOT = path.join(__dirname, '..', '..');

  it('there is no server endpoint for it', () => {
    // ── THE MISTAKE THIS PINS ────────────────────────────────────────────────────────────────
    //
    // This was first built as `GET /api/admin/design/widgets`, to keep 54 widget implementations
    // out of the studio's bundle. Sound reasoning, wrong conclusion: EVERY widget module begins
    // with `'use client'`, so in a Route Handler Next replaces it with a client-reference proxy and
    // never runs its body. `defineWidget()` never fires and `allWidgets()` returns `[]`.
    //
    // The endpoint answered 200 with a palette of nothing. It was caught on the first request only
    // because it REFUSED an empty palette rather than returning one — had it shipped the empty
    // array, the studio would have said "no widgets available" and the obvious suspect would have
    // been the studio.
    expect(fs.existsSync(path.join(ROOT, 'app/api/admin/design/widgets'))).toBe(false);
  });

  it('and the client module keeps the same refusal', () => {
    const client = fs.readFileSync(path.join(ROOT, 'lib/design/widget-palette.client.ts'), 'utf8');
    expect(client).toMatch(/^'use client';/);
    expect(client).toMatch(/import '@\/lib\/hub\/widgets\/register-all';/);
    expect(client).toMatch(/The widget registry is empty/);
  });

  it('the pure half imports nothing, so it can be tested and serialised', () => {
    // Everything above this block runs with no DOM, no registry and no database. That is the point
    // of the split surviving the correction: no React component ever reaches a stored design, a
    // JSON payload, or a test.
    const pure = fs.readFileSync(path.join(ROOT, 'lib/design/widget-palette.ts'), 'utf8');
    expect(pure).not.toMatch(/^import /m);
    expect(pure).not.toMatch(/'use client'/);
  });
});

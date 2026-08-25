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
  widgetCatalogId, isWidgetElement, widgetIdOf, WIDGET_PREFIX, widgetPixelSize, ARTBOARD_ROW_PX, elementToGrid, viewToGrid, snapToGrid,
  type PaletteWidget,
} from '@/lib/design/widget-palette';
import { renderElement } from '@/lib/design/render';

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
    const got = toPaletteWidget(def) as unknown as Record<string, unknown>;
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

// ── GRID CELLS → ARTBOARD PIXELS ────────────────────────────────────────────────────────────────
//
// A widget's size is in HUB GRID CELLS: `{ w: 3, h: 2 }` is three columns of eight and two rows. An
// artboard is measured in pixels. The two have to be reconciled in exactly one place, or the palette
// tile, the placed element and any future preview each pick their own ratio and a 3-cell widget is
// three different widths depending on where you look at it.
describe('a widget\'s size on an artboard', () => {
  // 8 columns, 16px gutters. One column of a 1440px artboard is (1440 - 16×7) / 8 = 166.
  const W = 1440;
  const COLS = 8;

  it('one cell is one column', () => {
    expect(widgetPixelSize({ w: 1, h: 1 }, W, COLS).w).toBe(166);
  });

  it('and n cells span the gutters between them', () => {
    // Not n × colWidth: three columns side by side also swallow the two gutters they sit across.
    // Getting this wrong makes every multi-cell widget narrower than the space it occupies on the
    // real hub, which is the kind of error that only shows up when a design is compared to a page.
    expect(widgetPixelSize({ w: 3, h: 1 }, W, COLS).w).toBe(166 * 3 + 16 * 2);
  });

  it('a full-width widget is exactly the artboard', () => {
    // The arithmetic has to close: 8 columns plus 7 gutters is the whole width, or a widget somebody
    // sized to span the page hangs a few pixels off the edge of it.
    expect(widgetPixelSize({ w: COLS, h: 1 }, W, COLS).w).toBe(W);
  });

  it('rows use the stated row height and its gutters', () => {
    expect(widgetPixelSize({ w: 1, h: 1 }, W, COLS).h).toBe(ARTBOARD_ROW_PX);
    expect(widgetPixelSize({ w: 1, h: 2 }, W, COLS).h).toBe(ARTBOARD_ROW_PX * 2 + 16);
  });

  it('and nothing ever rounds to zero', () => {
    // A widget with no width is invisible on the canvas and indistinguishable from one that failed
    // to place — the palette would look broken with nothing saying why.
    const tiny = widgetPixelSize({ w: 1, h: 1 }, 10, 8);
    expect(tiny.w).toBeGreaterThan(0);
    expect(tiny.h).toBeGreaterThan(0);
  });
});

describe('the canvas draws a placed widget as a named box', () => {
  it('never as the "unknown element" mark', () => {
    // `renderElement` returns `<div class="ds-missing">?</div>` for anything with no catalogue entry,
    // and a widget has none by design. Without its own branch, a deliberate placement and a broken
    // one would look identical on the canvas and the widget would read as a mistake.
    const html = renderElement(undefined, {
      id: 'e1', kind: 'catalogue', catalogId: 'widget:my-pay', name: 'My pay',
      slots: {}, style: {}, x: 0, y: 0, w: 300, h: 120, z: 1,
    });
    expect(html).toContain('ds-widget');
    expect(html).not.toContain('ds-missing');
    expect(html).toContain('My pay');
    expect(html).toContain('my-pay');
  });

  it('and never the live widget itself', () => {
    // Rendering the real component here would give the editor a second way of drawing a widget
    // beside the page's, and two renderers of one thing drifting apart is the defect this whole
    // plan exists to close. The box says what was recorded: this widget, this size, here.
    const html = renderElement(undefined, {
      id: 'e1', kind: 'catalogue', catalogId: 'widget:my-pay', name: 'My pay',
      slots: {}, style: {}, x: 0, y: 0, w: 300, h: 120, z: 1,
    });
    expect(html).toMatch(/^<div class="ds-widget"/);
    expect(html).toContain('The page renders the real one');
  });

  it('falls back to the id when the label was never stored', () => {
    const html = renderElement(undefined, {
      id: 'e1', kind: 'catalogue', catalogId: 'widget:my-pay',
      slots: {}, style: {}, x: 0, y: 0, w: 300, h: 120, z: 1,
    });
    expect(html).toContain('my-pay');
  });

  it('and an element that really is unknown still says so', () => {
    const html = renderElement(undefined, {
      id: 'e1', kind: 'catalogue', catalogId: 'button.nonexistent',
      slots: {}, style: {}, x: 0, y: 0, w: 10, h: 10, z: 1,
    });
    expect(html).toContain('ds-missing');
  });
});

// ── AND BACK AGAIN: PIXELS → GRID ───────────────────────────────────────────────────────────────
//
// W3. Serving a composition means undoing what `widgetPixelSize` did on the way in. This is the one
// place a SERVED page can silently differ from the design somebody approved — not by erroring, but
// by putting a widget one column over.
describe('a placed widget goes back to the grid it came from', () => {
  const W = 1440;
  const COLS = 8;
  const el = (over: Partial<{ x: number; y: number; w: number; h: number; catalogId: string }> = {}) => ({
    id: 'e1', catalogId: 'widget:my-pay', x: 0, y: 0, w: 166, h: ARTBOARD_ROW_PX, ...over,
  });

  it('round-trips every size the grid can express', () => {
    // The property that matters. Anything else means the widget somebody sized to three columns
    // serves at two, and the preview and the page disagree about a design that was signed off.
    for (let w = 1; w <= COLS; w += 1) {
      for (let h = 1; h <= 4; h += 1) {
        const px = widgetPixelSize({ w, h }, W, COLS);
        const back = elementToGrid(el({ w: px.w, h: px.h }), W, COLS)!;
        expect([back.w, back.h]).toEqual([w, h]);
      }
    }
  });

  it('round-trips positions too', () => {
    for (let col = 0; col < COLS; col += 1) {
      const step = (W - 16 * (COLS - 1)) / COLS + 16;
      const back = elementToGrid(el({ x: Math.round(step * col) }), W, COLS)!;
      expect(back.x).toBe(col);
    }
  });

  it('rounds an off-grid position to the column it meant', () => {
    // A canvas lets you put a widget at x=337 and a grid has no such column. Rounding is not an
    // approximation of the design — it is what the design MEANT, because the thing being designed
    // IS a grid layout and the canvas is only how it was drawn.
    expect(elementToGrid(el({ x: 337 }), W, COLS)!.x).toBe(2);
    expect(elementToGrid(el({ x: 350 }), W, COLS)!.x).toBe(2);
  });

  it('never lands in a column that does not exist', () => {
    // Dragged past the right edge, an unclamped x would send the hub's reflow somewhere arbitrary
    // and the served page would not match the design at all.
    const wide = elementToGrid(el({ x: 99_999, w: widgetPixelSize({ w: 3, h: 1 }, W, COLS).w }), W, COLS)!;
    expect(wide.x).toBe(COLS - 3);
    expect(elementToGrid(el({ y: -500 }), W, COLS)!.y).toBe(0);
  });

  it('honours the widget\'s own size envelope', () => {
    // The envelope is the REGISTRY's, not this module's. A widget resized on the canvas beyond what
    // its component supports would render broken on the served page — the one thing a preview is
    // supposed to catch.
    const envelope = { minSize: { w: 2, h: 2 }, maxSize: { w: 4, h: 3 } };
    const tiny = elementToGrid(el({ w: 100, h: 40 }), W, COLS, envelope)!;
    expect([tiny.w, tiny.h]).toEqual([2, 2]);
    const huge = elementToGrid(el({ w: 9_000, h: 9_000 }), W, COLS, envelope)!;
    expect([huge.w, huge.h]).toEqual([4, 3]);
  });

  it('ignores everything that is not a widget', () => {
    expect(elementToGrid(el({ catalogId: 'button.secondary' }), W, COLS)).toBeNull();
  });

  it('and returns them in reading order, because reflow walks the list', () => {
    // The hub resolves overlaps by walking the widgets in order, so the order decides who moves.
    // Reading order is the one that matches what somebody drew: the thing at the top-left stays
    // at the top-left.
    const step = (W - 16 * (COLS - 1)) / COLS + 16;
    const rowStep = ARTBOARD_ROW_PX + 16;
    const got = viewToGrid([
      { id: 'c', catalogId: 'widget:c', x: Math.round(step * 2), y: rowStep, w: 166, h: 120 },
      { id: 'a', catalogId: 'widget:a', x: 0, y: 0, w: 166, h: 120 },
      { id: 'not', catalogId: 'button.primary', x: 0, y: 0, w: 10, h: 10 },
      { id: 'b', catalogId: 'widget:b', x: Math.round(step), y: 0, w: 166, h: 120 },
    ], W, COLS);
    expect(got.map((p) => p.id)).toEqual(['a', 'b', 'c']);
  });

  it('keeps the element\'s own id, so a round trip renumbers nothing', () => {
    expect(elementToGrid(el(), W, COLS)!.id).toBe('e1');
    expect(elementToGrid(el(), W, COLS)!.type).toBe('my-pay');
  });
});

// ── W6: THE CANVAS AND THE SERVED PAGE AGREE BY CONSTRUCTION ────────────────────────────────────
//
// W6 asks for the two editors to converge, on the grounds that "two editors for one model is how
// they drift". That premise needs one correction: they are not two editors for one model.
// `GridEditor` edits an 8-column GRID and the studio edits a pixel CANVAS, and both are right for
// what they edit — a trace genuinely is pixels and a hub layout genuinely is cells.
//
// The drift that actually exists is narrower and worse. A composition is drawn in pixels and served
// in cells, so `viewToGrid` rounds — invisibly, at serve time, to a layout somebody already
// approved. A widget nudged to x=337 sat there in the editor and moved a column on the real page.
describe('a composition\'s widgets sit where they will serve', () => {
  const W = 1440;
  const COLS = 8;
  const el = (x: number, y: number, w = 166, h = ARTBOARD_ROW_PX) =>
    ({ catalogId: 'widget:my-pay', x, y, w, h });

  it('an off-grid position becomes the cell it would have rounded to', () => {
    const step = (W - 16 * (COLS - 1)) / COLS + 16;
    const snapped = snapToGrid(el(337, 5), W, COLS)!;
    expect(snapped.x).toBe(Math.round(step * 2));
    expect(snapped.y).toBe(0);
  });

  it('and snapping is idempotent, so nothing creeps on a second drag', () => {
    // If a snapped rect snapped again to somewhere else, every drag would nudge a widget one way
    // forever — a bug that only shows up after somebody has used the editor for ten minutes.
    const once = snapToGrid(el(337, 5), W, COLS)!;
    const twice = snapToGrid({ catalogId: 'widget:my-pay', ...once }, W, COLS)!;
    expect(twice).toEqual(once);
  });

  it('what it snaps to is exactly what viewToGrid will serve', () => {
    // The property the whole slice is for. A round trip, so the two cannot be kept in step wrongly:
    // there is only one arithmetic and both ends run it.
    const snapped = snapToGrid(el(337, 5, widgetPixelSize({ w: 3, h: 2 }, W, COLS).w, widgetPixelSize({ w: 3, h: 2 }, W, COLS).h), W, COLS)!;
    const served = elementToGrid({ id: 'e', catalogId: 'widget:my-pay', ...snapped }, W, COLS)!;
    expect([served.x, served.y, served.w, served.h]).toEqual([2, 0, 3, 2]);
  });

  it('and it leaves anything that is not a widget alone', () => {
    // A trace has no grid to snap to, and recording exact geometry is its entire job.
    expect(snapToGrid({ catalogId: 'button.secondary', x: 337, y: 5, w: 10, h: 10 }, W, COLS)).toBeNull();
  });
});

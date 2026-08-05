// __tests__/hub/mobile-editor.test.ts
//
// hub-mobile-customization. Locks the mobile hub customization refactor:
// on phones HubCanvas swaps the desktop GridEditor for MobileEditor (a
// vertical reorder/add/remove sheet), the stale "open on desktop"
// MobileBanner is gone, and the reorder relies on the mobile collapse
// honoring widget *array order* (so desktop x/y positions are
// untouched). Source-regex style — same as single-editor-entry.test.ts,
// avoiding the zustand/SSR snapshot render limitation.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (...p: string[]) => fs.readFileSync(path.join(__dirname, '..', '..', ...p), 'utf8');
const CANVAS = read('lib', 'hub', 'components', 'HubCanvas.tsx');
const EDITOR = read('lib', 'hub', 'components', 'MobileEditor.tsx');
const GRID_MATH = read('lib', 'hub', 'grid-math.ts');

describe('HubCanvas — breakpoint-aware editor swap', () => {
  it('renders MobileEditor on mobile and GridEditor on desktop', () => {
    expect(CANVAS).toMatch(/isMobile\s*\?[\s\S]*?<MobileEditor[\s\S]*?:\s*[\s\S]*?<GridEditor/);
  });

  it('derives isMobile from the shared useIsMobile hook', () => {
    expect(CANVAS).toMatch(/const isMobile = useIsMobile\(\)/);
    expect(CANVAS).toMatch(/import \{ useIsMobile \} from '\.\/EditMode'/);
  });

  it('both editors are driven by open={isEditMode}', () => {
    expect(CANVAS).toMatch(/<MobileEditor[\s\S]*?open=\{isEditMode\}/);
    expect(CANVAS).toMatch(/<GridEditor[\s\S]*?open=\{isEditMode\}/);
  });

  it('no longer mounts the desktop-only MobileBanner', () => {
    expect(CANVAS).not.toMatch(/<MobileBanner\s*\/?>/);
    expect(CANVAS).not.toMatch(/import MobileBanner/);
  });
});

describe('MobileEditor — reorder/add/remove/save wiring', () => {
  it('reorders by moving the widget array (preserving each widget x/y/w/h)', () => {
    // arrayMove relocates whole widget objects without touching their
    // grid coordinates — that is what keeps the desktop layout intact.
    expect(EDITOR).toMatch(/setDraftWidgets\(arrayMove\(widgets, oldIndex, newIndex\)\)/);
    expect(EDITOR).toMatch(/from '@dnd-kit\/sortable'/);
  });

  it('adds at the bottom of the desktop grid so it does not overlap there', () => {
    expect(EDITOR).toMatch(/reduce\(\(m, w\) => Math\.max\(m, w\.y \+ w\.h\), 0\)/);
    expect(EDITOR).toMatch(/addWidget\(\{/);
  });

  it('wires remove, save, and cancel to the shared store actions', () => {
    expect(EDITOR).toMatch(/removeWidget\(/);
    expect(EDITOR).toMatch(/onClick=\{saveDraft\}/);
    expect(EDITOR).toMatch(/onClick=\{cancelEdit\}/);
  });

  it('disables Save until there are unsaved changes', () => {
    expect(EDITOR).toMatch(/disabled=\{saving \|\| !isDirty\}/);
  });
});

describe('grid-math — mobile collapse honors array order', () => {
  it('breakpoint=1 stacks widgets in array order (the basis of mobile reorder)', () => {
    // The mobile reorder feature depends on collapseLayout(bp=1)
    // rendering widgets in their array order, while desktop (bp=8)
    // renders by explicit x/y. If this changes, mobile reorder breaks.
    const bp1 = GRID_MATH.match(/if \(breakpoint === 1\)[\s\S]*?return widgets\.map\(/);
    expect(bp1).not.toBeNull();
    expect(GRID_MATH).toMatch(/if \(breakpoint === 8\) return widgets;/);
  });
});

describe('mobile editor — per-widget editing (owner request, 2026-08-05)', () => {
  const SETTINGS = read('lib', 'hub', 'components', 'MobileWidgetSettings.tsx');
  const CSS = read('lib', 'hub', 'components', 'MobileEditor.css');

  it('a row can open the widget’s own settings', () => {
    // The mobile editor could reorder/add/remove but never open a widget to change what it shows.
    expect(EDITOR).toMatch(/onEdit=\{\(\) => setEditingId\(instance\.id\)\}/);
    expect(EDITOR).toContain('<MobileWidgetSettings');
  });

  it('reuses the widget’s SettingsForm rather than a mobile-only editor', () => {
    // Quick Actions ships QuickActionsSettings; reaching it is the whole feature. A parallel editor
    // would be a second place to keep in sync.
    expect(SETTINGS).toContain('def?.SettingsForm');
    expect(SETTINGS).toContain('SchemaOptionsForm');
  });

  it('preserves layout/style/interaction when saving content', () => {
    // patchWidgetCustomization REPLACES the object; passing only { content } would wipe the rest.
    expect(SETTINGS).toMatch(/\.\.\.instance!?\.customization/);
  });

  it('only shows an Edit control for widgets that have settings', () => {
    // A pencil that opens "nothing to customize" is worse than no pencil.
    expect(EDITOR).toContain('widgetHasSettings(instance.type)');
    expect(SETTINGS).toContain('export function widgetHasSettings');
  });

  it('the header is a non-scrolling flex bar, not sticky — it was overlapping its own hint', () => {
    // Owner screenshot: Cancel / Customize hub / Save drawn on top of the "Drag the handle" text.
    expect(CSS).toMatch(/\.hub-msheet__bar\s*\{[^}]*flex:\s*0 0 auto/);
    expect(CSS).toMatch(/\.hub-msheet__body\s*\{[^}]*min-height:\s*0/);
  });
});

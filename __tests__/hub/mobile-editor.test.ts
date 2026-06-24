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

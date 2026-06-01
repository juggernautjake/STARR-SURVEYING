// __tests__/cad/ui/new-drawing-clean.test.ts
//
// cad-trv-fidelity Slice 9 — a brand-new drawing the surveyor hasn't
// touched must NOT prompt to save on exit. Creating it
// (newDocument/updateSettings/addLayer) flips isDirty true, so the
// dialog marks it clean afterward; a real edit re-flags it dirty.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { useDrawingStore } from '@/lib/cad/store';

const read = (p: string) => fs.readFileSync(path.join(__dirname, '..', '..', '..', p), 'utf8');

describe('store dirty lifecycle', () => {
  it('starts clean, goes dirty on a setup mutation, and markClean() resets it', () => {
    const s = useDrawingStore.getState();
    s.markClean();
    expect(useDrawingStore.getState().isDirty).toBe(false);
    // A setup mutation (like the new-drawing dialog does) flips it dirty.
    s.updateSettings({ drawingScale: 50 });
    expect(useDrawingStore.getState().isDirty).toBe(true);
    // markClean() (called after the dialog finishes building the doc)
    // returns it to a pristine state.
    s.markClean();
    expect(useDrawingStore.getState().isDirty).toBe(false);
  });
});

describe('new-drawing + exit wiring (source-locked)', () => {
  it('NewDrawingDialog.handleCreate marks the fresh drawing clean before closing', () => {
    const src = read('app/admin/cad/components/NewDrawingDialog.tsx');
    const create = src.slice(src.indexOf('function handleCreate'), src.indexOf('function handleImport'));
    expect(create).toMatch(/drawingStore\.markClean\(\)/);
    // markClean must come AFTER the setup mutations (newDocument/addLayer).
    expect(create.indexOf('markClean')).toBeGreaterThan(create.indexOf('newDocument'));
    expect(create.indexOf('markClean')).toBeGreaterThan(create.indexOf('addLayer'));
  });

  it('the Exit button only prompts when the drawing is dirty', () => {
    const src = read('app/admin/cad/components/MenuBar.tsx');
    expect(src).toMatch(/if \(drawingStore\.isDirty\)\s*\{[\s\S]*?window\.confirm/);
  });

  it('the beforeunload guard only arms when dirty', () => {
    const src = read('app/admin/cad/hooks/useUnsavedChangesGuard.ts');
    expect(src).toMatch(/if \(!isDirty\) return;/);
  });
});

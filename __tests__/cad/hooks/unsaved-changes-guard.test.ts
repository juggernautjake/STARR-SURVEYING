// __tests__/cad/hooks/unsaved-changes-guard.test.ts
//
// cad-trv-dual-layer-filename Slice 3 — the unsaved-changes guard
// store. `requestDiscard(action)` must run the action immediately
// when the drawing is clean and defer it behind the confirm modal
// when there are unsaved changes (Save → continue, Don't Save →
// continue, Cancel → abort).

import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { useUnsavedGuardStore } from '@/app/admin/cad/hooks/useUnsavedChangesGuard';
import { useDrawingStore } from '@/lib/cad/store';

const CAD = (...p: string[]) =>
  fs.readFileSync(path.join(__dirname, '..', '..', '..', 'app', 'admin', 'cad', ...p), 'utf8');

function setDirty(dirty: boolean) {
  useDrawingStore.setState({ isDirty: dirty });
}

describe('useUnsavedGuardStore.requestDiscard', () => {
  beforeEach(() => {
    useUnsavedGuardStore.getState().reset();
    setDirty(false);
  });

  it('runs the action immediately when the drawing is clean', () => {
    const action = vi.fn();
    useUnsavedGuardStore.getState().requestDiscard(action);
    expect(action).toHaveBeenCalledTimes(1);
    expect(useUnsavedGuardStore.getState().isOpen).toBe(false);
  });

  it('defers the action behind the modal when the drawing is dirty', () => {
    setDirty(true);
    const action = vi.fn();
    useUnsavedGuardStore.getState().requestDiscard(action);
    expect(action).not.toHaveBeenCalled();
    expect(useUnsavedGuardStore.getState().isOpen).toBe(true);
    expect(useUnsavedGuardStore.getState().pending).toBe(action);
  });

  it('Don\'t Save runs the pending action + closes', () => {
    setDirty(true);
    const action = vi.fn();
    useUnsavedGuardStore.getState().requestDiscard(action);
    useUnsavedGuardStore.getState().proceedWithoutSaving();
    expect(action).toHaveBeenCalledTimes(1);
    expect(useUnsavedGuardStore.getState().isOpen).toBe(false);
    expect(useUnsavedGuardStore.getState().pending).toBeNull();
  });

  it('Cancel never runs the action', () => {
    setDirty(true);
    const action = vi.fn();
    useUnsavedGuardStore.getState().requestDiscard(action);
    useUnsavedGuardStore.getState().cancel();
    expect(action).not.toHaveBeenCalled();
    expect(useUnsavedGuardStore.getState().isOpen).toBe(false);
    expect(useUnsavedGuardStore.getState().pending).toBeNull();
  });

  it('Save hides the modal but keeps the pending action alive', () => {
    setDirty(true);
    const action = vi.fn();
    useUnsavedGuardStore.getState().requestDiscard(action);
    useUnsavedGuardStore.getState().beginSave();
    // Modal is hidden + a save is in flight; the action hasn't run yet.
    expect(useUnsavedGuardStore.getState().isOpen).toBe(false);
    expect(useUnsavedGuardStore.getState().awaitingSave).toBe(true);
    expect(action).not.toHaveBeenCalled();
    // The modal's watcher resumes the action once the save clears the
    // dirty flag (it calls proceedWithoutSaving). Simulate that.
    useUnsavedGuardStore.getState().proceedWithoutSaving();
    expect(action).toHaveBeenCalledTimes(1);
    expect(useUnsavedGuardStore.getState().awaitingSave).toBe(false);
  });
});

describe('unsaved-changes guard wiring (source locks)', () => {
  it('CADLayout renders the modal + guards New / Import / leaving the page', () => {
    const src = CAD('CADLayout.tsx');
    expect(src).toMatch(/<UnsavedChangesModal \/>/);
    // New Drawing + import wizard both route through requestDiscard.
    expect(src).toMatch(/requestDiscard\(\(\) => setShowNewDrawingDialog\(true\)\)/);
    expect(src).toMatch(/openImport = \(\) => \{\s*requestDiscard\(/);
    // Client-side nav-away interceptor exists.
    expect(src).toMatch(/document\.addEventListener\('click', onClick, true\)/);
    expect(src).toMatch(/router\.push\(dest\.pathname/);
  });

  it('MenuBar guards Open… + Import Traverse PC', () => {
    const src = CAD('components', 'MenuBar.tsx');
    expect(src).toMatch(/requestDiscard\(openFileDialog\)/);
    expect(src).toMatch(/requestDiscard\(importTrv\)/);
  });

  it('SaveToDBDialog guards opening a saved drawing', () => {
    const src = CAD('components', 'SaveToDBDialog.tsx');
    expect(src).toMatch(/requestDiscard\(\(\) => \{ void doOpen\(id\); \}\)/);
  });

  it('the Save button drives a save-then-continue flow', () => {
    const src = CAD('components', 'UnsavedChangesModal.tsx');
    expect(src).toMatch(/new CustomEvent\('cad:saveDocument'\)/);
    expect(src).toMatch(/if \(awaitingSave && !isDirty\)/);
  });
});

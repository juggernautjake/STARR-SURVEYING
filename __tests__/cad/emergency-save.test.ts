// CAD_AUDIT Slice S12 — the editor may break, but it must not take the drawing with it.
//
// The gap this closes was a promise, not an omission: `CADErrorBoundary` told the user "your most
// recent auto-save (if any) will be offered for recovery when you reload", and nothing wrote one at
// that moment. The routine snapshot is debounced 1.5 s after activity settles, and a render crash is
// very often caused by the edit just made — the one still inside that window.

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { writeAutosave, state } = vi.hoisted(() => ({
  writeAutosave: vi.fn(async () => {}),
  state: { document: null as unknown, isDirty: false },
}));
vi.mock('@/lib/cad/persistence/autosave', () => ({ writeAutosave }));
vi.mock('@/lib/cad/store', () => ({ useDrawingStore: { getState: () => state } }));

vi.mock('@/lib/cad/logger', () => ({
  cadLog: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import { emergencySave } from '@/lib/cad/persistence/emergency-save';

const doc = (over: Record<string, unknown> = {}) => ({
  id: 'doc-1', name: 'Lot 14 Boundary', features: {}, layers: {}, ...over,
});

beforeEach(() => {
  writeAutosave.mockClear();
  writeAutosave.mockImplementation(async () => {});
  state.document = doc();
  state.isDirty = true;
});

describe('it saves the work the boundary promised to save', () => {
  it('writes a snapshot keyed to the live document', async () => {
    const r = await emergencySave('react-error-boundary');
    expect(r.saved).toBe(true);
    expect(writeAutosave).toHaveBeenCalledTimes(1);
    const [docId, payload] = writeAutosave.mock.calls[0] as unknown as [string, { document: { id: string } }];
    expect(docId).toBe('doc-1');
    expect(payload.document.id).toBe('doc-1');
  });

  it('ignores autoSaveEnabled', async () => {
    // That setting governs routine background writes — a surveyor turning it off is asking us not
    // to write every few seconds while they work, not to discard their drawing when the program
    // crashes. The snapshot only ever OFFERS itself on reload; it never overwrites a file.
    state.document = doc({ settings: { autoSaveEnabled: false } });
    const r = await emergencySave('webgl-context-lost');
    expect(r.saved).toBe(true);
    expect(writeAutosave).toHaveBeenCalledTimes(1);
  });

  it('writes on every crash path', async () => {
    for (const reason of ['react-error-boundary', 'unhandled-rejection', 'uncaught-error', 'webgl-context-lost'] as const) {
      writeAutosave.mockClear();
      const r = await emergencySave(reason);
      expect(r.saved, reason).toBe(true);
    }
  });
});

describe('it does not write when there is nothing to save', () => {
  it('skips a clean document', async () => {
    // Writing anyway would replace a good snapshot with an identical one while the app is already
    // in trouble.
    state.isDirty = false;
    const r = await emergencySave('uncaught-error');
    expect(r).toEqual({ saved: false, skipped: 'not-dirty' });
    expect(writeAutosave).not.toHaveBeenCalled();
  });

  it('skips when there is no document at all', async () => {
    state.document = null;
    const r = await emergencySave('uncaught-error');
    expect(r).toEqual({ saved: false, skipped: 'no-document' });
    expect(writeAutosave).not.toHaveBeenCalled();
  });
});

describe('it never throws', () => {
  it('reports a failed write instead of raising', async () => {
    // Every caller is already on a failure path — an error boundary, a rejection handler, a dead GL
    // context. Throwing from here would turn a recoverable crash into an unrecoverable one.
    writeAutosave.mockImplementation(async () => { throw new Error('IndexedDB is full'); });
    const r = await emergencySave('react-error-boundary');
    expect(r).toEqual({ saved: false, skipped: 'write-failed' });
  });

  it('survives a store that throws', async () => {
    Object.defineProperty(state, 'document', {
      get() { throw new Error('store torn down'); }, configurable: true,
    });
    await expect(emergencySave('uncaught-error')).resolves.toEqual({ saved: false, skipped: 'write-failed' });
    Object.defineProperty(state, 'document', { value: doc(), writable: true, configurable: true });
  });
});

describe('the recovery snapshot stays small', () => {
  it('drops the redundant base64 for an image that also has a URL', async () => {
    // Mirrors CADLayout's toRecoverySnapshot. If the two writers disagreed, the recovery dialog
    // would read snapshots that differ depending on which one happened to write last.
    state.document = doc({
      projectImages: {
        a: { url: 'https://bucket/a.png', dataUrl: 'data:image/png;base64,AAAA' },
        b: { dataUrl: 'data:image/png;base64,BBBB' },
      },
    });
    await emergencySave('react-error-boundary');
    const [, payload] = writeAutosave.mock.calls[0] as unknown as [string, { document: { projectImages: Record<string, { dataUrl?: string; url?: string }> } }];
    expect(payload.document.projectImages.a.dataUrl).toBeUndefined();
    expect(payload.document.projectImages.a.url).toBe('https://bucket/a.png');
    // A legacy image with no URL keeps its base64 — recovery is never lossy.
    expect(payload.document.projectImages.b.dataUrl).toBe('data:image/png;base64,BBBB');
  });
});

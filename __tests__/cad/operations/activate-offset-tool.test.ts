// __tests__/cad/operations/activate-offset-tool.test.ts
//
// Slice 2 of cad-offset-tool-2026-05-29.md. Locks the two-step
// sequence the right-click "Create offset…" entry depends on:
// flip into OFFSET, then set the source id (because setTool
// resets the source to null along the way).

import { describe, it, expect, beforeEach } from 'vitest';
import { activateOffsetTool } from '@/lib/cad/operations/activate-offset-tool';
import { useToolStore } from '@/lib/cad/store';

beforeEach(() => {
  // Reset to SELECT with no source so each test starts clean.
  const ts = useToolStore.getState();
  ts.setTool('SELECT');
  ts.setOffsetSourceId(null);
});

describe('activateOffsetTool', () => {
  it('flips activeTool to OFFSET when given a source id', () => {
    const ok = activateOffsetTool('feature-abc');
    expect(ok).toBe(true);
    expect(useToolStore.getState().state.activeTool).toBe('OFFSET');
  });

  it('sets offsetSourceId to the provided feature id', () => {
    activateOffsetTool('feature-xyz');
    expect(useToolStore.getState().state.offsetSourceId).toBe('feature-xyz');
  });

  it('assigns the source id AFTER the tool switch (setTool resets it to null)', () => {
    // Pre-seed a different source so we know the value we observe
    // afterwards came from the helper, not a leftover.
    useToolStore.getState().setOffsetSourceId('leftover-id');
    activateOffsetTool('the-real-source');
    expect(useToolStore.getState().state.offsetSourceId).toBe('the-real-source');
  });

  it('returns false + leaves the tool alone when sourceId is null', () => {
    useToolStore.getState().setTool('PAN');
    const ok = activateOffsetTool(null);
    expect(ok).toBe(false);
    expect(useToolStore.getState().state.activeTool).toBe('PAN');
    expect(useToolStore.getState().state.offsetSourceId).toBeNull();
  });

  it('returns false + leaves the tool alone when sourceId is undefined', () => {
    useToolStore.getState().setTool('SELECT');
    const ok = activateOffsetTool(undefined);
    expect(ok).toBe(false);
    expect(useToolStore.getState().state.activeTool).toBe('SELECT');
  });

  it('returns false + leaves the tool alone when sourceId is the empty string', () => {
    const ok = activateOffsetTool('');
    expect(ok).toBe(false);
    expect(useToolStore.getState().state.activeTool).toBe('SELECT');
  });
});

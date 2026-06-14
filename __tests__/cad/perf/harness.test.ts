// __tests__/cad/perf/harness.test.ts
//
// cad-desktop-tauri-and-perf Slice N1e — harness driver.
// Locks the orchestration helpers that stitch the fixture
// generator, the histogram, and the drawing-store sink together.

import { describe, it, expect, vi } from 'vitest';
import {
  captureProfileWindow,
  loadProfileFixture,
  type ProfileFixtureSink,
} from '@/lib/cad/perf/harness';
import { generateSyntheticFeatures } from '@/lib/cad/perf/fixtures';
import {
  getRenderProfile,
  markRender,
  resetRenderProfile,
} from '@/lib/cad/perf/render-markers';
import type { Feature, Layer } from '@/lib/cad/types';

type MockSink = ProfileFixtureSink & {
  added: Feature[];
  layers: Layer[];
  newCalls: number;
};

function makeMockSink(): MockSink {
  const added: Feature[] = [];
  const layers: Layer[] = [];
  const layerById = new Map<string, Layer>();
  const sink: MockSink = {
    added,
    layers,
    newCalls: 0,
    addFeatures: (features: Feature[]) => {
      added.push(...features);
    },
    addLayer: (layer: Layer) => {
      layers.push(layer);
      layerById.set(layer.id, layer);
    },
    newDocument: () => {
      sink.newCalls += 1;
      added.length = 0;
      layers.length = 0;
      layerById.clear();
    },
    getLayer: (id: string) => layerById.get(id),
  };
  return sink;
}

describe('loadProfileFixture', () => {
  it('resets the document, ensures the synthetic layer, and pushes every feature', () => {
    const sink = makeMockSink();
    const features = generateSyntheticFeatures(50);
    const result = loadProfileFixture(features, sink);

    expect(result.loaded).toBe(50);
    expect(result.reset).toBe(true);
    expect(result.layerCreated).toBe(true);
    expect(sink.newCalls).toBe(1);
    expect(sink.layers).toHaveLength(1);
    expect(sink.layers[0].id).toBe('L1');
    expect(sink.added).toHaveLength(50);
    expect(result.loadMs).toBeGreaterThanOrEqual(0);
  });

  it('skips addLayer when the sink already has the synthetic layer', () => {
    const sink = makeMockSink();
    sink.addLayer?.({
      id: 'L1',
      name: 'pre-existing',
      visible: true,
      locked: false,
      frozen: false,
      color: '#000000',
      lineWeight: 0.5,
      lineTypeId: 'SOLID',
      opacity: 1,
      groupId: null,
      sortOrder: 0,
      isDefault: false,
      isProtected: false,
      autoAssignCodes: [],
    });
    // The pre-seed bumped the layer count to 1; loadProfileFixture
    // should NOT bump it again. Pass reset: false so the pre-seed
    // isn't wiped by an implicit `newDocument()`.
    const result = loadProfileFixture(
      generateSyntheticFeatures(10),
      sink,
      { reset: false },
    );
    expect(result.layerCreated).toBe(false);
    expect(sink.layers).toHaveLength(1);
  });

  it('respects { reset: false } — no newDocument call', () => {
    const sink = makeMockSink();
    const result = loadProfileFixture(
      generateSyntheticFeatures(5),
      sink,
      { reset: false },
    );
    expect(result.reset).toBe(false);
    expect(sink.newCalls).toBe(0);
  });

  it('respects a custom layerId', () => {
    const sink = makeMockSink();
    loadProfileFixture(
      generateSyntheticFeatures(5, { layerId: 'BENCH' }),
      sink,
      { layerId: 'BENCH' },
    );
    expect(sink.layers[0].id).toBe('BENCH');
    expect(sink.added.every((f) => f.layerId === 'BENCH')).toBe(true);
  });

  it('returns layerCreated=false when the sink does not implement addLayer', () => {
    let called: Feature[] = [];
    const sink: ProfileFixtureSink = {
      addFeatures: (features) => { called = features; },
    };
    const result = loadProfileFixture(generateSyntheticFeatures(3), sink);
    expect(result.layerCreated).toBe(false);
    expect(result.reset).toBe(false);
    expect(called).toHaveLength(3);
  });
});

describe('captureProfileWindow', () => {
  it('resets the histogram before waiting and snapshots after', async () => {
    resetRenderProfile();
    // A sample BEFORE the capture window should be wiped by the reset.
    markRender('phase', 100);
    expect(getRenderProfile().overall.sampleCount).toBe(1);

    let samplesDuringWait = 0;
    const delay = (ms: number) =>
      new Promise<void>((resolve) => {
        // Simulate the render loop dropping samples while we wait.
        markRender('phase', 5);
        samplesDuringWait += 1;
        setTimeout(resolve, ms);
      });

    const { profile, elapsedMs } = await captureProfileWindow(5, { delay });

    // The pre-capture sample is gone; only the in-window sample lives.
    expect(profile.byLabel.phase.sampleCount).toBe(samplesDuringWait);
    expect(profile.byLabel.phase.max).toBe(5);
    expect(elapsedMs).toBeGreaterThanOrEqual(0);
  });

  it('respects { reset: false }', async () => {
    resetRenderProfile();
    markRender('phase', 7);
    const { profile } = await captureProfileWindow(0, {
      reset: false,
      delay: () => Promise.resolve(),
    });
    expect(profile.byLabel.phase.sampleCount).toBe(1);
  });

  it('uses the supplied delay function — we never block on real time', async () => {
    const delay = vi.fn().mockResolvedValue(undefined);
    await captureProfileWindow(1000, { delay });
    expect(delay).toHaveBeenCalledWith(1000);
  });

  it('clamps negative durations to 0 before delegating to delay', async () => {
    const delay = vi.fn().mockResolvedValue(undefined);
    await captureProfileWindow(-50, { delay });
    expect(delay).toHaveBeenCalledWith(0);
  });
});

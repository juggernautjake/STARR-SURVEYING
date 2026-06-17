// __tests__/cad/perf/render-markers.test.ts
//
// cad-desktop-tauri-and-perf Slice N1 — profiling harness.
// Locks the histogram helper that the render loop calls to
// record per-phase timings. Covers ingest, percentile math,
// ring-buffer wrap, reset semantics, and the `measureRender`
// finally-clause behaviour.

import { describe, it, expect, beforeEach } from 'vitest';
import {
  RENDER_MARKER_RING_CAPACITY,
  getRenderProfile,
  markRender,
  measureRender,
  resetRenderProfile,
} from '@/lib/cad/perf/render-markers';

beforeEach(() => {
  resetRenderProfile();
});

describe('markRender + getRenderProfile — happy path', () => {
  it('returns an empty profile when nothing has been recorded', () => {
    const profile = getRenderProfile();
    expect(profile.byLabel).toEqual({});
    expect(profile.overall.sampleCount).toBe(0);
    expect(profile.overall.totalCount).toBe(0);
    expect(profile.overall.p50).toBe(0);
    expect(profile.overall.p95).toBe(0);
    expect(profile.overall.p99).toBe(0);
    expect(profile.overall.max).toBe(0);
    expect(profile.overall.mean).toBe(0);
  });

  it('rolls a single sample into both the per-label and overall buckets', () => {
    markRender('cull', 4);
    const profile = getRenderProfile();
    expect(profile.byLabel.cull.sampleCount).toBe(1);
    expect(profile.byLabel.cull.p50).toBe(4);
    expect(profile.byLabel.cull.max).toBe(4);
    expect(profile.byLabel.cull.mean).toBe(4);
    expect(profile.overall.sampleCount).toBe(1);
    expect(profile.overall.p50).toBe(4);
  });

  it('computes p50 / p95 / p99 / max / mean over a known distribution', () => {
    // 1..100 — easy to reason about.
    for (let i = 1; i <= 100; i += 1) markRender('draw', i);
    const bucket = getRenderProfile().byLabel.draw;
    expect(bucket.sampleCount).toBe(100);
    expect(bucket.totalCount).toBe(100);
    // Nearest-rank: p50 → index 49 → value 50.
    expect(bucket.p50).toBe(50);
    expect(bucket.p95).toBe(95);
    expect(bucket.p99).toBe(99);
    expect(bucket.max).toBe(100);
    expect(bucket.mean).toBeCloseTo(50.5);
  });

  it('keeps per-label histograms isolated', () => {
    markRender('cull', 1);
    markRender('cull', 2);
    markRender('draw', 10);
    markRender('draw', 20);
    const { byLabel, overall } = getRenderProfile();
    expect(byLabel.cull.sampleCount).toBe(2);
    expect(byLabel.cull.max).toBe(2);
    expect(byLabel.draw.sampleCount).toBe(2);
    expect(byLabel.draw.max).toBe(20);
    // Overall pools every sample.
    expect(overall.sampleCount).toBe(4);
    expect(overall.max).toBe(20);
  });
});

describe('markRender — bad inputs are silently dropped', () => {
  it('ignores NaN durations', () => {
    markRender('cull', NaN);
    expect(getRenderProfile().byLabel.cull?.sampleCount ?? 0).toBe(0);
    expect(getRenderProfile().overall.sampleCount).toBe(0);
  });

  it('ignores Infinity durations', () => {
    markRender('cull', Number.POSITIVE_INFINITY);
    expect(getRenderProfile().overall.sampleCount).toBe(0);
  });

  it('ignores negative durations', () => {
    markRender('cull', -1);
    expect(getRenderProfile().overall.sampleCount).toBe(0);
  });

  it('accepts zero (a free frame is still a frame)', () => {
    markRender('cull', 0);
    const bucket = getRenderProfile().byLabel.cull;
    expect(bucket.sampleCount).toBe(1);
    expect(bucket.max).toBe(0);
  });
});

describe('ring buffer wrap behaviour', () => {
  it('caps sampleCount at the ring capacity but keeps totalCount monotonic', () => {
    const N = RENDER_MARKER_RING_CAPACITY + 50;
    for (let i = 0; i < N; i += 1) markRender('cull', i + 1);
    const bucket = getRenderProfile().byLabel.cull;
    expect(bucket.sampleCount).toBe(RENDER_MARKER_RING_CAPACITY);
    expect(bucket.totalCount).toBe(N);
    // The newest samples are the highest values; the lowest 50
    // have been overwritten, so the floor is N - capacity + 1.
    expect(bucket.max).toBe(N);
    // Mean reflects the surviving window, not the entire history.
    const survivingLow = N - RENDER_MARKER_RING_CAPACITY + 1;
    const expectedMean = (survivingLow + N) / 2;
    expect(bucket.mean).toBeCloseTo(expectedMean, 6);
  });
});

describe('resetRenderProfile', () => {
  it('drops every label and zeroes the overall histogram', () => {
    markRender('cull', 5);
    markRender('draw', 10);
    resetRenderProfile();
    const profile = getRenderProfile();
    expect(profile.byLabel).toEqual({});
    expect(profile.overall.sampleCount).toBe(0);
    expect(profile.overall.totalCount).toBe(0);
  });
});

describe('measureRender', () => {
  it('records a sample under the supplied label and returns the function result', () => {
    const result = measureRender('cull', () => 42);
    expect(result).toBe(42);
    expect(getRenderProfile().byLabel.cull.sampleCount).toBe(1);
  });

  it('records a sample even when the wrapped function throws', () => {
    expect(() =>
      measureRender('cull', () => {
        throw new Error('boom');
      }),
    ).toThrow('boom');
    expect(getRenderProfile().byLabel.cull.sampleCount).toBe(1);
  });
});

// lib/cad/perf/render-markers.ts
//
// cad-desktop-tauri-and-perf Slice N1 — profiling harness.
//
// Tiny zero-dep histogram helper the render loop calls to record
// per-phase frame timings. The Perf overlay (separate slice)
// pulls the rolled-up profile out via `getRenderProfile()`; the
// whole module is dev-only in spirit but ships in the production
// bundle because it costs nothing when nobody calls `markRender`.
//
// Design notes:
//
//   - Per-label ring buffers (capacity `RING_CAPACITY` = 600,
//     i.e. ten seconds of 60 FPS samples per phase) so we keep a
//     bounded memory footprint regardless of session length.
//   - Samples are typed-array doubles. `pushSample` is O(1) and
//     allocation-free after the first call.
//   - Percentiles are computed on demand from a copied-and-sorted
//     snapshot — `getRenderProfile` is meant for UI ticks, not the
//     hot loop, so the per-call sort is fine.
//   - Non-finite or negative durations are silently dropped so
//     callers don't have to guard their `performance.now()`
//     subtractions.
//
// This is the gate for Phase 3 (native renderer) — only ship the
// Rust/wgpu rewrite if the overlay confirms the V8/WebGL stack is
// still the bottleneck after every Phase-2 slice has landed.

export const RENDER_MARKER_RING_CAPACITY = 600;

export interface RenderHistogramBucket {
  /** Total number of samples currently held in the ring buffer
   *  (capped at `RENDER_MARKER_RING_CAPACITY`). */
  sampleCount: number;
  /** Total samples ever pushed for this label since the last
   *  reset — useful for "are we hitting this phase at all?"
   *  questions when the ring has wrapped. */
  totalCount: number;
  p50: number;
  p95: number;
  p99: number;
  /** Largest sample currently in the ring (not a lifetime max —
   *  the ring drops old data). */
  max: number;
  /** Arithmetic mean over the ring contents. */
  mean: number;
}

export interface RenderProfile {
  /** Rolled-up histogram across every label currently tracked. */
  overall: RenderHistogramBucket;
  /** Per-phase breakdown keyed by the label passed to
   *  `markRender`. Keys appear in first-call order so the
   *  overlay can render a stable column list. */
  byLabel: Record<string, RenderHistogramBucket>;
}

interface RingBuffer {
  samples: Float64Array;
  /** Index of the next write — wraps at capacity. */
  cursor: number;
  /** Number of valid samples currently in the buffer (clamped
   *  to capacity). */
  size: number;
  /** Total samples ever pushed (monotonic). */
  total: number;
}

function createRing(): RingBuffer {
  return {
    samples: new Float64Array(RENDER_MARKER_RING_CAPACITY),
    cursor: 0,
    size: 0,
    total: 0,
  };
}

function pushSample(ring: RingBuffer, value: number): void {
  ring.samples[ring.cursor] = value;
  ring.cursor = (ring.cursor + 1) % RENDER_MARKER_RING_CAPACITY;
  if (ring.size < RENDER_MARKER_RING_CAPACITY) ring.size += 1;
  ring.total += 1;
}

function snapshotSorted(ring: RingBuffer): Float64Array {
  // Copy only the live slice so percentiles ignore the
  // pre-allocated zero suffix before the ring has filled.
  const out = new Float64Array(ring.size);
  for (let i = 0; i < ring.size; i += 1) {
    out[i] = ring.samples[i];
  }
  out.sort();
  return out;
}

function quantile(sorted: Float64Array, q: number): number {
  if (sorted.length === 0) return 0;
  // Nearest-rank percentile — cheap and stable on small N.
  const idx = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(q * sorted.length) - 1),
  );
  return sorted[idx];
}

function summarize(ring: RingBuffer): RenderHistogramBucket {
  if (ring.size === 0) {
    return {
      sampleCount: 0,
      totalCount: ring.total,
      p50: 0,
      p95: 0,
      p99: 0,
      max: 0,
      mean: 0,
    };
  }
  const sorted = snapshotSorted(ring);
  let sum = 0;
  let max = 0;
  for (let i = 0; i < sorted.length; i += 1) {
    const v = sorted[i];
    sum += v;
    if (v > max) max = v;
  }
  return {
    sampleCount: ring.size,
    totalCount: ring.total,
    p50: quantile(sorted, 0.5),
    p95: quantile(sorted, 0.95),
    p99: quantile(sorted, 0.99),
    max,
    mean: sum / sorted.length,
  };
}

// ────────────────────────────────────────────────────────────
// Module-scoped state
// ────────────────────────────────────────────────────────────

const rings = new Map<string, RingBuffer>();
let overall = createRing();

function getOrCreateRing(label: string): RingBuffer {
  let ring = rings.get(label);
  if (!ring) {
    ring = createRing();
    rings.set(label, ring);
  }
  return ring;
}

// ────────────────────────────────────────────────────────────
// Public API
// ────────────────────────────────────────────────────────────

/**
 * Record a single frame-phase sample. Silently drops non-finite
 * or negative durations so callers can `markRender(label, t1 -
 * t0)` without guarding the subtraction.
 */
export function markRender(label: string, durationMs: number): void {
  if (!Number.isFinite(durationMs) || durationMs < 0) return;
  pushSample(getOrCreateRing(label), durationMs);
  pushSample(overall, durationMs);
}

/**
 * Convenience wrapper: time `fn`, record under `label`, return
 * its result. The duration is recorded even if `fn` throws so
 * we don't miss outlier frames where a phase blew up.
 *
 * NOTE — `fn` MUST be synchronous. The duration is measured from
 * call to return; an async `fn` returns a Promise immediately
 * (sync ~ 0 ms) and the recorded sample reflects the Promise
 * construction, NOT the awaited work. Use a dedicated
 * `measureRenderAsync` (call sites are responsible for awaiting
 * the inner work) if you need to time a Promise. Today every
 * render-loop call site is sync, so no async wrapper exists yet.
 */
export function measureRender<T>(label: string, fn: () => T): T {
  const start = performance.now();
  try {
    return fn();
  } finally {
    markRender(label, performance.now() - start);
  }
}

/**
 * Roll up every tracked label plus the overall histogram. Safe
 * to call on every UI tick — the per-label sort is O(n log n)
 * over at most `RENDER_MARKER_RING_CAPACITY` samples.
 */
export function getRenderProfile(): RenderProfile {
  const byLabel: Record<string, RenderHistogramBucket> = {};
  for (const [label, ring] of rings) {
    byLabel[label] = summarize(ring);
  }
  return {
    overall: summarize(overall),
    byLabel,
  };
}

/**
 * Clear every histogram. Used between profiling fixtures (small
 * / medium / large) so the overlay shows clean numbers per run
 * and isn't biased by warm-up frames from the previous fixture.
 */
export function resetRenderProfile(): void {
  rings.clear();
  overall = createRing();
}

'use client';
// app/admin/cad/components/PerfOverlay.tsx
//
// cad-desktop-tauri-and-perf Slice N1c — dev-only Perf overlay.
// Slice N1f extends it with fixture-load buttons + a 5s capture
// window so the small/medium/large Phase-3 gating profile can be
// taken without leaving the running app.
//
// Press Ctrl+Alt+P to toggle a fixed-position panel that polls
// `getRenderProfile()` every 500 ms and shows the per-phase
// histogram (sample count + p50 / p95 / p99 + max) plus the
// pooled overall row. The Reset button drops every sample so
// the next profiling fixture starts clean.
//
// Load Small/Medium/Large generate a deterministic synthetic
// drawing (or use the small real-document baseline) and replace
// the current document — confirmed first, since this is
// destructive. Capture 5s pauses the live poll, resets the
// histogram, sleeps 5 s, and snapshots — the result is what
// you write down in the Phase-3 go/no-go ledger.
//
// The overlay is mounted unconditionally by `CADLayout` — when
// the hotkey hasn't been pressed it returns `null` and costs
// nothing beyond the keydown listener.

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  getRenderProfile,
  resetRenderProfile,
  type RenderHistogramBucket,
  type RenderProfile,
} from '@/lib/cad/perf/render-markers';
import {
  FIXTURE_SIZES,
  generateNamedFixture,
  type FixtureSize,
} from '@/lib/cad/perf/fixtures';
import {
  captureProfileWindow,
  loadProfileFixture,
} from '@/lib/cad/perf/harness';
import { useDrawingStore } from '@/lib/cad/store';

const POLL_INTERVAL_MS = 500;
const CAPTURE_DURATION_MS = 5_000;
// Fixtures at or above this count freeze the main thread for
// noticeable seconds while `addFeatures` lands. The confirm
// dialog spells out the cost so a hasty click can't blow a
// minute of the surveyor's time on a UI-thread stall.
const HEAVY_FIXTURE_THRESHOLD = 50_000;

const FIXTURE_BUTTONS: ReadonlyArray<{ size: FixtureSize; label: string }> = [
  { size: 'small', label: 'Small' },
  { size: 'medium', label: 'Medium' },
  { size: 'large', label: 'Large' },
];

function fmt(ms: number): string {
  if (ms === 0) return '0';
  if (ms < 1) return ms.toFixed(2);
  if (ms < 10) return ms.toFixed(2);
  return ms.toFixed(1);
}

function Row({ label, bucket }: { label: string; bucket: RenderHistogramBucket }) {
  return (
    <tr>
      <td className="pr-3 text-cyan-300 font-mono">{label}</td>
      <td className="pr-3 text-right text-gray-200 font-mono">{bucket.sampleCount}</td>
      <td className="pr-3 text-right text-gray-200 font-mono">{fmt(bucket.p50)}</td>
      <td className="pr-3 text-right text-amber-300 font-mono">{fmt(bucket.p95)}</td>
      <td className="pr-3 text-right text-rose-300 font-mono">{fmt(bucket.p99)}</td>
      <td className="text-right text-rose-400 font-mono">{fmt(bucket.max)}</td>
    </tr>
  );
}

export default function PerfOverlay() {
  const [visible, setVisible] = useState(false);
  const [profile, setProfile] = useState<RenderProfile>(() => getRenderProfile());
  const [busy, setBusy] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  // QA hardening — the 5 s capture and the deferred fixture load
  // both resolve AFTER React may have torn the component down (the
  // user navigates away mid-capture, or hot-reload swaps the tree).
  // Track mount state in a ref and bail out of setState in those
  // late-arriving callbacks so we don't emit React warnings or
  // mutate detached state.
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);
  const safeSetProfile = useCallback((next: RenderProfile) => {
    if (mountedRef.current) setProfile(next);
  }, []);
  const safeSetStatus = useCallback((next: string | null) => {
    if (mountedRef.current) setStatus(next);
  }, []);
  const safeSetBusy = useCallback((next: string | null) => {
    if (mountedRef.current) setBusy(next);
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.ctrlKey && e.altKey && (e.key === 'p' || e.key === 'P')) {
        e.preventDefault();
        setVisible((v) => !v);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (!visible) return;
    if (busy) return;
    setProfile(getRenderProfile());
    const id = window.setInterval(() => {
      setProfile(getRenderProfile());
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [visible, busy]);

  const onReset = useCallback(() => {
    resetRenderProfile();
    setProfile(getRenderProfile());
  }, []);

  const onLoadFixture = useCallback(
    (size: FixtureSize) => {
      const count = FIXTURE_SIZES[size];
      const isHeavy = count >= HEAVY_FIXTURE_THRESHOLD;
      // Heavy fixtures stall the main thread for several seconds while
      // `addFeatures` lands — spell out the cost so the surveyor isn't
      // ambushed by an unresponsive UI after a single click.
      const stallWarning = isHeavy
        ? '\n\nThe UI will freeze for several seconds during the load. Proceed?'
        : '';
      const ok = window.confirm(
        `Replace the current drawing with a ${count.toLocaleString()}-feature synthetic fixture? This wipes the current document.${stallWarning}`,
      );
      if (!ok) return;
      setBusy(`load:${size}`);
      setStatus(null);
      // Defer one tick so React can paint the busy state before the
      // big addFeatures call lands.
      setTimeout(() => {
        try {
          const features = generateNamedFixture(size);
          const sink = useDrawingStore.getState();
          const result = loadProfileFixture(features, sink);
          safeSetStatus(
            `Loaded ${result.loaded.toLocaleString()} features in ${fmt(result.loadMs)}ms`,
          );
        } catch (err) {
          safeSetStatus(
            `Load failed: ${err instanceof Error ? err.message : String(err)}`,
          );
        } finally {
          safeSetBusy(null);
        }
      }, 0);
    },
    [safeSetBusy, safeSetStatus],
  );

  const onCapture = useCallback(async () => {
    setBusy('capture');
    setStatus(`Capturing ${CAPTURE_DURATION_MS / 1000}s…`);
    try {
      const { profile: captured, elapsedMs } = await captureProfileWindow(
        CAPTURE_DURATION_MS,
      );
      safeSetProfile(captured);
      safeSetStatus(`Captured ${fmt(elapsedMs)}ms window`);
    } catch (err) {
      safeSetStatus(
        `Capture failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      safeSetBusy(null);
    }
  }, [safeSetProfile, safeSetStatus, safeSetBusy]);

  if (!visible) return null;

  const labels = Object.keys(profile.byLabel);
  const disabled = busy !== null;

  return (
    <div
      role="dialog"
      aria-label="Perf overlay"
      className="fixed bottom-12 right-4 z-50 w-[360px] rounded border border-gray-700 bg-gray-900/95 p-3 text-xs shadow-lg backdrop-blur"
    >
      <div className="mb-2 flex items-center justify-between">
        <span className="font-mono text-cyan-300">Perf overlay</span>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onReset}
            disabled={disabled}
            className="rounded border border-gray-600 px-2 py-0.5 text-gray-200 hover:bg-gray-800 disabled:opacity-50"
          >
            Reset
          </button>
          <button
            type="button"
            onClick={() => setVisible(false)}
            className="rounded border border-gray-600 px-2 py-0.5 text-gray-200 hover:bg-gray-800"
            aria-label="Close perf overlay"
          >
            ×
          </button>
        </div>
      </div>
      <div className="mb-2 flex flex-wrap gap-1">
        <span className="text-gray-400">Fixture:</span>
        {FIXTURE_BUTTONS.map(({ size, label }) => (
          <button
            key={size}
            type="button"
            onClick={() => onLoadFixture(size)}
            disabled={disabled}
            className="rounded border border-gray-600 px-2 py-0.5 text-gray-200 hover:bg-gray-800 disabled:opacity-50"
          >
            {label}
          </button>
        ))}
        <button
          type="button"
          onClick={onCapture}
          disabled={disabled}
          className="rounded border border-amber-600 px-2 py-0.5 text-amber-200 hover:bg-amber-900/40 disabled:opacity-50"
        >
          Capture {CAPTURE_DURATION_MS / 1000}s
        </button>
      </div>
      {status && (
        <div className="mb-2 text-[10px] text-amber-300 font-mono">{status}</div>
      )}
      <div className="admin-table-wrap"><table className="w-full">
        <thead>
          <tr className="border-b border-gray-700 text-left text-gray-400">
            <th className="pr-3 font-normal">phase</th>
            <th className="pr-3 text-right font-normal">n</th>
            <th className="pr-3 text-right font-normal">p50</th>
            <th className="pr-3 text-right font-normal">p95</th>
            <th className="pr-3 text-right font-normal">p99</th>
            <th className="text-right font-normal">max</th>
          </tr>
        </thead>
        <tbody>
          <Row label="overall" bucket={profile.overall} />
          {labels.map((label) => (
            <Row key={label} label={label} bucket={profile.byLabel[label]} />
          ))}
        </tbody>
      </table></div>
      <div className="mt-2 text-[10px] text-gray-500">
        Ctrl+Alt+P · all timings in ms · polled every {POLL_INTERVAL_MS}ms
      </div>
    </div>
  );
}

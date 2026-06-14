// __tests__/cad/perf/perf-overlay.test.ts
//
// cad-desktop-tauri-and-perf Slice N1c — the dev-only Perf
// overlay (Ctrl+Alt+P toggle). Source-locked because the
// component is the public face of the profiling harness and a
// silent refactor breaking the hotkey or the poll interval
// would render the histogram invisible without any test
// reporting the regression.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.join(__dirname, '..', '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

describe('PerfOverlay — module shape', () => {
  const SRC = read('app/admin/cad/components/PerfOverlay.tsx');

  it('is a client-only component', () => {
    expect(SRC.startsWith("'use client'")).toBe(true);
  });

  it('pulls helpers from the render-markers module', () => {
    expect(SRC).toMatch(/getRenderProfile,\s*\n\s*resetRenderProfile,/);
    expect(SRC).toMatch(/from '@\/lib\/cad\/perf\/render-markers'/);
  });

  it('binds the Ctrl+Alt+P hotkey to toggle visibility', () => {
    expect(SRC).toMatch(/e\.ctrlKey && e\.altKey && \(e\.key === 'p' \|\| e\.key === 'P'\)/);
    expect(SRC).toMatch(/setVisible\(\(v\) => !v\)/);
  });

  it('returns null when the overlay is hidden so the mount stays free', () => {
    expect(SRC).toMatch(/if \(!visible\) return null;/);
  });

  it('polls getRenderProfile on a 500ms interval while visible', () => {
    expect(SRC).toMatch(/const POLL_INTERVAL_MS = 500;/);
    expect(SRC).toMatch(/window\.setInterval\(\(\) => \{\s*\n\s*setProfile\(getRenderProfile\(\)\);\s*\n\s*\}, POLL_INTERVAL_MS\)/);
  });

  it('exposes a Reset button wired to resetRenderProfile', () => {
    expect(SRC).toMatch(/resetRenderProfile\(\);/);
    expect(SRC).toMatch(/onClick=\{onReset\}/);
  });

  it('renders the overall row + a per-label row for every tracked phase', () => {
    expect(SRC).toMatch(/<Row label="overall" bucket=\{profile\.overall\} \/>/);
    expect(SRC).toMatch(/labels\.map\(\(label\) => \(/);
  });

  it('shows p50 / p95 / p99 / max columns', () => {
    expect(SRC).toMatch(/>p50</);
    expect(SRC).toMatch(/>p95</);
    expect(SRC).toMatch(/>p99</);
    expect(SRC).toMatch(/>max</);
  });
});

describe('CADLayout — N1c overlay mount', () => {
  const SRC = read('app/admin/cad/CADLayout.tsx');

  it('imports PerfOverlay from the components folder', () => {
    expect(SRC).toMatch(/import PerfOverlay from '\.\/components\/PerfOverlay'/);
  });

  it('renders <PerfOverlay /> next to the StatusBar', () => {
    expect(SRC).toMatch(/<StatusBar [^\/]*\/>\s*\n\s*<PerfOverlay \/>/);
  });
});

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

describe('PerfOverlay — N1f fixture-load + capture wiring', () => {
  const SRC = read('app/admin/cad/components/PerfOverlay.tsx');

  it("imports the fixture generator + harness from the perf module", () => {
    expect(SRC).toMatch(/generateNamedFixture,/);
    expect(SRC).toMatch(/FIXTURE_SIZES,/);
    expect(SRC).toMatch(/from '@\/lib\/cad\/perf\/fixtures'/);
    expect(SRC).toMatch(/captureProfileWindow,\s*\n\s*loadProfileFixture,/);
    expect(SRC).toMatch(/from '@\/lib\/cad\/perf\/harness'/);
  });

  it('reads the drawing store at click time (lazy — no top-level subscription)', () => {
    expect(SRC).toMatch(/import \{ useDrawingStore \} from '@\/lib\/cad\/store'/);
    expect(SRC).toMatch(/const sink = useDrawingStore\.getState\(\);/);
  });

  it('guards fixture loads behind window.confirm so a stray click cannot wipe the doc', () => {
    expect(SRC).toMatch(/window\.confirm\(/);
    expect(SRC).toMatch(/Replace the current drawing/);
  });

  it('exposes one button per FIXTURE_SIZES key — Small / Medium / Large', () => {
    expect(SRC).toMatch(/size: 'small',\s*label: 'Small'/);
    expect(SRC).toMatch(/size: 'medium',\s*label: 'Medium'/);
    expect(SRC).toMatch(/size: 'large',\s*label: 'Large'/);
    expect(SRC).toMatch(/FIXTURE_BUTTONS\.map/);
  });

  it('Capture button drives captureProfileWindow + writes the result back into the table', () => {
    expect(SRC).toMatch(/const CAPTURE_DURATION_MS = 5_?000;/);
    expect(SRC).toMatch(/await captureProfileWindow\(\s*\n?\s*CAPTURE_DURATION_MS,?\s*\n?\s*\)/);
    // QA hardening — `setProfile` is now wrapped in `safeSetProfile`
    // which short-circuits when the component has unmounted before
    // the 5 s capture resolves. Accept either form.
    expect(SRC).toMatch(/(setProfile|safeSetProfile)\(captured\);/);
  });

  it('disables every action button while a load or capture is in flight', () => {
    expect(SRC).toMatch(/const disabled = busy !== null;/);
    expect(SRC).toMatch(/disabled=\{disabled\}/);
  });

  it('pauses the 500ms poll while busy so the capture window owns the histogram', () => {
    expect(SRC).toMatch(/if \(busy\) return;\s*\n\s*setProfile\(getRenderProfile\(\)\);/);
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

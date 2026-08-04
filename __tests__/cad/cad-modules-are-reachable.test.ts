// CAD_AUDIT Slice S18 — every module under lib/cad has a production caller, or a recorded reason.
//
// The research platform has `research-modules-are-reachable` because "authored but never wired"
// appeared eleven times in one plan. `lib/cad` has **248 modules** and had no equivalent — and this
// session found the same defect eleven more times across the codebase, including `diffFingerprints`,
// which had been written for exactly its job and never called.
//
// ── WHAT "REACHABLE" MEANS HERE ─────────────────────────────────────────────────────────────────
// A *production* importer. A module imported only by its own test is not reachable: the test proves
// the code works and says nothing about whether anything runs it. That distinction is the whole
// point — every dead module found today had passing tests.
//
// ── THE PREFILTER IS A NECESSARY CONDITION, NOT A HEURISTIC ─────────────────────────────────────
// `txt.includes(needle)` before the regex, because the import path contains the basename literally,
// so a file without that substring cannot match. The research version of this check took 3,856 ms
// before the same prefilter and 860 ms after, with identical answers. An earlier attempt there —
// extracting quoted literals once and matching against those — looked equivalent and was not: one
// apostrophe in prose mis-pairs every quote after it, and it reported twelve wired modules as dead.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Modules with no production caller, each with the reason it is allowed to stay that way.
 *
 * **This list is an inventory, not an amnesty.** Everything in it is either a real duplication worth
 * fixing or a genuinely unused module worth deleting — it is written down so the next person can act
 * on a specific claim instead of rediscovering the whole set.
 */
const KNOWN_UNREACHABLE: Record<string, string> = {
  // ── The one worth fixing first ────────────────────────────────────────────────────────────────
  // `CanvasViewport` defines its OWN `ensureFeatureIndex` inline (around line 2253) instead of
  // importing this. So the uniform-grid spatial index exists twice: once here, tested, and once in
  // a 15,000-line component, where the version that actually runs lives. The perf doc records P1 as
  // "DONE — lib/cad/spatial/feature-index.ts", which is true of the file and not of the renderer.
  // Deduplicating means touching CanvasViewport and should be sequenced with the S5 split, not
  // bolted onto an unrelated change.
  'spatial/feature-index.ts': 'DUPLICATED — CanvasViewport has its own inline ensureFeatureIndex; dedupe with the S5 split',

  // ── Shipped this session, deliberately not yet wired ──────────────────────────────────────────
  // S16a built the zone table and corrected a mislabel (2277 is Central, not North Central). The
  // exporters still hardcode their own EPSG constants; pointing them at this table is a behavioural
  // change to delivered files and wants its own slice, not a drive-by.
  'geo/texas-state-plane.ts': 'S16a — the zone table; wiring the exporters to it is a separate slice',

  // ── Genuinely unused today ────────────────────────────────────────────────────────────────────
  'ai/mock-proposer.ts': 'test/dev double for the AI proposer',
  'geometry/compound-curve.ts': 'compound-curve solving, built ahead of a UI that can express it',
  'geometry/spline-to-arc.ts': 'spline→arc conversion, for a DXF export path not yet taken',
  'io/trv-bearings.ts': 'TRV bearing helpers superseded by the parser doing it inline',
  'persistence/native-autosave.ts': 'Tauri desktop autosave; unreachable until the desktop build ships',

  // ── Barrels ───────────────────────────────────────────────────────────────────────────────────
  // Re-export files reached by directory path rather than filename. Harmless, and listed so the
  // count means something.
  'ai-engine/index.ts': 'barrel — re-export file, reached by directory path rather than filename',
  'codes/index.ts': 'barrel — re-export file, reached by directory path rather than filename',
  'platform/index.ts': 'barrel — re-export file, reached by directory path rather than filename',
};

function walk(dir: string, test: (n: string) => boolean, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (!/node_modules|\.next|\.git/.test(p)) walk(p, test, out);
    } else if (test(e.name)) out.push(p);
  }
  return out;
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function findUnreachable(): string[] {
  const modules = walk(path.join(process.cwd(), 'lib/cad'),
    (n) => /\.ts$/.test(n) && !/\.d\.ts$/.test(n));

  const callerFiles: string[] = [];
  for (const r of ['lib', 'app', 'worker/src', 'scripts', 'mobile']) {
    walk(path.join(process.cwd(), r), (n) => /\.(ts|tsx|mjs|js)$/.test(n), callerFiles);
  }

  const texts = new Map<string, string>();
  for (const f of callerFiles) {
    // A test-only importer is not production reachability — the distinction this check exists for.
    if (/__tests__|\.test\./.test(f)) continue;
    texts.set(f, fs.readFileSync(f, 'utf8'));
  }

  const orphans: string[] = [];
  for (const f of modules) {
    const base = path.basename(f).replace(/\.ts$/, '');
    // A barrel is imported by its DIRECTORY name, not "index".
    const needle = base === 'index' ? path.basename(path.dirname(f)) : base;
    const re = new RegExp(`from\\s+['"][^'"]*${esc(needle)}['"]`);
    let found = false;
    for (const [g, txt] of texts) {
      if (g === f) continue;
      if (!txt.includes(needle)) continue; // necessary condition — see the header
      if (re.test(txt)) { found = true; break; }
    }
    if (!found) orphans.push(path.relative(path.join(process.cwd(), 'lib/cad'), f).replace(/\\/g, '/'));
  }
  return orphans;
}

describe('every lib/cad module is reachable, or recorded', () => {
  it('scans a meaningful number of modules', () => {
    // Guards the guard: a walker returning [] would make the assertion below pass forever, which is
    // exactly how a structural check comes to defend nothing.
    const modules = walk(path.join(process.cwd(), 'lib/cad'),
      (n) => /\.ts$/.test(n) && !/\.d\.ts$/.test(n));
    expect(modules.length).toBeGreaterThan(200);
  });

  it('has no unreachable module that is not in the inventory', () => {
    const unexpected = findUnreachable().filter((m) => !(m in KNOWN_UNREACHABLE));
    expect(
      unexpected,
      'These lib/cad modules have no PRODUCTION importer — only tests, or nothing at all. '
      + 'A module with passing tests and no caller is this codebase\'s most frequent defect: every '
      + 'dead module found today had a green suite. Wire it, delete it, or add it to '
      + 'KNOWN_UNREACHABLE with the reason.',
    ).toEqual([]);
  });

  it('has no stale inventory entry', () => {
    // The other direction, and the one that rots quietly: an entry for a module that has since been
    // wired (or deleted) makes the list look like it is tracking something it is not.
    const actual = new Set(findUnreachable());
    const stale = Object.keys(KNOWN_UNREACHABLE).filter((m) => !actual.has(m));
    expect(stale, 'Listed as unreachable but now reachable (or gone) — remove from KNOWN_UNREACHABLE')
      .toEqual([]);
  });

  it('gives every inventory entry a real reason', () => {
    // "TODO" is not a reason. A list of names with no rationale is a list nobody can act on.
    for (const [mod, why] of Object.entries(KNOWN_UNREACHABLE)) {
      expect(why.length, mod).toBeGreaterThan(6);
    }
  });
});

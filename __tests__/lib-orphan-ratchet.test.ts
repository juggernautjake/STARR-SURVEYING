// A ratchet on unreachable modules across the whole of `lib/`.
//
// S18 added a reachability guard for `lib/cad` with a triaged, ten-entry inventory. Running the same
// sweep over ALL of `lib/` finds **44 modules with no production importer, out of 978** — the same
// defect that hid `diffFingerprints` in `lib/research/dom-fingerprint` until R10 wired it today.
//
// ── THE FIRST VERSION OF THIS FILE SAID 56, AND IT WAS WRONG ────────────────────────────────────
// It matched only `from '…path'`, so **bare side-effect imports were invisible to it**:
//
//     import '@/lib/hub/themes/register-builtins';   // registers every built-in theme
//     import './starr-default';                       // …which each register themselves
//
// That is a real and deliberate pattern — the registrar exists precisely so a consumer can pull the
// registry in with one side-effect import — and it made twelve live modules look dead: the eleven
// themes plus their registrar. The first version even flagged that cluster as "worth a look, either
// the registry is dead or themes register by a mechanism an import graph cannot see". **The second
// horn was right, and the mechanism was an import this file could not read.**
//
// Corrected within the hour, by investigating the cluster instead of leaving the question open. The
// lesson is the one this codebase keeps paying for: **a checker that is confidently wrong is worse
// than no checker**, and the way to find out is to take one of its answers and chase it.
//
// ── WHY A MEASURED LIST AND NOT A TRIAGED INVENTORY ─────────────────────────────────────────────
// Giving each of 44 modules a real reason means investigating 44 modules. Writing plausible
// sentences without doing that would be worse than writing nothing: it would turn an honest backlog
// into a list that LOOKS reviewed, and the rule this repo keeps relearning is that a reason nobody
// checked is not a reason. So this records exactly what was measured and leaves the triage as work.
//
// It stores the SET, not a count. A count would let a newly-dead module cancel out a newly-wired one
// and report no change — which is the failure mode of every metric that averages.
//
// ── THE LAST OPEN QUESTION, NOW ANSWERED ────────────────────────────────────────────────────────
// `research/prioritized-pipeline{,.service}.ts` were flagged as "worth checking whether the research
// guard covers them or misses them". **It covers them**, and with better reasons than this file
// could have invented:
//
//   > *PARKED: the prioritised run order is specified but the pipeline still runs its fixed stages.
//   >  Wiring it changes run behaviour and belongs with a plan slice, not a drive-by.*
//
// The guess embedded in the question was wrong in an instructive direction. `research-modules-are-
// reachable`'s `LIBRARY_DIRS` lists only `worker/src/*`, so it looked like `lib/research` was out of
// scope — but its `KNOWN_UNREACHABLE` map carries `lib/research/*` entries regardless. **Scanning
// scope and inventory scope are different things**, and reading only the first would have produced a
// confident "that guard misses them" that was false.
//
// So several entries in the list below are already triaged elsewhere. That overlap is deliberate and
// not worth deduplicating: this file's job is to notice a NEW orphan anywhere under `lib/`, and the
// research guard's job is to hold reasons for its own subsystem. Two lists that disagree would be a
// problem; two lists where one is a superset are not.
//
// ── WHAT THIS CANNOT SEE ────────────────────────────────────────────────────────────────────────
// Reachability by import is not the same as being exercised. `lib/finance/payment-cards` and
// `cost-recovery` are BOTH reachable — `tax-summary` imports them and the receipt panel calls that —
// and neither runs against real data, because the call site passes no card and no recovery. That is
// the "wired but never fed" failure the handoff records from R14, and no import graph will show it.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/** MEASURED 2026-08-04 — not triaged. See the header. It may shrink; it may not grow. */
const KNOWN_ORPHANS: readonly string[] = [
  'admin/legacy-redirects.ts',
  'cad/ai/mock-proposer.ts',
  'cad/ai-engine/index.ts',
  'cad/codes/index.ts',
  'cad/geo/texas-state-plane.ts',
  'cad/geometry/compound-curve.ts',
  'cad/geometry/spline-to-arc.ts',
  'cad/io/trv-bearings.ts',
  'cad/persistence/native-autosave.ts',
  'cad/platform/index.ts',
  'dnd/ai-scope.ts',
  'dnd/backgrounds/index.ts',
  'dnd/bestiary/ig-curation.ts',
  'dnd/bestiary/import-open5e.ts',
  'dnd/bestiary/import-pf2.ts',
  'dnd/stream-names-ai.ts',
  'dnd/systems/intuitive-games/creature-mechanics.ts',
  'dnd/theme-contrast.ts',
  'field-ingest/trimble-connect.ts',
  'hub/bundle-gating.ts',
  'hub/grid-resize.ts',
  'hub/performance-budget.ts',
  'hub/quick-actions-validator.ts',
  'hub/widget-refresh.ts',
  'learn/trigger-credential.ts',
  'payments/allocation-reports.ts',
  'payments/customer-snapshot.ts',
  'payments/rls-allowlist.ts',
  'payments/secrets.ts',
  'payouts/stripe-payout.ts',
  'research/document-segmentation.ts',
  'research/multi-source-confidence.ts',
  'research/place-county.ts',
  'research/prioritized-pipeline.service.ts',
  'research/prioritized-pipeline.ts',
  'research/self-heal-planner.ts',
  'research/spatial-filter.ts',
  'research/useResearchProgress.ts',
  'research/white-label.config.ts',
  'saas/api-bundle-gate.ts',
  'saas/notifications/prefs.ts',
  'saas/use-org-context.ts',
  'stardust/genesis/rng.ts',
];

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
const isModule = (n: string) => /\.ts$/.test(n) && !/\.d\.ts$/.test(n);

function findUnreachable(): string[] {
  const root = path.join(process.cwd(), 'lib');
  const modules = walk(root, isModule);

  const callerFiles: string[] = [];
  for (const r of ['lib', 'app', 'worker/src', 'scripts', 'mobile']) {
    walk(path.join(process.cwd(), r), (n) => /\.(ts|tsx|mjs|js)$/.test(n), callerFiles);
  }

  const texts = new Map<string, string>();
  for (const f of callerFiles) {
    // A test-only importer is not production reachability — the distinction this exists for.
    if (/__tests__|\.test\./.test(f)) continue;
    texts.set(f, fs.readFileSync(f, 'utf8'));
  }

  const orphans: string[] = [];
  for (const f of modules) {
    const base = path.basename(f).replace(/\.ts$/, '');
    // A barrel is imported by its DIRECTORY name, not "index".
    const needle = base === 'index' ? path.basename(path.dirname(f)) : base;
    const re = new RegExp(`(?:from|import)\\s+['"][^'"]*${esc(needle)}['"]`);
    let found = false;
    for (const [g, txt] of texts) {
      if (g === f) continue;
      // Necessary condition, not a heuristic: the import path contains the basename literally, so a
      // file without that substring cannot match. Same prefilter that took the research version of
      // this check from 3,856 ms to 860 ms with identical answers.
      if (!txt.includes(needle)) continue;
      if (re.test(txt)) { found = true; break; }
    }
    if (!found) orphans.push(path.relative(root, f).replace(/\\/g, '/'));
  }
  return orphans;
}

describe('THE RATCHET — unreachable modules across lib/', () => {
  it('scans a meaningful number of modules', () => {
    // Guards the guard: a walker returning [] would make every assertion below pass forever.
    expect(walk(path.join(process.cwd(), 'lib'), isModule).length).toBeGreaterThan(800);
  });

  it('gains no NEW unreachable module', () => {
    const known = new Set(KNOWN_ORPHANS);
    const added = findUnreachable().filter((m) => !known.has(m));
    expect(
      added,
      'New module(s) under lib/ with no PRODUCTION importer. A module imported only by its own test '
      + 'is not reachable — every dead module found on 2026-08-04 had a green suite. Wire it, delete '
      + 'it, or add it to KNOWN_ORPHANS.',
    ).toEqual([]);
  });

  it('never grows the total', () => {
    // Belt and braces with the check above: that one catches a new PATH, this one catches the set
    // getting bigger by any route at all.
    expect(findUnreachable().length).toBeLessThanOrEqual(KNOWN_ORPHANS.length);
  });
});

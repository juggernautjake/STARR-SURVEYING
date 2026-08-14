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

/** MEASURED 2026-08-04 — mostly not triaged. See the header. It may shrink; it may not grow.
 *
 *  TRIAGED SO FAR (reasons live with the subsystem that owns them, not here):
 *
 *    · the five `payments/*` and `payouts/*` entries — FINANCE_TAX_AND_INTAKE_2026-08-04.md §F8.
 *      Two are legitimate (documentation-as-code; a deliberately gated feature), two are unreached
 *      because the feature they serve has no data or was superseded by the UI, and one —
 *      `payments/allocation-reports.ts` — is a SECOND answer to "what revenue did we make", reading
 *      a different table from the wired `lib/reports/revenue-periods.ts`. That one is an owner
 *      question, not a refactor.
 *
 *  Reasons are deliberately NOT inlined here. This list's job is to notice a new orphan anywhere
 *  under `lib/`; a paragraph per entry would make it unreadable, and a one-line reason for a module
 *  nobody investigated is exactly the "list that LOOKS reviewed" the header warns against. */
const KNOWN_ORPHANS: readonly string[] = [
  'admin/legacy-redirects.ts',
  'cad/ai/mock-proposer.ts',
  'cad/ai-engine/index.ts',
  'cad/codes/index.ts',
  'cad/geometry/compound-curve.ts',
  'cad/geometry/spline-to-arc.ts',
  'cad/persistence/native-autosave.ts',
  'cad/platform/index.ts',
  // Added 2026-08-14 when the needle was tightened to a path SEGMENT (see `re` below). It is a
  // barrel re-exporting nine style modules, and every consumer imports those modules directly —
  // `@/lib/cad/styles/default-layers`, `.../symbol-library`, and so on. Genuinely unimported, and
  // hidden until now by a regex that counted any specifier merely ending in `styles`. Alongside
  // `cad/codes/index.ts` and `cad/platform/index.ts`, which are the same shape.
  'cad/styles/index.ts',
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
    // ── THE NEEDLE IS A PATH SEGMENT, NOT A SUFFIX (fixed 2026-08-14) ──────────────────────────
    //
    // This was `['"][^'"]*needle['"]`, which matches any specifier ENDING in the basename — so
    // `from './job-prefs'` counted as an import of `saas/notifications/prefs.ts`, and the ratchet
    // reported a module as newly wired that nothing had touched. It found the first genuine
    // collision the day a file called `job-prefs.ts` was added; before that the bug was invisible.
    //
    // Exactly the failure its own header warns about — "a checker that is confidently wrong is
    // worse than no checker" — and it fails in the dangerous direction: a false POSITIVE here marks
    // a dead module as live, which is the thing this file exists to notice.
    //
    // `(?:[^'"]*\/)?` requires the needle to be the whole last segment, so `./prefs`,
    // `@/lib/saas/notifications/prefs` and `../../prefs` all match and `./job-prefs` does not.
    const re = new RegExp(`(?:from|import)\\s+['"](?:[^'"]*\\/)?${esc(needle)}['"]`);
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

/**
 * The scan, computed once.
 *
 * It reads every module under `lib/` and every text in the repo, and it costs ~7.5 s. Three of the
 * tests below called `findUnreachable()` separately, so the file paid that three times — fine on its
 * own (23 s), and a timeout at 20 s when the whole suite is running and 1,600 files are competing
 * for the same cores. It failed as *"Test timed out"*, not as an assertion, which is the tell: the
 * answer was never wrong, there was just never time to finish computing it.
 *
 * A flaky ratchet is worse than a slow one — it is the check people learn to re-run rather than read.
 * The result is pure with respect to the working tree, so caching it changes nothing except that the
 * work happens once.
 */
let cachedUnreachable: string[] | null = null;
const unreachable = (): string[] => (cachedUnreachable ??= findUnreachable());

describe('THE RATCHET — unreachable modules across lib/', () => {
  it('scans a meaningful number of modules', () => {
    // Guards the guard: a walker returning [] would make every assertion below pass forever.
    expect(walk(path.join(process.cwd(), 'lib'), isModule).length).toBeGreaterThan(800);
  });

  it('gains no NEW unreachable module', () => {
    const known = new Set(KNOWN_ORPHANS);
    const added = unreachable().filter((m) => !known.has(m));
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
    expect(unreachable().length).toBeLessThanOrEqual(KNOWN_ORPHANS.length);
  });

  it('lists no module that has since been WIRED', () => {
    // The other half, and the one that had actually gone wrong. `cad/geo/texas-state-plane.ts` sat in
    // this list after S16b wired it into all four exporters, and every existing check was blind to
    // it: it is not new, and its file still exists.
    //
    // A wired module left on the list is worse than untidy. `never grows the total` compares against
    // `KNOWN_ORPHANS.length`, so each stale entry silently buys headroom for one genuinely dead
    // module to appear without failing anything. The allowance has to shrink as the work lands.
    //
    // `cad-modules-are-reachable` has always had this check; this file was written without it.
    const stillDead = new Set(unreachable());
    const wired = KNOWN_ORPHANS
      .filter((m) => fs.existsSync(path.join(process.cwd(), 'lib', m)))
      .filter((m) => !stillDead.has(m));
    expect(
      wired,
      wired.length
        ? `These are listed as unreachable but now have a production importer. Remove them — every ` +
          `stale entry raises the allowance in "never grows the total" by one:\n  ${wired.join('\n  ')}`
        : undefined,
    ).toEqual([]);
  });

  it('lists no module that has since been deleted', () => {
    // Added 2026-08-04 (S4c) after this ratchet went on passing with `cad/io/trv-bearings.ts` in its
    // list for a file that had just been removed. Every other check here asks "is anything NEW
    // unreachable", and a deleted entry is invisible to all of them: the file cannot appear in
    // `findUnreachable()`, so it silently pads the allowance instead — each stale entry buying room
    // for one real orphan to slip in under `never grows the total`.
    //
    // Same check `cad-modules-are-reachable` and `no-orphan-modules` already carry. This one was
    // written without it, and the gap only showed when an entry was finally retired.
    const gone = KNOWN_ORPHANS.filter(
      (m) => !fs.existsSync(path.join(process.cwd(), 'lib', m)),
    );
    expect(
      gone,
      gone.length
        ? `KNOWN_ORPHANS names ${gone.length} file(s) that no longer exist. Remove them — a stale ` +
          `entry raises the allowance in "never grows the total" without protecting anything:\n  ` +
          gone.join('\n  ')
        : undefined,
    ).toEqual([]);
  });
});

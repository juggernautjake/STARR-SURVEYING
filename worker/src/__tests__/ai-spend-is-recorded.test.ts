// R4 — every AI call site must price through `infra/usage`, or be a recorded exception.
//
// WHY THIS IS A CORRECTNESS CHECK AND NOT TELEMETRY HYGIENE. R5's run budget enforces a spend
// ceiling, and it reads `spendForRun(projectId)` — which sums only what `recordUsage` wrote. A call
// site that talks to Anthropic without reporting tokens is therefore invisible to the ceiling, so a
// run can pass every budget check and still overspend. The failure is silent, it costs real money,
// and it gets worse in exactly the direction nobody watches: the more work the unmigrated paths do,
// the further the ceiling drifts from the invoice.
//
// R4's note said "21 files still to migrate". Measured here it is 14 — and the first measurement I
// took said 20, because the probe only looked for a direct `infra/usage` import and missed the nine
// Bell analyzers that route through `ai-cost-helpers.ts`, which forwards to it. Widening the probe
// before believing it is the standing rule in this repo, and it moved the answer twice.
//
// This file does not perform the migration. It stops the hole growing while the migration proceeds,
// the same shape as `research-modules-are-reachable`'s KNOWN_UNREACHABLE inventory: a new offender
// fails immediately, and an entry that DID get migrated fails too, so the list cannot quietly become
// a permanent excuse.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const WORKER = path.join(process.cwd());
const SRC = path.join(WORKER, 'src');

/** A file counts as reporting spend if it reaches `infra/usage` directly OR through
 *  `ai-cost-helpers`, which wraps `recordAiCall`. Checking only the former is the mistake that made
 *  this list 20 instead of 14. */
const REPORTS_SPEND = /infra\/usage|ai-cost-helpers|recordUsage|recordAiCall|recordAiUsage/;

/** Call sites that construct their own Anthropic client and do NOT price through the one module.
 *
 *  Each is money the run budget cannot see. Listed rather than tolerated so the count is a number
 *  someone can watch go down; remove an entry when it is migrated — the stale-entry test below
 *  requires it. */
const UNMIGRATED: Record<string, string> = {
  // ── The blocker is projectId, not R6 ─────────────────────────────────────────────────────────
  // Every reason below used to read "same R6 pass" — migrate alongside the cheap-first rewrite so
  // the file is not touched twice. **R6 shipped 2026-08-02**, two days BEFORE that note was written,
  // and it had already passed through `address-normalizer` and `bis-cad` (both call `modelFor`)
  // without adding usage recording. So the pairing plan had already failed on the two files R6
  // actually reached, and the other ten were waiting for something that had happened.
  //
  // The real blocker, measured 2026-08-04: **none of these has `projectId` in scope.** 17 call sites
  // across 9 files each need it threaded from a caller, sometimes several hops up. That is genuine
  // work rather than a drive-by — and it is the honest reason. A stale one turns this map into
  // exactly the permanent excuse the header above warns about.
  //
  // A run-scoped global was considered and rejected: `currentRunningRuns()` returns a LIST and the
  // job queue runs `concurrency: 3`, so a module-level "current run" would file one run's spend
  // against another — a silent misattribution, which is the failure this whole file exists to stop.
  // `AsyncLocalStorage` is correct under concurrency and is the likely shape of the fix.
  'src/counties/bell/analyzers/site-intelligence.ts': 'Bell site intelligence. Needs projectId threaded from the Bell pipeline.',
  'src/counties/bell/reports/survey-plan-generator.ts': 'Survey plan generation. Needs projectId threaded.',
  'src/counties/bell/scrapers/map-screenshot-capture.ts': 'Vision call on a map screenshot. Needs projectId threaded.',
  'src/services/ai-extraction.ts': 'Generic field extraction — FIVE call sites, the largest single job on this list.',
  'src/services/bis-cad.ts': 'BIS/CAD interpretation. R6 already routed it (modelFor) without adding usage.',
  'src/services/geo-reconcile.ts': 'Geometry reconciliation — three call sites.',
  'src/services/receipt-extraction.ts': 'NOT a research-run call at all: it runs from a CLI batch over queued RECEIPTS and has no project to attribute to. Its cost is real but it is not run spend, so migrating it as-is would file finance work against a research ceiling. Needs its own key, or an explicit exemption.',
  'src/services/subdivision-lot-isolator.ts': 'Lot isolation — two call sites.',
};

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== 'node_modules') walk(p, out); continue; }
    if (p.endsWith('.ts') && !p.includes('__tests__')) out.push(p);
  }
  return out;
}

const rel = (abs: string) => path.relative(WORKER, abs).replace(/\\/g, '/');

/** Files that build their own Anthropic client. */
const callSites = walk(SRC)
  .filter((f) => /new Anthropic\s*\(/.test(fs.readFileSync(f, 'utf8')))
  .map(rel);

const reportsSpend = (relPath: string) =>
  REPORTS_SPEND.test(fs.readFileSync(path.join(WORKER, relPath), 'utf8'));

describe('the sweep is looking at something', () => {
  it('finds the AI call sites at all', () => {
    // A sweep that matched nothing would pass forever while the ceiling drifted.
    expect(callSites.length).toBeGreaterThan(10);
  });

  it('finds call sites that DO report, so the predicate is not just always-false', () => {
    expect(callSites.filter(reportsSpend).length).toBeGreaterThan(0);
  });
});

describe('spend the budget cannot see', () => {
  it('has no unrecorded AI call site that is not a recorded exception', () => {
    const offenders = callSites.filter((f) => !reportsSpend(f) && !(f in UNMIGRATED));
    expect(offenders, offenders.length
      ? 'These construct an Anthropic client without pricing through infra/usage, so R5\'s spend\n'
        + 'ceiling cannot see them and a run can overspend silently. Route them through the usage\n'
        + `helper, or add them to UNMIGRATED with a reason:\n  ${offenders.join('\n  ')}`
      : '').toEqual([]);
  });

  it('has no stale entry — a file on the list that DID get migrated', () => {
    // An inventory nobody prunes stops being read, and the count stops meaning anything.
    const stale = Object.keys(UNMIGRATED)
      .filter((f) => fs.existsSync(path.join(WORKER, f)))
      .filter(reportsSpend);
    expect(stale, stale.length
      ? `These now report spend — remove them from UNMIGRATED:\n  ${stale.join('\n  ')}`
      : '').toEqual([]);
  });

  it('has no entry for a file that no longer exists', () => {
    const gone = Object.keys(UNMIGRATED).filter((f) => !fs.existsSync(path.join(WORKER, f)));
    expect(gone, gone.length ? `Deleted files still listed:\n  ${gone.join('\n  ')}` : '').toEqual([]);
  });

  it('gives every exception a real reason', () => {
    const empty = Object.entries(UNMIGRATED).filter(([, why]) => why.trim().length < 25).map(([f]) => f);
    expect(empty, 'An exception without a reason is the defect wearing a permission slip').toEqual([]);
  });

  it('does not let the backlog grow past where it stands today', () => {
    // The ratchet. R4's own note claimed 21; the measured figure was 14, and the deed and plat
    // analyzers came off on 2026-08-04, then ai-context-analyzer, adaptive-vision, address-normalizer and property-validation-pipeline via the ambient run, so it is 8.
    //
    // **Tightened when the count drops, not just when it rises.** Left at 14 it would have allowed
    // two new unrecorded call sites to appear and still pass — a ratchet that does not follow the
    // work down is a ceiling, and this one exists precisely because an unwatched ceiling drifts.
    expect(Object.keys(UNMIGRATED).length).toBeLessThanOrEqual(8);
  });
});

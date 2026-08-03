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
  'src/counties/bell/analyzers/site-intelligence.ts': 'Bell site intelligence — R6 rewrites this call site for cheap-first routing; migrating both at once avoids touching the file twice.',
  'src/counties/bell/reports/survey-plan-generator.ts': 'Generates the survey plan; same R6 pass.',
  'src/counties/bell/scrapers/map-screenshot-capture.ts': 'Vision call on a map screenshot; same R6 pass.',
  'src/services/adaptive-vision.ts': 'Vision fallback ladder; same R6 pass.',
  'src/services/address-normalizer.ts': 'Cheap classification — the clearest cheap-first candidate, so R6 owns it.',
  'src/services/ai-context-analyzer.ts': 'Context synthesis; same R6 pass.',
  'src/services/ai-deed-analyzer.ts': 'Deed reading — one of the largest token consumers here, so its absence skews the ceiling most.',
  'src/services/ai-extraction.ts': 'Generic field extraction; same R6 pass.',
  'src/services/ai-plat-analyzer.ts': 'Plat reading — large prompts, same skew as the deed analyzer.',
  'src/services/bis-cad.ts': 'BIS/CAD interpretation; same R6 pass.',
  'src/services/geo-reconcile.ts': 'Geometry reconciliation; same R6 pass.',
  'src/services/property-validation-pipeline.ts': 'Validation pass; same R6 pass.',
  'src/services/receipt-extraction.ts': 'Receipt OCR post-processing; same R6 pass.',
  'src/services/subdivision-lot-isolator.ts': 'Lot isolation; same R6 pass.',
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
    // The ratchet. R4's own note claimed 21; the measured figure is 14. It may go down and must not
    // go up — a new unrecorded call site is new money the ceiling cannot see.
    expect(Object.keys(UNMIGRATED).length).toBeLessThanOrEqual(14);
  });
});

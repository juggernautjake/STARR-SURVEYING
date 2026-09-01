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
// ── HOISTED FROM INSIDE THE TESTS, BECAUSE THE TIMEOUT WAS THE IMPORT ────────────────────────────
//
// The last two tests each did `await import('../infra/usage.js')` in their own body. Alone that
// costs ~780ms; inside the full worker suite it reached **5,028ms** and tripped vitest's 5s default,
// so the suite failed with the machine under load and passed with it idle. A test that depends on
// how busy the laptop is will eventually fail in CI and be re-run until it goes green, which is how
// a real failure gets dismissed as "just the flaky one".
//
// The dynamic form was buying nothing. There is no `vi.mock`, no `vi.resetModules` and no
// `beforeEach` in this file, so both calls resolved the SAME cached module instance — the isolation
// a dynamic import usually provides was never there. The second test already calls `resetRunSpend`
// explicitly to get its clean state, which is the honest way to do it and is unaffected.
//
// Static, so the module graph is transformed once at load rather than inside a timed assertion.
import {
  opsAccountingKey, isOpsAccountingKey, recordOpsAiCall, spendForRun, resetRunSpend,
} from '../infra/usage.js';

const WORKER = path.join(process.cwd());
const SRC = path.join(WORKER, 'src');

/** A file counts as reporting spend if it reaches `infra/usage` directly OR through
 *  `ai-cost-helpers`, which wraps `recordAiCall`. Checking only the former is the mistake that made
 *  this list 20 instead of 14. */
const REPORTS_SPEND = /infra\/usage|ai-cost-helpers|recordUsage|recordAiCall|recordAiUsage|recordAmbientAiCall|recordOpsAiCall/;

/**
 * Comments removed before the predicate runs — and this is not tidiness.
 *
 * **Found by a negative control that failed to fire, 2026-08-04.** Migrating the last call site, I
 * deleted its `import … from '../infra/usage.js'` to prove the ratchet would catch the regression.
 * Nine tests stayed green. The file still contained the words `infra/usage` **in a comment I had
 * just written**, and the predicate is a text search.
 *
 * So for the length of that check, this guard would have credited any file that merely *mentioned*
 * the usage module — including one whose only mention was a note explaining that it does not use it.
 * A guard satisfied by prose is the exact defect guards exist to catch, and the only reason it
 * surfaced is that the control was run and then verified instead of assumed.
 */
function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

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
  // ── EMPTY, 2026-08-04 ────────────────────────────────────────────────────────────────────────
  // The last entry was `receipt-extraction.ts`, and its reason was correct rather than an excuse:
  // a CLI batch over queued receipts, with no research run to attribute to. Migrating it as-is
  // would have filed finance work against a research ceiling.
  //
  // It is closed by giving it what the reason asked for — `recordOpsAiCall` and an `ops:` accounting
  // key, which cannot collide with a project UUID and therefore cannot reach a run's ceiling, and
  // which carries SYSTEM_ACTOR so it cannot reach a customer's bill either.
  //
  // Keep this map. It is not decoration: the tests below fail the moment a new unrecorded call site
  // appears, and an empty inventory is the only state in which the ceiling and the invoice agree.
  //
  // ── NOT EMPTY AFTER ALL, 2026-08-04 ──────────────────────────────────────────────────────────
  //
  // The note above was wrong, and the guard that should have caught it was the reason it survived.
  //
  // Six Bell analyzers accumulate a usage summary, return it in their report, and the orchestrator
  // rolls it up for display. **Nothing ever wrote it to `research_usage_events`.** `recordAiUsage`
  // — the one function whose entire job is that write — was defined in `ai-cost-helpers.ts` and
  // called from nowhere at all.
  //
  // They passed anyway because `REPORTS_SPEND` is a text search and they import `ai-cost-helpers`.
  // Importing a recorder is not calling one. So the inventory read "empty" while the heaviest AI
  // work in the platform was invisible to R5's ceiling — a run could pass every budget check and
  // overspend, which is precisely the failure this file exists to prevent.
  //
  // ── ALL SIX MIGRATED, 2026-08-04 ─────────────────────────────────────────────────────────────
  //
  // The four reasons written above were themselves wrong, and measuring beat every one of them:
  //
  //   • "two hops", "invoked from three places", "dynamically imported with no projectId" — all four
  //     are called from exactly ONE place, `counties/bell/orchestrator.ts`, where `input.projectId`
  //     is already in scope. One hop, not two or three.
  //   • "needs a run-scoped accumulator" — `document-relevance-validator` has an accumulator; it
  //     calls `zeroUsage()` and `accumulateUsage()` on every document.
  //
  // The reasons were plausible and none of them survived opening the files. That is the same
  // failure as the empty inventory itself: a status believed instead of checked. Written down here
  // because the next person to add an entry should know how cheap it is to be wrong about one.
  //
  // Five record once per run (exact, since each uses a single `modelFor()` task); `lot-correlator`
  // records at the call, because it has no accumulator and two return paths.
  //
  // Keep this map. It is not decoration: the tests below fail the moment a new unrecorded call site
  // appears, and an empty inventory is the only state in which the ceiling and the invoice agree.
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

/**
 * Files that talk to the model — by constructing a client **or** by invoking one.
 *
 * ── WHY BOTH, ADDED 2026-08-04 ────────────────────────────────────────────────────────────────
 *
 * This swept `new Anthropic(` alone. Measured today, every file that invokes the model also
 * constructs one, so the population happened to be complete — but nothing made that true and
 * nothing would have noticed when it stopped being true.
 *
 * The moment somebody extracts a shared client module (the obvious next refactor: one place for the
 * API key, retries and timeouts), every caller invoking it stops constructing one. The sweep would
 * go blind, this file would stay green, and R5's ceiling would silently under-count again — the
 * exact failure this test exists to prevent, reintroduced by a tidy-up.
 *
 * Matching invocation as well means the check survives that refactor.
 */
const callSites = walk(SRC)
  .filter((f) => {
    const c = code(fs.readFileSync(f, 'utf8'));
    return /new Anthropic\s*\(/.test(c) || /\.messages\.(create|stream)\s*\(/.test(c);
  })
  .map(rel);

const reportsSpend = (relPath: string) =>
  REPORTS_SPEND.test(code(fs.readFileSync(path.join(WORKER, relPath), 'utf8')));

/**
 * Does the file actually CALL a recorder, rather than merely import one?
 *
 * `REPORTS_SPEND` is a text search, so an import left behind by a refactor satisfies it while the
 * call it used to serve is gone. That is a file reporting no spend and testing as though it does.
 */
const RECORDER_CALL = /\brecord(AiCall|Usage|AiUsage|AmbientAiCall|OpsAiCall)\s*\(/;
const callsRecorder = (relPath: string) =>
  RECORDER_CALL.test(code(fs.readFileSync(path.join(WORKER, relPath), 'utf8')));

describe('the sweep is looking at something', () => {
  it('finds the AI call sites at all', () => {
    // A sweep that matched nothing would pass forever while the ceiling drifted.
    expect(callSites.length).toBeGreaterThan(10);
  });

  it('finds call sites that DO report, so the predicate is not just always-false', () => {
    expect(callSites.filter(reportsSpend).length).toBeGreaterThan(0);
  });

  it('is NOT satisfied by a file that only mentions the usage module in a comment', () => {
    // The bug this file had until 2026-08-04, found by a negative control that reported false green:
    // the predicate is a text search, and prose counts as text. A file whose only reference to
    // `infra/usage` was a comment saying it does not use it was credited as migrated.
    const proseOnly = `
      // This file deliberately does NOT go through infra/usage — see recordAiCall.
      /* recordUsage lives elsewhere. */
      const client = new Anthropic({ apiKey });
    `;
    expect(REPORTS_SPEND.test(proseOnly)).toBe(true);        // …the raw text does match,
    expect(REPORTS_SPEND.test(code(proseOnly))).toBe(false); // …and stripping comments is what saves it.
  });

  it('still sees a real import after comments are stripped', () => {
    // The other direction: a comment-stripper that ate too much would mark every migrated file as an
    // offender, which fails loudly — but it would also be "fixed" by widening the exception list.
    const real = `import { recordOpsAiCall } from '../infra/usage.js';\nconst c = new Anthropic({});`;
    expect(REPORTS_SPEND.test(code(real))).toBe(true);
    expect(/new Anthropic\s*\(/.test(code(real))).toBe(true);
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

  it('every call site that claims to report spend actually invokes a recorder', () => {
    // An import is not a call. A refactor that removes the last `recordAiCall(...)` but leaves the
    // import line behind would keep this file green while the ceiling stopped seeing that path.
    const importOnly = callSites
      .filter((f) => !(f in UNMIGRATED))
      .filter(reportsSpend)
      .filter((f) => !callsRecorder(f));

    expect(importOnly, importOnly.length
      ? 'These import the usage module but never call a recorder, so they report no spend while\n'
        + `testing as though they do:\n  ${importOnly.join('\n  ')}`
      : '').toEqual([]);
  });

  it('the invocation sweep is not vacuous', () => {
    // The widening above is only worth anything if it matches. A control, because a broader pattern
    // that happens to match nothing looks identical to one that is doing its job.
    const invokers = callSites.filter((f) =>
      /\.messages\.(create|stream)\s*\(/.test(code(fs.readFileSync(path.join(WORKER, f), 'utf8'))));
    expect(invokers.length).toBeGreaterThan(10);
  });

  it('the orchestrator threads projectId into the analyzers that record', () => {
    // `projectId` is optional on those inputs — correctly, since not every caller has a run — so
    // deleting it from a call site still compiles, still passes every other test here, and silently
    // turns the recording back off. The analyzer would go on accumulating a summary nobody writes,
    // which is the exact state this whole slice was fixing.
    //
    // Found because the negative control for this thread did NOT fire: the two recorder guards above
    // caught their breaks and this one sailed through.
    const orch = code(fs.readFileSync(path.join(SRC, 'counties/bell/orchestrator.ts'), 'utf8'));

    // Every analyzer that records. Adding one here is cheaper than discovering months later that a
    // call site quietly stopped passing it.
    const RECORDING_ANALYZERS = [
      'analyzeBellDeeds',
      'analyzeBellPlats',
      'analyzeGisScreenshotQuality',
      'correlateTargetLot',
      'validateDeedRelevance',
      'classifyScreenshots',
    ];

    for (const fn of RECORDING_ANALYZERS) {
      const calls = orch.split(`${fn}(`).slice(1);
      expect(calls.length, `${fn} is no longer called from the orchestrator`).toBeGreaterThan(0);
      for (const [i, call] of calls.entries()) {
        expect(
          call.slice(0, 500),
          `${fn} call #${i + 1} does not pass projectId — its AI spend will not reach the ceiling`,
        ).toContain('projectId');
      }
    }
  });

  it('has no stale entry — a file on the list that DID get migrated', () => {
    // An inventory nobody prunes stops being read, and the count stops meaning anything.
    //
    // Uses `callsRecorder`, not `reportsSpend`. The weak predicate is satisfied by an import, and
    // every file on this list imports `ai-cost-helpers` — that is exactly how they came to be
    // credited as migrated while recording nothing. Checking migration with the same predicate that
    // was fooled would prune the list of the files that most need to be on it.
    const stale = Object.keys(UNMIGRATED)
      .filter((f) => fs.existsSync(path.join(WORKER, f)))
      .filter(callsRecorder);
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
    // The ratchet. R4's own note claimed 21; the measured figure was 14, then 0 — and 0 was wrong.
    //
    // ── RAISED 0 → 4, AND WHY THAT IS NOT A REGRESSION ────────────────────────────────────────
    //
    // Nothing was un-migrated. The backlog was never 0: six Bell analyzers had been counted as
    // migrated because they IMPORT `ai-cost-helpers`, while `recordAiUsage` — the only function in
    // that module which writes anything — had no callers anywhere in the repository. Their spend
    // was accumulated, displayed in the report, and never persisted.
    //
    // Two of the six are genuinely migrated now. The other four are listed with the specific reason
    // each is hard, so this number counts real work remaining instead of describing a hole nobody
    // had looked into. A ratchet whose measurement is wrong is worse than no ratchet: it reports
    // completion.
    //
    // **Tightened when the count drops, not just when it rises** — a ratchet that does not follow
    // the work down is a ceiling, and this one exists precisely because an unwatched ceiling drifts.
    // Back to 0 — and this time the number was arrived at by opening every file rather than by
    // trusting a predicate that counted imports.
    expect(Object.keys(UNMIGRATED).length).toBeLessThanOrEqual(0);
  });
});

describe('ops spend is recorded WITHOUT becoming run spend', () => {
  // The property that let the last entry close. If an ops key could pass for a project id, the fix
  // would be worse than the gap it closed: a receipt batch would quietly eat a customer's research
  // budget, and R5 would stop a run for money the run never spent.
  it('an ops key can never be mistaken for a research project id', async () => {

    const key = opsAccountingKey('receipt-extraction');
    expect(isOpsAccountingKey(key)).toBe(true);
    // A project id is a UUID; nothing about it can start with the ops prefix.
    expect(isOpsAccountingKey('4d1f2b7a-9c3e-4a5b-8d6f-0e1a2b3c4d5e')).toBe(false);
    expect(key).not.toMatch(/^[0-9a-f]{8}-/i);
  });

  it('does not add ops spend to a run ceiling', async () => {

    const project = '4d1f2b7a-9c3e-4a5b-8d6f-0e1a2b3c4d5e';
    resetRunSpend(project);
    await recordOpsAiCall('receipt-extraction', 'claude-sonnet-4-5', { input: 100_000, output: 10_000 });
    // The run has spent nothing, because nothing was spent on the run.
    expect(spendForRun(project)).toBe(0);
    // …and the cost is not lost: it accumulated under its own key.
    expect(spendForRun(opsAccountingKey('receipt-extraction'))).toBeGreaterThan(0);
  });
});

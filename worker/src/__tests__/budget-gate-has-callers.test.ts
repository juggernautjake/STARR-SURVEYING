import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { startRun, checkBudget, reasonText, endRun, DEFAULT_LIMITS } from '../infra/run-budget.js';
import { withStepDeadline } from '../research/budget-gate.js';

// ── $29.19 AGAINST A $2.00 CAP ──────────────────────────────────────────────────────────────────
//
// Measured 2026-09-03. A Bell County run: limits {maxCostUsd: 2, maxWallClockMs: 1500000}, actual
// cost $29.19 over 163 minutes. Fourteen times the money, six times the clock.
//
// Not because the ceilings were wrong and not because the check was missing. `checkBudget` and
// `mayRun` were both written, tested and documented — and `mayRun`, whose doc comment reads
// "callers ask mayRun(...) before starting expensive work", had ZERO callers. `checkBudget` had two,
// both in index.ts, both outside the county pipelines. Grepping src/counties/ for any budget call
// returned nothing.
//
// The guard existed. Nothing asked it.

const ROOT = path.join(__dirname, '..', '..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const code = (p: string) => {
  const raw = read(p);
  const stripped = raw.replace(/^[ \t]*\/\*[\s\S]*?\*\//gm, '').replace(/^[ \t]*\/\/[^\n\r]*/gm, '');
  if (!stripped.includes('import')) throw new Error(`comment stripping destroyed ${p}`);
  return stripped;
};

describe('the wind-down message names the LIMIT, not the elapsed time', () => {
  it('THE DEFECT: a 163-minute run must not report "its 163-minute limit"', () => {
    // The owner's screen said "Finished early because the run reached its 149-minute time limit"
    // beside another line saying "its 25-minute time limit", for a run whose limit was 25 and whose
    // duration was 163. Two numbers, neither of them the limit.
    const p = 'proj-limit';
    startRun(p, { ...DEFAULT_LIMITS, maxWallClockMs: 25 * 60_000 }, 0);
    const status = checkBudget(p, 0, 163 * 60_000);
    expect(status.exceeded).toBe('wall_clock');

    const text = reasonText('wall_clock', status);
    expect(text, 'the message still reports elapsed time as the limit').toContain('25-minute time limit');
    expect(text, 'and it should still say how long it actually ran').toContain('163 minutes elapsed');
    endRun(p);
  });

  it('the cost message names the ceiling and the spend', () => {
    const p = 'proj-cost';
    startRun(p, { ...DEFAULT_LIMITS, maxCostUsd: 2 }, 0);
    const status = checkBudget(p, 29.19, 1000);
    expect(status.exceeded).toBe('cost');
    const text = reasonText('cost', status);
    expect(text).toContain('$2.00 spending limit');
    expect(text).toContain('$29.19 spent');
    endRun(p);
  });

  it('the status carries the limits at all — it could not name them before', () => {
    const p = 'proj-carries';
    startRun(p, { ...DEFAULT_LIMITS, maxCostUsd: 2, maxWallClockMs: 1500000 }, 0);
    const s = checkBudget(p, 0, 0);
    expect(s.limitUsd).toBe(2);
    expect(s.limitMs).toBe(1500000);
    endRun(p);
  });

  it('CONTROL: an unbudgeted run is not an over-budget one', () => {
    // Refusing work because nobody set a limit would break the Testing Lab, the CLI and every
    // ad-hoc call. `ok: true` with infinite limits is the right answer, not a refusal.
    const s = checkBudget('never-registered', 999, Date.now());
    expect(s.ok).toBe(true);
    expect(s.limitUsd).toBe(Infinity);
  });
});

describe('the gate is actually asked — assert the CALLERS', () => {
  it('CONTROL: stripping kept the code and dropped the prose', () => {
    const src = code('src/counties/bell/orchestrator.ts');
    expect(src).toContain('scrapeBellClerk');
    expect(src).not.toContain('163 minutes');
  });

  it('the Bell orchestrator asks before the clerk search — the step that took 163 minutes', () => {
    const src = code('src/counties/bell/orchestrator.ts');
    expect(src).toContain("mayStep('clerk deed search')");
    // Guarding the BLOCK, not just the assignment: everything after it reads `clerk.*`, and the
    // compiler said so when the assignment alone was made conditional.
    expect(src).toMatch(/if \(mayClerk\) try \{/);
  });

  it('and before the plat search', () => {
    const src = code('src/counties/bell/orchestrator.ts');
    expect(src).toContain("mayStep('plat search')");
    expect(src).toMatch(/if \(mayPlats\) try \{/);
  });

  it('the Bell orchestrator imports the gate at all', () => {
    // Before this slice, `src/counties/` contained no budget call of any kind.
    expect(code('src/counties/bell/orchestrator.ts')).toContain("from '../../research/budget-gate.js'");
  });

  it('a skipped step is REPORTED, not silent', () => {
    // A phase skipped silently is indistinguishable from a phase that ran and found nothing.
    const src = code('src/counties/bell/orchestrator.ts');
    expect(src).toMatch(/progress\('Budget'/);
  });

  it('the generic pipeline asks before each clerk owner search, and bounds it (A2)', () => {
    const src = code('src/services/pipeline.ts');
    // The call sites, not `await searchClerkRecords(` — since 2026-09-03 each search is passed to
    // `withStepDeadline` as a thunk, so the await moved to the wrapper. Counting the await made
    // this guard read "0 clerk searches" the moment the searches were bounded.
    const calls = (src.match(/searchClerkRecords\(input\.county/g) ?? []).length;
    const guarded = (src.match(/mayStart\(input\.projectId, 'clerk owner search'\)/g) ?? []).length;
    const bounded = (src.match(/withStepDeadline\(input\.projectId, 'clerk owner search'/g) ?? []).length;
    expect(calls, 'the probe found no clerk owner searches at all').toBeGreaterThan(0);
    expect(guarded, `${calls} clerk searches, ${guarded} guarded`).toBe(calls);
    expect(bounded, `${calls} clerk searches, ${bounded} bounded by the run's remaining time`).toBe(calls);
  });

  it('mayRun finally has a caller', () => {
    // The whole point. Its own doc comment has said "callers ask mayRun(...)" since it was written.
    expect(code('src/research/budget-gate.ts')).toContain('mayRun(projectId, step, spendForRun(projectId))');
    const gateUsers = ['src/counties/bell/orchestrator.ts', 'src/services/pipeline.ts']
      .filter((f) => code(f).includes('budget-gate.js'));
    expect(gateUsers.length, 'the gate has no callers, which is where this started').toBe(2);
  });
});

// ── A2: A GATE BETWEEN STEPS CANNOT HOLD A TOTAL WHEN A STEP IS UNBOUNDED ────────────────────────
//
// `checkBudget` already tested wall-clock first — A2's premise as written ("the check is missing")
// was false, and checking it saved building the wrong thing. A1's gate enforces the clock BETWEEN
// steps. What is missing is a bound on a step ITSELF: one clerk owner search took 697,641 ms on
// 2026-09-03 (11.6 minutes). Its inner operations are all bounded — page loads 60s, image fetches
// 30s, visibility probes 1s — but the loop over owner-name variants exits only on a document count.
// Two such steps exhaust a 25-minute run, and the gate before the third is correct and far too late.

describe('a step cannot outlive the run', () => {
  it('returns the fallback when the run has no time-safety left for the step', async () => {
    // Deterministic: the run's (tiny) safety wall clock is already spent, so the step is not even
    // started and the fallback comes back at once. The step-overran-mid-run timeout path is the
    // same fallback and is exercised by the clerk-abort tests (a >45 s step is impractical here).
    const p = 'proj-deadline';
    startRun(p, { ...DEFAULT_LIMITS, maxWallClockMs: 40 }, Date.now() - 60_000);
    const skips: string[] = [];
    const out = await withStepDeadline(
      p, 'slow step',
      () => new Promise((r) => setTimeout(() => r('finished'), 5000)),
      'gave up',
      (m) => skips.push(m),
    );
    expect(out).toBe('gave up');
    expect(skips.join(' ')).toMatch(/no time left/);
    endRun(p);
  });

  it('CONTROL: a step that finishes in time returns its real result', async () => {
    // Without this, "always return the fallback" would satisfy the assertion above.
    const p = 'proj-fast';
    startRun(p, { ...DEFAULT_LIMITS, maxWallClockMs: 60_000 }, Date.now());
    const out = await withStepDeadline(p, 'fast step', async () => 'real result', 'gave up');
    expect(out).toBe('real result');
    endRun(p);
  });

  it('an unbudgeted run is not deadlined', async () => {
    const out = await withStepDeadline('never-registered', 'x', async () => 'ran', 'skipped');
    expect(out).toBe('ran');
  });

  it('the step deadline is derived from the run remaining, capped by a per-step safety max', async () => {
    // Cost is the run ceiling now (owner, 2026-09-04) and the wall clock is a generous 2-hour
    // safety, so a step must not be allowed to run to it: the deadline is the run's remaining time
    // (minus the reserve, floored at 45 s) BUT capped at STEP_MAX so a runaway scrape — which costs
    // nothing, so the cost watchdog never catches it — is still stopped in a reasonable time.
    const gate = read('src/research/budget-gate.ts');
    expect(gate).toContain('const STEP_MAX_MS = 20 * 60_000;');
    expect(gate).toContain('const deadlineMs = Math.min(STEP_MAX_MS, Math.max(45_000, status.remainingMs - reserveMs));');
  });

  it('and it does NOT claim to cancel the underlying work', async () => {
    // Losing a race returns control; it does not reach into Playwright and stop a navigation. A
    // comment claiming otherwise would be believed.
    const gate = read('src/research/budget-gate.ts');
    expect(gate).toMatch(/does NOT cancel the underlying work/);
  });

  it('both long Bell steps are wrapped', () => {
    const src = code('src/counties/bell/orchestrator.ts');
    expect(src).toContain("withStepDeadline(input.projectId, 'clerk deed search'");
    expect(src).toContain("withStepDeadline(input.projectId, 'plat search'");
  });

  it('and the null result they can now return is HANDLED, not assumed away', () => {
    // The compiler caught this twice: everything below each call reads `clerk.*` / `plats.*`, and
    // the fallback makes null a real state.
    const src = code('src/counties/bell/orchestrator.ts');
    expect(src).toContain('if (!clerk) {');
    expect(src).toContain('if (!plats) {');
  });
});

// ── A4: THE RATE WAS NEVER THE PROBLEM ──────────────────────────────────────────────────────────
//
// A4 was written as "rate-limit the clerk portal — 224 requests to one host in one run, and
// `lib/rate-limiter.ts` (291 lines) exists with zero importers". Checked before building:
//
//   · 224 requests over 163 minutes is one every 43.7 SECONDS. That is extremely polite.
//   · `infra/politeness.ts` already serialises per host and spaces with jitter, and the Bell clerk
//     path reaches it transitively: `fetchInstrumentDocument` (clerk-scraper.ts:341) delegates to
//     `searchByInstrument` (bell-clerk.ts:3219) and `fetchDocumentImages` (:2747), and both wrap
//     their navigation in `withPoliteness`.
//   · So wiring `rate-limiter.ts` would add a THIRD mechanism over a path already covered.
//
// What the check DID find: four of Bell's six rate constants had zero uses. `clerkImageDownload:
// 6000` reads as "we wait six seconds between clerk image downloads" and nothing waited.

describe('Bell rate constants state only rules the code follows', () => {
  const endpoints = read('src/counties/bell/config/endpoints.ts');

  it('the four constants nothing enforced are gone', () => {
    for (const dead of ['clerkImageDownload', 'clerkMaxConcurrent', 'henschenRpm', 'aiCallDelay']) {
      expect(endpoints, `${dead} is back — is it applied this time?`).not.toMatch(
        new RegExp(`^\s*${dead}:`, 'm'),
      );
    }
  });

  it('CONTROL: the two that ARE applied survived', () => {
    // Deleting all six would satisfy the assertion above for the wrong reason.
    expect(endpoints).toMatch(/^\s*cadSearch: 2000,/m);
    expect(endpoints).toMatch(/^\s*defaultDelay: 1000,/m);
  });

  it('and each surviving constant says where it is applied', () => {
    expect(endpoints).toMatch(/Applied at 3 sites/);
    expect(endpoints).toMatch(/Applied at clerk-scraper\.ts:238/);
  });

  it('the Bell clerk path really is polite, transitively', () => {
    // The claim the deletion rests on. If these stop wrapping their navigation, the constants were
    // load-bearing after all and this test says so.
    const clerk = read('src/services/bell-clerk.ts');
    expect(clerk).toMatch(/politeGoto|withPoliteness/);
    expect(read('src/counties/bell/scrapers/clerk-scraper.ts')).toContain('fetchDocumentImages');
  });
});

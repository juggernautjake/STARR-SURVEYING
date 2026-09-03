import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { startRun, checkBudget, reasonText, endRun, DEFAULT_LIMITS } from '../infra/run-budget.js';

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

  it('the generic pipeline asks before each clerk owner search', () => {
    const src = code('src/services/pipeline.ts');
    const guarded = (src.match(/mayStart\(input\.projectId, 'clerk owner search'\)/g) ?? []).length;
    const calls = (src.match(/await searchClerkRecords\(/g) ?? []).length;
    expect(guarded, `${calls} clerk searches, ${guarded} guarded`).toBe(calls);
  });

  it('mayRun finally has a caller', () => {
    // The whole point. Its own doc comment has said "callers ask mayRun(...)" since it was written.
    expect(code('src/research/budget-gate.ts')).toContain('mayRun(projectId, step, spendForRun(projectId))');
    const gateUsers = ['src/counties/bell/orchestrator.ts', 'src/services/pipeline.ts']
      .filter((f) => code(f).includes('budget-gate.js'));
    expect(gateUsers.length, 'the gate has no callers, which is where this started').toBe(2);
  });
});

// Free first, paid on demand (plan S-11).

import { describe, it, expect } from 'vitest';
import {
  DESIRED_CAPABILITIES,
  FREE_CONCURRENCY,
  SOURCE_CATALOGUE,
  adviseEscalation,
  buildPlan,
  describeProgress,
  fitsFreeWindow,
  servesCounty,
} from '../research/research-modes.js';

describe('free sources run first, in BOTH modes', () => {
  it('puts every free step before every paid one', () => {
    // This is the anti-waste mechanism and it is an ORDERING rule. Filtering afterwards cannot fix
    // it, because by then the money is gone.
    const plan = buildPlan('Bell', 'paid');
    const freeOrders = plan.steps.filter((s) => s.phase === 'free').map((s) => s.order);
    const paidOrders = plan.steps.filter((s) => s.phase === 'paid').map((s) => s.order);

    // Both phases are asserted NON-EMPTY before the comparison, and that is not pedantry.
    // `Math.max(...[])` is `-Infinity` and `Math.min(...[])` is `Infinity`, so the ordering check
    // below reads `-Infinity < Infinity` — TRUE — for a plan with no steps at all, or with no paid
    // step, or with no free one. The assertion would pass hardest at the exact moment the thing it
    // guards stopped existing, which is how a check ends up defending nothing while looking green.
    //
    // The same shape was found and fixed twice elsewhere on 2026-08-04 (an `indexOf` ordering guard
    // where -1 read as "earliest"). Worth hardening here specifically because this one guards a
    // SPENDING rule: if paid sources ever ran first, the money would already be gone by the time
    // anything downstream noticed.
    expect(freeOrders.length, 'the plan must contain free steps').toBeGreaterThan(0);
    expect(paidOrders.length, 'a paid-mode plan must contain paid steps').toBeGreaterThan(0);
    expect(Math.max(...freeOrders)).toBeLessThan(Math.min(...paidOrders));
  });

  it('omits paid sources entirely in free mode', () => {
    const plan = buildPlan('Bell', 'free');
    expect(plan.steps.every((s) => s.phase === 'free')).toBe(true);
    expect(plan.paidSteps).toBe(0);
  });

  it('runs the same free sources in both modes', () => {
    const free = buildPlan('Bell', 'free').steps.map((s) => s.source.id);
    const paid = buildPlan('Bell', 'paid').steps.filter((s) => s.phase === 'free').map((s) => s.source.id);
    expect(paid).toEqual(free);
  });
});

describe('a plan only includes sources that serve the county', () => {
  it('gives Bell its Kofile portal and the statewide sources', () => {
    const ids = buildPlan('Bell', 'free').steps.map((s) => s.source.id);
    expect(ids).toContain('kofile');
    expect(ids).toContain('cad');   // statewide
    expect(ids).not.toContain('edoctec');   // Coryell/Lampasas only

    // S-6c — `glo` was asserted here as a statewide source in the steps. It is statewide and it is
    // in the catalogue, but it is flagged `notWiredYet`: no code path reaches the adapter, so it is
    // deliberately NOT a step. The steps are what the run will do, and this list is that list.
    expect(ids, 'glo is back in the steps — has it been wired? then clear notWiredYet').not.toContain('glo');
  });

  it('still knows about GLO, and says so separately', () => {
    // Excluding it from the steps must not erase it. The platform knowing about a source and a run
    // using it are different facts, and collapsing them in either direction loses something: hide it
    // and the researcher hunts for a source we already have; list it as a step and the plan lies.
    expect(SOURCE_CATALOGUE.some((s) => s.id === 'glo')).toBe(true);
    expect(buildPlan('Bell', 'free').statement).toContain('Texas GLO land grants');
  });

  it('gives Coryell eDocTec and not Kofile', () => {
    const ids = buildPlan('Coryell', 'free').steps.map((s) => s.source.id);
    expect(ids).toContain('edoctec');
    expect(ids).not.toContain('kofile');
  });

  it('tolerates the word County in the name', () => {
    expect(servesCounty(SOURCE_CATALOGUE.find((s) => s.id === 'edoctec')!, 'Coryell County')).toBe(true);
  });

  it('requires a county', () => {
    expect(() => buildPlan('', 'free')).toThrow(/county is required/i);
  });
});

describe('the plan says what it cannot reach', () => {
  it('names capabilities no source covers', () => {
    // A researcher deciding whether to escalate needs to know what escalating cannot fix.
    const plan = buildPlan('Hays', 'free');           // no clerk source is routed for Hays
    expect(plan.missingCapabilities).toContain('conveyances');
    expect(plan.statement).toContain('No source in this plan covers');
  });

  it('reports original_survey as MISSING, because nothing queries GLO', () => {
    // ── Inverted 2026-08-04 (S-6c). This read `missingCapabilities).toEqual([])`. ────────────────
    //
    // That assertion was true only because GLO sat in the catalogue, and it was the plan's one false
    // statement: `GloLandGrantAdapter` has no caller anywhere in the worker, so no run has ever
    // fetched an original survey. The test was faithfully pinning a lie.
    //
    // GLO is now flagged `notWiredYet`, excluded from the steps, and named separately in the
    // statement — so the plan says what it will actually do. When the adapter is wired, the flag
    // comes off and this assertion goes back to `[]` in the same commit.
    const plan = buildPlan('Bell', 'free');
    expect(plan.missingCapabilities).toEqual(['original_survey']);

    // And the researcher is told the gap is ours, not the state's — escalating to paid will not fix
    // it, which "no source covers original_survey" alone would not convey.
    expect(plan.statement).toContain('Built but not connected');
    expect(plan.statement).toContain('Texas GLO land grants');
  });

  it('covers everything else desired for a routed county', () => {
    // The half that still holds: conveyances and appraisal are genuinely covered for Bell.
    const missing = buildPlan('Bell', 'free').missingCapabilities;
    expect(missing).not.toContain('conveyances');
    expect(missing).not.toContain('appraisal');
  });

  it('warns in free mode when paid sources exist and are unused', () => {
    const plan = buildPlan('Limestone', 'free');
    expect(plan.statement).toContain('NOT being used — escalate');
  });

  it('lists the capabilities a full answer wants', () => {
    expect(DESIRED_CAPABILITIES).toContain('original_survey');
    expect(DESIRED_CAPABILITIES).toContain('conveyances');
  });
});

describe('the 20–30 minute window', () => {
  it('fits a normal county with the standard concurrency', () => {
    expect(fitsFreeWindow(buildPlan('Bell', 'free'))).toBe(true);
  });

  it('is judged on WALL clock, not summed source time', () => {
    // Sources are independent and run concurrently; summing them would reject plans that fit fine.
    const plan = buildPlan('Bell', 'free');
    expect(plan.estimatedFreeSeconds).toBeGreaterThan(0);
    expect(fitsFreeWindow(plan, 30, 1)).toBe(plan.estimatedFreeSeconds <= 1800);
  });

  it('caps concurrency, because county portals are slow and rate-limited', () => {
    expect(FREE_CONCURRENCY).toBeGreaterThan(1);
    expect(FREE_CONCURRENCY).toBeLessThanOrEqual(6);
  });
});

describe('progress is a correctness feature', () => {
  it('reports plain progress', () => {
    expect(describeProgress({ completed: 2, total: 8, currentPhase: 'free', failed: [] })).toBe(
      'free phase — 2/8 source(s) done (25%).',
    );
  });

  it('distinguishes a failed source from one that found nothing', () => {
    // A twenty-minute silent screen gets killed, and a killed run looks exactly like a run that
    // found nothing.
    const s = describeProgress({ completed: 3, total: 8, currentPhase: 'free', failed: ['kofile'] });
    expect(s).toContain('FAILED');
    expect(s).toContain('not because the records are absent');
  });

  it('does not divide by zero on an empty plan', () => {
    expect(describeProgress({ completed: 0, total: 0, currentPhase: 'free', failed: [] })).toContain('0%');
  });
});

describe('escalation advice never oversells paying', () => {
  it('says no when no paid source serves the county', () => {
    // Coryell has eDocTec (free) and nothing paid beyond the statewide TexasFile... which does serve
    // it, so use a county where that is not true.
    const a = adviseEscalation('Coryell', 0, [], SOURCE_CATALOGUE.filter((s) => s.id !== 'texasfile'));
    expect(a.worthEscalating).toBe(false);
    expect(a.reason).toContain('search the same places');
  });

  it('tells the researcher to re-run failed free sources first', () => {
    // "Nothing found" after a failure means "not read", not "nothing recorded" — and re-running the
    // free source costs nothing.
    const a = adviseEscalation('Bell', 0, ['kofile']);
    expect(a.worthEscalating).toBe(true);
    expect(a.reason).toContain('not read');
    expect(a.reason).toContain('costs nothing and should be tried first');
  });

  it('recommends escalation after a clean empty free pass', () => {
    const a = adviseEscalation('Bell', 0, []);
    expect(a.worthEscalating).toBe(true);
    expect(a.reason).toContain('ran cleanly and found nothing');
  });

  it('reassures that found documents will not be re-bought', () => {
    const a = adviseEscalation('Bell', 12, []);
    expect(a.reason).toContain('will NOT be bought again');
  });
});

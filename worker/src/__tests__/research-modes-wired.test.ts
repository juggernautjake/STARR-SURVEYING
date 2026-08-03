// The mode picker finally governs something (plan S-11).
//
// `research-modes.ts` was built for a requirement stated in the owner's own words — *"a researcher
// picks a mode when starting a run"*, FREE or PAID — and had **zero callers**. No type carried a
// mode, no endpoint read one, and `/research/purchase` bought documents regardless of what anybody
// picked. The picker governed nothing.
//
// Tenth instance of this shape in the research plan, and the one where the gap is most visible from
// the outside: a user-facing choice that changes no behaviour.
//
// The single most important assertion here is that FREE is not a filter. Filtering after the fact
// does not refund anything, so free mode has to mean the paid phase does not RUN.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { buildPlan, fitsFreeWindow, DESIRED_CAPABILITIES } from '../research/research-modes.js';

const index = fs.readFileSync(path.join(process.cwd(), 'src/index.ts'), 'utf8');
const purchaseTypes = fs.readFileSync(path.join(process.cwd(), 'src/types/purchase.ts'), 'utf8');

describe('the endpoint reads the mode', () => {
  it('accepts a mode on the purchase request', () => {
    expect(index).toContain('mode?: ResearchMode');
  });

  it('defaults to paid, so callers that have not been updated keep working', () => {
    // This endpoint IS the paid phase. Silently turning it into a no-op for every existing caller
    // would look exactly like a run that found nothing to buy — the failure this slice exists to
    // prevent, introduced by the fix for it.
    expect(index).toContain("const runMode: ResearchMode = mode === 'free' ? 'free' : 'paid'");
  });

  it('builds the plan for the county', () => {
    expect(index).toContain('buildPlan(countyName, runMode)');
  });
});

describe('FREE is not a filter', () => {
  it('returns before the purchase orchestrator is constructed', () => {
    // The ordering is the mechanism. A check placed after the orchestrator would still spend.
    const guard = index.indexOf("if (runMode === 'free')");
    const orchestrator = index.indexOf('new DocumentPurchaseOrchestrator(projectId)');
    expect(guard).toBeGreaterThan(-1);
    expect(orchestrator).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(orchestrator);
  });

  it('says how many documents went unbought', () => {
    // Zero purchases explains nothing on its own: a free run and a run that found nothing worth
    // buying produce the identical empty array, and those are opposite facts.
    expect(index).toContain('were NOT bought');
    expect(index).toContain('Re-run in paid mode to reach them');
  });

  it('calls it a spending decision, not a finding', () => {
    expect(index).toContain('this is a spending decision, not a finding that');
  });

  it('does not file the skip as an error', () => {
    // Nothing failed. An error list is the wrong home for a deliberate choice, and would put a
    // successful run in a failure queue.
    expect(index).toMatch(/errors: \[\],\s*\n\s*mode: 'free'/);
  });
});

describe('the mode reaches the report, not only the log', () => {
  it('is on the report type', () => {
    expect(purchaseTypes).toContain("mode?: 'free' | 'paid'");
    expect(purchaseTypes).toContain('modeStatement?: string');
  });

  it('explains why it is on the report at all', () => {
    expect(purchaseTypes).toContain('produce the same empty `purchases` array');
  });

  it('is written to the persisted report file', () => {
    expect(index).toContain('JSON.stringify(freeReport, null, 2)');
  });
});

describe('the plan itself still behaves', () => {
  it('puts every free source before every paid one, in both modes', () => {
    // The anti-waste rule is an ORDERING rule: paying for a document a free source was about to
    // return is what it exists to prevent.
    const paid = buildPlan('Bell', 'paid');
    const firstPaid = paid.steps.findIndex((s) => s.phase === 'paid');
    if (firstPaid > -1) {
      expect(paid.steps.slice(0, firstPaid).every((s) => s.phase === 'free')).toBe(true);
    }
  });

  it('omits paid sources entirely in free mode', () => {
    expect(buildPlan('Bell', 'free').steps.every((s) => s.phase === 'free')).toBe(true);
  });

  it('says when paid sources exist but are not being used', () => {
    const free = buildPlan('Bell', 'free');
    if (buildPlan('Bell', 'paid').paidSteps > 0) {
      expect(free.statement).toContain('NOT being used');
    }
  });

  it('reports what no source in the plan can answer', () => {
    const plan = buildPlan('Bell', 'free');
    for (const c of plan.missingCapabilities) expect(DESIRED_CAPABILITIES).toContain(c);
  });

  it('refuses to plan without a county', () => {
    expect(() => buildPlan('', 'free')).toThrow(/county is required/);
  });

  it('checks the free window against wall-clock, not the sum', () => {
    // The 20–30 minute expectation is a constraint on a CONCURRENT pass; comparing it to the serial
    // sum would declare every plan too slow.
    const plan = buildPlan('Bell', 'free');
    expect(fitsFreeWindow(plan, 30, 4)).toBe(
      plan.estimatedFreeSeconds / 4 <= 30 * 60,
    );
  });
});

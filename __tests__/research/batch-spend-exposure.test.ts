// __tests__/research/batch-spend-exposure.test.ts — Phase C3.
//
// ── THE NUMBER THE SLIDER COULD NOT SHOW ────────────────────────────────────────────────────────
//
// `SpendLimitSlider` sets a PER-PROPERTY limit. Its hint has always said so, and the worker enforces
// it that way — `run-budget.ts` applies the ceiling to a single run, capped at MAX_COST_CEILING_USD.
//
// But this form accepts up to 50 properties. So a slider reading "$10.00" on a 50-row batch was a
// $500 decision presented as a $10 one, and every individual piece of that was accurate: the slider
// was right, the hint was right, the worker was right. Nothing was lying. The multiplication was
// simply never done anywhere the operator could see it.
//
// ── WHY IT IS A CEILING AND NOT A FORECAST ──────────────────────────────────────────────────────
//
// Most counties in this firm's working area route to a free portal and spend nothing at all. A
// figure presented as "estimated cost: $500" would be wrong for almost every real batch and would
// train people to ignore it. "Up to $500" is both true and useful, which is why the wording is
// pinned by a test and not left to whoever edits the JSX next.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const SRC = fs.readFileSync(
  path.join(process.cwd(), 'app/admin/research/_tabs/PipelineTab.tsx'),
  'utf8',
);

/** The rule the component implements, restated so the arithmetic itself can be tested. */
function maxSpend(rows: number, perProperty: number, autoPurchase: boolean): number {
  return autoPurchase ? rows * perProperty : 0;
}

describe('the exposure a batch actually carries', () => {
  it('multiplies the per-property limit by the rows that will run', () => {
    expect(maxSpend(50, 10, true)).toBe(500);
    expect(maxSpend(3, 2, true)).toBe(6);
  });

  it('is zero when purchasing is off, whatever the slider says', () => {
    // This is the case that matters most: the default. Showing "up to $100" beside a batch that
    // cannot buy anything would be a false alarm, and a false alarm is how a real one gets ignored.
    expect(maxSpend(10, 10, false)).toBe(0);
  });

  it('counts only rows that are ready, not empty ones', () => {
    // A form that opens with one blank row would otherwise claim an exposure before anything has
    // been typed.
    expect(maxSpend(0, 10, true)).toBe(0);
  });
});

describe('the component computes it that way', () => {
  it('derives the estimate from the ready rows and the slider', () => {
    expect(SRC).toContain('const maxSpend = autoPurchase ? readyRows * batchBudget : 0;');
  });

  it('counts ready rows by trimmed content, not truthiness', () => {
    // `r.address && r.county` counted a row holding a single space as ready.
    expect(SRC).toContain("return r.address.trim() !== '' && r.county.trim() !== '';");
  });

  it('the count shown and the count submitted come from the SAME predicate', () => {
    // Two identical expressions before C3 — which is how a form comes to say "3 ready" and send
    // two. Asserting both call `isReadyRow` is the only version of this that stays true: two
    // copies of the same filter satisfy any test that just checks the behaviour matches today.
    expect(SRC).toContain('const readyRows = batchRows.filter(isReadyRow).length;');
    expect(SRC).toContain('const properties = batchRows.filter(isReadyRow);');
    expect(SRC).toContain('{readyRows} of {batchRows.length} ready');
    // And exactly one place defines what ready MEANS.
    expect(SRC.split(String.raw`address.trim() !== ''`).length - 1).toBe(1);
  });

  it('says "Up to", never "estimated"', () => {
    expect(SRC).toContain('Up to $');
    expect(SRC.toLowerCase(), 'a ceiling must not be presented as a forecast').not.toContain('estimated cost');
  });

  it('says plainly that $0 means nothing can be bought', () => {
    expect(SRC).toContain('Purchasing is off, so nothing can be bought whatever the limit says.');
  });

  it('renders money to two decimal places', () => {
    // `readyRows * batchBudget` on a $2.50 slider produces 7.5, which renders as "$7.5".
    expect(SRC).toContain('maxSpend.toFixed(2)');
    expect(SRC).toContain('batchBudget.toFixed(2)');
  });
});

describe('the estimate is reachable', () => {
  it('sits with the spend controls, not somewhere else on the page', () => {
    const options = SRC.indexOf('research-pipeline__batch-options');
    const estimate = SRC.indexOf('research-pipeline__spend-estimate');
    const actions = SRC.indexOf('research-pipeline__batch-actions');
    expect(options).toBeGreaterThan(-1);
    expect(estimate, 'the estimate must come after the slider it explains').toBeGreaterThan(options);
    expect(estimate, 'and before the submit button it should inform').toBeLessThan(actions);
  });

  it('the class it names exists in a stylesheet', () => {
    // A class no sheet has heard of renders as unstyled text — present in a test, invisible on the
    // page. This portal has done exactly that three times.
    const css = fs.readFileSync(
      path.join(process.cwd(), 'app/admin/styles/AdminResearch.css'),
      'utf8',
    );
    expect(css).toContain('.research-pipeline__spend-estimate');
    expect(css).toContain('.research-pipeline__cell');
  });
});

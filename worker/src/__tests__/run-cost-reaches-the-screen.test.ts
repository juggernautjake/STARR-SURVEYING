import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { MODEL_PRICING, FALLBACK_RATE, rateFor } from '../infra/usage.js';
import { TIER_MODELS } from '../infra/model-router.js';

// A3 — "the user can see how much the run cost when complete", and B1 — "dynamically updated as the
// run progresses".
//
// A1 fixed the recording. This pins the CHAIN, because a cost that is recorded and never displayed
// is the same defect one hop along:
//
//   recordAmbientAiCall / recordPurchase   →  research_usage_events
//   run-console route                      →  sums them into `spend`
//   buildRunState                          →  RunState.spendUsd
//   the Spent counter                      →  "$2.14"
//
// Every link is asserted here or in __tests__/research/run-length-is-visible.test.ts (app side),
// which pins the counter itself — including the dollar sign, which went missing once already.

const WORKER_SRC = path.join(process.cwd(), 'src');
const read = (p: string) => fs.readFileSync(path.join(WORKER_SRC, p), 'utf8');

describe('every model a run can route to has a real price', () => {
  it('CONTROL: the pricing table is not empty', () => {
    expect(Object.keys(MODEL_PRICING).length).toBeGreaterThan(3);
  });

  it('every tier the router can return is priced', () => {
    // The router picks by TASK and returns one of these. A tier model missing from the table falls
    // back to Sonnet rates silently — conservative, but it means a Haiku run is billed at 3x and an
    // Opus run at a fifth of what it cost, and nothing says so.
    for (const [tier, model] of Object.entries(TIER_MODELS)) {
      const { known } = rateFor(model);
      expect(known, `tier "${tier}" routes to ${model}, which is not in MODEL_PRICING`).toBe(true);
    }
  });

  it('the constant the deed and plat analyzers send is priced', () => {
    // These two do not use the router; they read RESEARCH_AI_MODEL with a hardcoded default.
    expect(rateFor('claude-sonnet-4-6').known).toBe(true);
  });

  it('an unknown model costs SOMETHING, not nothing', () => {
    // The direction that matters. A model nobody priced is far more likely to cost money than to be
    // free, and a zero would quietly under-report every run that used it.
    const { rate, known } = rateFor('claude-something-nobody-priced');
    expect(known).toBe(false);
    expect(rate.input).toBeGreaterThan(0);
    expect(rate.output).toBeGreaterThan(0);
    expect(rate).toEqual(FALLBACK_RATE);
  });

  it('output costs more than input, on every priced model', () => {
    // Not pedantry: an inverted rate would make long analyses look cheap, and analysis is where this
    // product spends. Cheap to assert, and it catches a transposed pair.
    for (const [model, rate] of Object.entries(MODEL_PRICING)) {
      expect(rate.output, `${model} prices output at or below input`).toBeGreaterThan(rate.input);
    }
  });
});

describe('the recorded cost reaches the run', () => {
  it('usage is written to the table the console reads', () => {
    expect(read('infra/usage.ts')).toContain("from('research_usage_events')");
  });

  it('a document purchase is recorded as spend too, not just AI', () => {
    // recordPurchase writes BOTH the ledger row and a usage event, deliberately: a $1.00 page that
    // never reached research_usage_events is money the cost view cannot see.
    const ledger = read('services/purchase-ledger.ts');
    expect(ledger).toContain('recordUsage(');
    expect(ledger).toContain("eventType: 'document_purchase'");
  });

  it('a SKIPPED purchase does not write a usage event', () => {
    // The opposite direction, and just as important: nothing moved, so a $0.00 event would put a
    // purchase in the cost stream that never happened.
    const ledger = read('services/purchase-ledger.ts');
    const at = ledger.indexOf('export async function recordSkippedPurchases(');
    expect(at).toBeGreaterThan(-1);
    expect(ledger.slice(at, at + 1600)).not.toContain('recordUsage(');
  });

  it('the final total is persisted on the run record', () => {
    // So it survives a page reload after the run ends — the console reads live events, the run row
    // is what remains.
    expect(read('index.ts')).toContain('costUsd: finalBudget.spentUsd');
  });
});

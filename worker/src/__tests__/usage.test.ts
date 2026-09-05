// What a research run costs (research plan R4).
//
// Measured before this: `research_usage_events` had a model column, token columns, a cost column —
// and **0 rows**. The only code touching it read. The owner's constraint is "as cheap as possible
// per run", and that could not be evaluated, compared between runs, or regressed against.
//
// The Bell analyzers did track tokens, but priced every call with one hard-coded pair
// ($3/$15 per million, labelled "claude-sonnet-4 pricing as of March 2026") regardless of which
// model made it — so a Haiku classification and an Opus synthesis cost the same on paper, which is
// precisely the distinction somebody optimising spend needs.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  FALLBACK_RATE,
  MODEL_PRICING,
  SYSTEM_ACTOR,
  priceCall,
  rateFor,
} from '../infra/usage.js';

const M = 1_000_000;

describe('pricing knows which model made the call', () => {
  it('charges Opus more than Sonnet more than Haiku', () => {
    const tokens = { input: M, output: M };
    const opus = priceCall('claude-opus-5', tokens);
    const sonnet = priceCall('claude-sonnet-5', tokens);
    const haiku = priceCall('claude-haiku-4-5', tokens);
    expect(opus).toBeGreaterThan(sonnet);
    expect(sonnet).toBeGreaterThan(haiku);
    // The whole point of R6's cheap-first routing: the gap has to be visible to be worth chasing.
    expect(opus / haiku).toBeGreaterThan(5);
  });

  it('prices a million input + a million output tokens at the published rate', () => {
    // Sonnet: $3 in + $15 out.
    expect(priceCall('claude-sonnet-5', { input: M, output: M })).toBeCloseTo(18, 6);
  });

  it('resolves dated model ids to the right rate, longest prefix first', () => {
    // 'claude-sonnet-4-5-20250929' must not match 'claude-sonnet-4'.
    expect(rateFor('claude-sonnet-4-5-20250929').rate).toBe(MODEL_PRICING['claude-sonnet-4-5']);
    expect(rateFor('claude-sonnet-4-20250514').rate).toBe(MODEL_PRICING['claude-sonnet-4']);
    expect(rateFor('claude-haiku-4-5-20251001').rate).toBe(MODEL_PRICING['claude-haiku-4-5']);
  });

  it('falls back to a REAL rate for an unknown model, never to zero', () => {
    // A zero would make an unpriced model look like the cheapest thing in the system — the exact
    // wrong signal for somebody reducing spend.
    const { rate, known } = rateFor('claude-something-unreleased');
    expect(known).toBe(false);
    expect(rate).toBe(FALLBACK_RATE);
    expect(priceCall('claude-something-unreleased', { input: M, output: 0 })).toBeGreaterThan(0);
  });

  it('prices cache reads far below fresh input', () => {
    // Re-sending a 40-page deed to five prompts is the biggest saving available in this pipeline,
    // and it is invisible without these two numbers being different.
    const fresh = priceCall('claude-sonnet-5', { input: M, output: 0 });
    const cached = priceCall('claude-sonnet-5', { input: 0, output: 0, cacheRead: M });
    expect(cached).toBeLessThan(fresh / 5);
  });

  it('counts cache writes as more expensive than plain input', () => {
    const plain = priceCall('claude-sonnet-5', { input: M, output: 0 });
    const written = priceCall('claude-sonnet-5', { input: 0, output: 0, cacheWrite: M });
    expect(written).toBeGreaterThan(plain);
  });
});

describe('the record itself', () => {
  const src = fs.readFileSync(path.join(process.cwd(), 'src/infra/usage.ts'), 'utf8');

  it('never fails a run because telemetry failed', () => {
    // 25 minutes of research and a paid document are not discarded over a metrics row.
    expect(src).toMatch(/catch \(err\)/);
    expect(src).toContain('[usage] FAILED to record');
  });

  it('but says so loudly rather than swallowing it', () => {
    // Silent loss is exactly how the table reached 0 rows with everyone assuming it worked.
    expect(src).toContain('console.error');
    expect(src).not.toMatch(/catch \{\s*\}/);
  });

  it('accumulates BEFORE it writes, so a budget counts a call whose row was lost', () => {
    const accumulateAt = src.indexOf('runSpend.set(');
    // The INSERT specifically (not ledgerSpendForRun's read query, which also reads this table).
    const insertAt = src.indexOf(".from('research_usage_events').insert");
    expect(accumulateAt).toBeGreaterThan(0);
    expect(insertAt).toBeGreaterThan(0);
    expect(accumulateAt).toBeLessThan(insertAt);
  });

  it('is honest about who a system-triggered run belongs to', () => {
    // user_email is NOT NULL and a scheduled run belongs to nobody. A sentinel beats an invented
    // address that somebody will later filter a report by.
    expect(SYSTEM_ACTOR).toBe('worker@system');
  });

  it('flags a call it could not price rather than averaging it in silently', () => {
    expect(src).toContain('unpriced_model');
  });
});

describe('the Bell analyzers stopped inventing their own prices', () => {
  const helpers = fs.readFileSync(
    path.join(process.cwd(), 'src/counties/bell/analyzers/ai-cost-helpers.ts'),
    'utf8',
  );

  it('has no local rate constants left', () => {
    // They existed as `export const COST_PER_INPUT_TOKEN = 3 / 1_000_000` and were applied to every
    // model. Two places that price a call is two answers to "what did this cost".
    const code = helpers.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
    expect(code).not.toMatch(/COST_PER_INPUT_TOKEN\s*=/);
    expect(code).not.toMatch(/COST_PER_OUTPUT_TOKEN\s*=/);
  });

  it('prices through the one module that knows model rates', () => {
    expect(helpers).toContain("from '../../../infra/usage.js'");
    expect(helpers).toContain('priceCall');
  });

  it('offers a recorder that requires the project a cost belongs to', () => {
    // A cost that cannot be attributed to a run does not answer "what does a run cost".
    expect(helpers).toMatch(/export function recordAiUsage\(\s*\n?\s*projectId: string/);
  });
});

// The spend limit is REACHABLE, not merely enforceable.
//
// ── WHAT WENT WRONG ─────────────────────────────────────────────────────────────────────────────
//
// `MAX_COST_CEILING_USD` and the clamp in `limitsFor()` shipped with tests, and the owner was told a
// run could be capped between $0 and $10. Then they went to start a run and there was no control,
// because none had been built. Enforcement without a control is a constant with extra steps, and
// describing it as a setting was the actual error.
//
// So this asserts the chain a person can walk:
//
//     slider → form state → POST body `options` → API forwards `options` → worker
//
// ── AND WHERE IT BINDS, WHICH IS NOT EVERYWHERE ─────────────────────────────────────────────────
//
// There are two research pipelines. The project screen's "analyze" path runs IN THE APP and never
// contacts the worker — measured: zero references to WORKER_URL in the analyze route or
// `analysis.service.ts`. The batch form in PipelineTab is the only UI that reaches the worker, so it
// is the only place a worker-enforced spend limit can honestly be offered. Putting the control on
// the project modal instead would have looked more natural and done nothing.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { stripComments } from '../../scripts/derive-portal-tabs.mjs';
import {
  describeSpendLimit,
  SPEND_LIMIT_MAX_USD,
} from '@/app/admin/research/components/SpendLimitSlider';

const ROOT = process.cwd();
const read = (p: string) => stripComments(fs.readFileSync(path.join(ROOT, p), 'utf8'));

const TAB = 'app/admin/research/_tabs/PipelineTab.tsx';
const API = 'app/api/admin/research/batch/route.ts';
const SLIDER = 'app/admin/research/components/SpendLimitSlider.tsx';
const CSS = 'app/admin/styles/AdminResearch.css';

describe('the ceiling the UI offers matches the one the worker enforces', () => {
  it('stops at $10, the same number as MAX_COST_CEILING_USD', () => {
    // Two constants in two projects that must agree. The worker cannot import from the app, so the
    // agreement is asserted here rather than shared — and asserted against the worker's SOURCE, so
    // changing one without the other fails.
    expect(SPEND_LIMIT_MAX_USD).toBe(10);
    const budget = read('worker/src/infra/run-budget.ts');
    expect(budget).toContain('MAX_COST_CEILING_USD = 10');
  });

  it('describes $0 as a real choice rather than an empty one', () => {
    // A control whose minimum reads as "unset" gets treated as a bug. Zero means "buy nothing",
    // which is a legitimate and common selection.
    expect(describeSpendLimit(0).toLowerCase()).toContain('free sources only');
    expect(describeSpendLimit(-5).toLowerCase()).toContain('free sources only');
  });

  it('says something different at each meaningful point', () => {
    const seen = new Set([0, 2, 5, 10].map(describeSpendLimit));
    expect(seen.size).toBe(4);
    expect(describeSpendLimit(10).toLowerCase()).toContain('maximum');
  });
});

describe('the control is wired to the one form that reaches the worker', () => {
  it('PipelineTab renders the slider', () => {
    const src = read(TAB);
    expect(src).toMatch(/import SpendLimitSlider from/);
    expect(src).toContain('<SpendLimitSlider');
  });

  it('it is bound to state, not to a literal', () => {
    // `value={2}` would render identically and be unchangeable.
    expect(read(TAB)).toMatch(/value=\{batchBudget\}/);
    expect(read(TAB)).toMatch(/onChange=\{setBatchBudget\}/);
  });

  it('the value is SENT — the half that silently rots', () => {
    // Rendering a slider that nothing reads is the failure this whole file exists for.
    expect(read(TAB)).toMatch(/options:\s*\{\s*budget:\s*batchBudget,\s*autoPurchase\s*\}/);
  });

  it('the API forwards options to the worker instead of dropping them', () => {
    const api = read(API);
    expect(api).toMatch(/options:\s*body\.options/);
    expect(api).toContain('/research/batch');
  });

  it('the purchase toggle is present and sends too', () => {
    const src = read(TAB);
    expect(src).toContain('data-testid="batch-auto-purchase"');
    expect(src).toMatch(/checked=\{autoPurchase\}/);
  });

  it('every class the slider renders is defined in the stylesheet', () => {
    // A class the stylesheet has never heard of renders as unstyled text in the middle of a form —
    // visible to a test, invisible as a control. This repo has shipped that three times.
    const css = read(CSS);
    const rendered = [...read(SLIDER).matchAll(/className="([^"{]+)"/g)]
      .flatMap((m) => m[1]!.split(/\s+/))
      .filter((c) => c.startsWith('spend-limit'));
    expect(rendered.length).toBeGreaterThan(4);
    const missing = [...new Set(rendered)].filter((c) => !css.includes(`.${c}`));
    expect(missing, `classes rendered but never styled:\n  ${missing.join('\n  ')}`).toEqual([]);
  });
});

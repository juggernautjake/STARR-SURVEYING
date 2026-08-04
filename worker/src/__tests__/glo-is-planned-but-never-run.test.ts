// worker/src/__tests__/glo-is-planned-but-never-run.test.ts
//
// S-6b — the run plan claims an `original_survey` capability that nothing can deliver.
//
// ── THE CHAIN ───────────────────────────────────────────────────────────────────────────────────
//
// `SOURCE_CATALOGUE` lists `glo` as a free source with `capabilities: ['original_survey']`, and GLO
// is the ONLY source in the catalogue with that capability. `buildPlan()` derives `covered` from the
// catalogue and reports `missingCapabilities` as everything in `DESIRED_CAPABILITIES` that is not
// covered — so on every run, `original_survey` is reported as covered.
//
// **Nothing queries GLO.** `adapters/glo-land-grant-adapter.ts` has no importer at all, and
// `sources/glo-client.ts` is imported once by `index.ts` and never instantiated. The only production
// reference to GLO in the entire worker is that dead import.
//
// So a run tells the researcher the original survey is accounted for, and no code will ever look for
// it. That is this program's signature defect stated exactly — **an unknown rendered as an answer** —
// and it sits on the source the sources document calls *"the most valuable source found"* and
// *"highest value per hour of anything remaining"*.
//
// ── WHY A TEST AND NOT A FIX ────────────────────────────────────────────────────────────────────
//
// Two honest fixes exist and they are not equivalent:
//
//   1. **Wire the adapter into the pipeline.** Correct, and a real slice: it needs a stage, a place
//      for grants in the report, and a decision about what a missing grant means for confidence.
//   2. **Stop claiming the capability** until (1) lands, so `missingCapabilities` tells the truth.
//
// Picking (2) unilaterally would quietly downgrade what the run reports; picking (1) is the work
// S-6 was supposed to finish. Either is the owner's call. What is not defensible is the current
// state passing silently, so this test states it out loud and fails the day it changes — in either
// direction.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { buildPlan, SOURCE_CATALOGUE, DESIRED_CAPABILITIES } from '../research/research-modes.js';

const SRC = path.join(process.cwd(), 'src');
const read = (p: string) => fs.readFileSync(path.join(SRC, p), 'utf8');

/** Every non-test worker file, for reachability questions. */
function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== 'node_modules') walk(p, out); continue; }
    if (p.endsWith('.ts') && !p.includes('__tests__')) out.push(p);
  }
  return out;
}
const workerFiles = walk(SRC);

describe('S-6b — GLO is in the plan and in no code path', () => {
  it('GLO is the only source offering original_survey', () => {
    // If this ever fails, another source has taken the capability on and the rest of this file needs
    // re-reading — the claim would no longer be false.
    const providers = SOURCE_CATALOGUE.filter((s) => s.capabilities.includes('original_survey'));
    expect(providers.map((s) => s.id)).toEqual(['glo']);
    expect(DESIRED_CAPABILITIES).toContain('original_survey');
  });

  it('the plan reports original_survey as COVERED, on every run', () => {
    // The false statement itself, in both modes.
    for (const mode of ['free', 'paid'] as const) {
      const plan = buildPlan('Bell', mode);
      expect(
        plan.missingCapabilities,
        `${mode} mode: the plan says original_survey is covered, and nothing queries GLO`,
      ).not.toContain('original_survey');
    }
  });

  it('and nothing in the worker actually queries GLO', () => {
    // The other half. Asserted by reachability rather than by reading the pipeline, because the
    // question is "does ANY path reach it", which no single file can answer.
    const adapterImporters = workerFiles.filter(
      (f) => !f.endsWith('glo-land-grant-adapter.ts') && /glo-land-grant-adapter/.test(fs.readFileSync(f, 'utf8')),
    );
    expect(
      adapterImporters,
      'the GLO adapter gained an importer — if it is now wired, delete this test and tick S-6',
    ).toEqual([]);

    // `sources/glo-client.ts` IS imported by index.ts — but never constructed. An import that is
    // never used is the weakest possible evidence of a feature, and it is what made this look wired.
    const index = read('index.ts');
    expect(index, 'index.ts imports GLOClient').toContain('GLOClient');
    expect(
      /new\s+GLOClient/.test(index),
      'GLOClient is now constructed in index.ts — GLO may be wired; re-check S-6 and this test',
    ).toBe(false);
  });

  it('states the two ways out, so neither is chosen by accident', () => {
    // Documentation-as-assertion: the fix is either to wire the adapter or to stop claiming the
    // capability, and they are not interchangeable. Kept as a test so it is read with the rest.
    const options = ['wire the adapter into the pipeline', 'stop claiming the capability'];
    expect(options).toHaveLength(2);
  });
});

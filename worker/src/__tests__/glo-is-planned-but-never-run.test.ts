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

/**
 * Source with comments removed, before any "is it wired?" question is asked of it.
 *
 * ── I MADE THIS EXACT MISTAKE THREE SLICES EARLIER AND AGAIN HERE ───────────────────────────────
 *
 * R4b's spend ratchet credited a file as migrated because a **comment** mentioned the module it was
 * supposed to import. That was found and fixed the same day. Writing this guard, I searched raw
 * source for `findOriginalSurvey` — and `research-modes.ts` matched, because a comment I had just
 * written there says the function "is called from the Bell orchestrator".
 *
 * So the negative control passed with the caller deleted, and the guard was defending nothing.
 * **A guard that greps for a name is satisfied by anyone talking about the name**, and in a codebase
 * that documents its reasoning as heavily as this one that is not an edge case — it is the norm.
 */
const code = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

describe('S-6b — GLO is in the plan and in no code path', () => {
  it('GLO is the only source offering original_survey', () => {
    // If this ever fails, another source has taken the capability on and the rest of this file needs
    // re-reading — the claim would no longer be false.
    const providers = SOURCE_CATALOGUE.filter((s) => s.capabilities.includes('original_survey'));
    expect(providers.map((s) => s.id)).toEqual(['glo']);
    expect(DESIRED_CAPABILITIES).toContain('original_survey');
  });

  it('reports original_survey as covered IN BELL, because a Bell run now queries GLO — S-6d', () => {
    // ── Inverted a second time, and the direction is the whole story of this file. ───────────────
    //
    // Shipped asserting `original_survey` was reported COVERED while nothing queried GLO — the
    // defect. S-6c inverted it to MISSING when the plan stopped claiming what it could not do.
    // S-6d inverts it back, because the claim is now TRUE for Bell: `findOriginalSurvey` is called
    // from the Bell orchestrator once the abstract number is known.
    //
    // Both inversions were the guard working. It was written to fail the day this changed *in
    // either direction*, and it has now caught the fix as well as the defect — which is the only
    // way a test can tell "we fixed it" from "we broke it back".
    for (const mode of ['free', 'paid'] as const) {
      const plan = buildPlan('Bell', mode);
      expect(
        plan.missingCapabilities,
        `${mode} mode: Bell queries GLO now, so original_survey must NOT be reported missing`,
      ).not.toContain('original_survey');
    }
  });

  it('still reports it MISSING for a county whose pipeline does not call GLO', () => {
    // The half that stops S-6b's defect coming back one county at a time. GLO serves the whole
    // state and is called from ONE county's orchestrator, so "wired" is true per county — and a
    // Travis run must not inherit Bell's coverage just because the adapter finally has an importer.
    const plan = buildPlan('Travis', 'free');
    expect(
      plan.missingCapabilities,
      'Travis has no GLO caller, so original_survey is still a gap there',
    ).toContain('original_survey');
    // …and it is named as OUR gap, not the state's, so nobody escalates to paid mode to fix it.
    expect(plan.statement).toMatch(/Built but not connected/i);
  });

  it('the worker really does query GLO now', () => {
    // The other half, inverted with it. Asserted by reachability rather than by reading the
    // pipeline, because the question is "does ANY path reach it", which no single file can answer.
    const adapterImporters = workerFiles.filter(
      (f) => !f.endsWith('glo-land-grant-adapter.ts') && /glo-land-grant-adapter/.test(code(fs.readFileSync(f, 'utf8'))),
    );
    expect(
      adapterImporters.length,
      'the GLO adapter lost its importer — original_survey would be a false claim again',
    ).toBeGreaterThan(0);

    // And the importer is reached in turn. A service nothing calls is the same defect one level up,
    // which is precisely how `frameParcel` and `chooseTiles` were "wired" and delivered nothing.
    //
    // `code()` matters here specifically: without it this passed with the orchestrator's call
    // deleted, because a comment in research-modes.ts names the function. See the note on `code`.
    const callers = workerFiles.filter(
      (f) => !f.endsWith('original-survey.ts') && /findOriginalSurvey\s*\(/.test(code(fs.readFileSync(f, 'utf8'))),
    );
    expect(callers.length, 'findOriginalSurvey has no caller — the chain stops one link short')
      .toBeGreaterThan(0);
  });

  it('does not claim the grant lookup succeeded when it could not run', () => {
    // The distinction the service exists to preserve, pinned here because it is the thing a
    // surveyor would be misled by: "GLO holds no grant" and "we could not ask GLO" are opposite
    // statements, and an empty grants array is compatible with both.
    const src = read('services/original-survey.ts');
    for (const outcome of ["'found'", "'none'", "'not_identified'", "'error'"]) {
      expect(src, `the ${outcome} outcome must stay distinguishable`).toContain(outcome);
    }
    // A county-only search returns Bell's whole 1,523-grant index; refusing it is not a limitation.
    expect(src).toMatch(/returns the whole grant index/i);
  });
});

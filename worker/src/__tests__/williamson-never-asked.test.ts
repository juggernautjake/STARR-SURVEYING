/**
 * "No property at that address" is a claim about the county. It has to be earned.
 *
 * Stage 1 printed "WCAD has no property at that address. The search is a single free-text call, so
 * this is an answer rather than a failure to reach the site" without ever checking whether the site
 * answered. On 2026-09-21 this machine rate-limited ITSELF against WCAD by testing Williamson hard
 * for a day; every attempt came back 429 and the run reported that the county holds no parcel at an
 * address it certainly holds.
 *
 * A parcel that could not be looked up is not a parcel that does not exist, and the difference is
 * what decides whether a surveyor re-runs the job or goes looking for a wrong address.
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const stage1 = fs.readFileSync(
  path.join(process.cwd(), 'src/counties/williamson/stage1.ts'), 'utf8');

describe('a lookup that never happened', () => {
  it('checks whether any attempt actually reached the site', () => {
    expect(stage1).toContain('const reached = found.attempts.filter((a) => !a.error)');
    expect(stage1).toContain('reached.length === 0');
  });

  it('says the silence is about US, not about the property', () => {
    expect(stage1).toMatch(/says NOTHING about the property/);
    expect(stage1).toMatch(/never looked up/);
  });

  it('names the error and what to do about it', () => {
    // A warning a person cannot act on is a warning they learn to scroll past.
    expect(stage1).toMatch(/rate limiting/);
    expect(stage1).toMatch(/wait and re-run/);
  });

  it('still claims absence only on the path where the site DID answer', () => {
    // The original sentence survives — it is correct when the attempts came back clean.
    const i = stage1.indexOf('WCAD has no property at that address');
    const j = stage1.indexOf('reached.length === 0');
    expect(i).toBeGreaterThan(0);
    expect(j).toBeGreaterThan(0);
    expect(j, 'the never-asked guard runs BEFORE the absence claim').toBeLessThan(i);
  });
});

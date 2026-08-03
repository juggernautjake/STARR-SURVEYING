// Step failures in the adjoiner worker must reach the caller (plan R39).
//
// `AdjacentResearchWorker` declared `private errors: string[]`, reset it at the end of every run,
// and NEVER merged it into the result. It was a dead field. Every step that recorded a failure into
// it — AI deed selection, image download, boundary extraction — was writing to nothing, so a run
// that lost its images or crashed mid-extraction reported clean.
//
// This is the same defect as an adapter returning [], one layer up: the failure exists, and the
// caller cannot see it.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const src = fs.readFileSync(path.join(process.cwd(), 'src/services/adjacent-research-worker.ts'), 'utf8');
const code = src.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');

describe('step failures reach the result', () => {
  it('drains this.errors into result.errors before returning', () => {
    // Without this line every push to this.errors is invisible.
    expect(code).toMatch(/for \(const e of this\.errors\).*result\.errors\.push\(e\)/s);
  });

  it('drains BEFORE clearing the accumulator', () => {
    const drain = code.indexOf('for (const e of this.errors)');
    const clear = code.indexOf('this.errors = [];', drain);
    expect(drain).toBeGreaterThan(-1);
    expect(clear).toBeGreaterThan(drain);
  });

  it('records a failed deed selection rather than only logging it', () => {
    expect(src).toContain('This is a selection failure, NOT an adjoiner without a deed');
  });

  it('records a failed image download rather than only logging it', () => {
    // The adapters now throw informative errors here — "the absence of ACCESS, not the absence of
    // images". Swallowing them into [] discarded exactly what a reviewer needs.
    expect(code).toMatch(/Could not download images for.*this\.errors\.push/s);
  });

  it('distinguishes a failed extraction from a deed with no metes and bounds', () => {
    // The second is real and common, which is what makes the first easy to miss.
    expect(src).toContain('not the same as a deed containing no metes and bounds');
  });
});

describe('a run with recorded failures is never called complete', () => {
  it('requires a clean run as well as a boundary', () => {
    expect(code).toContain('const clean = this.errors.length === 0');
    expect(code).toMatch(/totalCalls > 0 && clean \? 'complete' : 'partial'/);
  });

  it('says why it was downgraded', () => {
    expect(src).toContain('reported as PARTIAL, not complete');
  });
});

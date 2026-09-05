import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// Plan GATHER_AND_REVIEW_SPLIT G6 — a gather run does NO AI. G6 first gated the app-side analysis
// TRIGGER; but the worker's own tail reads documents with adaptive-vision OCR (the biggest spender)
// and summarises them. Those are analysis too and must not run in a gather run — only capture does.
// This asserts the tail's reading + summary are gated by shouldRunAnalysis(runSettings).

const index = fs.readFileSync(path.join(process.cwd(), 'src/index.ts'), 'utf8');

describe('the worker tail runs no AI in a gather run', () => {
  it('the reading pass (mayRead) refuses when analysis is off', () => {
    expect(index).toMatch(/if \(!shouldRunAnalysis\(runSettings\)\) return false;/);
  });

  it('the summary sweep is gated by shouldRunAnalysis', () => {
    expect(index).toMatch(/if \(summaryKey && shouldRunAnalysis\(runSettings\)\)/);
  });

  it('still gathers — capture is not gated by the analysis switch', () => {
    // The gate lives on the reading/summary path, not on imagery/drawing capture. Guard against a
    // future edit that wraps the whole tail and silently stops gathering.
    expect(index).toContain('Gather run — documents filed for review');
  });
});

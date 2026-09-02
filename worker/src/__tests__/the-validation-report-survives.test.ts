import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// C2e — the run paid for an analysis on every property and kept a summary sentence.
//
// ── WHAT WAS BEING DISCARDED ────────────────────────────────────────────────────────────────────
//
// `runPropertyValidationPipeline` is a Stage 5 AI pass over everything the run found. It produces
// the most decision-shaped output a run has:
//
//   overallConfidencePct + rating     how much of this boundary to trust
//   topActions                        the documents worth buying next, WITH cost estimates and the
//                                     confidence boost each would give
//   adjacentResearchOrder             which neighbour to research first, and why
//   perCallConfidence                 evidence strength and conflict notes, per call
//   discrepancies                     with severity
//
// Three lines reached the run log — the top 3 actions and the top 3 adjacent owners — and nothing
// was persisted. `grep validationReport src/index.ts` returned nothing, and the app had never heard
// of the field. Measured, not assumed.
//
// This is the honest answer to "make sure the pipeline uses all the analysis available": the run
// already performs this analysis. It simply did not keep it.

const INDEX = fs.readFileSync(path.join(process.cwd(), 'src/index.ts'), 'utf8');
const code = INDEX
  .split(/\r?\n/)
  .filter((l) => {
    const t = l.trim();
    return !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*');
  })
  .join('\n');

const at = code.indexOf('validationReport: r.validationReport ?');
const block = at === -1 ? '' : code.slice(at, at + 2600);

describe('the Stage 5 report reaches the database', () => {
  it('CONTROL: the persist block is where this test thinks it is', () => {
    // Every assertion below reads `block`; a moved anchor would make them all pass on an empty
    // string.
    expect(at, 'the validation report is no longer persisted').toBeGreaterThan(-1);
    expect(block).toContain('overallConfidencePct');
  });

  it('keeps what to do next, with what it would cost', () => {
    // topActions carries estimatedCostLow/High and expectedConfidenceBoost. A recommendation without
    // a price is not a decision an operator can make.
    expect(block).toContain('topActions:');
  });

  it('keeps which neighbour to research first', () => {
    // Computed on every run, printed three at a time, discarded.
    expect(block).toContain('adjacentResearchOrder:');
  });

  it('keeps the discrepancies and their severity', () => {
    expect(block).toContain('discrepancies:');
  });

  it('keeps the per-call evidence, which is what a surveyor checks', () => {
    expect(block).toContain('perCallConfidence:');
  });

  it('keeps the adjacent properties, roads and easements it identified', () => {
    for (const f of ['adjacentProperties', 'roads', 'easements']) {
      expect(block, `${f} is not persisted`).toContain(`${f}:`);
    }
  });
});

describe('truncation is stated, never silent', () => {
  it('every capped array says whether it was capped', () => {
    // A truncated list of discrepancies that does not say it was truncated reads as a property with
    // fewer problems than it has — which is the defect this whole plan is about, applied to the one
    // field a surveyor would act on.
    for (const f of ['topActionsTruncated', 'adjacentResearchOrderTruncated',
                     'discrepanciesTruncated', 'perCallConfidenceTruncated']) {
      expect(block, `${f} is missing, so a cap would be silent`).toContain(f);
    }
  });

  it('the caps are large enough for a real boundary', () => {
    // 200 per-call entries covers a boundary far larger than anything this firm surveys; a cap that
    // truncated ordinary work would make the flag meaningless by firing every time.
    expect(block).toContain('slice(0, 200)');
  });

  it('a run with no report persists null rather than an empty shell', () => {
    // `{}` would render as a report that found nothing, which is a claim. Null is the absence of one.
    expect(block).toContain('} : null,');
  });
});

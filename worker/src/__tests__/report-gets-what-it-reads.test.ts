// The report is handed every field the report reads.
//
// Twice in two slices I surfaced something in the master report and it did not reach a real run,
// because `pipeline.ts` assembles the object it passes **by hand**:
//
//     const partialResult = {
//       projectId: input.projectId,
//       propertyId: propertyResult?.propertyId ?? null,
//       validation,
//     } as PipelineResult;              // ← the cast erases everything missing
//
// `as PipelineResult` tells the compiler to stop checking. A field the report reads and this object
// omits is `undefined` at runtime, and every section in that report degrades honestly — so it prints
// "not computed", truthfully, forever, and nothing anywhere fails.
//
// The unit tests could not catch it because they construct their own result object. The only test
// that can is one that compares the two FILES, which is what this is.
//
// Third standing check in this suite, and the set now covers the three shapes this codebase produces:
//
//   research-modules-are-reachable         a module nothing imports
//   survey-primitives-are-not-duplicated   one rule, several implementations
//   this                                   a producer with no consumer, hidden behind a cast

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');
const reportGenerator = read('src/services/report-generator.ts');
const pipeline = read('src/services/pipeline.ts');

/** Source with quoted strings blanked out.
 *
 *  Without this the scan matched `pipeline.js` out of an import path and reported a missing field
 *  called "js" — a false accusation, which for a check like this is the worst failure available: it
 *  costs someone an hour proving the tool wrong, and the next real finding gets the same treatment. */
function withoutStrings(src: string): string {
  // Quoted strings only. Template literals are deliberately LEFT ALONE: most of this report is
  // built inside backticks, so `${pipeline.propertyId}` lives there — blanking them dropped the
  // scan from five fields to two and would have made the check pass by seeing almost nothing.
  // Caught by the "finds both sides" guard, which exists for exactly this.
  // No newlines inside the match. `[^'\\]` matches newlines, so a lone apostrophe in a prose comment
  // — "the surveyor's opinion", of which this codebase has many — opened a string that ran to the
  // next apostrophe pages later, swallowing the accesses in between. That took the scan from five
  // fields to two while still finding *some*, which is the quiet kind of wrong.
  return src
    .replace(/'(?:[^'\\\n]|\\.)*'/g, "''")
    .replace(/"(?:[^"\\\n]|\\.)*"/g, '""');
}

/** Every `pipeline.<field>` the report generator reads. */
function fieldsReadByReport(): string[] {
  const out = new Set<string>();
  for (const m of withoutStrings(reportGenerator).matchAll(/\bpipeline\.([a-zA-Z_][\w]*)/g)) {
    out.add(m[1]!);
  }
  return [...out].sort();
}

/** The object literal `pipeline.ts` hands to the report generator. */
function partialResultLiteral(): string {
  const start = pipeline.indexOf('const partialResult = {');
  expect(start, 'partialResult literal not found — did it get renamed?').toBeGreaterThan(-1);
  const end = pipeline.indexOf('} as PipelineResult', start);
  expect(end, 'the `as PipelineResult` cast not found after partialResult').toBeGreaterThan(start);
  return pipeline.slice(start, end);
}

describe('every field the report reads is actually passed to it', () => {
  it('finds both sides of the comparison', () => {
    // A check that silently matched nothing would pass forever and defend nothing — the failure the
    // first version of the reachability check had.
    expect(fieldsReadByReport().length).toBeGreaterThan(2);
    expect(partialResultLiteral().length).toBeGreaterThan(20);
  });

  it('omits nothing the report will try to print', () => {
    const literal = partialResultLiteral();
    const missing = fieldsReadByReport().filter((f) => !new RegExp(`\\b${f}\\b`).test(literal));

    expect(missing, missing.length
      ? `report-generator.ts reads these off \`pipeline\`, and pipeline.ts does NOT put them in the\n` +
        `object it passes. The \`as PipelineResult\` cast hides it, so the report will print its\n` +
        `"not computed" branch on every real run while the unit tests pass:\n  ${missing.join('\n  ')}`
      : '').toEqual([]);
  });

  it('the two fields that were actually missed are covered', () => {
    // Named explicitly so a future refactor that drops them fails loudly rather than quietly.
    const literal = partialResultLiteral();
    expect(literal).toContain('surveyReading');
    expect(literal).toContain('retrievalFailures');
  });
});

describe('the cast that hides the gap is still the reason this check exists', () => {
  it('pipeline.ts still uses the cast, so the check is still needed', () => {
    // If somebody ever types this object properly, the compiler takes over and this file can go.
    // Until then it is the only thing standing between a surfaced finding and a silent one.
    expect(pipeline).toContain('} as PipelineResult');
  });

  it('says why, at the point of temptation', () => {
    expect(pipeline).toContain('silently absent from the printed report');
  });
});

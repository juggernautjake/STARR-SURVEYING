import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// ── TWO VALUES CARRIED TO THE DOOR AND LEFT ON THE STEP ─────────────────────────────────────────
//
// `operatorNotes` had three occurrences in the whole worker: a type, and two places that copy it
// into a record of what the operator SENT. It was never put on `researchInput` — the only object
// the research code sees — so the create form's "Sent to the AI with the run" was false for every
// run ever made, and the pipeline route's comment calling it "the channel that already reaches the
// AI briefing" described a channel with nothing on the far end.
//
// The abort signal is the same shape. `runCountyResearch` has taken one since it was written and
// Bell has been handed it since it was written; the generic pipeline — every OTHER routed county —
// was called without one, so pressing Cancel on a Travis County run stopped nothing.
//
// ── THESE TESTS ASSERT THE CALLER, NOT THE CALLEE ───────────────────────────────────────────────
//
// A field existing on an interface is exactly the state that produced this defect. What has to be
// true is that the code one layer UP writes to it. `specialInstructions` is the standing proof:
// declared on `CountyResearchInput`, declared again on the Bell input, passed at the Bell dispatch
// — and read only by `generateSurveyPlan`, which no run calls.

const read = (p: string): string => fs.readFileSync(path.join(process.cwd(), p), 'utf8');

/** Source with comments removed, so a probe cannot match this file's own prose. */
function code(p: string): string {
  const raw = read(p);
  const stripped = raw
    .replace(/^[ \t]*\/\*[\s\S]*?\*\//gm, '')
    .replace(/^[ \t]*\/\/[^\n\r]*/gm, '');
  // A control, because a stripper that eats the file makes every not.toContain pass.
  if (!/\b(import|export|function|const|interface)\b/.test(stripped) || stripped.length < raw.length * 0.02) {
    throw new Error(`comment stripping destroyed ${p}`);
  }
  return stripped;
}

describe('CONTROL — the probes can find wiring that is present', () => {
  it('finds a field this codebase already threads end to end', () => {
    // `instrumentNumber` was landed in an earlier slice by exactly this route. If these probes
    // cannot see it, a miss below says nothing about operatorNotes.
    expect(code('src/index.ts')).toContain('instrumentNumber: instrumentNumber ?? undefined');
    expect(code('src/counties/router.ts')).toContain('instrumentNumber: input.instrumentNumber');
  });
});

describe('operatorNotes reaches the code that can use it', () => {
  it('index.ts writes it onto researchInput, not only onto the run record', () => {
    expect(code('src/index.ts')).toContain('operatorNotes: body.operatorNotes?.trim() || undefined');
  });

  it('the router hands it to BOTH paths', () => {
    const s = code('src/counties/router.ts');
    const hits = s.split('operatorNotes: input.operatorNotes').length - 1;
    expect(hits).toBeGreaterThanOrEqual(2);
  });

  it('the generic pipeline puts it in the Stage 5 briefing, which is its only AI pass', () => {
    expect(code('src/services/pipeline.ts')).toContain('operatorNotes:    input.operatorNotes ?? null');
    expect(code('src/services/property-validation-pipeline.ts'))
      .toContain('operatorContext_unverifiedClaimsToCheckNotFacts');
  });

  it('Bell puts it in the deed-summary prompt', () => {
    const orch = code('src/counties/bell/orchestrator.ts');
    // Both analyzeBellDeeds call sites — the main one and the historical pass.
    expect(orch.split('operatorNotes: input.operatorNotes').length - 1).toBeGreaterThanOrEqual(2);

    const da = code('src/counties/bell/analyzers/deed-analyzer.ts');
    expect(da).toContain('input.operatorNotes');
    // The prompt must actually interpolate it, not merely accept it.
    expect(da).toContain('${targetContext}${notesContext}');
  });

  it('it is framed as a claim to check, never as a recorded fact', () => {
    // An operator's "seller says 2.3 acres" repeated back as though a deed carried it is worse
    // than not passing the notes at all: it launders a belief into the record.
    expect(read('src/counties/bell/analyzers/deed-analyzer.ts')).toContain('NOT as recorded fact');
    expect(read('src/services/property-validation-pipeline.ts')).toContain('unverifiedClaimsToCheckNotFacts');
  });

  it('both paths print it on the run log the operator is watching', () => {
    expect(code('src/services/pipeline.ts')).toContain('What the operator told us about this property');
    expect(code('src/counties/bell/orchestrator.ts')).toContain('What the operator told us about this property');
  });
});

describe('the stop button reaches every county, not just Bell', () => {
  it('the router passes the signal to the generic pipeline', () => {
    const s = code('src/counties/router.ts');
    // Inside the object literal built for runPipeline, not merely the Bell argument list.
    expect(s).toMatch(/const pipelineInput: PipelineInput = \{[\s\S]*?\n\s*signal,/);
  });

  it('the pipeline checks it at every stage boundary', () => {
    const s = code('src/services/pipeline.ts');
    for (const stage of ['Stage 0', 'Stage 1', 'Stage 2', 'Stage 3', 'Stage 3.5', 'Stage 4', 'Stage 5', 'Stage 6']) {
      expect(s).toContain(`stopIfAborted('${stage}')`);
    }
  });

  it('an expected stop is rethrown, not reported as a crash', () => {
    // Returning emptyResult() here would hand the caller status 'failed' and documents [] for a
    // run that stopped exactly where its operator told it to.
    expect(code('src/services/pipeline.ts')).toMatch(/if \(input\.signal\?\.aborted\)[\s\S]{0,600}?throw err;/);
  });

  it('the router draws the same Stopped-vs-Failed distinction on both paths', () => {
    const s = code('src/counties/router.ts');
    // Bell had this; the generic branch did not, because it could not be stopped at all.
    expect(s.split("phase: expected ? 'Stopped' : 'Failed'").length - 1).toBe(2);
  });
});

describe('what is deliberately NOT claimed', () => {
  it('specialInstructions is still unread by any run, and says so', () => {
    // Kept honest on purpose: the temptation was to quietly repurpose this field for the notes.
    // It is declared on three types and read only by generateSurveyPlan, which no run calls.
    const worker = ['src/counties/bell/orchestrator.ts', 'src/services/pipeline.ts'].map(code).join('\n');
    expect(worker).not.toContain('specialInstructions');
    expect(read('src/counties/bell/types/research-input.ts')).toContain('no run calls that');
  });
});

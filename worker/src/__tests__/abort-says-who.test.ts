import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { BudgetAbort, OperatorAbort, ShutdownAbort, describeAbort } from '../research/abort-reason.js';

// ── "PIPELINE CANCELLED BY USER", ON A RUN NOBODY CANCELLED ─────────────────────────────────────
//
// Measured 2026-09-03. One run, two fields, disagreeing:
//
//     Activity     ✕ Pipeline — Pipeline cancelled by user
//     stop_reason  budget_reached
//
// The owner: "it is saying it stoped because it reached its time limit, and it is also saying it
// stopped because I cancelled it. I did not cancel it."
//
// They were right. `index.ts:1341` aborts when the budget is exhausted, and
// `orchestrator.ts:108` threw `DOMException('Pipeline cancelled by user')` for ANY abort — because
// `signal.aborted` is a boolean and a boolean cannot say who set it.
//
// The half-fix is the interesting part: BOTH abort sites already set `stopReason` on the
// activePipelines entry, with comments describing this exact defect. That fixed the STATUS
// endpoint. It did not fix the thrown exception, because the orchestrator cannot see that map —
// and the exception's message is what reaches `research_runs.message` and the Activity log the
// owner was actually reading. The fix reached the surface that was checked, not the one displayed.

const ROOT = path.join(__dirname, '..', '..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const code = (p: string) => {
  const raw = read(p);
  const s = raw.replace(/^[ \t]*\/\*[\s\S]*?\*\//gm, '').replace(/^[ \t]*\/\/[^\n\r]*/gm, '');
  if (!s.includes('import')) throw new Error(`comment stripping destroyed ${p}`);
  return s;
};

describe('an abort names its cause', () => {
  it('the budget ceiling is an EXPECTED stop, not a cancellation', () => {
    const d = describeAbort(new BudgetAbort('Finished early because the run hit its 25-minute time limit.'));
    expect(d.kind).toBe('budget');
    expect(d.isExpected).toBe(true);
    // The exact string the owner disputed must not appear for this cause.
    expect(d.message).not.toMatch(/cancelled by user/i);
  });

  it('only an operator cancel says an operator cancelled', () => {
    const d = describeAbort(new OperatorAbort('Cancelled by the operator.'));
    expect(d.kind).toBe('operator');
    expect(d.isExpected).toBe(true);
  });

  it('a shutdown is NOT expected — the run did not get to finish', () => {
    const d = describeAbort(new ShutdownAbort());
    expect(d.kind).toBe('shutdown');
    expect(d.isExpected).toBe(false);
  });

  it('an unattributed abort admits it does not know', () => {
    // The whole defect was a confident wrong cause. "We do not know why this stopped" looks worse
    // and is far more useful — it does not send anyone to argue with the operator.
    const d = describeAbort(undefined);
    expect(d.kind).toBe('unknown');
    expect(d.isExpected).toBe(false);
    expect(d.message).toMatch(/not known whether a person cancelled it/);
    expect(d.message).not.toMatch(/cancelled by user/i);
  });

  it('CONTROL: a plain Error still surfaces its own message', () => {
    // Without this, "always return the unknown sentence" would satisfy the assertion above.
    expect(describeAbort(new Error('socket hang up')).message).toBe('socket hang up');
  });
});

describe('every abort site carries a reason — assert the CALLERS', () => {
  it('CONTROL: stripping kept the code and dropped the prose', () => {
    expect(code('src/index.ts')).toContain('BudgetAbort');
    expect(code('src/index.ts')).not.toContain('a boolean cannot say who set it');
  });

  it('the budget abort says it is the budget', () => {
    expect(code('src/index.ts')).toMatch(/pipelineAbortController\.abort\(new BudgetAbort\(/);
  });

  it('the operator cancel says it is the operator', () => {
    expect(code('src/index.ts')).toMatch(/abortController\.abort\(new OperatorAbort\(/);
  });

  it('no bare abort() is left to be misattributed', () => {
    const src = code('src/index.ts');
    expect(src, 'a bare abort() is back — it will be blamed on the operator').not.toMatch(
      /AbortController\.abort\(\)|abortController\.abort\(\)/,
    );
  });

  it('checkAborted reports the signal reason instead of hardcoding a culprit', () => {
    const src = code('src/counties/bell/orchestrator.ts');
    expect(src).toContain('describeAbort(');
    expect(src, 'the hardcoded blame is back').not.toContain("DOMException('Pipeline cancelled by user'");
  });

  it('and the router stops calling an expected stop a crash', () => {
    // `phase: 'Failed'` beside `status: 'complete'` and a message beginning "pipeline error" —
    // three fields describing one ordinary early finish, disagreeing.
    const src = code('src/counties/router.ts');
    expect(src).toContain("phase: expected ? 'Stopped' : 'Failed'");
    expect(src).toContain('abort?.isExpected === true');
  });
});

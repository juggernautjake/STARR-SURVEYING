import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { describeRunOutcome, describeCrashedRun } from '../research/run-outcome.js';

// D2 — "a run that reports FAILED and then Pipeline Complete in the same log. Decide which it is
// and say it once."
//
// From the Milam run of 2026-09-02, ten minutes apart, about the same run:
//
//     [00:10:53]  Pipeline FAILED in 261.9s
//     [00:15:58]  [Pipeline Lifecycle] Pipeline Complete
//
// Neither line lied. `pipeline.ts` reported the RESULT; `index.ts` reported the LIFECYCLE — that the
// function resolved rather than threw — and logged `.success()` regardless of what was found. A
// reader cannot reconcile them, and the one they see last wins.

const read = (...p: string[]) => fs.readFileSync(path.join(process.cwd(), ...p), 'utf8');

const codeOnly = (src: string) =>
  src
    .split(/\r?\n/)
    .filter((l) => {
      const t = l.trim();
      return !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*');
    })
    .join('\n');

describe('the three outcomes read as three different things', () => {
  const opts = { documents: 3, durationMs: 261_900 };

  it('complete is a success', () => {
    const o = describeRunOutcome('complete', opts);
    expect(o.isProblem).toBe(false);
    expect(o.sentence).toContain('261.9s');
    expect(o.sentence).toContain('3 documents');
  });

  it('partial is NOT a problem — it is an answer with a caveat', () => {
    // Flagging a usable result red teaches an operator to ignore red. A run that got a good boundary
    // and a short document set has told them something worth having.
    const o = describeRunOutcome('partial', opts);
    expect(o.isProblem).toBe(false);
    expect(o.sentence).toMatch(/incomplete/i);
  });

  it('an empty run says it found nothing, and does not say it failed', () => {
    // `status: 'failed'` is set when there is no boundary, no property id and no documents — the run
    // executed correctly and found nothing. That is a finding, not a fault, and a different finding
    // from the pipeline throwing.
    const o = describeRunOutcome('failed', { documents: 0, durationMs: 261_900 });
    expect(o.isProblem).toBe(true);
    expect(o.label).toBe('Research Found Nothing');
    expect(o.label.toLowerCase(), 'an empty run is still being called a failure').not.toContain('failed');
    expect(o.sentence).toMatch(/not proof the records do not exist/i);
  });

  it('only a crash gets the word "failed"', () => {
    const o = describeCrashedRun('ECONNRESET');
    expect(o.label).toBe('Research Failed');
    expect(o.isProblem).toBe(true);
    expect(o.sentence).toContain('ECONNRESET');
  });

  it('CONTROL: the labels are genuinely distinct', () => {
    // If two statuses produced the same label, "say it once" would be satisfied by saying the wrong
    // thing consistently.
    const labels = (['complete', 'partial', 'failed'] as const).map(
      (s) => describeRunOutcome(s, opts).label,
    );
    expect(new Set(labels).size).toBe(3);
    expect(labels).not.toContain(describeCrashedRun('x').label);
  });

  it('singular reads correctly — one document is not "1 documents"', () => {
    expect(describeRunOutcome('complete', { documents: 1, durationMs: 1000 }).sentence)
      .toContain('1 document.');
  });
});

describe('both layers take their wording from the one place', () => {
  const pipeline = codeOnly(read('src/services/pipeline.ts'));
  const index = codeOnly(read('src/index.ts'));

  it('the pipeline no longer prints its raw status as a verdict', () => {
    expect(
      pipeline,
      'the `Pipeline ${status.toUpperCase()}` line is back',
    ).not.toContain('Pipeline ${status.toUpperCase()} in');
  });

  it('the pipeline uses the shared wording', () => {
    expect(pipeline).toContain('describeRunOutcome(status');
  });

  it('the lifecycle handshake uses the shared wording too — the other half of the contradiction', () => {
    expect(index).toContain('describeRunOutcome(unifiedResult.data.status');
  });

  it('the handshake no longer hardcodes "Pipeline Complete"', () => {
    expect(
      index,
      'the lifecycle entry still announces completion regardless of the result',
    ).not.toContain("'Pipeline Complete'");
  });

  it('and no longer claims success unconditionally', () => {
    const at = index.indexOf('const lifecycleOutcome');
    expect(at, 'the lifecycle block moved').toBeGreaterThan(-1);
    const block = index.slice(at, at + 1200);
    expect(block).toContain('lifecycleOutcome.isProblem');
    const warnAt = block.indexOf('.warn(');
    const successAt = block.indexOf('.success(');
    expect(warnAt).toBeGreaterThan(-1);
    expect(successAt).toBeGreaterThan(-1);
    expect(warnAt, 'success is claimed before the problem case is considered').toBeLessThan(successAt);
  });
});

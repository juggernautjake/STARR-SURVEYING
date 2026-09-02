import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { FilingTally } from '../research/file-document.js';

// B1 — `[Library]: 0 new document(s) filed. 1 could not be written.`
//
// A document was captured and then lost, and the run said so without saying why. The reason was
// never missing: `record()` stores the error string and `describe()` printed only `.length`. The
// answer was in hand and dropped one line before it mattered.
//
// This is the same defect as the 22 rows advertising a file nobody wrote — a count with no cause —
// and it was ALSO being logged as a success, which is the second half of the fix.

const err = (message: string) => ({ outcome: 'error' as const, error: message, reason: 'x' });

describe('a document that could not be written says why', () => {
  it('CONTROL: a clean tally still reads as it did, with no failure clause', () => {
    // Without this, "always append a scary sentence" would pass every other test here.
    const t = new FilingTally();
    t.record({ outcome: 'new', id: '1', reason: 'x' });
    expect(t.describe()).toBe('1 new document(s) filed.');
    expect(t.hasFailures).toBe(false);
  });

  it('names the reason instead of only counting', () => {
    const t = new FilingTally();
    t.record(err('storage_url was null'));
    const out = t.describe();
    expect(out).toContain('1 could not be written');
    expect(out, 'the cause is still being thrown away').toContain('storage_url was null');
  });

  it('says plainly that the review is incomplete', () => {
    // The operator-facing consequence, not just the mechanic.
    const t = new FilingTally();
    t.record(err('boom'));
    expect(t.describe()).toContain('retrieved and then lost');
  });

  it('collapses one repeated cause rather than printing it fifty times', () => {
    // A portal that times out fails every document in the batch identically.
    const t = new FilingTally();
    for (let i = 0; i < 50; i += 1) t.record(err('clerk portal timed out'));
    const out = t.describeFailures();
    expect(out).toContain('50 could not be written');
    expect(out).toContain('clerk portal timed out (x50)');
    // One occurrence of the message, not fifty.
    expect(out.split('clerk portal timed out').length - 1).toBe(1);
  });

  it('caps the list and admits what it did not show', () => {
    const t = new FilingTally();
    for (const m of ['a', 'b', 'c', 'd', 'e']) t.record(err(m));
    const out = t.describeFailures();
    expect(out).toContain('and 2 other reason(s)');
  });

  it('does not print an empty reason as a blank', () => {
    const t = new FilingTally();
    t.record(err('   '));
    expect(t.describeFailures()).toContain('no reason given');
  });

  it('still counts filed, merged and flagged alongside the failure', () => {
    const t = new FilingTally();
    t.record({ outcome: 'new', id: '1', reason: 'x' });
    t.record({ outcome: 'merged', id: '2', reason: 'x' });
    t.record(err('nope'));
    const out = t.describe();
    expect(out).toContain('1 new document(s) filed');
    expect(out).toContain('already held from an earlier run');
    expect(out).toContain('nope');
  });
});

describe('the run log stops calling a lost document a success', () => {
  const SRC = fs.readFileSync(path.join(process.cwd(), 'src/index.ts'), 'utf8');
  const at = SRC.indexOf('const filing = endFiling(projectId);');
  const raw = SRC.slice(at, at + 1200);

  // Comments stripped, because this block's own comment QUOTES the code it replaced — "logged 'info'
  // and `.success()` unconditionally" — and an ordering assertion that reads prose is measuring the
  // explanation rather than the behaviour. This repository has been caught by that four times.
  const block = raw
    .split(/\r?\n/)
    .filter((l) => !l.trim().startsWith('//'))
    .join('\n');

  it('CONTROL: the filing block is where this test thinks it is', () => {
    expect(at, 'endFiling call site moved — this whole block is vacuous').toBeGreaterThan(-1);
    expect(block).toContain('[Library]');
  });

  it('branches on whether anything failed', () => {
    expect(block).toContain('filing.hasFailures');
  });

  it('logs a failure as warn, not info+success', () => {
    const warnAt = block.indexOf("'warn'");
    const successAt = block.indexOf('.success(');
    expect(warnAt, 'the failure path still reports info').toBeGreaterThan(-1);
    expect(successAt, 'the clean path lost its success').toBeGreaterThan(-1);
    expect(warnAt, 'success is claimed before the failure branch is considered').toBeLessThan(successAt);
  });

  it('puts the reasons in the run log, which is the point of B1', () => {
    expect(block).toContain('describeFailures()');
  });
});

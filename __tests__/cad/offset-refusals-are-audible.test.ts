// C16 — the offset panels say why, instead of doing nothing.
//
// ── THE DEFECT ──────────────────────────────────────────────────────────────────────────────────
//
// Both offset panels advertise a keyboard commit on the button face — "Apply (Enter)" and
// "Place (Enter)" — and both had a commit path that could fail without a word.
//
//   OffsetPanel.onKeyDown        Enter called handleApply() unconditionally. With a blank or zero
//                                distance `applyOffsetFromPanel` returns false, `onCommit()` never
//                                fires, and nothing visible happens. The Apply BUTTON beside it was
//                                already `disabled` for exactly that state, so the mouse path gave
//                                a (dim, wordless) signal and the keyboard path gave none at all.
//
//   commitPerp                   Three bare `return`s. The commonest one: length left blank to
//                                "drag to set" it, cursor never moved off the start point, so the
//                                projected length is ~0, `computePerpEndpoint` returns null, and
//                                Place does nothing forever.
//
// This is the failure S7b already named in this codebase: *a silent no-op is the worst version of
// this — the input was accepted, so there is nothing to retry.* The surveyor's next move is to
// press Enter harder.
//
// ── WHY A SOURCE SCAN ───────────────────────────────────────────────────────────────────────────
//
// `commitPerp` is a closure inside a 14,000-line component bound to a live PIXI canvas; standing it
// up in jsdom would test the harness, not the fix (the lesson C14 recorded). What is worth pinning
// is that neither exit is silent, and that each channel is the one that surface already uses —
// inline text for the panel, the command bar for the canvas tool.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** Comments stripped — this change's own comments quote the strings they describe, the trap that
 *  cost C3's guard three revisions. */
function code(rel: string): string {
  return readFileSync(join(process.cwd(), rel), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');
}

const panel = code('app/admin/cad/components/OffsetPanel.tsx');
const viewport = code('app/admin/cad/components/CanvasViewport.tsx');

describe('the source scan is looking at the right code', () => {
  it('found both commit paths', () => {
    // A stripped-to-nothing file would make every assertion below vacuous.
    expect(panel).toMatch(/function onKeyDown/);
    expect(viewport).toMatch(/function commitPerp/);
  });
});

describe('OffsetPanel — Enter never no-ops', () => {
  it('guards Enter on the same condition that disables the button', () => {
    const kd = panel.slice(panel.indexOf('function onKeyDown'), panel.indexOf('const canApply'));
    expect(kd).toMatch(/if \(!canApply\)/);
    expect(kd, 'the guard must fire BEFORE handleApply, not after').toMatch(
      /!canApply[\s\S]{0,200}return;[\s\S]{0,40}\}\s*handleApply\(\)/,
    );
  });

  it('sets a reason on the blocked path rather than returning bare', () => {
    const kd = panel.slice(panel.indexOf('function onKeyDown'), panel.indexOf('const canApply'));
    expect(kd).toMatch(/setReason\(applyBlockedReason\(\)\)/);
  });

  it('the reason names the thing to fix, per condition', () => {
    const fn = panel.slice(panel.indexOf('function applyBlockedReason'));
    // Two distinct blockers, two distinct sentences. One generic "cannot apply" for both would be
    // no more actionable than the silence it replaced.
    expect(fn).toMatch(/offsetSourceId[\s\S]{0,80}Pick the feature/);
    expect(fn).toMatch(/greater than zero/);
  });

  it('renders the reason where the surveyor is already looking', () => {
    expect(panel, 'a reason held only in state is still silence').toMatch(
      /\{reason && \([\s\S]{0,400}\{reason\}/,
    );
    expect(panel, 'assistive tech needs the announcement too').toMatch(/role="alert"/);
  });

  it('clears the reason once the surveyor starts fixing it', () => {
    // A complaint that outlives its cause becomes noise, and then gets ignored when it is right.
    expect(panel).toMatch(/if \(reason\) setReason\(''\)/);
  });

  it('the disabled button carries the same reason on hover', () => {
    expect(panel).toMatch(/title=\{canApply \?[\s\S]{0,60}applyBlockedReason\(\)\}/);
  });
});

describe('commitPerp — Place never no-ops', () => {
  // The end marker has to survive comment-stripping. The first draft closed the slice on the
  // "Mouse event handlers" banner comment, which by then no longer existed — so `fn` was the whole
  // 14k-line file, 77 bare returns, and every assertion above was matching the file at large.
  const start = viewport.indexOf('function commitPerp');
  const end = viewport.indexOf('const handleMouseDown', start);
  const fn = viewport.slice(start, end);

  it('the slice really is just commitPerp', () => {
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    expect(fn.length, 'a runaway slice makes everything below vacuous').toBeLessThan(1600);
  });

  it('explains a missing start point', () => {
    expect(fn).toMatch(/!st\.perpStartPoint[\s\S]{0,160}refuse\(/);
    expect(fn).toMatch(/base line first/);
  });

  it('explains a null endpoint', () => {
    expect(fn).toMatch(/if \(!end\)[\s\S]{0,200}refuse\(/);
  });

  it('distinguishes a bad typed length from a length never set', () => {
    // These need different next moves: fix the number, versus supply one at all. Collapsing them
    // sends half the surveyors to the wrong field.
    expect(fn).toMatch(/length must be greater than zero/);
    expect(fn).toMatch(/type a length[\s\S]{0,80}move the cursor/);
  });

  it('speaks on the channel this tool already uses for success', () => {
    // commitPerp announces "PERPENDICULAR — line placed." on the command bar. A refusal routed
    // anywhere else would be a second, unlearned place to look.
    expect(fn).toMatch(/cad:commandOutput/);
    const refusals = [...fn.matchAll(/PERPENDICULAR — /g)];
    expect(refusals.length, 'success + both refusal shapes').toBeGreaterThanOrEqual(3);
  });

  it('leaves no bare return on a commit path', () => {
    const bare = [...fn.matchAll(/\n\s*return;/g)];
    expect(bare.length, 'both early exits should still be here to check').toBe(2);
    for (const m of bare) {
      // Back to the top of the enclosing guard rather than a fixed character window — the second
      // refusal's ternary is long enough that any window wide enough to clear it would also be wide
      // enough to catch the OTHER exit's refuse() and pass vacuously.
      const guard = fn.slice(0, m.index!).lastIndexOf('if (');
      const before = fn.slice(guard, m.index!);
      expect(before, `a silent exit survives near: ${before.slice(0, 90)}`).toMatch(/refuse\(/);
    }
  });
});

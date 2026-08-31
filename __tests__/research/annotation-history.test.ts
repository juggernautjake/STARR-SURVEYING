// __tests__/research/annotation-history.test.ts
//
// Undo/redo for drawing annotations. **This logic shipped untested**, because it could not be
// reached: four `useState`s and four closures inside a 3,600-line component. Extracting it into
// `useAnnotationHistory` made it ordinary functions over ordinary values.
//
// ── WHY IT DESERVES TESTS ───────────────────────────────────────────────────────────────────────
//
// It is the kind of logic that looks obvious and is not:
//
//   · a new edit must DISCARD the redo stack — without that, undo → edit → redo restores a state
//     that never followed the edit, and the drawing silently regains annotations the surveyor
//     deleted;
//   · the history cap must trim the OLDEST entries — trimming the other way keeps the fifty oldest
//     and throws away everything recent, which is the opposite of an undo stack;
//   · a drag must not commit — every mouse-move calls the silent path, and if it pushed history a
//     single drag would become a hundred undo steps.
//
// None of those is visible by reading, and all three are one character away from wrong.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  EMPTY_HISTORY, MAX_UNDO_HISTORY, commit, redo, reset, silentChange, undo,
  type AnnotationHistoryState,
} from '../../app/admin/research/[projectId]/_sections/annotation-history';
import type { UserAnnotation } from '../../app/admin/research/components/DrawingCanvas';

/** Minimal annotation — only identity matters to these rules. */
const a = (id: string) => ({ id } as unknown as UserAnnotation);
const ids = (list: UserAnnotation[]) => list.map((x) => (x as unknown as { id: string }).id);

describe('a tracked edit', () => {
  it('records the previous state and applies the new one', () => {
    const s = commit(reset([a('1')]), [a('1'), a('2')]);
    expect(ids(s.annotations)).toEqual(['1', '2']);
    expect(s.past.map(ids)).toEqual([['1']]);
    expect(s.hasUnsavedChanges).toBe(true);
  });

  it('DISCARDS the redo stack', () => {
    // The rule that is easy to leave out and impossible to spot by hand. Undo, then a new edit:
    // the redone future no longer belongs to this timeline.
    let s = commit(reset([a('1')]), [a('1'), a('2')]);
    s = undo(s);
    expect(s.future).toHaveLength(1);
    s = commit(s, [a('1'), a('3')]);
    expect(s.future, 'redo must not restore a state that never followed this edit').toEqual([]);
  });
});

describe('the history cap', () => {
  it('keeps the NEWEST entries, not the oldest', () => {
    let s = reset([a('0')]);
    for (let i = 1; i <= MAX_UNDO_HISTORY + 10; i++) s = commit(s, [a(String(i))]);
    expect(s.past).toHaveLength(MAX_UNDO_HISTORY);
    // The most recent past state must be the one just before the current annotations.
    const newest = ids(s.past[s.past.length - 1]);
    expect(newest, 'trimming from the wrong end keeps the fifty OLDEST states').toEqual([String(MAX_UNDO_HISTORY + 9)]);
  });

  it('still undoes correctly at the cap', () => {
    let s = reset([a('0')]);
    for (let i = 1; i <= MAX_UNDO_HISTORY + 5; i++) s = commit(s, [a(String(i))]);
    const before = ids(s.annotations);
    s = undo(s);
    expect(ids(s.annotations)).not.toEqual(before);
    expect(s.past).toHaveLength(MAX_UNDO_HISTORY - 1);
  });
});

describe('a silent change', () => {
  it('does not touch either stack', () => {
    // Every mouse-move during a drag comes through here. Committing would make one drag a hundred
    // undo steps and undo useless.
    const base = commit(reset([a('1')]), [a('2')]);
    const s = silentChange(base, [a('3')]);
    expect(ids(s.annotations)).toEqual(['3']);
    expect(s.past).toEqual(base.past);
    expect(s.future).toEqual(base.future);
  });

  it('still marks the drawing dirty', () => {
    // It is not a commit, but it IS a change — the beforeunload guard reads this.
    expect(silentChange(EMPTY_HISTORY, [a('1')]).hasUnsavedChanges).toBe(true);
  });
});

describe('undo and redo', () => {
  it('round-trip to the same state', () => {
    const start = reset([a('1')]);
    const edited = commit(start, [a('1'), a('2')]);
    expect(ids(redo(undo(edited)).annotations)).toEqual(['1', '2']);
  });

  it('do nothing at the ends rather than throwing', () => {
    // `past[-1]` is `undefined`, and setting annotations to undefined would break the canvas a long
    // way from here.
    expect(undo(EMPTY_HISTORY)).toBe(EMPTY_HISTORY);
    expect(redo(EMPTY_HISTORY)).toBe(EMPTY_HISTORY);
  });

  it('walk back through several edits in order', () => {
    let s = reset([a('0')]);
    s = commit(s, [a('1')]);
    s = commit(s, [a('2')]);
    expect(ids(undo(s).annotations)).toEqual(['1']);
    expect(ids(undo(undo(s)).annotations)).toEqual(['0']);
  });
});

describe('reset', () => {
  it('forgets the history — you cannot undo into the previous drawing', () => {
    // The page did this by hand in three places. A fourth that forgot would let somebody undo their
    // way into a different drawing's annotations.
    let s = commit(reset([a('1')]), [a('2')]);
    s = reset([a('9')]);
    expect(s.past).toEqual([]);
    expect(s.future).toEqual([]);
    expect(s.hasUnsavedChanges, 'a freshly loaded drawing is not dirty').toBe(false);
    expect(undo(s)).toBe(s);
  });
});

describe('the page actually uses these rules', () => {
  // The rules being correct is worth nothing if the page still has its own copy. That is the defect
  // this whole session kept finding, and a rules module is an especially easy place to commit it:
  // it compiles, its own tests pass, and the page carries on with the logic it always had.
  //
  // A `useAnnotationHistory` hook was written first and deleted unshipped for the same reason —
  // wiring it meant rewriting 83 references with no way to run the result, so it would have been
  // dead code until every one of them moved.
  const PAGE = fs.readFileSync(
    path.join(process.cwd(), 'app/admin/research/[projectId]/page.tsx'),
    'utf8',
  );

  it('imports the rules', () => {
    expect(PAGE).toContain("from './_sections/annotation-history'");
  });

  it('calls them from all four handlers', () => {
    for (const fn of ['commitAnnotations(', 'undoAnnotations(', 'redoAnnotations(',
      'silentAnnotationChange(']) {
      expect(PAGE, `${fn} is not called`).toContain(fn);
    }
  });

  it('no longer carries its own copy of the cap', () => {
    // `MAX_UNDO_HISTORY` was declared inline in the page. Two definitions of one cap is how they
    // drift, and the page's copy would have been the one that ran.
    expect(PAGE, 'the page still defines its own history cap').not.toContain('MAX_UNDO_HISTORY');
  });

  it('applies the whole result, not part of it', () => {
    // `applyHistory` sets all four pieces. Setting only `annotations` would leave the stacks
    // untouched — undo would appear to work once and then repeat the same state for ever.
    const fn = PAGE.slice(PAGE.indexOf('function applyHistory('), PAGE.indexOf('const historyState'));
    for (const setter of ['setAnnotations(', 'setAnnotationHistory(', 'setAnnotationFuture(',
      'setHasUnsavedChanges(']) {
      expect(fn, `applyHistory does not call ${setter}`).toContain(setter);
    }
  });
});

// __tests__/dnd/transpose-progress.test.ts — a transpose SHOWS ITS WORK (TR1) and asks consent (TR2).
//
// RE-POINTED WHOLESALE 2026-07-29 (P4-6c). Every assertion here read `SystemSwitcher.tsx`, a component
// rendered by nothing since consolidation C3 — so this file was green while describing UI no user could
// reach. `no-orphan-components` flagged the component; these were the last three test files keeping it
// alive, and this is the last of them.
//
// THE BEHAVIOURS SURVIVED; THEIR SHAPES DID NOT, which is why each was checked against `EditFlow` rather
// than sed-ed across:
//   · the explicit `phase: 'working' | 'done'` state machine became `busy` plus a `result` step — the same
//     lifecycle expressed with the step the flow is already on, instead of a second parallel state;
//   · the indeterminate `transposeBar` sweep became a spinner with a sentence explaining the wait, which is
//     a better answer to "has this hung?" than an animated bar with no words;
//   · the "✓ Transposed into" toast became a full report panel (`TransposeReport`) with an open-it link.
//
// Where a claim had no equivalent it was DROPPED with a note, not reworded onto something adjacent —
// inventing a claim about the new component to keep an old test name alive is worse than deleting it.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const editFlow = readFileSync(join(process.cwd(), 'app/dnd/_ui/EditFlow.tsx'), 'utf8');

describe('transpose progress + completion UX (TR1)', () => {
  it('tracks an in-flight state, and only a real rebuild says what is being rebuilt', () => {
    // `busy` IS the working phase. The distinction the old `isTranspose` guard drew — an instant switch
    // must not enter the transpose lifecycle — is now structural: only the AI/level-up steps render the
    // explanatory spinner, and an already-built version switches without entering this flow at all.
    expect(editFlow).toContain('const [busy, setBusy] = useState(false);');
    expect(editFlow).toMatch(/busy && \(step === 'ai-kind' \|\| step === 'levelup-kind'/);
  });

  it('shows a spinner AND says what is happening, because a silent wait reads as a hang', () => {
    expect(editFlow).toContain('styles.spinner');
    expect(editFlow).toMatch(/Rebuilding \{name\} in /);
    // The reassurance that nothing is lost — the specific worry a full AI rebuild creates.
    expect(editFlow).toMatch(/Your other versions are kept/);
    expect(editFlow).toMatch(/This takes a few seconds/);
  });

  it('and completion is a REPORT with a way into the result, not just a toast', () => {
    expect(editFlow).toContain('<TransposeReport');
    expect(editFlow).toMatch(/Open the new version →/);
    expect(editFlow).toMatch(/now has a new version in this system\. Your other versions are untouched\./);
  });

  // DROPPED: `styles.transposeBar` + the `@keyframes transposeSweep` CSS. That was an indeterminate
  // progress bar belonging to the retired panel; `EditFlow` uses a spinner with a sentence instead. There
  // is no bar to assert, and asserting the CSS rule still EXISTS would only guard dead styling.
});

describe('custom-content consent before an AI transpose (TR2)', () => {
  it('asks whether the AI may invent content, rather than deciding for the player', () => {
    // The rule that must not be lost: a transpose can only fabricate content if the player says so, and a
    // vanilla-only campaign removes the question entirely (asserted in `edit-flow-ui`).
    expect(editFlow).toMatch(/allowCustom/);
  });

  it('and the answer is passed to the route', () => {
    expect(editFlow).toMatch(/allowCustom:/);
  });
});

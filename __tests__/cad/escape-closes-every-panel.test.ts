// __tests__/cad/escape-closes-every-panel.test.ts
//
// C45 — every panel CADLayout owns closes on Escape, and a new one cannot quietly miss out.
//
// C13's contract states the universal rule — *"Escape cancels from any state and is never a
// no-op"* — and measured that 56 of 58 toolbar entries never mention Escape, calling that a hint
// that the key was inconsistently IMPLEMENTED rather than merely undocumented. Driving the panels
// at 390px settled it: of the five dialogs that pass reached, none closed on Escape, and the source
// agreed — `AIDrawingDialog`, `CalcPointDialog`, `CloseDrawingDialog`, `CodeStylePanel` and
// `CompletenessPanel` contain no reference to the key at all.
//
// The fix is one handler in `CADLayout`, not thirty-one `onKeyDown` props — the same fix written
// thirty-one times is a fix dialog thirty-two forgets, which is precisely how the gap opened. That
// makes the handler's list of setters the thing that rots, so this test is what stops it: every
// panel-visibility state declared in the file must appear in the Escape handler.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = readFileSync(join(__dirname, '..', '..', 'app', 'admin', 'cad', 'CADLayout.tsx'), 'utf8');

/** The Escape effect's body — sliced so the assertions below cannot accidentally match the rest of
 *  a 1,000-line component that mentions these names for other reasons. */
function escapeHandlerBody(): string {
  const start = SRC.indexOf("if (e.key !== 'Escape') return;");
  expect(start, 'the Escape handler is gone').toBeGreaterThan(-1);
  // Bounded on `addEventListener('keydown'` without its arguments. The first version pinned the
  // whole call including a trailing `);`, and adding the capture flag (`, true`) silently unmatched
  // it — `indexOf` returned -1, the slice came back empty, and four assertions failed on a handler
  // that was correct. A marker that includes the part of the line most likely to change is a
  // marker with an expiry date.
  const end = SRC.indexOf("window.addEventListener('keydown'", start);
  expect(end, 'could not find the end of the Escape handler').toBeGreaterThan(start);
  return SRC.slice(start, end);
}

/** Every boolean panel-visibility state the component declares. */
function panelStates(): { state: string; setter: string }[] {
  return [...SRC.matchAll(/const \[(show[A-Za-z0-9_]+)\s*,\s*(set[A-Za-z0-9_]+)\]\s*=\s*useState/g)]
    .map((m) => ({ state: m[1], setter: m[2] }));
}

describe('C45 — Escape closes every CAD panel', () => {
  it('finds the panels it is meant to guard', () => {
    // A scan that silently matched nothing would make every assertion below vacuously true — the
    // failure mode where a guard passes because it checked nothing.
    expect(panelStates().length).toBeGreaterThan(20);
  });

  it('closes every panel-visibility state the layout declares', () => {
    const body = escapeHandlerBody();
    const missing = panelStates()
      .filter(({ state, setter }) => !body.includes(`close(${state}, ${setter})`))
      .map((p) => p.state);
    expect(
      missing,
      `these panels open but Escape does not close them:\n  ${missing.join('\n  ')}\n` +
        'Add `close(<state>, <setter>);` to the Escape handler in CADLayout.',
    ).toEqual([]);
  });

  it('closes the two panels that hold an object rather than a boolean', () => {
    const body = escapeHandlerBody();
    // `renameDialog` and `featureDialog` carry their subject in state, so they clear to null rather
    // than false. Named individually because the regex above cannot see them.
    expect(body).toContain('setRenameDialog(null)');
    expect(body).toContain('setFeatureDialog(null)');
  });

  it('does not steal Escape from a field being edited', () => {
    const body = escapeHandlerBody();
    // Escape in a text input means "revert what I am typing" long before it means "close the
    // dialog", and a surveyor mid-edit losing the whole panel is worse than the bug being fixed.
    expect(body).toContain("tag === 'INPUT'");
    expect(body).toContain("tag === 'TEXTAREA'");
    expect(body).toContain('isContentEditable');
  });

  it('does not swallow Escape when nothing is open', () => {
    const body = escapeHandlerBody();
    // The canvas uses Escape to cancel the active tool. Stopping propagation unconditionally would
    // trade a dialog bug for a drawing bug — the tool would become impossible to cancel.
    expect(body).toContain('if (closedAny) e.stopPropagation();');
  });
});

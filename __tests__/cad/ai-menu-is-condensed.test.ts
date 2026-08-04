// __tests__/cad/ai-menu-is-condensed.test.ts
//
// CAD_AUDIT S5b — the AI menu spends one entry on the AI mode, not five.
//
// S1a catalogued the menu bar by driving the live app and recorded three observations "for S5,
// recorded not acted on". This is the last of them:
//
//   > `AI` spends five entries on one setting — four mode items plus Cycle.
//
// Half the menu was a radio group. The condensed form puts the CURRENT mode on the parent row, so
// the menu answers "what mode am I in?" at a glance rather than making the reader scan four lines
// looking for a bullet, and keeps every mode individually selectable in the submenu — condensing
// must not cost the ability to jump straight to COMMAND.
//
// ── WHY A TEST FOR A MENU SHAPE ─────────────────────────────────────────────────────────────────
//
// Nothing breaks if this is re-flattened. It typechecks, it renders, every action still works, and
// the only symptom is a menu that is harder to read — which is exactly the class of regression that
// survives review, and exactly what S1a was written to find in the first place.
//
// The other two S1a observations are settled: the Draw menu's separator was already there (S5a found
// the note stale), and the File menu's ambiguous Opens were renamed to name their source (S5a).

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const MENU = readFileSync(
  join(__dirname, '..', '..', 'app', 'admin', 'cad', 'components', 'MenuBar.tsx'),
  'utf8',
);

/** The AI menu's own block, up to the next top-level menu. */
function aiMenuBlock(): string {
  const start = MENU.indexOf("label: 'AI',");
  expect(start, 'the AI menu moved or was renamed').toBeGreaterThan(-1);
  const end = MENU.indexOf("label: 'Help',", start);
  return MENU.slice(start, end > start ? end : start + 6000);
}

describe('S5b — the AI menu', () => {
  const block = aiMenuBlock();

  it('found the AI menu', () => {
    // Vacuous-pass guard: every assertion below reads this slice.
    expect(block.length).toBeGreaterThan(300);
  });

  it('shows the current mode on one row rather than four', () => {
    // The condensed shape. `AI mode: AUTO` on the parent answers the question the four rows made you
    // work for.
    expect(block).toMatch(/label: `AI mode: \$\{aiMode\}`/);
  });

  it('does not spread the modes across the top level again', () => {
    // The regression this exists for. The old form mapped AI_MODE_CYCLE straight into `items`, which
    // put four radio rows and a Cycle entry in a menu of eleven.
    const topLevelModeRows = block.match(/label: `\$\{mode === aiMode \? '● ' : '  '\}AI mode: \$\{mode\}`/g) ?? [];
    expect(
      topLevelModeRows,
      'the AI modes are back at the top level — five entries for one setting, which is what S1a ' +
        'recorded and S5b condensed',
    ).toEqual([]);
  });

  it('still lets you pick any single mode', () => {
    // Condensing must not cost directness: jumping straight to COMMAND is the reason the modes are
    // listed at all rather than only offering Cycle.
    expect(block).toContain('AI_MODE_CYCLE.map');
    expect(block).toContain('setAIMode(mode)');
  });

  it('keeps the cycle chord discoverable', () => {
    // The original justification for listing Cycle in the menu was that the chord is otherwise
    // invisible. Moving it into the submenu must not lose the shortcut label.
    expect(block).toContain('Ctrl+Shift+M');
    expect(block).toContain('cycleAIMode()');
  });
});

// __tests__/dnd/shell-scope-is-deliberate.test.ts
//
// T-SHELL-SCOPE — the bespoke sheet roots do NOT carry `.dnd-sheet`, and that is the design.
//
// ── WHY THIS TEST EXISTS ────────────────────────────────────────────────────────────────────────
//
// P14-11 (streamer parity on IG/PF2) is an open item, and its audit records the correct observation:
// **not one of theme.css's `.dnd-sheet.skin-streamer` rules reaches a Pathfinder or Intuitive Games
// sheet**, because every one needs both classes on the same element and the bespoke roots carry only
// `sheet-shell`.
//
// The obvious remedy is to add `dnd-sheet` to those roots. **That would be a regression**, and the
// reason is written into `app/dnd/_sheet/App.tsx` under the tag T-SHELL-SCOPE:
//
//   > `sheet-shell` carries the shared FORMAT layout rules (codex/dashboard/play CSS), scoped apart
//   > from theme.css's broad `.dnd-sheet` element rules so the same shells can render inside a
//   > bespoke PF2/IG sheet **without those rules bleeding onto its panels**.
//
// So the missing class is not an oversight — it is a boundary someone engineered on purpose, and
// removing it would drag ~91 rules' worth of 5e element styling onto panels designed for other
// systems. The fix for P14-11 has to bring the streamer's ROOT-level treatment across under a
// selector the bespoke roots already carry, not widen the gate.
//
// Measured in this tree on 2026-08-04, so the numbers are checkable rather than quoted:
//
//   theme.css      91 rules `.dnd-sheet.skin-streamer…`   ← gated, unreachable from PF2/IG
//   theme.css       1 streamer rule without `.dnd-sheet`
//   skinAccents.css 3 streamer rules without `.dnd-sheet` ← the only ones PF2/IG get today
//
// This test does not fix P14-11. It stops the cheapest wrong fix from landing silently.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const REPO = join(__dirname, '..', '..');
const read = (p: string) => readFileSync(join(REPO, p), 'utf8');

const pf2 = read('app/dnd/_ui/PF2Sheet.tsx');
const ig = read('app/dnd/_ui/IGSheet.tsx');
const app5e = read('app/dnd/_sheet/App.tsx');
const theme = read('app/dnd/_sheet/styles/theme.css');

/** Root `className` expressions, i.e. the strings that build a sheet's outermost class list. */
const rootClasses = (src: string): string[] =>
  [...src.matchAll(/className=\{`([^`]*sheet-shell[^`]*)`\}/g)].map((m) => m[1]);

describe('T-SHELL-SCOPE — the bespoke roots stay out of .dnd-sheet', () => {
  it('finds a root class on each sheet', () => {
    // Vacuous-pass guard: every assertion below reads these.
    expect(rootClasses(pf2).length).toBeGreaterThan(0);
    expect(rootClasses(ig).length).toBeGreaterThan(0);
    expect(app5e).toContain('dnd-sheet sheet-shell');
  });

  it('the 5e root carries both classes', () => {
    // The control for the two below: if `dnd-sheet` vanished everywhere, they would pass while the
    // whole theme stopped applying.
    expect(app5e, 'the 5e root lost `dnd-sheet` — theme.css no longer applies to it')
      .toMatch(/dnd-sheet sheet-shell/);
  });

  for (const [system, src] of [['Pathfinder 2e', pf2], ['Intuitive Games', ig]] as const) {
    it(`the ${system} root carries sheet-shell but NOT dnd-sheet`, () => {
      const roots = rootClasses(src);
      expect(roots.every((c) => c.includes('sheet-shell'))).toBe(true);
      expect(
        roots.filter((c) => c.includes('dnd-sheet')),
        `A ${system} sheet root gained \`dnd-sheet\`. If this was an attempt at P14-11 (streamer ` +
          `parity), it is the wrong fix: it unlocks ~91 \`.dnd-sheet.skin-streamer\` rules AND every ` +
          `broad \`.dnd-sheet\` element rule in theme.css, which T-SHELL-SCOPE exists to keep off ` +
          `bespoke panels. Bring the streamer's root-level treatment across under a selector these ` +
          `roots already carry instead.`,
      ).toEqual([]);
    });
  }

  it('the style catalogue does not claim the streamer reaches every system unqualified', () => {
    // `sheet-styles.ts` is what the picker reads, and its header used to say flatly "Every style
    // works with every game system". That is right about the TOKENS — a PF2 sheet picking `streamer`
    // really does recolour, via `skinHxVars`, `shellThemeVars` and the scanline in `skinAccents.css`
    // — and wrong about the 91 rules that make the streamer look like the streamer.
    //
    // Pinned here rather than in a comment because the gap is measured in THIS file, and a claim in
    // one file contradicting a measurement in another is how P14-11 got its optimistic phrasing.
    const catalogue = read('lib/dnd/sheet-styles.ts');
    expect(catalogue, 'the unqualified claim is back — the streamer is a palette on bespoke sheets')
      .not.toMatch(/Every style works with every game system; NPCs/);
    expect(catalogue, 'the exception should point at where it is measured').toMatch(/T-SHELL-SCOPE/);
  });

  it('records how many streamer rules are gated behind .dnd-sheet', () => {
    // Not a limit — a measurement, so P14-11's scope is a number rather than an adjective. If this
    // moves a lot, the streamer skin was reworked and the P14-11 note needs re-reading.
    const gated = (theme.match(/\.dnd-sheet\.skin-streamer/g) ?? []).length;
    expect(gated).toBeGreaterThan(50);
  });
});

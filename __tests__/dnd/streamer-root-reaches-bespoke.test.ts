// __tests__/dnd/streamer-root-reaches-bespoke.test.ts
//
// P14-11 (part 1) — the streamer skin's ROOT treatment now reaches the Pathfinder and Intuitive
// Games sheets, and the 5e element rules deliberately still do not.
//
// ── THE SHAPE OF THIS FIX, AND WHY IT IS TWO HALVES ─────────────────────────────────────────────
//
// `shell-scope-is-deliberate.test.ts` pins the trap: adding `dnd-sheet` to the bespoke roots would
// unlock 91 streamer rules AND every broad `.dnd-sheet` element rule in theme.css onto panels built
// for other systems. Progress on the first sheet you open, damage on the rest.
//
// So this half widens only the rules that target **the root itself or a universal pseudo-element** —
// the design tokens, the light wash, the floating pixel cubes, the sparkle/scanline field, selection
// and scrollbar. None of them can reach a child, so none of them can bleed. A PF2 sheet in the
// streamer skin now looks like the streamer's sheet instead of a default panel stack.
//
// The 5e-specific rules (`.stat .big`, `.ab .score`, `.res-head .rn`, `.hero`, `.kicker`) stay
// `.dnd-sheet`-only, and this file asserts they stay that way. They need bespoke equivalents, which
// is the remaining and larger half of P14-11 — widening them would be the exact regression above,
// arriving one selector at a time instead of all at once.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');
const css = read('app/dnd/_sheet/styles/theme.css');
const pf2 = read('app/dnd/_ui/PF2Sheet.tsx');
const ig = read('app/dnd/_ui/IGSheet.tsx');

/** The widened form. */
const WIDE = ':is(.dnd-sheet, .sheet-shell).skin-streamer';

/** Selectors that must be reachable from a bespoke root — root-level or universal only. */
const ROOT_LEVEL = [
  `${WIDE} {`,                          // tokens + the background wash
  `${WIDE}.variant-blue {`,             // the blue variant's token swap
  `${WIDE}::before {`,                  // floating pixel cubes
  `${WIDE}::after {`,                   // sparkle + scanline field
  `${WIDE} ::selection {`,
  `${WIDE} ::-webkit-scrollbar-thumb {`,
];

/** Rules that must NOT be widened: each targets markup only the 5e sheet renders. */
const FIVE_E_ONLY = ['.stat .big', '.ab .score', '.res-head .rn', '.form-name', '.inv-name'];

describe('P14-11 — the streamer root treatment reaches PF2 and IG', () => {
  it('applies its tokens and backdrop through a selector the bespoke roots carry', () => {
    for (const sel of ROOT_LEVEL) {
      expect(css, `${sel} must match .sheet-shell too, or PF2/IG render the skin's name and none of its look`)
        .toContain(sel);
    }
  });

  it('leaves no root-level streamer rule behind on the narrow selector', () => {
    // The failure mode of a partial widening: the background arrives and the sparkles do not, which
    // reads as a rendering bug rather than an unfinished port.
    for (const sel of ROOT_LEVEL) {
      const narrow = sel.replace(WIDE, '.dnd-sheet.skin-streamer');
      expect(css, `${narrow} is still 5e-only while its siblings were widened`).not.toContain(narrow);
    }
  });

  it('does NOT widen the rules that target 5e-only markup', () => {
    // The boundary this whole slice is built around. These need bespoke equivalents; widening them
    // is `shell-scope-is-deliberate`'s regression arriving one selector at a time.
    for (const marker of FIVE_E_ONLY) {
      expect(
        css.includes(`${WIDE} ${marker}`),
        `${marker} was widened to .sheet-shell — that is the T-SHELL-SCOPE regression, one selector ` +
          `at a time. PF2/IG need their own rule, not a wider gate.`,
      ).toBe(false);
      // …and they are still present, so this cannot pass by the rules being deleted.
      expect(css, `${marker} disappeared from the streamer skin entirely`)
        .toContain(`.dnd-sheet.skin-streamer ${marker}`);
    }
  });

  it('the bespoke roots still refuse `dnd-sheet` — the boundary is unchanged', () => {
    // Restated here rather than assumed: if a later session "fixes" P14-11 by adding the class, this
    // file's premise evaporates and its assertions would start passing for the wrong reason.
    for (const [name, src] of [['PF2', pf2], ['IG', ig]] as const) {
      const root = src.match(/className=\{`sheet-shell[^`]*`\}/);
      expect(root, `${name} root className not found — has the shell markup changed?`).not.toBeNull();
      expect(root![0], `${name} root gained dnd-sheet; see shell-scope-is-deliberate`).not.toContain('dnd-sheet');
    }
  });

  it('the widened rules cannot reach a child element', () => {
    // The property that makes widening safe, checked rather than asserted in prose: every widened
    // selector ends at the root or a universal pseudo-element. A descendant selector here would put
    // 5e styling on someone else's panels, which is the thing being avoided.
    const widened = [...css.matchAll(/^:is\(\.dnd-sheet, \.sheet-shell\)\.skin-streamer([^{]*)\{/gm)]
      .map((m) => m[1].trim());
    for (const tail of widened) {
      const ok = tail === '' || tail === '.variant-blue' || tail.startsWith('::') || tail.startsWith('::selection')
        || tail === '::-webkit-scrollbar-thumb' || /^::?[a-z-]+$/.test(tail);
      expect(ok, `widened selector reaches a child: "${tail}" — root-level and universal only`).toBe(true);
    }
  });
});

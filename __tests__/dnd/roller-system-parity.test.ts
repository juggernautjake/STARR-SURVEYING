// __tests__/dnd/roller-system-parity.test.ts — a PF2 roller is an IG roller with different buttons (D6-3).
//
// D6-1 asked for every per-system difference to be catalogued and classified as **system mechanics** (must
// differ) or **drift** (must not). Measured over the source: the stages reference no system at all, and the
// only legitimate difference is the CONTROLS each sheet wraps the shared stage in — PF2's Target DC, IG's
// none, 5e's adv/dis and Reckless.
//
// So what needs guarding is not the stage (nothing there knows what system it is) but the SEAM: the two
// bespoke sheets each hand-assemble their roller panel inline, in two files, and nothing held them to the
// same shape. Both happen to be identical today. That is the state a guard exists to preserve — the Impact
// stage was also "fine" right up until one of the two mount sites was written slightly differently.
//
// Source-read rather than rendered, for the reason the other roller guards record: this suite runs
// `environment: 'node'` with no DOM.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

const PANELS = [
  { system: 'Pathfinder 2e', file: 'app/dnd/_ui/pf2/usePf2Panels.tsx' },
  { system: 'Intuitive Games', file: 'app/dnd/_ui/ig/useIgPanels.tsx' },
] as const;

/** The `const roller = (…)` JSX block, which is the whole surface this file is about. */
function rollerBlock(src: string): string {
  const start = src.indexOf('const roller = (');
  expect(start, 'the bespoke sheet no longer assembles a `roller` block — has it moved?').toBeGreaterThan(-1);
  const end = src.indexOf('\n  );', start);
  return src.slice(start, end);
}

describe('the bespoke sheets assemble their roller the same way', () => {
  const blocks = PANELS.map((p) => ({ ...p, block: rollerBlock(read(p.file)) }));

  for (const { system, block } of blocks) {
    it(`${system} wraps the stage in .dnd-sheet`, () => {
      // The wrapper-scoped stages (Sigil, Dice Core) are styled through `.dnd-sheet`. A mount site that
      // dropped it would render them unstyled — the exact defect roller-stage-scope.test.ts was written for,
      // here asserted on the roller panel specifically rather than on the file as a whole.
      expect(block).toContain('className="dnd-sheet"');
    });

    it(`${system} mounts the shared trio in the same order`, () => {
      // Template bar, then the stage, then the dice pad. Order is layout: a dice pad above the stage would
      // read as a different product, which is precisely what D6-3 forbids.
      const bar = block.indexOf('<RollerTemplateBar');
      const stage = block.indexOf('rollerStageFor(');
      const pad = block.indexOf('<DicePad');
      expect(bar, 'no RollerTemplateBar').toBeGreaterThan(-1);
      expect(stage, 'no rollerStageFor').toBeGreaterThan(-1);
      expect(pad, 'no DicePad').toBeGreaterThan(-1);
      expect(bar).toBeLessThan(stage);
      expect(stage).toBeLessThan(pad);
    });

    it(`${system} uses theme TOKENS, never a hardcoded colour`, () => {
      // A hex here survives every test and then ignores the player's chosen theme — the same shape of bug
      // that made the Impact stage a black polygon on two systems. `--hx-*` is the vocabulary both bespoke
      // sheets define; the 5e tokens do not exist here.
      const hexes = [...block.matchAll(/#[0-9a-fA-F]{3,8}\b/g)].map((m) => m[0]);
      expect(hexes, `${system}'s roller controls hardcode a colour`).toEqual([]);
      for (const v of [...block.matchAll(/var\((--[a-z0-9-]+)/g)].map((m) => m[1])) {
        expect(v, `${system} uses ${v}, which the bespoke sheets do not define`).toMatch(/^--hx-/);
      }
    });
  }

  it('and lay it out identically — same direction, same gap', () => {
    // The two panels are hand-assembled in two files. They agree today; nothing was holding them there.
    const shapes = blocks.map(({ block }) =>
      block.match(/style=\{\{ display: 'flex', flexDirection: '(\w+)', gap: (\d+), minWidth: 0 \}\}/)?.slice(1, 3).join('/'));
    expect(shapes[0], 'the PF2 roller wrapper shape could not be read').toBeTruthy();
    expect(shapes[0]).toEqual(shapes[1]);
  });

  it('differ only in the CONTROLS they add, which is the difference that belongs', () => {
    // The classification D6-1 asked for, asserted rather than described: PF2 adds a Target DC and IG adds
    // nothing, and that is a system mechanic (PF2 resolves against a DC by degrees of success). If IG ever
    // grows a control this stays true; if PF2 loses its DC input, that is a regression worth failing on.
    const pf2 = blocks[0].block;
    const ig = blocks[1].block;
    expect(pf2).toContain('Target DC');
    expect(ig).not.toContain('Target DC');
  });
});

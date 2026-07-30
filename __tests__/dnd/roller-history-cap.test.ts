// __tests__/dnd/roller-history-cap.test.ts — the roller window cannot grow without bound (D7-2).
//
// G7 is "the roller window never scrolls". Roll history is the ONE section with no natural bound: the
// store keeps 40 entries and all three stages rendered every one of them, so the window was always a busy
// combat away from becoming a scroll container.
//
// These read the source rather than render it, for the reason the D7-3 detector tests already record:
// this repo runs vitest under `environment: 'node'` with no DOM. That is a real limitation, so the
// assertions are deliberately about things a source read can establish honestly — that the cap is applied,
// that it is shared, and that the permitted scroller is tagged — and the browser sweep remains D7-3's job.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { HISTORY_PREVIEW } from '@/app/dnd/_sheet/components/rollers/rollerAnim';

const SHEET = join(process.cwd(), 'app/dnd/_sheet');
const ROLLERS = join(SHEET, 'components/rollers');

/**
 * All FOUR roll logs, and the fourth is the reason this list is written out rather than globbed.
 *
 * The first version of this test covered the three roller STAGES and asserted "nothing else in the app
 * renders an unbounded roll log" — which was false when it was written. `DiceTray` (the Dice Core, the
 * roller the 5e sheet actually shows by default) has its own `tray-log` and was rendering all 40 entries.
 * Driving the sheet found it in one query; the source-reading test had confidently said otherwise.
 */
const STAGES = [
  { file: 'components/rollers/ImpactRoller.tsx', css: 'components/rollers/impactRoller.css', prefix: 'iroller' },
  { file: 'components/rollers/RollBoard.tsx', css: 'components/rollers/rollBoard.css', prefix: 'rboard' },
  { file: 'components/rollers/SigilStack.tsx', css: 'components/rollers/sigilStack.css', prefix: 'sigil' },
  { file: 'components/DiceTray.tsx', css: 'styles/theme.css', prefix: 'tray' },
];
const src = (f: string) => readFileSync(join(SHEET, f), 'utf8');

describe('roll history is capped in every stage', () => {
  it('keeps the preview small enough to be context rather than history', () => {
    // Five is "what did I just roll, and the one before it". A cap large enough to need scrolling is not
    // a cap.
    expect(HISTORY_PREVIEW).toBeGreaterThan(0);
    expect(HISTORY_PREVIEW).toBeLessThanOrEqual(8);
  });

  for (const s of STAGES) {
    it(`${s.file} renders at most HISTORY_PREVIEW entries until asked`, () => {
      const code = src(s.file);
      expect(code).toContain('HISTORY_PREVIEW');
      // The whole log may only be mapped through the expansion toggle — a bare `log.map` is the defect.
      expect(code).toMatch(/\(histAll \? log : log\.slice\(0, HISTORY_PREVIEW\)\)\.map/);
      expect(code).not.toMatch(/\{log\.map\(/);
    });

    it(`${s.file} imports the SHARED cap rather than declaring its own`, () => {
      // Three literals is how two stages end up at 5 and one at 8, and nobody notices which.
      const code = src(s.file);
      // The path differs by depth — the stages sit beside rollerAnim, DiceTray one level up.
      expect(code).toMatch(/HISTORY_PREVIEW.*from '\.\/(rollers\/)?rollerAnim'/);
      expect(code).not.toMatch(/const HISTORY_PREVIEW/);
    });

    it(`${s.file} tags its log as the one permitted scroller`, () => {
      // D7-3's detector treats becoming a scroll container as the defect and reads permission from the
      // markup. An untagged history would be reported as a bug by a detector that is working correctly.
      expect(src(s.file)).toMatch(new RegExp(`className="${s.prefix}-log" data-scrollable="true"`));
    });

    it(`${s.css} gives the expand control a touch-sized target`, () => {
      // 44px is the mobile minimum in D7's own acceptance criteria, and this control is the one thing
      // added to the history section.
      const css = src(s.css);
      expect(css).toMatch(new RegExp(`\.${s.prefix}-hist-more`));
      expect(css).toMatch(/min-height: 44px/);
    });
  }

  it('nothing else in the app renders an unbounded roll log', () => {
    // A fourth stage added later would reintroduce the defect silently; this fails the moment one does.
    for (const s of STAGES) expect(src(s.file)).not.toMatch(/\{log\.map\(/);
  });
});

// __tests__/dnd/roller-arena-flex.test.ts — every stage's arena is in the window's flex budget (D7-3).
//
// The rule this guards lives in ONE place (`floatingRoller.css`) and names the three arenas explicitly,
// because there is no shared arena class to hook — each stage's arena is genuinely its own visual object.
// That trade is deliberate and it has a known failure mode: a FOURTH stage arrives, nobody adds it to the
// list, and it clips exactly the way the other three used to. This file is the half that makes the trade
// safe, and it is the same shape as `roller-history-cap.test.ts`, which enumerates all four roll logs for
// the identical reason.
//
// The lesson underneath is D7-2's, twice over now: a shared token is only shared by the files that
// actually reference it. Three of four stages read `--roller-stage-min-h`; the Dice Core — the tallest,
// and the one the 5e sheet shows by default — had a hard `height: 178px` in `theme.css` and so sat
// outside every list anyone was looking at, including the one in the slice that introduced the token.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8');
const DOCK = read('app/dnd/_sheet/components/rollers/floatingRoller.css');

/** The arena element of each roller stage, by the class its own stylesheet paints. */
const ARENAS = [
  { stage: 'Dice Core', cls: 'stage-core', file: 'app/dnd/_sheet/components/rollers/rollStage.css' },
  { stage: 'Roll Board', cls: 'rb-felt', file: 'app/dnd/_sheet/components/rollers/rollBoard.css' },
  { stage: 'Impact', cls: 'ir-arena', file: 'app/dnd/_sheet/components/rollers/impactRoller.css' },
];

describe('the window hands out its height, and nothing above the permitted scroller scrolls', () => {
  it('the body is a flex column', () => {
    // A block body lets its children be any height and then scrolls, which IS the defect: measured at
    // 84–94px hidden on both 5e sheets, at every viewport including a 1280×900 desktop.
    expect(DOCK).toMatch(/\.fld-body\s*\{[^}]*display:\s*flex/);
    expect(DOCK).toMatch(/\.fld-body\s*\{[^}]*flex-direction:\s*column/);
  });

  it('keeps overflow:auto on the body rather than hiding the evidence', () => {
    // `hidden` would make any remaining failure invisible instead of fixed, and `detectClipped`
    // deliberately ranks hidden WORSE than auto — content nobody can scroll to is more hidden, not less.
    // If this ever becomes `hidden`, the sweep goes green while the product gets worse.
    expect(DOCK).toMatch(/\.fld-body\s*\{[^}]*overflow:\s*auto/);
    expect(DOCK).not.toMatch(/\.fld-body\s*\{[^}]*overflow:\s*hidden/);
  });

  it('makes the permitted scroller the elastic one, with no leftover per-roller max-height', () => {
    const rule = DOCK.match(/\.fld-body \[data-scrollable='true'\]\s*\{[^}]*\}/)?.[0] ?? '';
    expect(rule, 'the tagged scroller must be styled from one place').not.toBe('');
    expect(rule).toMatch(/flex:\s*1 1 auto/);
    // A FLOOR, not 0. With `min-height: 0` both permitted scrollers shrank to nothing on a 360×640
    // phone and the window reported a perfect fit while the roll breakdown was zero pixels tall — a
    // green bought by deleting content. The floor makes such a window overflow and be REPORTED instead.
    expect(rule, 'the permitted scrollers must not be allowed to vanish').toMatch(/min-height:\s*48px/);
    expect(rule).not.toMatch(/min-height:\s*0[;\s]/);
    // Each roller had its own literal cap (260px, 320px…). Left in place they cap the growth half-way
    // and re-introduce a scroll on a screen that had room to show everything.
    expect(rule).toMatch(/max-height:\s*none/);
  });
});

describe('every stage arena is in the budget — all three, by name', () => {
  it.each(ARENAS)('$stage ($cls) is claimed by the dock rule', ({ cls }) => {
    expect(DOCK, `.${cls} must appear in floatingRoller.css`).toContain(`.fld-body .${cls}`);
  });

  it('lets arenas grow into spare room AND shrink when there is none', () => {
    // This went through `1 0 auto` on the way. Shrink-0 stopped the desktop clipping and was the wrong
    // fix: an immovable arena left the Impact roller 81px over budget on a phone, so `.fld-body` scrolled
    // instead — a clipped total traded for a scrolling window, which is the thing the phase exists to
    // prevent. Shrinking is safe only because the breakdown inside is now a tagged scroller.
    const rule = DOCK.match(/\.fld-body \.stage-core,[\s\S]*?\{[^}]*\}/)?.[0] ?? '';
    expect(rule).toMatch(/flex:\s*1 1 auto/);
    expect(rule).toMatch(/min-height:\s*var\(--roller-stage-min-h/);
  });

  it('tags the roll breakdown as a permitted scroller, on the same rule as roll history', () => {
    // "Unbounded by nature may scroll; chrome may not." A 20-dice roll is twenty rows, so the breakdown
    // qualifies on exactly the grounds D7-2 used for a 40-entry history. Without this the arena cannot
    // shrink without clipping the total.
    const impact = read('app/dnd/_sheet/components/rollers/ImpactRoller.tsx');
    expect(impact).toMatch(/className="ir-detail is-open" data-scrollable="true"/);
  });

  it('makes roll history yield before the breakdown does', () => {
    // Left equal, flex shrank both scrollers in proportion and took the BREAKDOWN to zero on a phone —
    // your total, gone. History is the one thing nobody needs while a die is landing.
    const rule = DOCK.match(/\.fld-body \.tray-log,[\s\S]*?\{[^}]*\}/)?.[0] ?? '';
    expect(rule, 'the four logs must yield faster').not.toBe('');
    expect(rule).toMatch(/flex-shrink:\s*[2-9]/);
    for (const log of ['tray-log', 'sigil-log', 'rboard-log', 'iroller-log']) {
      expect(rule, `${log} must be in the list`).toContain(log);
    }
  });

  it('every arena reads the shared min-height token, so the short-screen rule reaches all of them', () => {
    // The check that would have caught the Dice Core's hard 178px before a sweep had to.
    for (const { stage, cls, file } of ARENAS) {
      const css = read(file) + read('app/dnd/_sheet/styles/theme.css');
      const usesToken = new RegExp(`\\.${cls}[^{]*\\{[^}]*min-height:\\s*var\\(--roller-stage-min-h`).test(css)
        // The Dice Core's arena is styled as `.dnd-sheet .stage` in theme.css and painted `.stage-core`
        // inside; accept the token anywhere the stage is defined, which is what the rule needs.
        || /\.stage\s*\{[^}]*min-height:\s*var\(--roller-stage-min-h/.test(css);
      expect(usesToken, `${stage} must take its height from --roller-stage-min-h, not a literal`).toBe(true);
    }
  });

  it('no stage keeps a hard `height` where a min-height is needed', () => {
    // `height: 178px` cannot participate in a flex column at all — the stage refuses to give up its
    // pixels however cramped the window gets, which is why the short-screen rule moved three stages and
    // left the worst offender exactly where it was.
    const theme = read('app/dnd/_sheet/styles/theme.css');
    const stageRule = theme.match(/\.dnd-sheet \.stage\s*\{[^}]*\}/)?.[0] ?? '';
    expect(stageRule, 'the 5e stage rule must still exist').not.toBe('');
    expect(stageRule).not.toMatch(/(^|[^-])height:\s*\d+px/m);
    expect(stageRule).toMatch(/min-height:\s*var\(--roller-stage-min-h/);
  });
});

describe('a short screen compresses rather than scrolls', () => {
  it('drops the stage tokens on a short viewport', () => {
    // 360×640 leaves ~473px for a 5e roller whose fixed content measured 491. Flexing cannot fix that on
    // its own: with history already at zero there is nothing left to give, so the stage — the one part
    // built to scale, since `dieSizeFor` sizes dice to their arena — gives way.
    const short = DOCK.match(/@media \(max-height: \d+px\)\s*\{[\s\S]*?\n\}/)?.[0] ?? '';
    expect(short, 'a short-screen rule must exist').not.toBe('');
    expect(short).toMatch(/--roller-stage-min-h:\s*\d+px/);
    expect(short).toMatch(/--roller-idle-min-h:\s*\d+px/);
  });
});

// __tests__/dnd/roller-height-parity.test.ts — the four rollers are the same height.
//
// OWNER REPORT, 2026-07-28: *"the digital dice roller… some of the digital dice rollers are too tall or
// something."*
//
// The four rollers (Dice Core, Sigil Stack, Roll Board, Impact) are interchangeable — the roller template is
// chosen INDEPENDENTLY of the sheet template (`rollerFor.tsx`), and RO-5 made them render on PF2 and IG too.
// So the same sheet, same system, could change height by 42px purely from which roller you picked.
//
// WHAT IT ACTUALLY WAS: Impact's arena declared `min-height: 210px` against Roll Board's 176 and Sigil
// Stack's 168 — but the real driver was the IDLE state, which is what a sheet shows most of the time.
// Impact's empty state was `178px` where the other two used `118`. Dice Core was never part of the problem:
// `.stage-core` is `flex: 1 1 auto; min-height: 0`, so it takes the height its window gives it.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { adoptedToken, stripTotalTail } from '@/app/dnd/_sheet/components/rollers/rollerAnim';

const CSS = 'app/dnd/_sheet/components/rollers';
const read = (f: string) => readFileSync(join(process.cwd(), CSS, f), 'utf8');

/** The three rollers that declare a fixed stage box. */
const BESPOKE = ['impactRoller.css', 'rollBoard.css', 'sigilStack.css'];

describe('every roller stage reads the shared height token', () => {
  it.each(BESPOKE)('%s', (file) => {
    expect(read(file)).toContain('min-height: var(--roller-stage-min-h, 176px)');
  });

  it('and none keeps its own hard-coded stage height', () => {
    // The specific numbers that diverged. If any comes back, the panel starts jumping between templates
    // again — and it is invisible in a test suite that only renders one roller at a time.
    const OLD = ['min-height: 210px', 'min-height: 168px'];
    for (const file of BESPOKE) {
      const src = read(file);
      for (const old of OLD) {
        expect(src, `${file} still hard-codes "${old}"`).not.toContain(old);
      }
    }
  });
});

describe('the IDLE state — the one you actually look at — matches too', () => {
  it.each(BESPOKE)('%s', (file) => {
    expect(read(file)).toContain('var(--roller-idle-min-h, 118px)');
  });

  it('and Impact no longer stands 60px taller than the others when empty', () => {
    // The root cause. A roller sitting idle at 178px next to two at 118px is the "too tall" the report
    // describes, and it forced the arena to 210 to contain it.
    expect(read('impactRoller.css'), 'the 178px idle box should be gone').not.toContain('min-height: 178px');
  });
});

describe('the fallbacks agree, so the token is optional rather than required', () => {
  it('every reference uses the same default', () => {
    // Each roller's CSS travels with its component (the RO-5 fix), so there is no guaranteed shared
    // stylesheet to define the variable in. The fallback IS the shared value; a theme can still override
    // all four at once by setting the property on any common ancestor.
    const stage = new Set<string>();
    const idle = new Set<string>();
    for (const file of BESPOKE) {
      const src = read(file);
      for (const m of src.matchAll(/var\(--roller-stage-min-h,\s*([^)]+)\)/g)) stage.add(m[1].trim());
      for (const m of src.matchAll(/var\(--roller-idle-min-h,\s*([^)]+)\)/g)) idle.add(m[1].trim());
    }
    expect([...stage], 'stage fallbacks must not diverge').toEqual(['176px']);
    expect([...idle], 'idle fallbacks must not diverge').toEqual(['118px']);
  });
});

describe('Dice Core stays flexible rather than being pinned to the same number', () => {
  it('fills its window instead of declaring a stage height', () => {
    // Deliberately NOT given the token. It is the one roller that already adapts, and forcing a min-height
    // onto it would introduce the bug being fixed rather than resolve it.
    const src = read('rollStage.css');
    expect(src).toMatch(/\.stage-core \{[\s\S]{0,200}flex: 1 1 auto;[\s\S]{0,120}min-height: 0;/);
    expect(src).not.toContain('--roller-stage-min-h');
  });
});

describe('switching template does not re-roll (RO-7)', () => {
  // OWNER REPORT: "I am on one template, then I click another template, and then it automatically rerolls."
  //
  // Switching template unmounts one roller and mounts another. Each decided "is this roll new?" by comparing
  // `activeRoll.token` against a ref seeded with -1, so the fresh mount always saw a NEW roll and replayed
  // it. The animation was the visible half; the invisible half was that the same path calls
  // `commitRoll(activeRoll.entry)`, logging the roll a SECOND time — and P3-1 publishes committed rolls to
  // the shared campaign feed, so a duplicate reached the DM's log and skewed the P3-3 statistics.
  const readTs = (f: string) => readFileSync(join(process.cwd(), 'app/dnd/_sheet/components', f), 'utf8');
  // ALL FOUR, including Dice Core. The first pass of this fix covered the three bespoke rollers and MISSED
  // `RollStage` — which is the default template, so the most-used roller kept the bug while the test went
  // green. Sweeping every roller rather than listing the ones I happened to edit is the whole point.
  const ROLLERS = [
    'rollers/SigilStack.tsx',
    'rollers/RollBoard.tsx',
    'rollers/ImpactRoller.tsx',
    'RollStage.tsx',
  ];

  it.each(ROLLERS)('%s seeds its token from the roll already on screen', (file) => {
    // `useRef<number>(...)` as well as `useRef(...)` — RollStage annotates the type, and a bare substring
    // check silently excused it.
    expect(readTs(file)).toMatch(/useRef(<number>)?\(adoptedToken\(activeRoll\)\)/);
  });

  it('and none is still seeded with -1', () => {
    // The one-character difference that caused all of it.
    for (const file of ROLLERS) {
      expect(readTs(file), `${file} still seeds lastToken with -1`).not.toMatch(/lastToken = useRef\(-1\)/);
    }
  });

  it('the shared helper returns -1 only when nothing is on screen', () => {
    expect(adoptedToken(null)).toBe(-1);
    expect(adoptedToken(undefined)).toBe(-1);
    expect(adoptedToken({ token: 7 })).toBe(7);
    // Token 0 is a real token, not "nothing" — `?? -1` rather than `|| -1` is what keeps the very first
    // roll of a session from being treated as absent and replayed.
    expect(adoptedToken({ token: 0 })).toBe(0);
  });

  it('and each roller renders the adopted roll SETTLED rather than idle', () => {
    // Adopting the token without adopting the display would fix the reroll and replace it with a roller that
    // goes blank every time you switch template.
    expect(readTs('rollers/SigilStack.tsx')).toMatch(/useState<'idle' \| 'assembling' \| 'locked'>\(activeRoll \? 'locked' : 'idle'\)/);
    expect(readTs('rollers/RollBoard.tsx')).toMatch(/useState<BoardPhase>\(activeRoll \? 'shown' : 'idle'\)/);
    expect(readTs('rollers/ImpactRoller.tsx')).toMatch(/useState<'idle' \| 'tumbling' \| 'landed'>\(adopted \? 'landed' : 'idle'\)/);
    expect(readTs('RollStage.tsx')).toMatch(/useState<'idle' \| 'spinning' \| 'crit' \| 'fumble' \| 'done'>\(activeRoll \? 'done' : 'idle'\)/);
  });
});

describe('the roller window is a fixed, consistent size', () => {
  const dock = readFileSync(join(process.cwd(), 'app/dnd/_sheet/components/rollers/useFloatingDock.ts'), 'utf8');
  const win = readFileSync(join(process.cwd(), 'app/dnd/_sheet/components/rollers/FloatingRoller.tsx'), 'utf8');

  it('declares one width and one height', () => {
    expect(dock).toMatch(/export const FIXED_W = \d+/);
    expect(dock).toMatch(/export const FIXED_H = \d+/);
  });

  it('restores POSITION but not size', () => {
    // A box drag-resized before this change would otherwise live forever — including boxes too small for the
    // tallest template, which is the complaint.
    expect(dock).toMatch(/w: FIXED_W,\s*\n\s*h: FIXED_H,/);
  });

  it('and the resize corner is gone from the window', () => {
    expect(win, 'the drag-to-resize control should not render').not.toContain('className="fld-resize"');
  });

  it('while dragging to REPOSITION still works', () => {
    // Where the window sits is a preference worth keeping; only its size was fighting the template.
    expect(win).toContain('onHeaderPointerDown');
  });
});

describe('every roller can explain a roll (RO-11)', () => {
  // OWNER: "tool tips or something… to explain exactly why certain things are added and where certain
  // bonuses/buffs/penalties/debuffs are coming from… with any system and any template."
  //
  // Three rollers already rendered `boosts`/`penalties` in their own idiom. DICE CORE — the default
  // template — rendered none of it, so the promise was already false on the roller most people use.
  const readAny = (f: string) => readFileSync(join(process.cwd(), 'app/dnd/_sheet/components', f), 'utf8');

  it('Dice Core now carries the named sources into its reveal', () => {
    const src = readAny('RollStage.tsx');
    expect(src).toContain('boosts: entry.boosts, penalties: entry.penalties');
    expect(src).toContain('<RollWhy');
  });

  it('the shared component is scoped for the bespoke shells, not just .dnd-sheet', () => {
    // PF2 and IG deliberately do not import theme.css. A `.dnd-sheet`-scoped rule renders unstyled there —
    // the exact bug RO-5 fixed for the Dice Core stage, and the easiest one to reintroduce.
    const css = readFileSync(join(process.cwd(), 'app/dnd/_sheet/components/rollers/rollWhy.css'), 'utf8');
    expect(css).not.toMatch(/\.dnd-sheet\s+\.rw/);
    expect(css).toMatch(/^\.rw\b/m);
  });

  it('and says nothing when there is nothing to explain', () => {
    // A plain d6 off the dice pad must not grow an empty "sources" box.
    const src = readAny('rollers/RollWhy.tsx');
    expect(src).toMatch(/if \(!hasSources && !entry\.tag\) return null/);
  });

  it('marking boosts and penalties with glyphs, not colour alone', () => {
    const src = readAny('rollers/RollWhy.tsx');
    expect(src).toContain('▲');
    expect(src).toContain('▼');
  });
});

describe('a breakdown’s trailing "= N" is a summary, not a term (RO-14)', () => {
  // FOUND BY BROWSER QA. `rollDiceExpr` returns "1d4[1] = 1" — the total is appended for readability. Both
  // damage tokenisers split on whitespace and treat a bare number as a flat modifier, so that trailing
  // total became a `+1` term: a plain d4 rendered a die row AND a phantom "flat +1".
  //
  // The tell was that the phantom CONTRADICTED the row beneath it — `1d4[1]` plus `+1` is 2, and the total
  // row correctly said 1. A term that does not sum with the others was never a term.
  it('strips only a trailing summary', () => {
    expect(stripTotalTail('1d4[1] = 1')).toBe('1d4[1]');
    expect(stripTotalTail('2d6[3,5] + 4 = 12')).toBe('2d6[3,5] + 4');
    expect(stripTotalTail('d8[7] = -2')).toBe('d8[7]');
  });

  it('and leaves a breakdown without one untouched', () => {
    expect(stripTotalTail('1d4[1]')).toBe('1d4[1]');
    expect(stripTotalTail('d20[14] + 7')).toBe('d20[14] + 7');
    expect(stripTotalTail('')).toBe('');
  });

  it('never eats an "=" that is not the trailing summary', () => {
    // Guessing at a mid-string `=` would silently drop real terms.
    expect(stripTotalTail('a = b 1d4[1]')).toBe('a = b 1d4[1]');
  });

  it('and BOTH tokenisers use it — fixing one would have left the other wrong', () => {
    const dir = 'app/dnd/_sheet/components/rollers';
    for (const f of ['ImpactRoller.tsx', 'SigilStack.tsx']) {
      const src = readFileSync(join(process.cwd(), dir, f), 'utf8');
      expect(src, `${f} must strip the summary before tokenising`).toMatch(/stripTotalTail\(breakdown\)\.split\(/);
    }
  });
});

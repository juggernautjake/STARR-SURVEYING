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
import { adoptedToken } from '@/app/dnd/_sheet/components/rollers/rollerAnim';

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
  const TSX = 'app/dnd/_sheet/components/rollers';
  const readTs = (f: string) => readFileSync(join(process.cwd(), TSX, f), 'utf8');
  const ROLLERS = ['SigilStack.tsx', 'RollBoard.tsx', 'ImpactRoller.tsx'];

  it.each(ROLLERS)('%s seeds its token from the roll already on screen', (file) => {
    expect(readTs(file)).toContain('useRef(adoptedToken(activeRoll))');
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
    expect(readTs('SigilStack.tsx')).toMatch(/useState<'idle' \| 'assembling' \| 'locked'>\(activeRoll \? 'locked' : 'idle'\)/);
    expect(readTs('RollBoard.tsx')).toMatch(/useState<BoardPhase>\(activeRoll \? 'shown' : 'idle'\)/);
    expect(readTs('ImpactRoller.tsx')).toMatch(/useState<'idle' \| 'tumbling' \| 'landed'>\(adopted \? 'landed' : 'idle'\)/);
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

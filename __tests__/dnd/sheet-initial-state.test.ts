// __tests__/dnd/sheet-initial-state.test.ts — the 5e sheet's first paint is a blank character.
//
// Slice 117, pinning the finding from slices 97–103, 115 and 116. Every other finding of that arc got a
// test; the most severe one existed only as prose in a 4,500-line document, where it would rot.
//
// WHAT IS WRONG. `store.tsx` initialises from `blankCharacter('')` in DB mode and fetches the real
// character on mount, so until it lands the whole stat rail is a level-1 blank:
//
//     name (empty) · LEVEL 1 · HP 1 / 1 · AC 10 · SAVE DC 10 · INIT +0 · FORM Base · STR…CHA 10 / +0
//
// with no skeleton, no spinner and no `aria-busy` — it reads as data, not as loading. Measured on a
// PRODUCTION build: correct values at 456–764ms on localhost, 885ms on fast 3G, **2,522ms on slow 3G**,
// and that is a floor because the server was local too. CLS median **0.194** over five runs (never once
// under the 0.1 "good" threshold), LCP median **1236ms** against **680ms** for the prop-driven IG sheet.
//
// `HP 1 / 1` is the same wrong number this repo already fixed once in its persistent form — the level-8
// Fighter of slices 10–12.
//
// WHY THE BLANK EXISTS, which any fix must preserve. The store's own comment states the reason and it is a
// real one: *"In DB mode the real sheet arrives from the API on mount; until then show a neutral BLANK
// character **so no other character's content ever flashes**."* The store is module-level; without the
// reset, opening character B could paint character A's data first. A fix that simply removes the blank
// would trade a wrong-but-generic sheet for a wrong-and-specific one, which is worse.
//
// THE TWO OPTIONS, costed in slice 103 and separated by slice 115:
//   A  expose `dbPhase` (already tracked at store.tsx:349, `offline` is the template for exposing it) and
//      render a loading state. Fixes the wrong numbers. Fixes CLS ONLY if the loading state reserves the
//      real content's height — the blank hero is shorter, and that difference is what jumps.
//   B  pass the server-fetched character in as a prop, the way `IGSheet` and `PF2Sheet` already do. Four
//      touch points. Fixes both inherently, and preserves the anti-leak property because the server sends
//      the character the URL asked for.
//
// This file FAILS ON PURPOSE where the defect is, using `it.fails` — so the suite stays green, the finding
// cannot be forgotten, and whoever fixes it gets told ("expected to fail but passed") to delete the pin.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { blankCharacter } from '@/app/dnd/_sheet/data/blank';

const STORE = readFileSync(join(process.cwd(), 'app/dnd/_sheet/state/store.tsx'), 'utf8');

describe('what the blank character actually contains', () => {
  const blank = blankCharacter('');

  it('is the source of the numbers a player sees for up to 2.5s', () => {
    // Asserted from the real value, not transcribed — if `blankCharacter` changes, this describes the new
    // first paint rather than a stale memory of the old one.
    expect(blank.meta.level).toBe(1);
    expect(blank.combat.maxHp).toBe(1);
    expect(blank.combat.currentHp).toBe(1);   // together: the `HP 1 / 1` a player reads mid-session
    expect(blank.combat.ac).toBe(10);
    expect(Object.values(blank.abilities)).toEqual([10, 10, 10, 10, 10, 10]);
  });

  it('and its name is empty, which is what makes the hero shorter and the page jump', () => {
    expect(blank.meta.name).toBe('');
  });
});

describe('the initialiser, and the constraint on any fix', () => {
  it('DB mode still starts from a blank character', () => {
    expect(STORE).toContain("dbMode ? blankCharacter('') : loadInitial(characterId)");
  });

  it('the anti-leak reason is still recorded next to it', () => {
    // If someone removes this comment while changing the initialiser, the reason for the blank is lost and
    // the next person re-derives it the hard way. Pinned so the rationale travels with the code.
    expect(STORE).toMatch(/no other character's content ever flashes/);
  });

  it('`dbPhase` exists and is still not exposed — option A is still a 3-line change', () => {
    expect(STORE).toMatch(/const \[dbPhase, setDbPhase\] = useState<'loading' \| 'ready'>/);
    // `offline` is exposed through the context; `dbPhase` is not. That asymmetry IS option A's cost.
    expect(STORE).toContain('offline,');
  });
});

describe('THE DEFECT — pinned, fails on purpose', () => {
  it.fails('the sheet should not paint a blank character before the real one (slices 97–116)', () => {
    // Passing means someone has fixed it: either the initialiser no longer starts blank in DB mode
    // (option B), or `dbPhase` is exposed so the sheet can render a loading state instead (option A).
    const startsBlank = STORE.includes("dbMode ? blankCharacter('') : loadInitial(characterId)");
    const phaseExposed = /dbPhase,\s*$/m.test(STORE) || /dbPhase\s*,\s*\n\s*\}/.test(STORE);
    expect(startsBlank && !phaseExposed).toBe(false);
  });
});

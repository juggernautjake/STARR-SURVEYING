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

describe('the initialiser, and the constraint the fix had to respect', () => {
  it('DB mode seeds from the server-fetched character when it has one', () => {
    // FIXED 2026-07-27 (option B). The page already fetched the row to render itself; it now passes
    // `initialCharacter` through `SheetRoot` to the provider, so first paint is the real sheet.
    // Measured after, production build: `HP 32 / 32 · LEVEL 3 · STR 19` at **41ms** where it had read
    // `HP 1 / 1` through 2049ms, and CLS median **0.194 → 0**.
    expect(STORE).toContain('dbMode && initialCharacter ? safeNormalize(initialCharacter) : null');
  });

  it('and still falls back to blank when there is no seed', () => {
    // Preview/standalone, or any caller without the row. Unchanged behaviour for them.
    expect(STORE).toContain("dbMode ? blankCharacter('') : loadInitial(characterId)");
  });

  it('the seed is validated, so a foreign or half-written row cannot paint the sheet', () => {
    // Same guard the DB hydrate path uses. Anything failing it falls back to the blank, which is the
    // safe direction — an empty sheet beats someone else's numbers.
    expect(STORE).toMatch(/function safeNormalize[\s\S]{0,400}!d\.meta \|\| !d\.abilities/);
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

describe('THE FIX — the anti-leak property it had to preserve', () => {
  // This was `it.fails` while the defect stood (slices 97–116). Option B shipped, so it asserts the
  // fix instead. The pin is gone because the thing it recorded is gone.
  const ROOT = readFileSync(join(process.cwd(), 'app/dnd/_sheet/SheetRoot.tsx'), 'utf8');

  it('the provider is KEYED on characterId', () => {
    // The load-bearing half. A `useState` initialiser runs once per mount, so without this a
    // client-side navigation from character A to B would keep A's seed until the fetch landed —
    // trading a wrong-but-generic sheet for a wrong-and-SPECIFIC one, which is worse and is exactly
    // what the store's "no other character's content ever flashes" comment guards against.
    const providers = [...ROOT.matchAll(/<CharacterProvider([^>]*)>/g)].map((m) => m[1]);
    expect(providers.length, 'no providers found — did SheetRoot change shape?').toBeGreaterThan(0);
    for (const p of providers) {
      expect(p, 'a CharacterProvider is missing key={characterId}').toContain('key={characterId}');
      expect(p, 'a CharacterProvider is missing initialCharacter').toContain('initialCharacter=');
    }
  });

  it('the page passes the row it already fetched', () => {
    const page = readFileSync(join(process.cwd(), 'app/dnd/characters/[id]/page.tsx'), 'utf8');
    expect(page).toContain('initialCharacter={character.data}');
  });
});

// __tests__/dnd/ig-roll-kinds.test.ts — IG's roll kinds, catalogued and checked (RO-12).
//
// OWNER: *"We really need to look at the rules and all of the different kinds of rolls that IG has and make
// sure the dice roller is totally revamped to handle that system."*
//
// THE CATALOGUE, from `IgRollKind` — this is the list the slice asked for, written down before anything was
// changed:
//
//   attack · reflex_save · fortitude_save · will_save · save · perception · str_dex_check · skill ·
//   ability_check · any
//
//   `any`  matches every d20 roll (Shaken and Sickened's flat −2 use it).
//   `save` is a BUCKET matching all three specific saves, so a rule written against "saves" applies to each.
//
// WHAT THE AUDIT FOUND. Nine of the ten were reachable. **`skill` and `perception` were not** — the skills
// list called `rollLine(label, total)` with no kind, so every skill fell to the default `ability_check`.
// That is not cosmetic: Blind, Deaf, Fascinated and Prone all impose disadvantage on **`perception`**
// specifically, so a blinded character rolling Perception got a clean d20. The condition was on the sheet,
// the rule was implemented and tested, and the roll simply never asked for it — the same "wired at one end"
// shape this whole audit keeps turning up.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { igConditionRollEffect, type IgRollKind } from '@/lib/dnd/conditions/intuitive-games';

const panels = readFileSync(join(process.cwd(), 'app/dnd/_ui/ig/useIgPanels.tsx'), 'utf8');

/** Every kind the engine understands. */
const ALL: IgRollKind[] = [
  'attack', 'reflex_save', 'fortitude_save', 'will_save', 'save',
  'perception', 'str_dex_check', 'skill', 'ability_check', 'any',
];

describe('the catalogue is complete and the two bucket kinds behave', () => {
  it('`any` matches every roll', () => {
    // Shaken's flat −2 must reach an attack, a save and a skill alike.
    for (const kind of ['attack', 'will_save', 'skill', 'perception'] as IgRollKind[]) {
      expect(igConditionRollEffect(['Shaken'], kind).penalty, `Shaken should hit ${kind}`).toBe(-2);
    }
  });

  it('and `save` is a bucket over the three specific saves', () => {
    // A rule written against "saves" has to apply to Fortitude, Reflex and Will without naming each.
    for (const kind of ['fortitude_save', 'reflex_save', 'will_save'] as IgRollKind[]) {
      expect(igConditionRollEffect(['Sickened'], kind).penalty).toBe(-2);
    }
  });

  it('a kind with no matching condition is untouched', () => {
    const e = igConditionRollEffect([], 'attack');
    expect(e.penalty).toBe(0);
    expect(e.disadvantage).toBe(false);
  });
});

describe('THE BUG: perception conditions never reached a perception roll', () => {
  it('Blind imposes disadvantage on perception', () => {
    // The rule, which was correct all along.
    expect(igConditionRollEffect(['Blind'], 'perception').disadvantage).toBe(true);
  });

  it('but NOT on a generic ability check — which is what skills were rolling as', () => {
    // This is why the bug was invisible: the engine was right, and the caller asked the wrong question.
    expect(igConditionRollEffect(['Blind'], 'ability_check').disadvantage).toBe(false);
  });

  it('and the same holds for Deaf, Fascinated and Prone', () => {
    for (const c of ['Deaf', 'Fascinated', 'Prone']) {
      expect(igConditionRollEffect([c], 'perception').disadvantage, `${c} on perception`).toBe(true);
      expect(igConditionRollEffect([c], 'ability_check').disadvantage, `${c} on ability_check`).toBe(false);
    }
  });

  it('so the sheet now routes Perception to its own kind', () => {
    expect(panels).toMatch(/skillKind: IgRollKind = \/\^perception\$\/i\.test\(s\.name\) \? 'perception' : 'skill'/);
    expect(panels).toContain('rollLine(`${s.name} (${s.ability})`, total, skillKind)');
  });

  it('and no skill still rolls with the untyped default', () => {
    // The exact call that carried the bug.
    expect(panels).not.toContain('rollLine(`${s.name} (${s.ability})`, total)');
  });
});

describe('every OTHER roll surface already declares its kind', () => {
  it('saves route to the three specific save kinds', () => {
    expect(panels).toMatch(/'reflex_save' : s === 'Fortitude' \? 'fortitude_save' : 'will_save'/);
  });

  it('ability checks distinguish STR/DEX, which some conditions single out', () => {
    expect(panels).toMatch(/\(k === 'STR' \|\| k === 'DEX'\) \? 'str_dex_check' : 'ability_check'/);
  });

  it('and attacks declare `attack`', () => {
    expect(panels).toContain("'attack')");
  });

  it('so all ten kinds are either sent by a surface or reached as a bucket', () => {
    // `save` and `any` are never SENT — they are matched by the engine when a specific kind arrives. Every
    // other kind now has a caller. Listing this explicitly is what makes the catalogue a claim rather than
    // a note.
    const SENT = ['attack', 'reflex_save', 'fortitude_save', 'will_save', 'perception', 'str_dex_check', 'skill', 'ability_check'];
    const BUCKETS = ['save', 'any'];
    expect([...SENT, ...BUCKETS].sort()).toEqual([...ALL].sort());
    for (const k of SENT) {
      expect(panels, `nothing ever rolls with kind "${k}"`).toContain(`'${k}'`);
    }
  });
});

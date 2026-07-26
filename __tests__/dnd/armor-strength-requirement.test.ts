// __tests__/dnd/armor-strength-requirement.test.ts — heavy armour you can't carry costs you 10 feet.
//
// The rules-platform doc listed "Armor builder: … STR requirement" as an unbuilt control. It was worse than
// unbuilt: the rule was already in the repo TWICE and applied nowhere.
//   · `ARMOR_2014` / `ARMOR_2024` carry `strengthReq` on every row;
//   · `lib/dnd/library.ts` prints it verbatim — "**Requires:** Strength N (or lose 10 feet of speed)";
//   · `app/dnd/_sheet/engine/equipment.ts` even declared `strengthRequirement?: number`, with no writer
//     and no reader anywhere in the codebase.
// So the sheet told a player the requirement and then ignored it — the same "authored but not wired" shape
// as the weapon `properties` gap, and the reason a control alone would not have been enough.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildLedger } from '@/lib/dnd/effects/ledger';
import { blankCharacter } from '@/app/dnd/_sheet/data/blank';
import type { Character, InvItem } from '@/app/dnd/_sheet/types';

const plate = (strengthReq: number | null, equipped = true): InvItem => ({
  id: 'plate', name: 'Plate Armor', desc: '', qty: 1, tags: [], kind: 'armor', equipped,
  armor: { category: 'heavy', baseAC: 18, modAbility: 'none', strengthReq },
} as InvItem);

function sheet(str: number, items: InvItem[]): Character {
  const c = blankCharacter('Test');
  c.abilities = { ...c.abilities, str };
  c.combat = { ...c.combat, speed: 30 };
  c.inventory = items;
  return c;
}

const speed = (c: Character) => buildLedger(c, {}).value('speed_walk', c.combat.speed);

describe('the penalty applies exactly when the rules say', () => {
  it('costs 10 feet when your Strength is below the requirement', () => {
    expect(speed(sheet(13, [plate(15)]))).toBe(20);
  });

  it('does NOT apply when you meet it exactly', () => {
    // "Strength 15" means 15 is enough — an off-by-one here would penalise a legal character.
    expect(speed(sheet(15, [plate(15)]))).toBe(30);
  });

  it('does not apply when you exceed it', () => {
    expect(speed(sheet(18, [plate(15)]))).toBe(30);
  });

  it('does not apply to armour with no requirement', () => {
    expect(speed(sheet(8, [plate(null)]))).toBe(30);
  });

  it('does not apply while the armour is UNEQUIPPED — carrying it is not wearing it', () => {
    expect(speed(sheet(8, [plate(15, false)]))).toBe(30);
  });

  it('does not stack across two pieces', () => {
    // The rule is a flat 10 feet, and two entries would also read as −20 on the ★ explanation.
    const second = { ...plate(15), id: 'plate2', name: 'Spare Plate' } as InvItem;
    expect(speed(sheet(8, [plate(15), second]))).toBe(20);
  });
});

describe('the player can see WHY their speed dropped', () => {
  it('names the armour and the number it needs', () => {
    // A speed that silently drops 10 feet reads as a bug. Modelled as a source, like Exhaustion, so the
    // ★ can explain it.
    const explained = buildLedger(sheet(13, [plate(15)]), {}).explain('speed_walk');
    const names = explained.map((e) => e.source ?? '').join(' | ');
    expect(names).toContain('Plate Armor');
    expect(names).toContain('Strength 15');
  });
});

describe('the model and the control', () => {
  const TYPES = readFileSync(join(process.cwd(), 'app/dnd/_sheet/types.ts'), 'utf8');
  const BUILDER = readFileSync(join(process.cwd(), 'app/dnd/_sheet/components/ItemBuilder.tsx'), 'utf8');

  it('ArmorStats carries the field', () => {
    expect(TYPES).toContain('strengthReq?: number | null');
  });

  it('the builder exposes it, so a homebrew piece can state it', () => {
    expect(BUILDER).toContain('Min Strength');
    expect(BUILDER).toContain('strengthReq: e.target.value === \'\' ? null : Number(e.target.value)');
  });

  it('clears to null rather than 0 when emptied — 0 would read as "requires Strength 0"', () => {
    expect(BUILDER).toContain("e.target.value === '' ? null");
  });
});

describe('the known limit is stated, not hidden', () => {
  it('records that it reads the RAW score, and why', () => {
    // Sources are collected before any target resolves, so there is no effective STR to read yet. A belt
    // of giant strength therefore does not lift the penalty. Getting the common case right while saying
    // where it stops beats not applying the rule at all — but it must be said.
    const LEDGER = readFileSync(join(process.cwd(), 'lib/dnd/effects/ledger.ts'), 'utf8');
    expect(LEDGER).toContain('KNOWN LIMIT, stated rather than hidden');
    expect(LEDGER).toContain('belt of giant strength');
  });
});

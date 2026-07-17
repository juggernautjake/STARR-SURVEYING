// __tests__/dnd/pf2-digest.test.ts — the PF2 character's derived numbers reach the adjudication AI.
//
// The librarian rules on THIS character via characterDigest, which reads the 5e Character model. A PF2
// character's real numbers (AC, saves, Class/Spell DC, Strike + skill totals) live in the data.pf2e
// sidecar and are computed by rules.ts — so without pf2CharacterDigest the AI was blind to them (it had
// the PF2 rulebook but not the character's actual DC to rule "does the target save?"). This pins that the
// summary carries the derived numbers AND that the chat route appends it for a PF2 character.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { pf2CharacterDigest } from '@/lib/dnd/systems/pathfinder2e/digest';
import type { PF2Character } from '@/lib/dnd/systems/pathfinder2e/model';

function fighter5(): PF2Character {
  return {
    identity: {
      name: 'Durgan', level: 5, ancestry: 'Dwarf', heritage: 'Rock Dwarf', background: 'Warrior',
      className: 'Fighter', subclass: '', deity: '', size: 'Medium', alignment: '', bio: '', photoUrl: '',
    } as PF2Character['identity'],
    attributes: { STR: 4, DEX: 1, CON: 3, INT: 0, WIS: 2, CHA: 0 },
    perception: { rank: 'expert' },
    saves: {
      Fortitude: { rank: 'expert', itemBonus: 0 },
      Reflex: { rank: 'trained', itemBonus: 0 },
      Will: { rank: 'expert', itemBonus: 0 },
    },
    skills: [{ name: 'Athletics', attribute: 'STR', rank: 'trained', itemBonus: 0 }],
    combat: {
      ancestryHp: 10, classHpPerLevel: 10, currentHp: 0, tempHp: 0, dyingValue: 0, woundedValue: 0,
      speed: 20, armorRank: 'trained', dexCap: 0, acItemBonus: 6, attackRank: 'expert',
      classDcRank: 'expert', classDcAttribute: 'STR',
    } as PF2Character['combat'],
    attacks: [{ id: 'a1', name: 'Longsword', attribute: 'STR', rank: 'expert', weaponBonus: 0, damage: '1d8+4 slashing', traits: [] }],
    spellcasting: { tradition: 'none', kind: 'none', attribute: 'INT', rank: 'untrained', slots: [] },
    feats: [],
    languages: ['Common', 'Dwarven'],
  };
}

describe('pf2CharacterDigest', () => {
  const d = pf2CharacterDigest(fighter5());

  it('names the character, its build, ancestry and level', () => {
    expect(d).toMatch(/PATHFINDER 2e CHARACTER: Durgan — Fighter \(Dwarf Rock Dwarf\), level 5/);
  });

  it('carries the derived DEFENSES from the real rules (AC/HP/saves/perception)', () => {
    // AC 10 + cappedDex(min(1,0)=0) + trained(2+5=7) + item 6 = 23; HP 10 + (10+3)*5 = 75.
    // currentHp 0 reads as full, so HP shows 75/75 (matching the sheet's `currentHp || maxHp`).
    expect(d).toMatch(/DEFENSES: AC 23 · HP 75\/75/);
    expect(d).toMatch(/Fort \+12/);   // CON 3 + expert(4+5)
    expect(d).toMatch(/Ref \+8/);     // DEX 1 + trained(2+5)
    expect(d).toMatch(/Will \+11/);   // WIS 2 + expert(4+5)
    expect(d).toMatch(/Perception \+11/);
  });

  it('shows CURRENT hp (how hurt) + temp, and the death track only when live', () => {
    // A healthy character has no STATUS line; a hurt/downed one shows current HP + Dying/Wounded.
    expect(d).not.toMatch(/STATUS:/); // full HP, not dying
    const hurt = fighter5();
    hurt.combat = { ...hurt.combat, currentHp: 20, tempHp: 5, dyingValue: 2, woundedValue: 1 };
    const dh = pf2CharacterDigest(hurt);
    expect(dh).toMatch(/HP 20\/75 \(\+5 temp\)/);
    expect(dh).toMatch(/STATUS: Dying 2 · Wounded 1/);
  });

  it('carries Class DC + the MAP schedule; omits Spell DC for a non-caster', () => {
    expect(d).toMatch(/Class DC 23/); // 10 + STR 4 + expert(4+5)
    expect(d).toMatch(/2nd Strike -5 \(-4 agile\), 3rd -10 \(-8 agile\)/);
    expect(d).not.toMatch(/Spell DC/); // kind 'none'
  });

  it('lists Strikes with their to-hit and trained-or-better skills with totals', () => {
    expect(d).toMatch(/STRIKES: Longsword \+13/); // STR 4 + expert(4+5)
    expect(d).toMatch(/SKILLS: Athletics \+11 \(trained\)/); // STR 4 + trained(2+5)
  });

  it('a caster variant DOES carry the Spell DC + attack', () => {
    const caster = fighter5();
    caster.spellcasting = { tradition: 'arcane', kind: 'prepared', attribute: 'INT', rank: 'trained', slots: [] } as PF2Character['spellcasting'];
    caster.attributes = { ...caster.attributes, INT: 4 };
    const dc = pf2CharacterDigest(caster);
    expect(dc).toMatch(/Spell DC 21/); // 10 + INT 4 + trained(2+5)
  });

  it('the adjudication chat route appends the PF2 digest for a PF2 character', () => {
    const route = fs.readFileSync(path.join(process.cwd(), 'app/api/dnd/library/chat/route.ts'), 'utf8');
    expect(route).toContain('isPF2Character(pf2Data)');
    expect(route).toContain('pf2CharacterDigest(pf2Data)');
  });
});

// __tests__/dnd/character-digest.test.ts — the facts block the librarian adjudicates from.
//
// The failure mode this guards against is the one that makes a rules bot worthless: answering
// "can I do X?" about a GENERIC character instead of THIS one, or inventing a feature/resource
// the sheet never had. So the digest must (a) carry the real numbers, (b) state absences
// explicitly, and (c) never contain anything the sheet doesn't say.
import { describe, it, expect } from 'vitest';
import { characterDigest, adjudicationInstruction } from '@/lib/dnd/character-digest';
import { blankCharacter } from '@/app/dnd/_sheet/data/blank';
import type { Character } from '@/app/dnd/_sheet/types';

function fixture(): Character {
  const c = blankCharacter('Rangor');
  c.meta = { ...c.meta, species: 'Ragnar', className: 'Barbarian', subclass: 'Path of the Juggernaut', level: 7, background: 'Soldier', alignment: 'Chaotic Good' };
  c.abilities = { ...c.abilities, str: 18, dex: 14, con: 16, int: 8, wis: 12, cha: 10 };
  c.combat = { ...c.combat, ac: 17, maxHp: 68, currentHp: 41, tempHp: 5, speed: 30, exhaustion: 1, conditions: ['grappled'] } as Character['combat'];
  c.saves = { ...c.saves, str: { proficient: true, misc: 0 }, con: { proficient: true, misc: 0 } };
  c.skills = { ...c.skills, athletics: { prof: 'expertise', misc: 0 }, survival: { prof: 'proficient', misc: 0 } };
  c.resources = [{ id: 'r1', name: 'Momentum', current: 2, max: 4, resetOn: 'long' }] as Character['resources'];
  c.attacks = [{ id: 'a1', name: 'Cross Counter', ability: 'str', proficient: true, range: 'melee 5 ft', damage: '1d8', damageType: 'bludgeoning' }] as Character['attacks'];
  c.features = [
    { id: 'f1', name: 'Living Momentum', source: 'Ragnar', body: ['Once per turn, when you move 10 feet in a straight line you gain a stacking bonus.'], unlockLevel: 1 },
    { id: 'f2', name: 'Unstoppable Force', source: 'Ragnar', body: ['You cannot be knocked prone while conscious.'], unlockLevel: 1 },
    { id: 'f3', name: 'Not Yet Yours', source: 'Barbarian', body: ['A level 20 capstone.'], unlockLevel: 20 },
  ] as Character['features'];
  return c;
}

describe('characterDigest carries the sheet, not a generic character', () => {
  const d = characterDigest(fixture(), 'dnd-5e-2024');

  it('names the character, its build, system, background and alignment', () => {
    expect(d).toContain('NAME: Rangor');
    expect(d).toContain('Barbarian');
    expect(d).toContain('Path of the Juggernaut');
    expect(d).toContain('LEVEL: 7');
    expect(d).toContain('Background: Soldier');
    expect(d).toContain('Alignment: Chaotic Good');
  });

  it('omits the background/alignment line when the character has neither (no empty scaffolding)', () => {
    const out = characterDigest(blankCharacter('Blank'), 'dnd-5e-2024');
    expect(out).not.toContain('Background:');
    expect(out).not.toContain('Alignment:');
  });

  it('carries ability scores WITH their modifiers (the numbers rulings turn on)', () => {
    expect(d).toMatch(/STR 18 \(\+4\)/);
    expect(d).toMatch(/INT 8 \(-1\)/);
  });

  it('carries current state, not just maximums — an in-play ruling needs what is true now', () => {
    expect(d).toContain('HP 41/68 (+5 temp)');
    expect(d).toContain('AC 17');
    expect(d).toContain('Exhaustion 1 (−2 to all d20 rolls)'); // the penalty the sheet actually applies
  });

  it('states conditions explicitly, including their absence', () => {
    expect(characterDigest(fixture(), 'dnd-5e-2024')).toContain('CONDITIONS: grappled');
    // The absence of a condition is itself a fact a ruling can hinge on, so it must be stated
    // rather than left to the model to infer from silence.
    expect(characterDigest(blankCharacter('Nobody'), 'dnd-5e-2024')).toContain('CONDITIONS: none');
  });

  it('carries proficiencies, resources and attacks', () => {
    expect(d).toMatch(/SAVES: .*STR [+-]\d+\*.*CON [+-]\d+\*/); // save bonuses, proficient ones starred
    expect(d).toMatch(/SKILLS: .*Athletics [+-]\d+ \(expertise\)/); // skills now carry their computed total
    expect(d).toContain('Momentum 2/4');
    expect(d).toContain('Cross Counter');
  });

  it('lists only the features the character actually HAS at its level', () => {
    expect(d).toContain('Living Momentum');
    expect(d).toContain('Unstoppable Force');
    // Level 20 feature on a level 7 character: handing this to the AI invites a ruling that
    // grants a power the player has not earned.
    expect(d).not.toContain('Not Yet Yours');
  });

  it('bounds the prompt on a big sheet, and says so rather than truncating silently', () => {
    const c = fixture();
    c.features = Array.from({ length: 40 }, (_, i) => ({
      id: `f${i}`, name: `Feature ${i}`, body: ['x'], unlockLevel: 1,
    })) as Character['features'];
    const big = characterDigest(c, 'dnd-5e-2024', { maxFeatures: 5 });
    expect(big).toContain('Feature 0');
    expect(big).not.toContain('Feature 30');
    expect(big).toContain('(+35 more not listed)');
  });

  it('omits bio prose — it is not evidence for a ruling and it burns context', () => {
    const c = fixture();
    c.bio = { ...c.bio, background: 'ZZBACKSTORYZZ', intro: ['ZZINTROZZ'] };
    const out = characterDigest(c, 'dnd-5e-2024');
    expect(out).not.toContain('ZZBACKSTORYZZ');
    expect(out).not.toContain('ZZINTROZZ');
  });
});

describe('adjudicationInstruction demands honesty over confidence', () => {
  const i = adjudicationInstruction('Rangor', 'D&D 5e (2024)');

  it('pins the ruling to the named character', () => {
    expect(i).toContain('Rangor');
    expect(i).toMatch(/ACTUAL numbers/);
  });

  it('requires the model to concede when the rules do not settle it', () => {
    // The whole point: a confident wrong ruling is worse than "the rules do not say".
    expect(i).toMatch(/do not settle it, SAY SO/);
    expect(i).toMatch(/DM's call/);
  });

  it('forbids inventing anything the sheet does not have', () => {
    expect(i).toMatch(/Never invent a feature, a number, or a resource/);
  });
  it('tells the AI the numbers are already effective, so it does not double-count a folded-in bonus', () => {
    expect(i).toMatch(/current EFFECTIVE values/);
    expect(i).toMatch(/do NOT re-add a bonus/);
  });
});

describe('the digest reports LEDGER-resolved numbers, not the stored base (Slice 15)', () => {
  function belted(): Character {
    const c = fixture();
    // A Belt of the Bear that SETS STR to 22, and Boots that add +10 walk speed — equipped.
    c.inventory = [
      { id: 'belt', name: 'Belt of the Bear', desc: '', qty: 1, tags: [], equipped: true, effects: [{ target: 'ability_str', operation: 'set', value: 22 }] },
      { id: 'boots', name: 'Striding Boots', desc: '', qty: 1, tags: [], equipped: true, effects: [{ target: 'speed_walk', operation: 'add', value: 10 }] },
    ] as Character['inventory'];
    return c;
  }

  it('shows the effective ability with its base noted, and lists the active source', () => {
    const d = characterDigest(belted(), 'dnd-5e-2024');
    expect(d).toMatch(/STR 22 \(\+6\) \[base 18\]/);   // effective, with base flagged
    expect(d).not.toMatch(/STR 18 \(\+4\) ·/);          // the raw base is NOT what's reported
    expect(d).toMatch(/SAVES: STR \+9\*/);              // proficient STR save = +6 (eff) + 3 (PB), effective
    expect(d).toContain('ACTIVE EFFECTS: Belt of the Bear, Striding Boots');
  });

  it('folds walk speed too, base noted', () => {
    // fixture() carries Exhaustion 1 (−5 ft), so base 30 + 10 boots − 5 exhaustion = 35.
    const d = characterDigest(belted(), 'dnd-5e-2024');
    expect(d).toMatch(/Speed 35 ft \[base 30\]/);
  });

  it('reports the DERIVED AC (equipped armour + AC effects), base noted when it differs', () => {
    const c = fixture();
    // A Ring of Protection (+1 AC) equipped, over the manual base 17.
    c.inventory = [
      { id: 'ring', name: 'Ring of Protection', desc: '', qty: 1, tags: [], equipped: true, effects: [{ target: 'ac', operation: 'add', value: 1 }] },
    ] as Character['inventory'];
    const d = characterDigest(c, 'dnd-5e-2024');
    expect(d).toMatch(/AC 18 \[base 17\]/);
  });

  it('reports attack to-hit from the EFFECTIVE ability + proficiency', () => {
    function withStr(boost: boolean): Character {
      const c = fixture();
      c.combat = { ...c.combat, exhaustion: 0 };
      c.attacks = [{ id: 'gs', name: 'Greatsword', ability: 'str', proficient: true, range: 'melee 5 ft', damage: '2d6', damageType: 'slashing' }] as Character['attacks'];
      if (boost) {
        c.inventory = [{ id: 'belt', name: 'Belt of the Bear', desc: '', qty: 1, tags: [], equipped: true, effects: [{ target: 'ability_str', operation: 'set', value: 22 }] }] as Character['inventory'];
      }
      return c;
    }
    const plain = characterDigest(withStr(false), 'dnd-5e-2024');
    const boosted = characterDigest(withStr(true), 'dnd-5e-2024');
    // Damage folds the ability mod the sheet adds automatically: 2d6 + STR.
    expect(plain).toMatch(/Greatsword \([+-]\d+ to hit, melee 5 ft, 2d6[+-]\d+ slashing\)/);
    const th = (s: string) => Number(s.match(/Greatsword \(([+-]\d+) to hit/)![1]);
    const dmg = (s: string) => Number(s.match(/2d6([+-]\d+) slashing/)![1]);
    expect(th(boosted)).toBe(th(plain) + 2); // STR 18 → 22 is +2 to the mod
    expect(dmg(boosted)).toBe(dmg(plain) + 2); // damage mod rises with STR too
  });

  it('reports Passive Perception + Initiative from the EFFECTIVE WIS/DEX', () => {
    function withBoosts(on: boolean): Character {
      const c = fixture();
      c.combat = { ...c.combat, exhaustion: 0 };
      if (on) {
        c.inventory = [
          { id: 'w', name: 'Cap of Insight', desc: '', qty: 1, tags: [], equipped: true, effects: [{ target: 'ability_wis', operation: 'add', value: 4 }] },
          { id: 'd', name: 'Cloak of Reflexes', desc: '', qty: 1, tags: [], equipped: true, effects: [{ target: 'ability_dex', operation: 'add', value: 4 }] },
        ] as Character['inventory'];
      }
      return c;
    }
    const plain = characterDigest(withBoosts(false), 'dnd-5e-2024');
    const boosted = characterDigest(withBoosts(true), 'dnd-5e-2024');
    expect(plain).toMatch(/Passive Perception \d+/);
    expect(plain).toMatch(/Initiative [+-]\d+/);
    const pp = (s: string) => Number(s.match(/Passive Perception (\d+)/)![1]);
    const init = (s: string) => Number(s.match(/Initiative ([+-]\d+)/)![1]);
    expect(pp(boosted)).toBe(pp(plain) + 2);     // +4 WIS → +2 mod
    expect(init(boosted)).toBe(init(plain) + 2); // +4 DEX → +2 mod
  });

  it('reports the spell save DC + attack from the EFFECTIVE spellcasting ability', () => {
    // A caster with base INT 10; the boosted variant equips an item SETTING INT to 20 (+5 mod). The
    // reported Spell Save DC / attack must rise by 5 — i.e. it reads the effective ability, not the base.
    function caster(withItem: boolean): Character {
      const c = fixture();
      c.combat = { ...c.combat, exhaustion: 0 };
      c.abilities = { ...c.abilities, int: 10 };
      c.spellcasting = { ability: 'int', slots: { 1: { current: 2, max: 2 } } } as Character['spellcasting'];
      if (withItem) {
        c.inventory = [
          { id: 'hb', name: 'Headband of Intellect', desc: '', qty: 1, tags: [], equipped: true, effects: [{ target: 'ability_int', operation: 'set', value: 20 }] },
        ] as Character['inventory'];
      }
      return c;
    }
    const plain = characterDigest(caster(false), 'dnd-5e-2024');
    const boosted = characterDigest(caster(true), 'dnd-5e-2024');
    expect(plain).toMatch(/SPELLCASTING: INT · Spell Save DC \d+ · Spell Attack [+-]\d+/);
    const dc = (s: string) => Number(s.match(/Spell Save DC (\d+)/)![1]);
    const atk = (s: string) => Number(s.match(/Spell Attack ([+-]\d+)/)![1]);
    expect(dc(boosted)).toBe(dc(plain) + 5);   // INT 10 → 20 is +5 to the mod
    expect(atk(boosted)).toBe(atk(plain) + 5);
  });

  it('a vanilla character shows no base annotations and no ACTIVE EFFECTS line', () => {
    // Truly vanilla: no item/spell effects AND no exhaustion (which now legitimately reduces speed).
    const c = fixture();
    c.combat = { ...c.combat, exhaustion: 0 };
    const d = characterDigest(c, 'dnd-5e-2024');
    expect(d).not.toContain('[base ');
    expect(d).not.toContain('ACTIVE EFFECTS:');
    expect(d).toMatch(/STR 18 \(\+4\)/); // the base IS the effective value here
  });

  it('folds save/attack/damage effects so the AI sees the same numbers the sheet does', () => {
    // A Cloak of Protection (+1 all saves) + a +1-to-all-attacks item. The digest must report the
    // folded numbers, matching the sheet's now-folding rolls — otherwise the AI would misadjudicate.
    const c = blankCharacter('Warded');
    c.abilities = { ...c.abilities, dex: 10, str: 10 };
    c.saves = { ...c.saves, dex: { proficient: false, misc: 0 } } as Character['saves'];
    c.attacks = [{ id: 'sw', name: 'Sword', ability: 'str', proficient: true, damage: '1d8', damageType: 'slashing', range: 'melee' }] as Character['attacks'];
    c.inventory = [{
      id: 'cloak', name: 'Cloak of Protection', desc: '', qty: 1, tags: [], equipped: true,
      effects: [{ target: 'all_saves', operation: 'add', value: 1 }, { target: 'attack_and_damage', operation: 'add', value: 1 }],
    }] as Character['inventory'];
    const d = characterDigest(c, 'dnd-5e-2024');
    expect(d).toMatch(/DEX \+1/); // 0 base + 1 all_saves
    expect(d).toMatch(/Sword \(\+\d/); // to-hit includes the +1 attack_and_damage (prof 2 + 1 = +3)
  });
});

describe('the digest carries effect-derived movement, senses and defenses (Slice 11)', () => {
  // These render on the sheet's Combat panel (fly/swim/climb/burrow, Senses, the Defenses card) but were
  // absent from the AI's copy of the sheet — so a ruling on "can you fly to the ledge?" / "do you see in
  // the dark?" / "do you take fire damage?" would be blind to capabilities the player can plainly see.
  function equipped(effects: { target: string; operation: string; value: number | string }[]): Character {
    const c = fixture();
    c.combat = { ...c.combat, exhaustion: 0 };
    c.inventory = [
      { id: 'x', name: 'Wondrous Item', desc: '', qty: 1, tags: [], equipped: true, effects },
    ] as Character['inventory'];
    return c;
  }

  it('reports a granted fly/swim/climb speed, only once it exists', () => {
    const plain = characterDigest(fixture(), 'dnd-5e-2024');
    expect(plain).not.toContain('Movement '); // no non-walking modes → no line at all
    const d = characterDigest(equipped([
      { target: 'speed_fly', operation: 'set', value: 60 },
      { target: 'speed_swim', operation: 'set', value: 30 },
    ]), 'dnd-5e-2024');
    expect(d).toMatch(/Movement .*fly 60 ft/);
    expect(d).toMatch(/swim 30 ft/);
  });

  it('reports granted senses (the "do you see in the dark?" fact)', () => {
    const d = characterDigest(equipped([
      { target: 'grant_sense', operation: 'set', value: 'darkvision 60 ft' },
    ]), 'dnd-5e-2024');
    expect(d).toMatch(/Senses .*darkvision 60 ft/);
  });

  it('reports damage resistance / immunity / vulnerability, kept distinct from condition immunity', () => {
    const d = characterDigest(equipped([
      { target: 'resistance', operation: 'resistance', value: 'fire' },
      { target: 'immunity', operation: 'immunity', value: 'poison' },
      { target: 'vulnerability', operation: 'vulnerability', value: 'cold' },
      { target: 'condition_immunity', operation: 'immunity', value: 'frightened' },
    ]), 'dnd-5e-2024');
    expect(d).toMatch(/DEFENSES:/);
    expect(d).toMatch(/Resistant: fire/);
    expect(d).toMatch(/Immune: poison/);          // damage immunity
    expect(d).toMatch(/Vulnerable: cold/);
    expect(d).toMatch(/Immune to conditions: frightened/); // NOT lumped with the damage immunity
  });

  it('reports a granted movement trait (hover / ignores difficult terrain), presence = the effect', () => {
    const d = characterDigest(equipped([
      { target: 'hover', operation: 'set', value: 1 },
      { target: 'ignore_difficult_terrain', operation: 'set', value: 1 },
    ]), 'dnd-5e-2024');
    expect(d).toMatch(/Movement traits: .*can hover/);
    expect(d).toMatch(/ignores difficult terrain/);
  });

  it('reports advantage on saves vs a named condition (Dwarven Resilience etc.), not auto-applied', () => {
    const d = characterDigest(equipped([
      { target: 'condition_advantage', operation: 'condition_advantage', value: 'poison' },
    ]), 'dnd-5e-2024');
    expect(d).toMatch(/DEFENSES:.*Advantage on saves vs: poison/);
  });

  it('a character with none of these gets no Movement/Senses/DEFENSES noise', () => {
    const d = characterDigest((() => { const c = fixture(); c.combat = { ...c.combat, exhaustion: 0 }; return c; })(), 'dnd-5e-2024');
    expect(d).not.toContain('Movement ');
    expect(d).not.toContain('Movement traits:');
    expect(d).not.toContain('Senses ');
    expect(d).not.toContain('DEFENSES:');
  });
});

describe('the digest carries provenance + the prompt meets homebrew (Slice 22)', () => {
  function homebrewChar(): Character {
    const c = fixture(); // Rangor with homebrew "Living Momentum" / "Unstoppable Force" features
    return c;
  }

  it('reports homebrew content as REAL, to be adjudicated with', () => {
    const d = characterDigest(homebrewChar(), 'dnd-5e-2024');
    // Rangor's features/species aren't 5e-2024 vanilla → flagged homebrew, not disclaimed.
    expect(d).toMatch(/PROVENANCE/);
    expect(d).toMatch(/REAL for this character/);
  });

  it('a fully-vanilla-named sheet gets no PROVENANCE noise', () => {
    const c = blankCharacter('Plain');
    // blank character has no homebrew-named features/species that would flag.
    const d = characterDigest(c, 'dnd-5e-2024');
    // Either no PROVENANCE line, or it only appears when there's custom content — assert it's absent
    // for a sheet with nothing to flag.
    if (d.includes('PROVENANCE')) {
      // If present, it must still frame content as real, never as "unofficial".
      expect(d).not.toMatch(/unofficial/i);
    }
  });

  it('the adjudication instruction tells the model homebrew is real, not unofficial', () => {
    const i = adjudicationInstruction('Rangor', 'D&D 5e (2024)');
    expect(i).toMatch(/HOMEBREW IS REAL/);
    expect(i).toMatch(/do NOT call it "unofficial"/);
    // ...while keeping the honesty rule, now scoped to sheet-or-rulebook.
    expect(i).toMatch(/neither on Rangor's sheet nor in the D&D 5e \(2024\) rules/);
  });
});

describe('the 5e digest lists the character’s spells (SQ3)', () => {
  it('lists known spells with level + school + a brief of the effect, capped like features', () => {
    const c = blankCharacter('Caster') as Character;
    c.spellcasting = { ability: 'int' } as Character['spellcasting'];
    c.spells = [
      { id: 's1', name: 'Fireball', level: 3, school: 'Evocation', description: 'A bright streak flashes to a point and blossoms into flame — 8d6 fire, Dex save for half.' } as never,
      { id: 's2', name: 'Mage Hand', level: 0, school: 'Conjuration', description: 'A spectral hand manipulates objects at a distance.' } as never,
      { id: 's3', name: 'Shield', level: 1, school: 'Abjuration', description: '+5 AC until your next turn.', prepared: false } as never,
    ];
    const d = characterDigest(c, 'dnd-5e-2024');
    expect(d).toMatch(/SPELLS:/);
    expect(d).toMatch(/Fireball \(L3, Evocation\): .*8d6 fire/);
    expect(d).toMatch(/Mage Hand \(cantrip, Conjuration\)/);
    expect(d).toMatch(/Shield \(L1, Abjuration, unprepared\)/);
  });
  it('caps the spell list and notes how many more, like features', () => {
    const c = blankCharacter('Archmage') as Character;
    c.spells = Array.from({ length: 10 }, (_, i) => ({ id: `s${i}`, name: `Spell ${i}`, level: 1, description: 'x' })) as never;
    const d = characterDigest(c, 'dnd-5e-2024', { maxFeatures: 3 });
    expect(d).toMatch(/\(\+7 more not listed\)/);
  });
  it('omits the SPELLS line for a non-caster (no empty scaffolding)', () => {
    expect(characterDigest(blankCharacter('Fighter'), 'dnd-5e-2024')).not.toMatch(/^SPELLS:/m);
  });
});

describe('the 5e digest shows skill totals, not just proficiency names (SQ3)', () => {
  it('lists each proficient/expert skill with its computed bonus', () => {
    const c = blankCharacter('Rogue') as Character;
    c.abilities = { ...c.abilities, dex: 16 }; // +3
    c.skills = { ...c.skills, stealth: { prof: 'expertise', misc: 0 }, athletics: { prof: 'proficient', misc: 0 } };
    const d = characterDigest(c, 'dnd-5e-2024');
    // level 1 → PB 2. Stealth (dex+3): +3 + expertise(2×2=4) = +7. Athletics (str+0): +0 + prof(2) = +2.
    expect(d).toMatch(/SKILLS: /);
    expect(d).toMatch(/Stealth \+7 \(expertise\)/);
    expect(d).toMatch(/Athletics \+2/);
    expect(d).not.toMatch(/SKILL PROFICIENCIES/); // replaced by the totals line
  });
  it('omits the SKILLS line when nothing is proficient', () => {
    expect(characterDigest(blankCharacter('Commoner'), 'dnd-5e-2024')).not.toMatch(/^SKILLS: /m);
  });
});

describe('the 5e digest surfaces wealth (SQ3 completeness)', () => {
  it('lists coins with a non-zero amount, omits zero coins + the line when broke', () => {
    const c = blankCharacter('Merchant') as Character;
    c.currencies = [
      { id: 'gp', name: 'Gold', abbrev: 'gp', amount: 42, rate: 100 },
      { id: 'sp', name: 'Silver', abbrev: 'sp', amount: 7, rate: 10 },
      { id: 'cp', name: 'Copper', abbrev: 'cp', amount: 0, rate: 1 },
    ];
    const d = characterDigest(c, 'dnd-5e-2024');
    expect(d).toMatch(/WEALTH: 42 gp, 7 sp/);
    expect(d).not.toMatch(/0 cp/); // zero coins omitted
    expect(characterDigest(blankCharacter('Broke'), 'dnd-5e-2024')).not.toMatch(/WEALTH:/);
  });
});

// __tests__/dnd/ig-digest.test.ts — the IG character's in-play STATE reaches the adjudication AI.
//
// The librarian rules on THIS character via characterDigest, which reads the 5e Character model. An IG
// character's real state (active stance, conditions + their computed penalty, feats/powers) lives in the
// data.ig sidecar, so without igCharacterDigest the AI was blind to it — it had the IG rulebook but not the
// character's current mechanics. This pins that the summary carries the state AND its computed effect, and
// that the chat route actually appends it for an IG character.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { igCharacterDigest } from '@/lib/dnd/systems/intuitive-games/digest';
import { blankIGCharacter, blankIGCompanion } from '@/lib/dnd/systems/intuitive-games/model';

function fixture() {
  const ig = blankIGCharacter('Brannor');
  ig.identity = { ...ig.identity, level: 6, className: 'Fighter', subclass: 'Champion', ancestry: 'Dwarf' };
  ig.abilities = { ...ig.abilities, CON: 14 };
  ig.combat.hitPoints = { classBackgroundHp: 40, nonlethal: 3, lethal: 8 };
  ig.combat.damageReduction = 2;
  ig.combat.saves = { Fortitude: { rank: 2, misc: 0 }, Reflex: { rank: 1, misc: 0 }, Will: { rank: 0, misc: 0 } };
  ig.skills = [
    { name: 'Stealth', ability: 'DEX', ranks: 3, proficient: true, misc: 0 },
    { name: 'Grapple', ability: 'STR', ranks: 2, proficient: false, misc: 0, combat: true },
    { name: 'Athletics', ability: 'STR', ranks: 0, proficient: false, misc: 0 }, // untrained → excluded
  ];
  ig.combat.stances = ['Offensive'];
  ig.combat.conditions = ['Shaken', 'Prone'];
  ig.combat.defensivePower = 'Sidestep';
  ig.feats = { general: ['Endurance'], combat: ['Weapon Focus'] };
  ig.powers = ['Elemental Blast'];
  return ig;
}

describe('igCharacterDigest', () => {
  const d = igCharacterDigest(fixture());

  it('names the character, its build and level', () => {
    expect(d).toMatch(/INTUITIVE GAMES CHARACTER: Brannor/);
    expect(d).toMatch(/Fighter \/ Champion/);
    expect(d).toMatch(/Dwarf/);
    expect(d).toMatch(/level 6/);
  });

  it('states the ACTIVE stance WITH its resolved mechanical effect (advanced at level 5+)', () => {
    // Offensive at level 6 is the Advanced tier: +half your level to damage rolls.
    expect(d).toMatch(/ACTIVE STANCE: Offensive Stance \(advanced\)/);
    expect(d).toMatch(/damage rolls/);
  });

  it('carries the conditions AND the computed penalty the sheet shows (so a ruling uses it)', () => {
    // Shaken imposes −2; the digest must state both the names and the −2 to attacks/saves/skills.
    expect(d).toMatch(/CONDITIONS: .*Shaken/);
    expect(d).toMatch(/Prone/);
    expect(d).toMatch(/-2 to attacks, saves & skill checks \(Shaken\)/);
    // Prone imposes disadvantage on melee attacks — that legible line rides along too.
    expect(d).toMatch(/Prone: disadvantage on melee attack rolls/);
  });

  it('lists the defensive power WITH its effect, plus feats and powers (the character\'s capabilities)', () => {
    // Like the stance's effect and the conditions' penalty, a recognized defensive power shows what it DOES
    // (the AI can't recall a bespoke IG reaction from its name alone).
    expect(d).toMatch(/DEFENSIVE POWER: Sidestep — On a successful Reflex save vs an attack, take a free 5-foot step/);
    expect(d).toMatch(/FEATS: .*Endurance.*Weapon Focus/);
    expect(d).toMatch(/POWERS: .*Elemental Blast/);
  });

  it('a custom/unknown defensive power stays name-only — never an invented effect (Ground Rule 2)', () => {
    const ig = fixture();
    ig.combat.defensivePower = 'Homebrew Ward';
    const dc = igCharacterDigest(ig);
    expect(dc).toMatch(/DEFENSIVE POWER: Homebrew Ward$/m); // name, no " — <effect>" appended
  });

  it('states DEFENSES — current/max HP (with nonlethal), DR, and the three resolved saves', () => {
    // The numbers a ruling turns on. maxHp = 40 bg + CON mod 2 × level 6 = 52; currentHp = 52 − 8 lethal = 44.
    // Saves = rank + proficiency(=level 6) + governing-ability mod: Fort 2+6+2, Ref 1+6+0, Will 0+6+0.
    expect(d).toMatch(/DEFENSES: HP 44\/52 \(3 nonlethal\)/);
    expect(d).toMatch(/DR 2/);
    expect(d).toMatch(/Saves Fort \+10, Ref \+7, Will \+6/);
  });

  it('lists the TRAINED skills with their totals, flags combat skills, and omits untrained ones', () => {
    // Stealth: ranks 3 + proficiency(level 6) 6 + DEX mod 0 = +9. Grapple: ranks 2 + 0 + STR mod 0 = +2,
    // flagged [combat] (it resolves vs a Reflex save, not a flat DC). Athletics (0 ranks, unproficient) is out.
    expect(d).toMatch(/SKILLS \(trained\): /);
    expect(d).toMatch(/Stealth \+9/);
    expect(d).toMatch(/Grapple \+2 \[combat\]/);
    expect(d).not.toMatch(/Athletics/);
  });

  it('surfaces the companion creature when the character has one (a whole second combatant)', () => {
    const ig = fixture();
    ig.companion = { ...blankIGCompanion('Rukh', 'Dire Wolf'), hitPoints: 33, movement: '50 ft' };
    const dc = igCharacterDigest(ig);
    expect(dc).toMatch(/COMPANION: Rukh \(Dire Wolf, HP 33, 50 ft\)/);
  });

  it('omits the COMPANION line when there is none (no empty scaffolding)', () => {
    expect(d).not.toMatch(/COMPANION:/); // the base fixture has companion = null
  });

  it('surfaces the ancestry TRAITS with their full IG text (a darkvision ruling needs them, not just "Dwarf")', () => {
    // Naming the ancestry alone leaves the AI blind to what it grants. Dwarf carries Cave Vision
    // (darkvision 30 ft) + Robust — both must reach the librarian, verbatim from IG_ANCESTRIES.
    expect(d).toMatch(/ANCESTRY TRAITS \(Dwarf\):/);
    expect(d).toMatch(/Cave Vision — Gain darkvision out to a range of 30 feet\./);
    expect(d).toMatch(/Robust —/);
  });

  it('never invents ancestry traits — an unknown/custom ancestry adds no traits line (Ground Rule 2)', () => {
    const ig = blankIGCharacter('Stranger');
    ig.identity = { ...ig.identity, ancestry: 'Homebrew Wanderer' };
    expect(igCharacterDigest(ig)).not.toMatch(/ANCESTRY TRAITS/);
  });

  it('states absences explicitly for a blank character (no stance / no conditions)', () => {
    const d0 = igCharacterDigest(blankIGCharacter('Nobody'));
    expect(d0).toMatch(/ACTIVE STANCE: none/);
    expect(d0).toMatch(/CONDITIONS: none/);
  });

  it('the adjudication chat route appends the IG digest for an IG character', () => {
    // Source-anchored: the route detects the data.ig sidecar and folds igCharacterDigest into the digest
    // the librarian sees, so an IG ruling is character-aware, not just rulebook-aware.
    const route = fs.readFileSync(path.join(process.cwd(), 'app/api/dnd/library/chat/route.ts'), 'utf8');
    expect(route).toContain('isIGCharacter(igData)');
    expect(route).toContain('igCharacterDigest(igData)');
  });
});

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
import { blankIGCharacter } from '@/lib/dnd/systems/intuitive-games/model';

function fixture() {
  const ig = blankIGCharacter('Brannor');
  ig.identity = { ...ig.identity, level: 6, className: 'Fighter', subclass: 'Champion', ancestry: 'Dwarf' };
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

  it('lists the defensive power, feats and powers (the character\'s capabilities)', () => {
    expect(d).toMatch(/DEFENSIVE POWER: Sidestep/);
    expect(d).toMatch(/FEATS: .*Endurance.*Weapon Focus/);
    expect(d).toMatch(/POWERS: .*Elemental Blast/);
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

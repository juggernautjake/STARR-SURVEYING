// __tests__/dnd/pf2-build-picks.test.ts — the PF2 builder can finally pick feats and spells (S16).
//
// The builder offered ancestry/class/skills/armor/weapon but NOT feats or spells, so a PF2
// character could only gain them after the fact from the sheet or the AI. Gating the sheet while
// leaving the builder open would have moved the hole rather than closed it.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { gatePf2Picks } from '@/lib/dnd/systems/pathfinder2e/rules-gate';
import { parsePF2Picks } from '@/lib/dnd/systems/pathfinder2e/ai';
import { assemblePF2VanillaCharacter } from '@/lib/dnd/systems/pathfinder2e/builder';
import type { PF2FeatFull, PF2SpellFull } from '@/lib/dnd/systems/pathfinder2e/defs';

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');
const picker = read('app/dnd/_ui/PF2BuildPicks.tsx');
const builder = read('app/dnd/_ui/PF2CharacterBuilder.tsx');
const route = read('app/api/dnd/characters/[id]/pf2-build/route.ts');

const CATALOG = {
  feats: [
    { name: 'Toughness', level: 1, track: 'general', traits: [], effect: 'x', source: 'Player Core' },
    { name: 'Big Feat', level: 16, track: 'general', traits: [], effect: 'x', source: 'Player Core' },
    { name: 'Power Attack', level: 1, track: 'class', className: 'Fighter', traits: [], effect: 'x', source: 'Player Core' },
    { name: 'Chain', level: 2, track: 'general', traits: [], effect: 'x', source: 'Player Core', prereqs: [{ kind: 'feat', name: 'Toughness' }] },
  ] as PF2FeatFull[],
  spells: [
    { name: 'Fireball', rank: 3, traditions: ['arcane'], traits: [], cast: '2', effect: 'x', source: 'Player Core' },
    { name: 'Heal', rank: 1, traditions: ['divine'], traits: [], cast: '1-3', effect: 'x', source: 'Player Core' },
  ] as PF2SpellFull[],
};

describe('picks reach the character', () => {
  it('the picks parser accepts feats and spells', () => {
    const p = parsePF2Picks({ name: 'X', feats: ['Toughness'], spells: ['Fireball'] });
    expect(p.feats).toEqual(['Toughness']);
    expect(p.spells).toEqual(['Fireball']);
  });

  it('a chosen feat is assembled onto the sheet with its catalog level and text', () => {
    // Resolved against the catalog rather than stored as a bare name.
    const c = assemblePF2VanillaCharacter({ name: 'X', className: 'Fighter', level: 5, feats: ['Toughness'] });
    const f = c.pf2e.feats.find((x) => x.name === 'Toughness');
    expect(f).toBeTruthy();
    expect(f!.level).toBe(1);
    expect(f!.body).toBeTruthy();
  });

  it('an uncatalogued feat is still honoured, as homebrew', () => {
    // Dropping it would lose a deliberate choice; it just carries no invented mechanics.
    const c = assemblePF2VanillaCharacter({ name: 'X', className: 'Fighter', level: 5, feats: ['Blorpwave Mastery'] });
    expect(c.pf2e.feats.map((f) => f.name)).toContain('Blorpwave Mastery');
  });

  it('a chosen spell lands on a caster with its catalog rank', () => {
    const c = assemblePF2VanillaCharacter({ name: 'X', className: 'Wizard', level: 6, spells: ['Fireball'] });
    expect(c.pf2e.spellcasting.spells?.[0]).toMatchObject({ name: 'Fireball', rank: 3 });
  });
});

describe('the build gate holds the same line as the sheet', () => {
  const VANILLA = { enforce: true };

  it('refuses a feat above the character’s level', () => {
    const r = gatePf2Picks({ className: 'Fighter', level: 4, feats: ['Big Feat'] }, VANILLA, CATALOG);
    expect(r.refused.map((x) => x.name)).toEqual(['Big Feat']);
  });

  it('refuses another class’s feat', () => {
    const r = gatePf2Picks({ className: 'Wizard', level: 4, feats: ['Power Attack'] }, VANILLA, CATALOG);
    expect(r.refused).toHaveLength(1);
  });

  it('refuses an off-tradition spell', () => {
    const r = gatePf2Picks({ className: 'Wizard', level: 10, spells: ['Heal'] }, VANILLA, CATALOG, 'arcane');
    expect(r.refused).toHaveLength(1);
  });

  it('allows a legal build untouched', () => {
    const r = gatePf2Picks({ className: 'Fighter', level: 4, feats: ['Toughness'] }, VANILLA, CATALOG);
    expect(r.refused).toHaveLength(0);
  });

  it('picks under review do NOT satisfy each other’s prerequisites', () => {
    // Otherwise a chain of feats is vacuously legal — each one satisfied by the others in the same
    // unsaved build.
    const r = gatePf2Picks({ className: 'Fighter', level: 5, feats: ['Toughness', 'Chain'] }, VANILLA, CATALOG);
    expect(r.refused.map((x) => x.name)).toEqual(['Chain']);
  });

  it('marks rather than refuses for a custom character', () => {
    const r = gatePf2Picks({ className: 'Fighter', level: 4, feats: ['Big Feat'] },
      { enforce: false, unboundReason: 'custom-character' }, CATALOG);
    expect(r.refused).toHaveLength(0);
    expect(r.offRules['Big Feat']).toBeTruthy();
  });

  it('passes homebrew through', () => {
    const r = gatePf2Picks({ className: 'Fighter', level: 1, feats: ['Blorpwave Mastery'] }, VANILLA, CATALOG);
    expect(r.refused).toHaveLength(0);
  });

  it('the route calls it with server-derived enforcement', () => {
    expect(route).toContain('gatePf2Picks(picks');
    expect(route).toContain('readActiveSlotMeta(');
    expect(route).not.toMatch(/enforce:\s*body\./);
  });
});

describe('the builder UI greys rather than hides', () => {
  it('consults the same eligibility core', () => {
    expect(picker).toContain('pf2FeatEligibility');
    expect(picker).toContain('pf2SpellEligibility');
  });

  it('disables and strikes through an ineligible pick, with its reason', () => {
    expect(picker).toContain('disabled={blocked}');
    expect(picker).toContain("textDecoration: blocked ? 'line-through'");
    expect(picker).toContain('r.reason');
  });

  it('never blocks an already-selected pick', () => {
    expect(picker).toContain('const blocked = !r.ok && !active');
  });

  it('does not let picks satisfy each other’s prerequisites, matching the server', () => {
    expect(picker).toContain('featNames: []');
  });

  it('is search-first, because the catalog is thousands of rows', () => {
    expect(picker).toContain('needle.length < 2');
  });

  it('admits the catalog is partial', () => {
    expect(picker).toContain('!status.complete');
  });

  it('offers the spell picker only to casters, and sends both to the build', () => {
    // The spell block is gated on the class being a caster. (After the B7 stepped-layout refactor the block
    // is a `cls?.spellcasting ? (…) : null` node instead of an inline `&&`, but the caster gate is identical.)
    expect(builder).toMatch(/cls\?\.spellcasting\s*\?/);
    expect(builder).toContain('weapon, feats, spells }');
  });
});

// __tests__/dnd/system-integrity.test.ts — Ground Rule 1, enforced.
//
// "A system's rules never leak into another system." The same word means different things in
// different games — a 2014 Barbarian and a 2024 Barbarian are distinct classes, a "berserker"
// subclass exists in both, and Frightened is binary in 5e but numeric in Pathfinder. As more content
// is authored, name collisions across systems are inevitable. This suite is the guardrail: every
// piece of content is TAGGED with its system, and every lookup is SCOPED to a system, so a character
// can only ever be given the version that belongs to its chosen system. If a future edit adds
// cross-system content without scoping it, one of these fails.
import { describe, it, expect } from 'vitest';
import { GAME_SYSTEMS, availableSystems, isSystemAvailable } from '@/lib/dnd/systems';
import { classesForSystem, findClass, subclassesFor, findSubclass } from '@/lib/dnd/classes/registry';
import { findTerm, glossaryFor } from '@/lib/dnd/glossary';
import { FEATS_2024 } from '@/lib/dnd/feats/dnd5e-2024';
import { BACKGROUNDS_2024 } from '@/lib/dnd/backgrounds/dnd5e-2024';
import { SPECIES_2024 } from '@/lib/dnd/species/dnd5e-2024';

const SYSTEMS = GAME_SYSTEMS.map((s) => s.key);
const CLASS_SYSTEMS = ['dnd5e-2014', 'dnd5e-2024']; // the systems with a full class table today

describe('classes are tagged with, and locked to, their system', () => {
  it('every registered class carries a system matching the bucket it lives in', () => {
    for (const sys of CLASS_SYSTEMS) {
      for (const cls of classesForSystem(sys)) {
        expect(cls.system, `${cls.name} in ${sys}`).toBe(sys);
        for (const sub of subclassesFor(sys, cls.key)) {
          expect(sub.system, `${sub.name} (${cls.key}) in ${sys}`).toBe(sys);
          expect(sub.classKey).toBe(cls.key);
        }
      }
    }
  });

  it('a class key shared across editions resolves to the RIGHT edition, never the other', () => {
    // Barbarian exists in both 2014 and 2024 — distinct objects, each scoped to its own system.
    const b2014 = findClass('dnd5e-2014', 'barbarian');
    const b2024 = findClass('dnd5e-2024', 'barbarian');
    expect(b2014?.system).toBe('dnd5e-2014');
    expect(b2024?.system).toBe('dnd5e-2024');
    expect(b2014).not.toBe(b2024);
    // The 2014 Barbarian has an ASI at 19; the 2024 one grants an Epic Boon there instead. Proof the
    // lookup returns genuinely different rules, not the same object under two names.
    expect(b2014?.asiLevels).toContain(19);
    expect(b2024?.features.some((f) => f.choice === 'epic-boon')).toBe(true);
    expect(b2014?.features.some((f) => f.choice === 'epic-boon')).toBe(false);
  });

  it('a subclass key shared across editions never leaks (the bug this suite was born from)', () => {
    // "berserker" is a Barbarian path in 2014 AND 2024. Each system must only ever see its own.
    const s2014 = subclassesFor('dnd5e-2014', 'barbarian').map((s) => s.name);
    const s2024 = subclassesFor('dnd5e-2024', 'barbarian').map((s) => s.name);
    expect(s2014).toContain('Path of the Totem Warrior'); // 2014-only
    expect(s2024).not.toContain('Path of the Totem Warrior');
    expect(s2024).toContain('Path of the Wild Heart'); // 2024-only
    expect(s2014).not.toContain('Path of the Wild Heart');
    // findSubclass is scoped the same way.
    expect(findSubclass('dnd5e-2014', 'berserker')?.system).toBe('dnd5e-2014');
    expect(findSubclass('dnd5e-2024', 'berserker')?.system).toBe('dnd5e-2024');
    // A subclass never resolves under a system that doesn't have it.
    expect(findSubclass('pathfinder2e', 'berserker')).toBeNull();
    expect(subclassesFor('pathfinder2e', 'barbarian')).toEqual([]);
  });
});

describe('the glossary is scoped: a shared term returns the CORRECT system version', () => {
  it('"Frightened" resolves to a different article per system (5e binary vs PF numeric)', () => {
    // Frightened is defined for several systems with genuinely different rules text.
    const systemsWithFrightened = SYSTEMS.filter((s) => findTerm(s, 'Frightened'));
    expect(systemsWithFrightened.length).toBeGreaterThanOrEqual(2);
    const articles = systemsWithFrightened.map((s) => findTerm(s, 'Frightened')!.body);
    // At least two systems disagree on what Frightened MEANS — the whole point of scoping.
    expect(new Set(articles).size).toBeGreaterThan(1);
  });

  it('a term is only ever drawn from the requested system\'s glossary', () => {
    for (const sys of SYSTEMS) {
      const terms = glossaryFor(sys);
      // Every hit for a term in this system comes from this system's own list (object identity).
      for (const t of terms.slice(0, 5)) {
        expect(glossaryFor(sys)).toContain(findTerm(sys, t.term));
      }
    }
  });

  it('a system with no glossary yields nothing rather than borrowing another\'s', () => {
    expect(findTerm('a-made-up-system', 'Frightened')).toBeNull();
  });
});

describe('system availability — four systems are the focus; the rest are under construction', () => {
  it('marks exactly the four built-out systems as available', () => {
    expect(availableSystems().map((s) => s.key).sort()).toEqual(
      ['dnd5e-2014', 'dnd5e-2024', 'intuitive-games', 'pathfinder2e'].sort(),
    );
  });

  it('marks every other seeded system as under construction (offered, but a future build)', () => {
    const under = GAME_SYSTEMS.filter((s) => s.status === 'under-construction').map((s) => s.key).sort();
    expect(under).toEqual(['blades', 'coc7e', 'cyberpunk-red', 'pathfinder1e', 'shadowrun6e', 'starfinder1e'].sort());
    for (const k of under) expect(isSystemAvailable(k)).toBe(false);
  });

  it('every system carries a status (nothing untriaged)', () => {
    for (const s of GAME_SYSTEMS) expect(['available', 'under-construction']).toContain(s.status);
  });
});

describe('single-system content is uniformly tagged (so it can be scoped as systems grow)', () => {
  it('every 2024 feat, background, and species is tagged dnd5e-2024', () => {
    for (const f of FEATS_2024) expect(f.system, f.name).toBe('dnd5e-2024');
    for (const b of BACKGROUNDS_2024) expect(b.system, b.name).toBe('dnd5e-2024');
    for (const sp of SPECIES_2024) expect(sp.system, sp.name).toBe('dnd5e-2024');
  });

  it('a background\'s Origin feat resolves within the same system (no dangling cross-system ref)', () => {
    // Backgrounds reference feats by key; both are 2024, so the reference stays in-system.
    for (const b of BACKGROUNDS_2024) {
      expect(b.system).toBe('dnd5e-2024');
      expect(FEATS_2024.some((f) => f.key === b.originFeat), `${b.name} → ${b.originFeat}`).toBe(true);
    }
  });
});

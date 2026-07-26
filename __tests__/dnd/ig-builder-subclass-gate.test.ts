// __tests__/dnd/ig-builder-subclass-gate.test.ts — the IG builder's class → subclass dependency.
//
// Driven in the browser during the final-QA walkthrough (slice 17). The IG Foundations builder is CORRECT:
// its five steps render IG's own mechanics (the "start 10, eight +2 boosts, cap 14, at most two per
// ability" method, stances, defensive powers, companions), and picking a class narrows the subclass list
// from all fourteen to that class's own. Recorded here so the dependency can't silently regress into an
// ungated list — offering a Wizard "Sohei" would be a rules error the sheet would then carry.
//
// It also pins that **Champion is reachable this way**, which is what makes slice 7's free-text fallback
// matter: a player really can pick Fighter → Champion and reach the choices IG has no catalogued options
// for. If Champion ever leaves the taxonomy, that fallback's justification changes and this fails.
import { describe, it, expect } from 'vitest';
import { IG_CLASS_TAXONOMY, igSubclassesOf } from '@/lib/dnd/systems/intuitive-games/taxonomy';

describe('IG class → subclass is a real dependency, not one flat list', () => {
  const parents = IG_CLASS_TAXONOMY.map((t: { name?: string; parent?: string }) => t.name ?? t.parent).filter(Boolean) as string[];

  it('offers exactly the four parent classes the taxonomy defines', () => {
    expect(parents.sort()).toEqual(['Archon', 'Conduit', 'Fighter', 'Wizard']);
  });

  it('each parent yields only its OWN subclasses', () => {
    expect(igSubclassesOf('Fighter').sort()).toEqual(['Champion', 'Freebooter', 'Marksman', 'Sohei']);
    // The point of the gate: a Fighter's list must not leak into a Wizard's.
    for (const s of igSubclassesOf('Wizard')) {
      expect(igSubclassesOf('Fighter'), `${s} appears under both Wizard and Fighter`).not.toContain(s);
    }
  });

  it('every subclass belongs to exactly one parent', () => {
    const seen = new Map<string, string>();
    for (const p of parents) {
      for (const s of igSubclassesOf(p)) {
        expect(seen.has(s), `${s} is under both ${seen.get(s)} and ${p}`).toBe(false);
        seen.set(s, p);
      }
    }
    expect(seen.size).toBe(14);
  });

  it('an unknown parent yields nothing rather than everything', () => {
    // Failing open here would show a player every subclass in the game for a class that doesn't exist.
    expect(igSubclassesOf('Not A Class')).toEqual([]);
  });

  it('Champion is genuinely reachable — which is why the free-text fallback exists', () => {
    expect(igSubclassesOf('Fighter')).toContain('Champion');
  });
});

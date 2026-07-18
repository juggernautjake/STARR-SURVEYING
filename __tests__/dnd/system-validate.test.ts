// __tests__/dnd/system-validate.test.ts — the safety net catches wrong-system mechanics
// (Phase V, system-grounding Slice 3) without flagging valid characters.
import { describe, it, expect } from 'vitest';
import { validateCharacterForSystem, violationsSummary } from '@/lib/dnd/system-validate';
import { blankCharacter } from '@/app/dnd/_sheet/data/blank';
import { SYSTEM_AMBIGUOUS } from '@/lib/dnd/systems';
import { classesForSystem } from '@/lib/dnd/classes/registry';

/** Class-feature names for a system (choice placeholders excluded), for the cross-edition test. */
function featureNames(system: string): Set<string> {
  const s = new Set<string>();
  for (const c of classesForSystem(system)) for (const f of c.features) if (f.name && !f.choice) s.add(f.name.trim().toLowerCase());
  return s;
}

function make(over: Partial<{ level: number; className: string; species: string; str: number }>) {
  const c = blankCharacter('Test');
  if (over.level != null) c.meta.level = over.level;
  if (over.className != null) c.meta.className = over.className;
  if (over.species != null) c.meta.species = over.species;
  if (over.str != null) c.abilities.str = over.str;
  return c;
}

describe('system validation (Slice 3)', () => {
  it('a valid in-system character produces no violations', () => {
    const c = make({ level: 5, className: 'Fighter', species: 'Human', str: 16 });
    expect(validateCharacterForSystem(c, 'dnd5e-2014')).toEqual([]);
    expect(validateCharacterForSystem(c, 'dnd5e-2024')).toEqual([]); // Human valid in both
  });

  it('the ambiguous / unknown system validates nothing system-specific', () => {
    const c = make({ level: 99, className: 'Warlock', species: 'Aasimar', str: 40 });
    expect(validateCharacterForSystem(c, SYSTEM_AMBIGUOUS)).toEqual([]);
    expect(validateCharacterForSystem(c, 'nonsense')).toEqual([]);
  });

  it('flags a level outside the system range', () => {
    const v = validateCharacterForSystem(make({ level: 25 }), 'dnd5e-2014');
    expect(v.some((x) => x.field === 'meta.level' && x.severity === 'error')).toBe(true);
  });

  it('flags an ability score past the 5e cap (score-based), but not for PF2 (modifier-based)', () => {
    const v5 = validateCharacterForSystem(make({ str: 26 }), 'dnd5e-2024');
    expect(v5.some((x) => x.field === 'abilities.str')).toBe(true);
    // PF2 stores modifiers, so the numeric field isn't range-checked the same way (no false positive).
    const vpf = validateCharacterForSystem(make({ str: 26 }), 'pathfinder2e');
    expect(vpf.some((x) => x.field === 'abilities.str')).toBe(false);
  });

  it('flags a cross-system CLASS (Warlock does not exist in Pathfinder 2e)', () => {
    const v = validateCharacterForSystem(make({ className: 'Warlock' }), 'pathfinder2e');
    expect(v.some((x) => x.field === 'meta.className' && /Warlock/.test(x.message))).toBe(true);
    // Fighter exists in PF2, so no class flag.
    expect(validateCharacterForSystem(make({ className: 'Fighter' }), 'pathfinder2e').some((x) => x.field === 'meta.className')).toBe(false);
  });

  it('flags a class feature that is EXCLUSIVE to the other 5e edition, but not shared/homebrew ones', () => {
    const in2024 = featureNames('dnd5e-2024');
    const in2014 = featureNames('dnd5e-2014');
    const only2014 = [...in2014].find((n) => !in2024.has(n));
    const shared = [...in2014].find((n) => in2024.has(n));
    // The datasets should give us at least one exclusive + one shared feature to test with.
    expect(only2014).toBeTruthy();
    expect(shared).toBeTruthy();

    const withFeature = (name: string) => { const c = blankCharacter('T'); c.meta.className = 'Barbarian'; c.features = [{ id: 'f', name, source: '', body: [''] }]; return c; };
    // A 2014-exclusive feature on a 2024 sheet → flagged.
    expect(validateCharacterForSystem(withFeature(only2014!), 'dnd5e-2024').some((x) => x.field.startsWith('features.'))).toBe(true);
    // A feature shared by both editions → NOT flagged.
    expect(validateCharacterForSystem(withFeature(shared!), 'dnd5e-2024').some((x) => x.field.startsWith('features.'))).toBe(false);
    // A homebrew feature in NEITHER edition → NOT flagged.
    expect(validateCharacterForSystem(withFeature('Zorptastic Overdrive'), 'dnd5e-2024').some((x) => x.field.startsWith('features.'))).toBe(false);
  });

  it('does NOT flag a SAVED HOMEBREW class (Slice 5) as unrecognized', () => {
    const c = make({ className: 'Spellblade' });
    // Without the homebrew class saved, it's flagged as not-recognized…
    expect(validateCharacterForSystem(c, 'dnd5e-2024').some((x) => x.field === 'meta.className')).toBe(true);
    // …but a character carrying the saved homebrew class is fine.
    c.homebrewClasses = [{ key: 'custom-spellblade', name: 'Spellblade', system: 'dnd5e-2024' } as never];
    expect(validateCharacterForSystem(c, 'dnd5e-2024').some((x) => x.field === 'meta.className')).toBe(false);
    // Ground Rule 1: the homebrew class only counts under its own system.
    expect(validateCharacterForSystem(c, 'pathfinder2e').some((x) => x.field === 'meta.className')).toBe(true);
  });

  it('flags a cross-edition SPECIES (Aasimar is 2024, not a 2014 PHB race; Half-Elf is 2014, not 2024)', () => {
    expect(validateCharacterForSystem(make({ species: 'Aasimar' }), 'dnd5e-2014').some((x) => x.field === 'meta.species')).toBe(true);
    expect(validateCharacterForSystem(make({ species: 'Half-Elf' }), 'dnd5e-2024').some((x) => x.field === 'meta.species')).toBe(true);
    // And each is fine in its own edition.
    expect(validateCharacterForSystem(make({ species: 'Aasimar' }), 'dnd5e-2024').some((x) => x.field === 'meta.species')).toBe(false);
    expect(validateCharacterForSystem(make({ species: 'Half-Elf' }), 'dnd5e-2014').some((x) => x.field === 'meta.species')).toBe(false);
  });

  it('tolerates multiclass / variant strings', () => {
    expect(validateCharacterForSystem(make({ className: 'Fighter 3 / Rogue 2' }), 'dnd5e-2014').some((x) => x.field === 'meta.className')).toBe(false);
    expect(validateCharacterForSystem(make({ species: 'Variant Human' }), 'dnd5e-2014').some((x) => x.field === 'meta.species')).toBe(false);
  });

  it('violationsSummary renders one line per violation', () => {
    const v = validateCharacterForSystem(make({ level: 30, className: 'Warlock' }), 'pathfinder2e');
    const s = violationsSummary(v);
    expect(s.split('\n').length).toBe(v.length);
    expect(violationsSummary([])).toBe('');
  });
});

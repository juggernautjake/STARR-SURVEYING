import { describe, it, expect } from 'vitest';
import { progressionRows, progressionColumns } from '@/lib/dnd/classes/progression-rows';
import { classesForSystem } from '@/lib/dnd/classes/registry';

const barbarian = classesForSystem('dnd5e-2024').find((c) => c.name === 'Barbarian')!;
const wizard = classesForSystem('dnd5e-2024').find((c) => c.name === 'Wizard')!;

describe('progressionRows — a class table straight from the class data (Slice 7)', () => {
  it('produces 20 rows with faithful level + proficiency bonus', () => {
    const rows = progressionRows(barbarian);
    expect(rows).toHaveLength(20);
    expect(rows[0]).toMatchObject({ level: 1, prof: '+2' });
    expect(rows[4].prof).toBe('+3');   // level 5 → +3
    expect(rows[19].prof).toBe('+6');  // level 20 → +6
  });

  it('lists the features GAINED at each level (not cumulative)', () => {
    const rows = progressionRows(barbarian);
    expect(rows[0].features).toMatch(/Rage/);          // level 1
    // A mid-level row doesn't repeat level-1 features (per-level, not cumulative).
    expect(rows[9].features).not.toMatch(/^Rage,/);
    // Some later level also gains a named feature (the table isn't just level 1).
    expect(rows.slice(1).some((r) => r.features !== '—')).toBe(true);
  });

  it('marks the current level with `here`', () => {
    const rows = progressionRows(barbarian, null, 3);
    expect(rows.filter((r) => r.here).map((r) => r.level)).toEqual([3]);
  });

  it('fills the middle columns from resources (Barbarian tracks Rage) or spell info (Wizard)', () => {
    const barb = progressionRows(barbarian);
    // Barbarian has a Rage resource — col3 shows a number at level 1.
    expect(barb[0].col3).toMatch(/^\d+$/);
    const wiz = progressionRows(wizard);
    // A caster surfaces spell info in the middle columns rather than '—' at higher levels.
    expect(wiz[0].col3 === '—' && wiz[0].col4 === '—').toBe(false);
  });

  it('progressionColumns labels the middle columns from the class (a resource name, else Spell Slots)', () => {
    // Barbarian's first resource labels col3.
    expect(progressionColumns(barbarian).col3Label.length).toBeGreaterThan(0);
    // Wizard's first tracked resource is Arcane Recovery; a class with NO resources would show Spell Slots.
    const noResourceCaster = { ...wizard, resources: [] };
    expect(progressionColumns(noResourceCaster).col3Label).toBe('Spell Slots');
  });
});

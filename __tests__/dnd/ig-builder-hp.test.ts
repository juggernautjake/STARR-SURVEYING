// The IG builder wires a character's HP BASE from its class + background (owner 2026-07-22).
// Before this, `assembleIGVanillaCharacter` set the background NAME but left classBackgroundHp at 0,
// so every IG character built with a background read as though it had no base HP — the "a stat that
// should be there defaults to nothing" bug.
import { describe, expect, it } from 'vitest';
import { assembleIGVanillaCharacter } from '@/lib/dnd/systems/intuitive-games/builder';
import { igMaxHp } from '@/lib/dnd/systems/intuitive-games/rules';
import type { IGCharacter } from '@/lib/dnd/systems/intuitive-games/model';

describe('IG builder populates the HP base', () => {
  it('sets classBackgroundHp = class base + background HP', () => {
    // Fighter/Freebooter base 12 + Soldier background 12 = 24.
    const c = assembleIGVanillaCharacter({ name: 'HP Test', className: 'Fighter', subclass: 'Freebooter', background: 'Soldier', level: 6, abilities: { STR: 16, DEX: 12, CON: 14, INT: 10, WIS: 10, CHA: 10 } } as never) as { ig: { combat: { hitPoints: { classBackgroundHp: number } } } };
    expect(c.ig.combat.hitPoints.classBackgroundHp).toBe(24);
  });

  it('produces a real, non-zero max HP through igMaxHp', () => {
    const c = assembleIGVanillaCharacter({ name: 'HP Test', className: 'Wizard', background: 'Academic', level: 5, abilities: { STR: 8, DEX: 12, CON: 14, INT: 18, WIS: 12, CHA: 10 } } as never) as { ig: IGCharacter };
    // Wizard base 8 + Academic 8 = 16, plus CON mod (+2) × 5 = 10 → 26. The point is it is NOT 0/near-0.
    expect(igMaxHp(c.ig)).toBeGreaterThanOrEqual(16);
  });

  it('leaves the base at 0 for an off-catalog background rather than inventing HP', () => {
    const c = assembleIGVanillaCharacter({ name: 'HP Test', className: 'Fighter', background: 'Interdimensional Tourist', level: 3, abilities: { STR: 16, DEX: 12, CON: 12, INT: 10, WIS: 10, CHA: 10 } } as never) as { ig: { combat: { hitPoints: { classBackgroundHp: number } } } };
    // Class base (Fighter 12) still counts; the unknown background adds 0 — honest, not fabricated.
    expect(c.ig.combat.hitPoints.classBackgroundHp).toBe(12);
  });
});

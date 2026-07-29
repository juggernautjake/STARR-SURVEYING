// __tests__/dnd/combat-hp.test.ts — HP resolves for every system, not just 5e (P1-1, audit B-3).
//
// The defect: `encounters/[id]/entries` read `c.data?.combat` and nothing else, so PF2 and IG combatants
// entered the initiative tracker with null HP — silently. Half the playable systems could not be run in the
// tracker without the DM typing HP in by hand. Neither system was missing the arithmetic; nobody was asking
// for it.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { resolveHp } from '@/lib/dnd/combat-hp';
import { pf2MaxHp } from '@/lib/dnd/systems/pathfinder2e/rules';
import { igMaxHp } from '@/lib/dnd/systems/intuitive-games/rules';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

/** A PF2 sidecar: 8 ancestry HP + (10/level + CON 3) × 5 = 73. */
const pf2Data = (over: Record<string, unknown> = {}) => ({
  pf2e: {
    identity: { level: 5, className: 'Fighter' },
    attributes: { STR: 4, DEX: 2, CON: 3, INT: 0, WIS: 1, CHA: 0 },
    combat: { ancestryHp: 8, classHpPerLevel: 10, currentHp: 0, tempHp: 0, dyingValue: 0, woundedValue: 0, heroPoints: 1, speed: 25, ...over },
  },
});

/** An IG sidecar: 30 class/background HP + (CON mod × level). */
const igData = (over: Record<string, unknown> = {}) => ({
  ig: {
    identity: { level: 4, className: 'Archon' },
    abilities: { STR: 12, DEX: 10, CON: 14, INT: 10, WIS: 10, CHA: 10 },
    combat: { hitPoints: { classBackgroundHp: 30, nonlethal: 0, lethal: 0, ...over } },
  },
});

describe('5e keeps reading its own combat block', () => {
  it('takes max and current straight from data.combat', () => {
    const d = { combat: { maxHp: 42, currentHp: 17 } };
    expect(resolveHp('dnd5e-2014', d)).toEqual({ maxHp: 42, currentHp: 17 });
    expect(resolveHp('dnd5e-2024', d)).toEqual({ maxHp: 42, currentHp: 17 });
  });

  it('and a 5e character with no combat block still resolves to null, not a crash', () => {
    expect(resolveHp('dnd5e-2024', {})).toEqual({ maxHp: null, currentHp: null });
    expect(resolveHp('dnd5e-2024', null)).toEqual({ maxHp: null, currentHp: null });
  });
});

describe('PF2 — the bug', () => {
  it('resolves HP from the pf2e sidecar instead of null', () => {
    const got = resolveHp('pathfinder2e', pf2Data());
    // THE regression. Before P1-1 this was { maxHp: null, currentHp: null }.
    expect(got.maxHp).not.toBeNull();
    expect(got.maxHp).toBe(8 + (10 + 3) * 5); // 73
  });

  it('and defers to the engine rather than re-deriving the formula', () => {
    // If `pf2MaxHp` changes — a variant rule, an errata — this must follow it, not drift.
    const data = pf2Data();
    expect(resolveHp('pathfinder2e', data).maxHp).toBe(pf2MaxHp(data.pf2e as never));
  });

  it('seeds FULL hp when the sheet has never recorded any', () => {
    // A blank PF2 sheet stores `currentHp: 0`, which read literally means "unconscious". A character being
    // added to an encounter is joining a fight; PF2 tracks genuinely-dying characters on `dyingValue`.
    expect(resolveHp('pathfinder2e', pf2Data({ currentHp: 0 })).currentHp).toBe(73);
  });

  it('unless the character is DYING, where a stored 0 means exactly 0', () => {
    // The exception `applyPf2Edit` encodes: `combat.currentHp || (dyingValue > 0 ? 0 : maxHp)`. PF2's death
    // track is what disambiguates the two meanings of a stored zero. Without this, a dying character added
    // to the tracker would arrive at full health — quiet, and entirely plausible-looking.
    expect(resolveHp('pathfinder2e', pf2Data({ currentHp: 0, dyingValue: 2 })).currentHp).toBe(0);
    // …and a dying character who still has HP recorded keeps it.
    expect(resolveHp('pathfinder2e', pf2Data({ currentHp: 5, dyingValue: 1 })).currentHp).toBe(5);
  });

  it('but honours a real current HP', () => {
    expect(resolveHp('pathfinder2e', pf2Data({ currentHp: 20 })).currentHp).toBe(20);
  });

  it('and clamps a stored current above max', () => {
    // Stale sidecar after a level-down or a rebuild — a 200/73 combatant renders as a broken bar.
    expect(resolveHp('pathfinder2e', pf2Data({ currentHp: 200 })).currentHp).toBe(73);
  });

  it('an unbuilt PF2 sheet resolves to null rather than a 1-HP combatant', () => {
    // `pf2MaxHp` floors at 1, which is arithmetically right and useless as a combat stat.
    const blank = { pf2e: { identity: { level: 1 }, attributes: {}, combat: { ancestryHp: 0, classHpPerLevel: 0, currentHp: 0 } } };
    expect(resolveHp('pathfinder2e', blank)).toEqual({ maxHp: null, currentHp: null });
  });
});

describe('IG — the other half of the bug', () => {
  it('resolves HP from the ig sidecar', () => {
    const got = resolveHp('intuitive-games', igData());
    expect(got.maxHp).not.toBeNull();
    expect(got.maxHp).toBe(igMaxHp(igData().ig as never));
  });

  it('subtracts LETHAL damage only, per the system rule', () => {
    // IG tracks lethal and nonlethal separately and `igCurrentHp` subtracts only lethal. Doing this
    // subtraction here rather than deferring would be exactly the kind of re-implemented rule that drifts.
    const max = resolveHp('intuitive-games', igData()).maxHp!;
    expect(resolveHp('intuitive-games', igData({ lethal: 7 })).currentHp).toBe(max - 7);
    expect(resolveHp('intuitive-games', igData({ nonlethal: 7 })).currentHp).toBe(max);
  });

  it('floors current at zero rather than going negative', () => {
    expect(resolveHp('intuitive-games', igData({ lethal: 9999 })).currentHp).toBe(0);
  });

  it('an unbuilt IG sheet resolves to null', () => {
    expect(resolveHp('intuitive-games', { ig: { identity: { level: 1 }, abilities: {}, combat: { hitPoints: { classBackgroundHp: 0, nonlethal: 0, lethal: 0 } } } }))
      .toEqual({ maxHp: null, currentHp: null });
  });
});

describe('the system argument decides, not whichever sidecar is present', () => {
  it('a character carrying BOTH sidecars uses the one its system names', () => {
    // Transposing between systems can leave a stale `data.pf2e` behind on a character that is now 5e.
    // Sniffing the blob for whichever key exists would hand the tracker the stale one.
    const both = { ...pf2Data(), combat: { maxHp: 42, currentHp: 42 } };
    expect(resolveHp('dnd5e-2024', both).maxHp).toBe(42);
    expect(resolveHp('pathfinder2e', both).maxHp).toBe(73);
  });

  it('a missing or unknown system falls back to the 5e block, not to null', () => {
    // Rows predating the `system` column, and any system without a bespoke sidecar.
    const d = { combat: { maxHp: 30, currentHp: 30 } };
    expect(resolveHp(null, d).maxHp).toBe(30);
    expect(resolveHp(undefined, d).maxHp).toBe(30);
  });

  it('a PF2 system with a malformed sidecar degrades to null instead of throwing', () => {
    for (const junk of [{ pf2e: null }, { pf2e: 'nonsense' }, { pf2e: { identity: { level: 3 } } }, {}]) {
      expect(() => resolveHp('pathfinder2e', junk)).not.toThrow();
      expect(resolveHp('pathfinder2e', junk).maxHp).toBeNull();
    }
  });
});

describe('the encounter route actually uses it', () => {
  // The resolver passing its own tests proves nothing about the tracker — the whole defect was a caller
  // that never asked. This pins the wire.
  const route = read('app/api/dnd/encounters/[id]/entries/route.ts');

  it('calls resolveHp', () => {
    expect(route).toContain("from '@/lib/dnd/combat-hp'");
    expect(route).toContain('resolveHp(c.system as CharacterSystem, c.data)');
  });

  it('selects the system column it needs to dispatch on', () => {
    // Without `system` the resolver would fall back to 5e for every character, which is the original bug
    // wearing a new function's name.
    expect(route).toMatch(/\.select\('name, token_url, data, system'\)/);
  });

  it('no longer reads data.combat directly', () => {
    expect(route, 'the 5e-only read should be gone from the route').not.toContain('c.data?.combat');
  });

  it('still lets an explicit hp/maxHp in the request win', () => {
    // Auto-seeding is a default, not an override: a DM adding a wounded NPC types real numbers.
    expect(route).toContain('if (finalMax == null && resolved.maxHp != null)');
    expect(route).toContain('if (finalHp == null && resolved.currentHp != null)');
  });
});

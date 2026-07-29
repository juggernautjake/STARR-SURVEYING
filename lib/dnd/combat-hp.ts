// lib/dnd/combat-hp.ts — "what is this character's HP?", answered for every system (P1-1, audit B-3).
//
// THE BUG THIS EXISTS TO FIX. `encounters/[id]/entries` seeded a combatant's HP by reading `c.data?.combat`
// — the **5e** shape — and nothing else. A Pathfinder 2e or Intuitive Games character therefore entered the
// initiative tracker with `hp: null, max_hp: null`, and did so SILENTLY: no error, no warning, just a
// combatant the DM has to look up and type in by hand mid-fight. Two of the four playable systems could not
// be run in the encounter tracker without manual data entry.
//
// Neither system was missing the arithmetic. `pf2MaxHp` and `igMaxHp` have always been there, and both are
// tested. What was missing was anyone ASKING them — the route knew exactly one sidecar shape. So this is a
// dispatcher, not a rules module: every number below comes from the system's own engine, and this file's
// only job is to know which engine to call and where its data lives.
//
// WHY IT TAKES A RAW `data` BLOB rather than a typed character: its callers are server routes holding a
// jsonb column straight from Postgres. Making them reconstruct a `PF2Character` first would push per-system
// knowledge back out into the routes, which is the shape of the defect in the first place.
import { normalizeSystem, type CharacterSystem } from './systems';
import { pf2MaxHp } from './systems/pathfinder2e/rules';
import { igMaxHp, igCurrentHp } from './systems/intuitive-games/rules';
import type { PF2Character } from './systems/pathfinder2e/model';
import type { IGCharacter } from './systems/intuitive-games/model';

export interface ResolvedHp {
  /** Null when the character genuinely has no HP recorded — a half-built sheet, not a system we can't read. */
  maxHp: number | null;
  currentHp: number | null;
}

const EMPTY: ResolvedHp = { maxHp: null, currentHp: null };

/** A finite number, or null. Guards against jsonb holding a string, a NaN, or nothing at all. */
function num(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Is a computed max HP worth seeding into a tracker?
 *
 * A blank sheet computes a max of 0 (IG: no class/background HP) or 1 (PF2: `pf2MaxHp` floors there). Both
 * are arithmetically correct and useless as combat stats — seeding them would put a 1-HP combatant in the
 * tracker and look like real data. Null is the honest answer for a character nobody has built yet, and it
 * is what the route already does when it finds nothing.
 */
function usable(max: number): boolean {
  return Number.isFinite(max) && max > 1;
}

/**
 * Resolve max and current HP from a character row's `data` blob.
 *
 * `system` decides which sidecar is authoritative. It is passed explicitly rather than sniffed from the
 * blob because a character that has been transposed between systems can carry MORE THAN ONE sidecar —
 * `data.pf2e` can outlive a switch back to 5e — and guessing from whichever key happens to be present
 * would hand the tracker the stale one.
 */
export function resolveHp(system: CharacterSystem | null | undefined, data: unknown): ResolvedHp {
  const d = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>;

  switch (normalizeSystem(system)) {
    case 'pathfinder2e': {
      const pf2 = d.pf2e as PF2Character | undefined;
      if (!pf2?.combat || !pf2?.identity) return EMPTY;
      // Max is DERIVED (ancestry HP + (class HP/level + CON) × level) but current is STORED, on
      // `combat.currentHp`. Only the max needs the engine.
      //
      // A stored `currentHp` of 0 means "full", not "unconscious" — `blankPF2Character` starts there and a
      // sheet that has never been damaged stays there. This is not a guess: `applyPf2Edit` encodes exactly
      // the same convention, INCLUDING its one exception — a character with `dyingValue > 0` really is at
      // 0 HP, and the death track is what disambiguates the two meanings of a stored zero. Resolving that
      // the engine's way rather than inventing a second rule is the whole reason to read it first; seeding a
      // dying character into the tracker at full health would have been a quiet, plausible-looking bug.
      const max = pf2MaxHp(pf2);
      if (!usable(max)) return EMPTY;
      const stored = num(pf2.combat.currentHp) ?? 0;
      const dying = (num(pf2.combat.dyingValue) ?? 0) > 0;
      const current = stored || (dying ? 0 : max);
      return { maxHp: max, currentHp: Math.min(current, max) };
    }

    case 'intuitive-games': {
      const ig = d.ig as IGCharacter | undefined;
      if (!ig?.combat?.hitPoints || !ig?.identity) return EMPTY;
      // IG splits damage into lethal and nonlethal; `igCurrentHp` subtracts lethal only, which is the
      // system's own rule and the reason this defers to the engine rather than doing the subtraction here.
      const max = igMaxHp(ig);
      if (!usable(max)) return EMPTY;
      return { maxHp: max, currentHp: Math.max(0, igCurrentHp(ig)) };
    }

    default: {
      // Both 5e editions, and anything else, use the shared `combat` block — the one shape the route
      // already knew. Unchanged behaviour, deliberately: this slice adds systems, it does not re-decide 5e.
      const combat = d.combat as Record<string, unknown> | undefined;
      if (!combat) return EMPTY;
      return { maxHp: num(combat.maxHp), currentHp: num(combat.currentHp) };
    }
  }
}

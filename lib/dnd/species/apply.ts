// lib/dnd/species/apply.ts — a 2024 species' mechanics as live ledger effects (Slice 4 follow-up).
//
// Slice 4 shipped the species PICKER + a legibility panel; this makes the numbers real: a chosen
// species' size, creature type, darkvision and (when it differs) walk speed flow through the SAME
// effect ledger as an item or a spell, so they render on the Combat panel and appear in the Active
// Effects list sourced to the species — instead of being prose the reader has to apply by hand.
//
// System-scoped by construction: this is only ever called for a `dnd5e-2024` sheet (the ledger gates
// on ctx.system), because "human"/"elf" mean different things in other games — Ground Rule 1.
import type { Effect } from '@/app/dnd/_sheet/engine/effects';
import type { Species } from './dnd5e-2024';
import type { ResolvedRace2014 } from './dnd5e-2014';

/**
 * The mechanical effects a 2024 species grants, as ledger overlays. Size and creature type are
 * identity `set`s (they have no base on the sheet, so they can't false-star); darkvision is a granted
 * sense. Walk speed is emitted ONLY when it differs from the character's stored base speed
 * (`baseWalk`) — a 30-speed species on a default-30 sheet would otherwise register a no-op
 * contribution and light a permanent "modified" star, the exact thing Slice 13 warns against. Pass
 * `baseWalk` undefined to always emit it (e.g. in a test asserting the full set).
 */
export function speciesEffects(sp: Species, baseWalk?: number): Effect[] {
  const out: Effect[] = [
    { target: 'size', operation: 'set', value: sp.size },
    { target: 'creature_type', operation: 'set', value: sp.creatureType },
  ];
  if (sp.darkvision) {
    out.push({ target: 'grant_sense', operation: 'set', value: `Darkvision ${sp.darkvision} ft.` });
  }
  if (baseWalk == null || sp.speed !== baseWalk) {
    out.push({ target: 'speed_walk', operation: 'set', value: sp.speed });
  }
  return out;
}

/**
 * The mechanical effects a **2014 RACE** grants, as ledger overlays (Slice 14-S7). Same contract as
 * `speciesEffects` above — size, senses and a differing walk speed become live numbers on the Combat
 * panel and appear in Active Effects sourced to the race — but a separate function because the two
 * editions' catalogs are separate types on purpose (see dnd5e-2014.ts's header).
 *
 * Two deliberate differences from the 2024 version:
 *
 * · **No creature type.** The 2014 race entries do not record one — SRD 5.1 states it in the race's
 *   prose rather than as a line of the stat block — so emitting "Humanoid" here would be asserting a
 *   fact the catalog does not hold. Every SRD race is in fact Humanoid, but "true as far as I recall"
 *   is not the standard this subsystem works to.
 *
 * · **NO ABILITY SCORE INCREASES, on purpose.** This is the one that needs the argument, because the
 *   racial increase is the headline 2014 rule and leaving it out looks like the bug. The sheet stores
 *   `abilities` as running TOTALS that the player typed in, and 2014 character creation folds the
 *   racial bonus into the number you write on the sheet — so a dwarf's Constitution 16 already
 *   includes the +2. Emitting an `add` here would double it, silently, for every existing 2014
 *   character in the database. The 2024 side has the same hazard and solves it with an explicit
 *   Apply button (`reconcileBackgroundIncreases`); 2014 has no equivalent UI yet, and inventing an
 *   auto-apply that cannot be reversed is worse than the gap. The increases ARE surfaced — as data on
 *   `SpeciesView.abilityIncreases` and as the leading trait line — so the player can see and apply
 *   them. Recorded as an open gap in the 14-S7 slice notes rather than quietly half-done.
 */
export function race2014Effects(resolved: ResolvedRace2014, baseWalk?: number): Effect[] {
  const { race } = resolved;
  const out: Effect[] = [{ target: 'size', operation: 'set', value: race.size }];
  if (race.darkvision) {
    out.push({ target: 'grant_sense', operation: 'set', value: `Darkvision ${race.darkvision} ft.` });
  }
  // Only when it differs from the stored base, so a 30-speed race on a default-30 sheet does not
  // light a permanent "modified" star for a no-op contribution (Slice 13). Dwarves, gnomes and
  // halflings are 25 in 2014, so this fires for exactly the races where it means something.
  if (baseWalk == null || race.speed !== baseWalk) {
    out.push({ target: 'speed_walk', operation: 'set', value: race.speed });
  }
  return out;
}

/** A species' natural-armor unarmored AC (e.g. Rangor rocklike scales 13 + DEX), or null when it has none.
 *  The sheet's AC uses a best-of across unarmored formulas (like the Monk/Barbarian and Jack's bespoke sheet),
 *  so this is offered as a candidate rather than forced — the player keeps the highest. */
export function speciesNaturalArmorAc(sp: Species, abilityMod: number): number | null {
  return sp.naturalArmor ? sp.naturalArmor.base + abilityMod : null;
}

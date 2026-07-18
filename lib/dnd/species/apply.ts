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

/** A species' natural-armor unarmored AC (e.g. Rangor rocklike scales 13 + DEX), or null when it has none.
 *  The sheet's AC uses a best-of across unarmored formulas (like the Monk/Barbarian and Jack's bespoke sheet),
 *  so this is offered as a candidate rather than forced — the player keeps the highest. */
export function speciesNaturalArmorAc(sp: Species, abilityMod: number): number | null {
  return sp.naturalArmor ? sp.naturalArmor.base + abilityMod : null;
}

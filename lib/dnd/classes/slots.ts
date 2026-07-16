// lib/dnd/classes/slots.ts — the 5e spell slot tables, written once.
//
// Each row is [_, rank1, rank2, … rank9] so `FULL_CASTER_SLOTS[5][3]` reads "a level-5 full caster
// has 2 third-rank slots". Index 0 is unused so the rank index matches the spell rank.
//
// These are shared by every caster in the system: authoring them per class is how tables drift.
import type { SpellSlotRow } from './types';

/** Bard, Cleric, Druid, Sorcerer, Wizard. Identical in the 2014 and 2024 PHBs. */
export const FULL_CASTER_SLOTS: Record<number, SpellSlotRow> = {
  1: [0, 2, 0, 0, 0, 0, 0, 0, 0, 0],
  2: [0, 3, 0, 0, 0, 0, 0, 0, 0, 0],
  3: [0, 4, 2, 0, 0, 0, 0, 0, 0, 0],
  4: [0, 4, 3, 0, 0, 0, 0, 0, 0, 0],
  5: [0, 4, 3, 2, 0, 0, 0, 0, 0, 0],
  6: [0, 4, 3, 3, 0, 0, 0, 0, 0, 0],
  7: [0, 4, 3, 3, 1, 0, 0, 0, 0, 0],
  8: [0, 4, 3, 3, 2, 0, 0, 0, 0, 0],
  9: [0, 4, 3, 3, 3, 1, 0, 0, 0, 0],
  10: [0, 4, 3, 3, 3, 2, 0, 0, 0, 0],
  11: [0, 4, 3, 3, 3, 2, 1, 0, 0, 0],
  12: [0, 4, 3, 3, 3, 2, 1, 0, 0, 0],
  13: [0, 4, 3, 3, 3, 2, 1, 1, 0, 0],
  14: [0, 4, 3, 3, 3, 2, 1, 1, 0, 0],
  15: [0, 4, 3, 3, 3, 2, 1, 1, 1, 0],
  16: [0, 4, 3, 3, 3, 2, 1, 1, 1, 0],
  17: [0, 4, 3, 3, 3, 2, 1, 1, 1, 1],
  18: [0, 4, 3, 3, 3, 3, 1, 1, 1, 1],
  19: [0, 4, 3, 3, 3, 3, 2, 1, 1, 1],
  20: [0, 4, 3, 3, 3, 3, 2, 2, 1, 1],
};

/** Paladin, Ranger — no slots at level 1; slots begin at 2 and cap at rank 5. */
export const HALF_CASTER_SLOTS: Record<number, SpellSlotRow> = {
  1: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  2: [0, 2, 0, 0, 0, 0, 0, 0, 0, 0],
  3: [0, 3, 0, 0, 0, 0, 0, 0, 0, 0],
  4: [0, 3, 0, 0, 0, 0, 0, 0, 0, 0],
  5: [0, 4, 2, 0, 0, 0, 0, 0, 0, 0],
  6: [0, 4, 2, 0, 0, 0, 0, 0, 0, 0],
  7: [0, 4, 3, 0, 0, 0, 0, 0, 0, 0],
  8: [0, 4, 3, 0, 0, 0, 0, 0, 0, 0],
  9: [0, 4, 3, 2, 0, 0, 0, 0, 0, 0],
  10: [0, 4, 3, 2, 0, 0, 0, 0, 0, 0],
  11: [0, 4, 3, 3, 0, 0, 0, 0, 0, 0],
  12: [0, 4, 3, 3, 0, 0, 0, 0, 0, 0],
  13: [0, 4, 3, 3, 1, 0, 0, 0, 0, 0],
  14: [0, 4, 3, 3, 1, 0, 0, 0, 0, 0],
  15: [0, 4, 3, 3, 2, 0, 0, 0, 0, 0],
  16: [0, 4, 3, 3, 2, 0, 0, 0, 0, 0],
  17: [0, 4, 3, 3, 3, 1, 0, 0, 0, 0],
  18: [0, 4, 3, 3, 3, 1, 0, 0, 0, 0],
  19: [0, 4, 3, 3, 3, 2, 0, 0, 0, 0],
  20: [0, 4, 3, 3, 3, 2, 0, 0, 0, 0],
};

/** Eldritch Knight / Arcane Trickster — slots begin at 3 and cap at rank 4. */
export const THIRD_CASTER_SLOTS: Record<number, SpellSlotRow> = {
  1: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  2: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  3: [0, 2, 0, 0, 0, 0, 0, 0, 0, 0],
  4: [0, 3, 0, 0, 0, 0, 0, 0, 0, 0],
  5: [0, 3, 0, 0, 0, 0, 0, 0, 0, 0],
  6: [0, 3, 0, 0, 0, 0, 0, 0, 0, 0],
  7: [0, 4, 2, 0, 0, 0, 0, 0, 0, 0],
  8: [0, 4, 2, 0, 0, 0, 0, 0, 0, 0],
  9: [0, 4, 2, 0, 0, 0, 0, 0, 0, 0],
  10: [0, 4, 3, 0, 0, 0, 0, 0, 0, 0],
  11: [0, 4, 3, 0, 0, 0, 0, 0, 0, 0],
  12: [0, 4, 3, 0, 0, 0, 0, 0, 0, 0],
  13: [0, 4, 3, 2, 0, 0, 0, 0, 0, 0],
  14: [0, 4, 3, 2, 0, 0, 0, 0, 0, 0],
  15: [0, 4, 3, 2, 0, 0, 0, 0, 0, 0],
  16: [0, 4, 3, 3, 0, 0, 0, 0, 0, 0],
  17: [0, 4, 3, 3, 0, 0, 0, 0, 0, 0],
  18: [0, 4, 3, 3, 0, 0, 0, 0, 0, 0],
  19: [0, 4, 3, 3, 1, 0, 0, 0, 0, 0],
  20: [0, 4, 3, 3, 1, 0, 0, 0, 0, 0],
};

/**
 * Warlock Pact Magic — a fundamentally different shape, which is why it is not a slots table:
 * few slots, ALL cast at your highest rank, and they come back on a SHORT rest.
 * Index 1..20.
 */
export const PACT_SLOTS = [0, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3, 3, 4, 4, 4, 4];
export const PACT_RANK = [0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5];

/** Mystic Arcanum (Warlock): one casting each of ranks 6–9 at levels 11/13/15/17, per long rest. */
export const MYSTIC_ARCANUM_LEVEL: Record<number, number> = { 6: 11, 7: 13, 8: 15, 9: 17 };

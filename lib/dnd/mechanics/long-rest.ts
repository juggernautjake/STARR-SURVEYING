// lib/dnd/mechanics/long-rest.ts — Phase 2, Area M2 (configurable mechanics). The long-rest models the
// preference layer names, as pure functions the sheet store consumes. VANILLA is this platform's default
// (a long rest restores ALL hit dice); the alternatives are opt-in via the campaign/player preferences.
import type { LongRestModel } from '../preferences';

/**
 * Hit dice a character has after a long rest, by model. Clamped to [0, total] so a corrupt sheet can't
 * over- or under-restore.
 *
 * - **vanilla** (default): full restore — you regain all your Hit Dice. This is the platform's long-standing
 *   behavior and a common house rule.
 * - **half-hit-dice** (2014 D&D RAW): you regain only HALF your total Hit Dice (minimum 1), added to what
 *   you had left — so a fully-spent pool refills slowly across several rests.
 * - **gritty** / **epic**: these change the TIME a long rest takes (7 days / a short rest), not the amount
 *   restored, so the hit-dice amount matches vanilla; the time difference is a table-side ruling.
 */
export function hitDiceAfterLongRest(total: number, remaining: number, model: LongRestModel): number {
  const t = Math.max(0, Math.floor(total));
  const r = Math.max(0, Math.min(t, Math.floor(remaining)));
  if (model === 'half-hit-dice') return Math.min(t, r + Math.max(1, Math.floor(t / 2)));
  return t; // vanilla / gritty / epic → full restore of the amount
}

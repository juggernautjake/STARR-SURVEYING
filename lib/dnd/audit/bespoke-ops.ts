// lib/dnd/audit/bespoke-ops.ts — which bespoke-sheet edits belong in the DM's review queue.
//
// The shared 5e sheet settled this boundary already, and the rules-platform doc states it outright:
//
//   **BUILD changes audit; PLAY does not.** HP spent, conditions, slots used and prepared toggles are how
//   a character is PLAYED, not how it is BUILT, and logging them would bury the build changes the queue
//   exists to surface.
//
// That sweep covered `app/dnd/_sheet/` only — the shared sheet. The two BESPOKE sheets (Intuitive Games and
// Pathfinder 2e) write through their own routes, `ig-edit` and `pf2-edit`, and those audited nothing at all.
// So on an IG or PF2 character a player could add a feat, add a power or spell, change an ability score, or
// add an attack, and the DM's review queue showed **nothing** — including for content taken through the
// escape hatch, which is precisely what that queue exists to surface.
//
// The asymmetry that makes this a bug rather than a gap: the **AI path already audits these**
// (`ai-edit` inserts `ig:<op>` / `pf2:<op>` rows). `ig-edit`'s own header comment makes the argument for
// the mirror case — *"Gating only the AI would make 'use the manual control instead' a way around the
// rules, which is the exact shape of hole this work exists to close."* Auditing only the AI makes the
// manual control a way around the DM's review queue.
//
// WHY THIS IS A DENY-LIST, NOT AN ALLOW-LIST. An op nobody has classified yet audits. Getting that backwards
// is asymmetric in cost: an unclassified PLAY op adds a noisy row someone can filter, while an unclassified
// BUILD op is a silent change to a character — the exact defect this module closes. So a new op is visible
// by default and must be named here to become quiet.

/** IG ops that are PLAY, not build. Everything else audits. */
const IG_PLAY_OPS = new Set([
  // A stance is entered and left constantly in a fight; `add_stance` is NOT here, because that grants a new
  // stance to the character rather than switching between the ones they have.
  'set_active_stance',
  'clear_stance',
  'add_condition',
  'remove_condition',
  'apply_damage',
  'heal',
]);

/** PF2 ops that are PLAY, not build. Everything else audits. */
const PF2_PLAY_OPS = new Set([
  'apply_damage',
  'heal',
  'set_temp_hp',
  'set_condition',
  // The PF2 death/recovery track and the two point pools: all spent and restored within an encounter.
  'set_dying',
  'set_wounded',
  'set_hero_points',
  'set_focus_points',
]);

/** Does this bespoke-sheet edit belong in the DM's review queue?
 *
 *  `system` takes the normalized key. An unrecognised system audits, for the same fail-visible reason the
 *  op lists are deny-lists. */
export function isAuditableBespokeEdit(system: string, op: string): boolean {
  if (system === 'intuitive-games') return !IG_PLAY_OPS.has(op);
  if (system === 'pathfinder2e') return !PF2_PLAY_OPS.has(op);
  return true;
}

/** The `field_path` an audit row carries for a bespoke edit — the SAME vocabulary the AI path already
 *  writes (`ig:add_power`, `pf2:add_feat`), so a change reads identically in the queue whether the player
 *  typed it at the AI or clicked it on the sheet. Two vocabularies for one event is how the shared sheet's
 *  audit diverged in the first place. */
export function bespokeFieldPath(system: string, op: string): string {
  const prefix = system === 'intuitive-games' ? 'ig' : system === 'pathfinder2e' ? 'pf2' : system;
  return `${prefix}:${op}`;
}

/** Exposed for tests + docs: the play sets, so a suite can assert coverage of the real op unions rather
 *  than restating them. */
export const PLAY_OPS = { 'intuitive-games': IG_PLAY_OPS, pathfinder2e: PF2_PLAY_OPS } as const;

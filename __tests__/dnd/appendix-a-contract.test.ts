// __tests__/dnd/appendix-a-contract.test.ts — Appendix A of the platform doc calls itself "the
// contract": the single catalog the builder picker, the AI schema, the ledger and the star tooltips are
// generated from. This test keeps that promise HONEST — every catalog entry is either live in the
// registry (directly or under a documented alias) or an EXPLICIT, reasoned deferral. It is drift-proof:
// wiring a deferred target later fails the "not in both" check, forcing its removal from the deferred
// list so the contract and the code can never quietly disagree.
import { describe, it, expect } from 'vitest';
import { EFFECT_TARGETS, findTarget } from '@/lib/dnd/effects/targets';

const REGISTERED = new Set(EFFECT_TARGETS.map((t) => t.key));

// The full Appendix A catalog, by section. Abilities/skills/saves are generated families — represented
// by one concrete member each (the generator is covered elsewhere).
const CATALOG = [
  // Movement
  'speed_walk', 'speed_fly', 'speed_swim', 'speed_climb', 'speed_burrow', 'speed_all', 'hover', 'ignore_difficult_terrain',
  // Core numbers
  'ability_str', 'ac', 'initiative', 'hp_max', 'hp_temp', 'hit_dice', 'proficiency_bonus', 'spell_save_dc', 'spell_attack', 'carrying_capacity',
  // Rolls
  'attack_roll', 'damage_roll', 'attack_and_damage', 'weapon_bonus_dice', 'dex_saves', 'all_saves', 'skill.stealth', 'all_skills', 'death_save', 'concentration_save',
  // Defenses
  'resistance', 'immunity', 'vulnerability', 'condition_immunity', 'condition_advantage',
  // Grants
  'proficiency', 'expertise', 'grant_feature', 'grant_attack', 'grant_spell', 'grant_cantrip', 'grant_resource', 'grant_spell_slot', 'grant_sense', 'grant_language', 'grant_action', 'grant_expertise',
  // Identity
  'name', 'image', 'token', 'species', 'class', 'subclass', 'gender', 'pronouns', 'profession', 'size', 'creature_type', 'alignment',
  // Instant
  'heal', 'temp_hp', 'damage', 'restore_resource', 'restore_slot', 'remove_condition', 'apply_condition', 'set_hp',
  // State
  'condition', 'exhaustion', 'concentration', 'inspiration',
  // Economy
  'attunement_slots', 'action_count', 'bonus_action_count', 'reaction_count', 'attacks_per_action',
  // Meta
  'transform', 'note',
];

// Catalog names that live under a DIFFERENT registry key — pure naming drift, no missing capability.
const ALIASES: Record<string, string> = {
  hp_temp: 'temp_hp',        // core-numbers prose calls it hp_temp; the instant target key is temp_hp
  grant_expertise: 'expertise', // the grant IS the `expertise` target
};

// Genuinely-unbuilt catalog entries, each with the one-line reason it isn't a drop-in target yet.
const DEFERRED: Record<string, string> = {
  grant_cantrip: 'a cantrip is a level-0 spell — covered by grant_spell until per-cantrip nuance is needed',
  grant_action: 'a granted usable action is a grant_feature today; a distinct Actions home would come first',
  grant_spell_slot: 'a PERSISTENT bonus slot needs slot-grant resolution (restore_slot only refills existing ones)',
  set_hp: 'instant HP-set needs the generic instant-effect consume path, which the bespoke consumable model does not yet route',
  concentration: 'needs a concentration tracker on the sheet before a target can honestly render',
  inspiration: 'char.inspiration is a player-toggled boolean; granting it needs instant resolution, not a ledger overlay',
  action_count: 'the specific economies exist (attacks_per_action / reaction_count / bonus_action_count); a generic action_count has no distinct home',
};

describe('Appendix A is an honest contract with the registry', () => {
  it('every catalog entry is registered, aliased, or explicitly deferred — nothing silently missing', () => {
    const unclassified = CATALOG.filter(
      (k) => !REGISTERED.has(k) && !(k in ALIASES) && !(k in DEFERRED),
    );
    expect(unclassified, `these catalog names are neither built, aliased, nor deferred: ${unclassified.join(', ')}`).toEqual([]);
  });

  it('every alias points at a real registry target', () => {
    for (const [name, key] of Object.entries(ALIASES)) {
      expect(findTarget(key), `alias ${name} → ${key} must resolve`).toBeTruthy();
    }
  });

  it('no entry is BOTH deferred and built — wiring one forces its removal from the deferred list', () => {
    const contradictions = Object.keys(DEFERRED).filter((k) => REGISTERED.has(k));
    expect(contradictions, `these are registered AND still marked deferred — remove them from DEFERRED: ${contradictions.join(', ')}`).toEqual([]);
  });

  it('every deferral carries a reason', () => {
    for (const [k, reason] of Object.entries(DEFERRED)) {
      expect(reason.trim().length, `${k} needs a deferral reason`).toBeGreaterThan(10);
    }
  });
});

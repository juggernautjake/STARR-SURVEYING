// lib/dnd/systems.ts — the game systems a character can be built against (Phase V).
// A character carries a `system` (dnd_characters.system): a system key, or 'ambiguous' for a
// system-agnostic build. The rules/feats/abilities store (dnd_systems / dnd_system_entries) is
// scoped by system so an AI build can never mix rules across systems.

export const SYSTEM_AMBIGUOUS = 'ambiguous' as const;

/** Whether a system is fully built out and playable, or a placeholder we'll finish later. */
export type SystemStatus = 'available' | 'under-construction';

export interface GameSystem {
  key: string;
  name: string;
  publisher: string;
  notes: string;
  /** 'available' = classes/rules/library built out and playable now; 'under-construction' = seeded
   *  as a future option (rules catalog only) — offered but clearly labelled, not yet a full build. */
  status: SystemStatus;
}

/**
 * The seeded systems (see seeds/422_dnd_systems.sql). Four are BUILT OUT and playable now — D&D 5e
 * 2024, D&D 5e 2014, Pathfinder 2e, and Intuitive Games; the rest are seeded as **under construction**
 * (offered as a future option, rules catalog only). Entries are curated into the store separately.
 */
export const GAME_SYSTEMS: GameSystem[] = [
  { key: 'dnd5e-2014', name: 'D&D 5e (2014)', publisher: 'Wizards of the Coast', notes: "The 2014 Player's Handbook edition.", status: 'available' },
  { key: 'dnd5e-2024', name: 'D&D 5e (2024)', publisher: 'Wizards of the Coast', notes: 'The 2024 revised edition.', status: 'available' },
  { key: 'pathfinder2e', name: 'Pathfinder 2e', publisher: 'Paizo', notes: 'Pathfinder Second Edition (Remaster-aware).', status: 'available' },
  { key: 'intuitive-games', name: 'Intuitive Games', publisher: 'Intuitive Games', notes: 'A d20 system (levels 1–10, degrees of success, 3-action economy). Rules from intuitivegames.net.', status: 'available' },
  { key: 'pathfinder1e', name: 'Pathfinder 1e', publisher: 'Paizo', notes: 'The classic 3.x-derived d20: BAB, three saves, skill ranks, confirmed criticals.', status: 'under-construction' },
  { key: 'starfinder1e', name: 'Starfinder 1e', publisher: 'Paizo', notes: 'PF1-derived d20 in space: EAC/KAC, Stamina + Hit Points, Resolve Points.', status: 'under-construction' },
  { key: 'coc7e', name: 'Call of Cthulhu 7e', publisher: 'Chaosium', notes: 'Percentile (d100) roll-under BRP. No levels, no classes; Sanity and Luck.', status: 'under-construction' },
  { key: 'blades', name: 'Blades in the Dark', publisher: 'Evil Hat / John Harper', notes: 'Forged in the Dark: d6 pools read on the highest die, position & effect, stress and trauma. No levels.', status: 'under-construction' },
  { key: 'cyberpunk-red', name: 'Cyberpunk RED', publisher: 'R. Talsorian Games', notes: '1d10 + STAT + SKILL, exploding 10s. No levels; Roles, Humanity and Stopping Power.', status: 'under-construction' },
  { key: 'shadowrun6e', name: 'Shadowrun 6e', publisher: 'Catalyst Game Labs', notes: 'd6 dice pool counting hits on 5–6. No levels; Attribute+Skill, Edge, Essence vs Magic.', status: 'under-construction' },
];

/** The systems fully built out and playable today (the four the project is focused on). */
export function availableSystems(): GameSystem[] {
  return GAME_SYSTEMS.filter((s) => s.status === 'available');
}

/** Is this system fully built out (vs. a seeded, under-construction placeholder)? */
export function isSystemAvailable(key: CharacterSystem): boolean {
  return GAME_SYSTEMS.find((s) => s.key === key)?.status === 'available';
}

export type CharacterSystem = string; // a GAME_SYSTEMS key, or SYSTEM_AMBIGUOUS

/** Normalize any stored/user value to a known system key or 'ambiguous'. */
export function normalizeSystem(value: unknown): CharacterSystem {
  const v = String(value ?? '').trim();
  if (!v || v === SYSTEM_AMBIGUOUS) return SYSTEM_AMBIGUOUS;
  return GAME_SYSTEMS.some((s) => s.key === v) ? v : SYSTEM_AMBIGUOUS;
}

/** Display label for a system key (or "System-ambiguous"). */
export function systemLabel(key: CharacterSystem): string {
  if (key === SYSTEM_AMBIGUOUS) return 'System-ambiguous';
  return GAME_SYSTEMS.find((s) => s.key === key)?.name ?? key;
}

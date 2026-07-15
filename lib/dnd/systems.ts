// lib/dnd/systems.ts — the game systems a character can be built against (Phase V).
// A character carries a `system` (dnd_characters.system): a system key, or 'ambiguous' for a
// system-agnostic build. The rules/feats/abilities store (dnd_systems / dnd_system_entries) is
// scoped by system so an AI build can never mix rules across systems.

export const SYSTEM_AMBIGUOUS = 'ambiguous' as const;

export interface GameSystem {
  key: string;
  name: string;
  publisher: string;
  notes: string;
}

/** The seeded systems (see seeds/422_dnd_systems.sql). Entries are curated into the store separately. */
export const GAME_SYSTEMS: GameSystem[] = [
  { key: 'dnd5e-2014', name: 'D&D 5e (2014)', publisher: 'Wizards of the Coast', notes: "The 2014 Player's Handbook edition." },
  { key: 'dnd5e-2024', name: 'D&D 5e (2024)', publisher: 'Wizards of the Coast', notes: 'The 2024 revised edition.' },
  { key: 'pathfinder2e', name: 'Pathfinder 2e', publisher: 'Paizo', notes: 'Pathfinder Second Edition (Remaster-aware).' },
];

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

// lib/dnd/systems.ts — the game systems a character can be built against (Phase V).
// A character carries a `system` (dnd_characters.system): a system key, or 'ambiguous' for a
// system-agnostic build. The rules/feats/abilities store (dnd_systems / dnd_system_entries) is
// scoped by system so an AI build can never mix rules across systems.

export const SYSTEM_AMBIGUOUS = 'ambiguous' as const;

/**
 * What a character, sheet or piece of content is built against when nothing says otherwise.
 *
 * OWNER, 2026-07-30: *"I want you to get rid of anything on the site that is system ambiguous… trying to
 * have a catch-all ambiguous option doesn't make sense. The default should always be the 2024 D&D
 * edition."*
 *
 * `SYSTEM_AMBIGUOUS` is NOT deleted, and that distinction is the whole change. It stays as the value that
 * means *"we genuinely do not know"* — which `normalizeSystem` no longer produces, but which the AI
 * grounding and the rules-validation layers still need in order to REFUSE to answer rather than guess a
 * system's rules. What is gone is offering it as a CHOICE: nothing asks a player to pick it, and nothing
 * falls back to it.
 *
 * Safe to switch because the live data has none — every character carries a real system, and no homebrew
 * piece is ambiguous. Checked before changing it, precisely because relabelling a genuinely
 * system-less character as 2024 would state a rule set it was never built against.
 */
export const DEFAULT_SYSTEM = 'dnd5e-2024';

/** Whether a system is fully built out and playable, or a placeholder we'll finish later. */
export type SystemStatus = 'available' | 'under-construction';

export interface GameSystem {
  key: string;
  name: string;
  publisher: string;
  notes: string;
  /** 'available' = classes/rules/library built out and playable now; 'under-construction' = seeded, with
   *  authored rules in `system-rules-extra.ts`, but **not surfaced anywhere yet**.
   *
   *  This used to say "offered but clearly labelled (rules catalog only)", which is what the code did until
   *  the owner changed it on 2026-07-18 to hide them SITE-WIDE behind one "more systems coming soon" card.
   *  The stale wording mattered: search kept indexing their entries after `/dnd/library/[key]` started
   *  `notFound()`-ing them, so every such hit was a link to a 404 (fixed 2026-07-26). If you are adding a
   *  surface that lists systems, filter on `isSystemAvailable` — see under-construction-gating.test.ts. */
  status: SystemStatus;
}

/**
 * The seeded systems (see seeds/422_dnd_systems.sql). Four are BUILT OUT and playable now — D&D 5e
 * 2024, D&D 5e 2014, Pathfinder 2e, and Intuitive Games; the rest are seeded as **under construction**:
 * their rules are authored but every player-facing surface hides them (owner 2026-07-18), so their
 * name/publisher/notes below are for the pickers a future flip to 'available' will light up, not for
 * anything rendered today. Entries are curated into the store separately.
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

/**
 * The systems that share the 5e `Character` model (`data`), as opposed to owning a bespoke sidecar
 * (`data.pf2e`, `data.ig`) with its own rules engine.
 *
 * This is the gate for anything that edits a sheet through the shared `edit_sheet` vocabulary — most
 * notably levelling a sheet up in place. On a PF2/IG character those edits would land on a blank 5e
 * projection and appear to do nothing. Exported so the UI can HIDE the affordance and the route can
 * REFUSE it from one definition: when those two drift, you get a button that always errors.
 */
export function isSharedEngineSystem(key: unknown): boolean {
  const k = normalizeSystem(key);
  return k === 'dnd5e-2014' || k === 'dnd5e-2024' || k === SYSTEM_AMBIGUOUS;
}

export type CharacterSystem = string; // a GAME_SYSTEMS key, or SYSTEM_AMBIGUOUS

/** Normalize any stored/user value to a known system key or 'ambiguous'. */
export function normalizeSystem(value: unknown): CharacterSystem {
  const v = String(value ?? '').trim();
  // An EXPLICIT ambiguous is honoured: the AI grounding establishes it deliberately and then refuses to
  // answer, and coercing it here would turn "I cannot tell you" into a confident answer from one system.
  if (v === SYSTEM_AMBIGUOUS) return SYSTEM_AMBIGUOUS;

  // NOTHING SPECIFIED → the default edition (owner, 2026-07-30). This is the case the owner's ask is
  // about: a new character, a fresh form, a surface with no system yet. There is no information to lose.
  if (!v) return DEFAULT_SYSTEM;

  // SOMETHING SPECIFIED THAT WE DO NOT RECOGNISE → still ambiguous, and this half must not change.
  //
  // A typo, a legacy value, or a corrupt row is NOT "no system chosen" — it is a system we cannot
  // identify, and defaulting it to 5e 2024 would apply one rulebook's rules to a character built against
  // something else, confidently, including inside an AI prompt. Four tests exist for exactly this and
  // they are right: *"never guesses a rulebook"*.
  //
  // Nothing a player can create reaches here — every surface now offers the four real systems and starts
  // on the default — so this branch guards data, not choices, which is why the owner's ask and this
  // safety net do not actually conflict.
  return GAME_SYSTEMS.some((s) => s.key === v) ? v : SYSTEM_AMBIGUOUS;
}

/** Display label for a system key (or "System-ambiguous"). */
export function systemLabel(key: CharacterSystem): string {
  if (key === SYSTEM_AMBIGUOUS) return 'System-ambiguous';
  return GAME_SYSTEMS.find((s) => s.key === key)?.name ?? key;
}

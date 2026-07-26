// lib/dnd/preference-options.ts — the display catalog for the configurable preferences (settings S-3).
//
// The option labels, help text, and ordering that DRIVE every preferences UI, kept in ONE place so the
// DM's campaign panel and the per-character settings modal can never drift (they showed the same list
// authored twice before). Pure data, no React — importable by any client component.
//
// It mirrors `EffectivePreferences` in `preferences.ts`: each enum field lists its options, each boolean
// its label, and a group tag ('rules' | 'display') lets a UI split them into sections. Adding a setting
// is one entry in `preferences.ts` (the model) and one here (how it reads).

export type EnumPrefField =
  | 'exhaustionModel' | 'longRestModel' | 'equipLimits' | 'diceRollerStyle'
  | 'recordMode' | 'shapeshiftStats' | 'downedDamageModel'
  | 'proficiencyWithoutLevel' | 'freeArchetype' | 'startingHeroPoints';
export type BoolPrefField = 'autoMechanics' | 'autoAttune' | 'featAutoApply';
export type PrefGroup = 'rules' | 'display';

export const ENUM_OPTIONS: Record<EnumPrefField, { value: string; label: string }[]> = {
  exhaustionModel: [
    { value: 'vanilla', label: 'Vanilla (rules-as-written)' },
    { value: 'flat-2-per-level', label: '−2 to every d20 test per level' },
  ],
  longRestModel: [
    { value: 'vanilla', label: 'Vanilla — each system’s own RAW long rest' },
    { value: 'half-hit-dice', label: 'Half hit dice (2014 RAW)' },
    { value: 'gritty', label: 'Gritty realism (long rest = 7 days)' },
    { value: 'epic', label: 'Epic (long rest = a short rest)' },
  ],
  equipLimits: [
    { value: 'enforced', label: 'Enforced (one armor, one shield, no 2H + shield)' },
    { value: 'off', label: 'Off (no equipment limits)' },
  ],
  diceRollerStyle: [
    { value: 'futuristic', label: 'Futuristic' },
    { value: 'rugged', label: 'Rugged' },
    { value: 'natural', label: 'Natural' },
    { value: 'fantasy', label: 'Fantasy' },
    { value: 'medieval', label: 'Medieval' },
  ],
  recordMode: [
    { value: 'auto', label: 'Auto (roller applies effects)' },
    { value: 'manual', label: 'Manual roll input' },
    { value: 'irl', label: 'Record IRL rolls' },
  ],
  shapeshiftStats: [
    { value: 'full', label: 'Full — a form replaces your ability scores, up or down (RAW)' },
    { value: 'partial', label: 'Partial — scores meet in the middle (a sensible average)' },
    { value: 'none', label: 'None — forms change shape/senses/movement but never ability scores' },
  ],
  downedDamageModel: [
    { value: 'official', label: 'Official (PF2) — damage while dying raises your Dying value' },
    { value: 'off', label: 'Off — Dying only advances on failed recovery saves' },
  ],
  proficiencyWithoutLevel: [
    { value: 'off', label: 'Off — your level is added to proficiency (rules-as-written)' },
    { value: 'on', label: 'On — level is not added; untrained is −2' },
  ],
  freeArchetype: [
    { value: 'off', label: 'Off — archetype feats come out of your normal class feats (RAW)' },
    { value: 'on', label: 'On — an extra archetype-only class feat at every even level' },
  ],
  startingHeroPoints: [
    { value: '0', label: '0 — none to start' },
    { value: '1', label: '1 — rules-as-written' },
    { value: '2', label: '2' },
    { value: '3', label: '3 — start at the maximum' },
  ],
};

export const ENUM_HELP: Record<EnumPrefField, string> = {
  exhaustionModel: 'How exhaustion penalties are applied.',
  longRestModel: 'How much a long rest restores. Vanilla uses each game system’s own rules.',
  equipLimits: 'Whether the one-armor / one-shield equip rules are enforced.',
  diceRollerStyle: 'The look of the in-app dice roller.',
  recordMode: 'How rolls are entered: the roller applies effects, you type a total, or you record a real-life roll.',
  shapeshiftStats: 'What a shape-shift (Wild Shape, Primal Shape, a Surge form) does to your ability scores. Full replaces them like the rules say; partial averages your scores with the form’s; none leaves your scores alone.',
  downedDamageModel: 'Pathfinder 2e only: whether taking damage while already dying pushes your Dying value up (official rules) or leaves it to recovery saves.',
  proficiencyWithoutLevel: 'An official Pathfinder 2e variant (GM Core). Normally you add your level to every check, save, AC and DC. With this on you don’t, and being untrained costs you −2 instead of nothing — so a low-level threat stays dangerous and a high-level one stays reachable. It changes every number on the sheet.',
  freeArchetype: 'An official Pathfinder 2e variant (GM Core). You gain an extra class feat at 2nd level and every even level after, which can only be spent on archetype feats. Your normal class feats are untouched — this is on top of them.',
  startingHeroPoints: 'How many Hero Points you begin a session with. The rules say 1; you spend one to reroll a check, or all three to avoid death.',
};

/** Human label for each enum field's ROW (the option labels describe the values). */
export const ENUM_LABEL: Record<EnumPrefField, string> = {
  exhaustionModel: 'Exhaustion',
  longRestModel: 'Long rest',
  equipLimits: 'Equipment limits',
  diceRollerStyle: 'Dice roller style',
  recordMode: 'Roll record mode',
  shapeshiftStats: 'Shape-shift ability scores',
  downedDamageModel: 'Damage while dying',
  proficiencyWithoutLevel: 'Proficiency without level',
  freeArchetype: 'Free archetype',
  startingHeroPoints: 'Starting Hero Points',
};

export const ENUM_ORDER: EnumPrefField[] = ['exhaustionModel', 'longRestModel', 'equipLimits', 'diceRollerStyle', 'recordMode', 'shapeshiftStats', 'downedDamageModel', 'proficiencyWithoutLevel', 'freeArchetype', 'startingHeroPoints'];

export const BOOL_LABEL: Record<BoolPrefField, string> = {
  autoMechanics: 'Auto-apply mechanics',
  autoAttune: 'Auto-attune magic items',
  featAutoApply: 'Auto-apply feat bonuses',
};
export const BOOL_HELP: Record<BoolPrefField, string> = {
  autoMechanics: 'When on, the roller folds a roll’s effects (conditions, exhaustion, item bonuses) into the sheet automatically. When off, rolls are recorded but you apply effects by hand.',
  autoAttune: 'When on, a magic item that needs attunement works the moment you equip it — no separate attune step. When off, you attune each item by hand. Either way you still equip armor, weapons, and worn items yourself.',
  featAutoApply: 'When on, a feat’s ability-score increase (like Resilient’s +1) applies itself. When off, you raise the score by hand.',
};
export const BOOL_ORDER: BoolPrefField[] = ['autoMechanics', 'autoAttune', 'featAutoApply'];

/** Which SECTION each field sits in for the per-character modal: the two dice/record settings are
 *  "display & roller"; everything else is a rules choice. */
export const PREF_GROUP: Record<EnumPrefField | BoolPrefField, PrefGroup> = {
  diceRollerStyle: 'display',
  recordMode: 'display',
  exhaustionModel: 'rules',
  longRestModel: 'rules',
  equipLimits: 'rules',
  shapeshiftStats: 'rules',
  downedDamageModel: 'rules',
  proficiencyWithoutLevel: 'rules',
  freeArchetype: 'rules',
  startingHeroPoints: 'rules',
  autoMechanics: 'rules',
  autoAttune: 'rules',
  featAutoApply: 'rules',
};

// ── Per-system scoping ────────────────────────────────────────────────────────────────────────────
//
// Some settings only mean anything on ONE game system. Before this map existed, every character was
// offered every setting: a D&D 5e player saw "Damage while dying (PF2)" — a rule their sheet does not
// have — and the only thing marking it PF2-only was the words in its help text. A setting a system
// cannot honour is worse than a missing one, because a player will set it and expect it to do something.
//
// `undefined` (a field absent from this map) means CROSS-SYSTEM: show it on every system. A field listed
// here shows ONLY for the systems named. System ids match `lib/dnd/systems.ts`.

/** Settings that apply to one system only. Absent = applies to all systems. */
export const PREF_SYSTEMS: Partial<Record<EnumPrefField | BoolPrefField, string[]>> = {
  downedDamageModel: ['pathfinder2e'],
  proficiencyWithoutLevel: ['pathfinder2e'],
  freeArchetype: ['pathfinder2e'],
  startingHeroPoints: ['pathfinder2e'],
};

/**
 * Should this setting be offered for a character on `system`?
 *
 * Fails OPEN (`true`) when the system is unknown/undefined — a system-ambiguous character should see the
 * cross-system settings rather than an empty modal, and hiding a control the player legitimately has is
 * the worse failure of the two.
 */
export function prefAppliesToSystem(field: EnumPrefField | BoolPrefField, system: string | undefined | null): boolean {
  const only = PREF_SYSTEMS[field];
  if (!only) return true;          // cross-system setting
  if (!system) return false;       // system-specific setting, but we don't know the system → don't offer it
  return only.includes(system);
}

/** The enum fields to show for a system, in catalog order. */
export function enumPrefsForSystem(system: string | undefined | null): EnumPrefField[] {
  return ENUM_ORDER.filter((f) => prefAppliesToSystem(f, system));
}

/** The boolean fields to show for a system, in catalog order. */
export function boolPrefsForSystem(system: string | undefined | null): BoolPrefField[] {
  return BOOL_ORDER.filter((f) => prefAppliesToSystem(f, system));
}

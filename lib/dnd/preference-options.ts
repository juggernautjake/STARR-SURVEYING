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
  | 'recordMode' | 'shapeshiftStats' | 'downedDamageModel';
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
};

export const ENUM_HELP: Record<EnumPrefField, string> = {
  exhaustionModel: 'How exhaustion penalties are applied.',
  longRestModel: 'How much a long rest restores. Vanilla uses each game system’s own rules.',
  equipLimits: 'Whether the one-armor / one-shield equip rules are enforced.',
  diceRollerStyle: 'The look of the in-app dice roller.',
  recordMode: 'How rolls are entered: the roller applies effects, you type a total, or you record a real-life roll.',
  shapeshiftStats: 'What a shape-shift (Wild Shape, Primal Shape, a Surge form) does to your ability scores. Full replaces them like the rules say; partial averages your scores with the form’s; none leaves your scores alone.',
  downedDamageModel: 'Pathfinder 2e only: whether taking damage while already dying pushes your Dying value up (official rules) or leaves it to recovery saves.',
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
};

export const ENUM_ORDER: EnumPrefField[] = ['exhaustionModel', 'longRestModel', 'equipLimits', 'diceRollerStyle', 'recordMode', 'shapeshiftStats', 'downedDamageModel'];

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
  autoMechanics: 'rules',
  autoAttune: 'rules',
  featAutoApply: 'rules',
};

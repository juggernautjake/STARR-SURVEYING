// lib/dnd/sheet-help.ts — plain-language grounding so the AI chat can explain HOW the character sheet works
// and WHAT each campaign preference does. Injected into the assistant's system prompt whenever a character is
// in focus, so "how does my sheet calculate this?" or "what does auto-attune do?" answers from the real design
// instead of guessing. Kept as data (one entry per preference) so it can't drift from preferences.ts — the
// DEFAULT_CAMPAIGN_PREFERENCES keys are the source of truth and a test asserts every one is described here.

/** One preference explained for a human: what it controls, its options, and the default. */
export interface PreferenceHelp {
  key: string;
  name: string;
  explains: string;
}

export const PREFERENCE_HELP: PreferenceHelp[] = [
  { key: 'autoMechanics', name: 'Auto-apply mechanics', explains: 'When on (default), the dice roller folds a roll’s effects — conditions, stances, exhaustion, item bonuses — into the sheet automatically. When off, rolls are recorded but the player applies effects by hand. There is also a per-session “vanilla roller” toggle in the Dice Tray that turns effects off for straight rolls without changing this preference.' },
  { key: 'autoAttune', name: 'Auto-attune magic items', explains: 'When on (default), a magic item that needs attunement works the moment it is equipped — no separate attune step. When off, the player attunes each item by hand before its effects count. Equipping armor, weapons, and worn items is always manual either way.' },
  { key: 'featAutoApply', name: 'Auto-apply feat bonuses', explains: 'When on (default), a feat’s ability-score increase (like Resilient’s +1) applies itself on the sheet. When off, the player raises the score by hand.' },
  { key: 'shapeshiftStats', name: 'Shape-shift ability scores', explains: 'How a shape-shift (Wild Shape, Primal Shape, a Surge form) treats ability scores. “Full” (default) replaces your scores with the form’s, up or down, like the rules say — a druid who becomes a rat drops to the rat’s Strength. “Partial” averages your score with the form’s for a middle ground. “None” leaves your ability scores alone while still changing shape, senses, and movement.' },
  { key: 'downedDamageModel', name: 'Damage while dying (PF2)', explains: 'Pathfinder 2e only. “Official” (default) follows the rules: taking damage while already dying raises your Dying value by 1, or 2 on a critical hit. “Off” leaves the Dying value to advance only on failed recovery saves.' },
  { key: 'exhaustionModel', name: 'Exhaustion model', explains: 'How exhaustion penalties bite a d20 test. “Vanilla” uses each edition’s own rules (the 2014 tiered table, or the 2024 −2-per-level). The alternative applies a flat −2 to every d20 test per exhaustion level.' },
  { key: 'longRestModel', name: 'Long-rest model', explains: 'How much a long rest restores. “Vanilla” (default) uses each game system’s own rules. Alternatives include half-hit-dice (2014 RAW), gritty realism (a long rest takes 7 days), and epic (a long rest is as quick as a short rest).' },
  { key: 'equipLimits', name: 'Equipment limits', explains: 'Whether the one-armor / one-shield / no-two-handed-weapon-with-a-shield equip rules are enforced, or off for free-form loadouts.' },
  { key: 'diceRollerStyle', name: 'Dice roller style', explains: 'The visual look of the in-app dice roller (futuristic, rugged, natural, fantasy, or medieval). Cosmetic only.' },
  { key: 'recordMode', name: 'Roll recording mode', explains: 'How rolls are entered: the app rolls and applies effects, the player types a total, or the player records a real-life physical roll.' },
];

/** The always-true description of how the sheet derives its numbers (the effect ledger), independent of any
 *  preference. This is what makes "everything factor in" — one pipeline resolves every stat. */
export const SHEET_MECHANICS_OVERVIEW =
  'HOW THE SHEET CALCULATES THINGS: every derived number on the sheet (ability scores, AC, saves, skills, ' +
  'attack/damage, spell save DC, speeds, HP) is resolved by a single effect ledger. It gathers every active ' +
  'source of effects — equipped and attuned items, active potions/spells/conditions/stances, an active ' +
  'shape-shift form, class and species features, feats, and exhaustion — and folds them into each stat, so a ' +
  'belt that sets Strength, a cloak that adds to saves, or a condition that grants disadvantage all show up ' +
  'automatically. A “set” from an item only raises a value (a weak item never drags a strong hero down), but a ' +
  'shape-shift form REPLACES the value outright. When the roller applies effects, a roll’s math shows what ' +
  'helped (teal) or hurt it (red penalties) and why. The behavior of several of these mechanics is governed ' +
  'by campaign preferences (below), which a DM can set and lock and a player can choose within.';

/** Build the assistant-facing help block: the ledger overview + every preference explained. Injected into the
 *  chat system prompt when a character is in focus so the AI can answer "how does my sheet work?" and "what
 *  does <preference> do?" from the real design. */
export function sheetMechanicsHelp(): string {
  const prefs = PREFERENCE_HELP.map((p) => `• ${p.name} — ${p.explains}`).join('\n');
  return [
    SHEET_MECHANICS_OVERVIEW,
    'CAMPAIGN PREFERENCES (what each one does — explain these plainly if asked):',
    prefs,
    'If the reader asks how the sheet works or what a setting does, answer from the above in plain language.',
  ].join('\n\n');
}

// lib/dnd/classes/level-up-ai.ts — the AI level-up path: the structured-output TOOL the model fills to level a
// character up by one, and the PURE apply that turns a validated LevelUpDraft into the character's changes
// (Area LU, owner 2026-07-18). Mirrors how `custom-ai.ts` feeds the homebrew-class engine: the AI proposes, a
// defensive parser (`parseLevelUpDraft`) normalizes, and this applies — the AI never writes the sheet directly.
//
// Works for a vanilla OR a custom/highly-modified character: the caller grounds the model with the character's
// current state + `standardLevelUpOptions` (the class's standard features/choices at the new level), and the
// model returns either those standard features (mode 'vanilla') or invented balanced content (mode 'custom').
import type { Character } from '@/app/dnd/_sheet/types';
import type { AbilityKey } from '@/app/dnd/_sheet/rules/dnd';
import { parseLevelUpDraft, type LevelUpDraft } from './level-up-draft';

const ABILITY_KEYS: AbilityKey[] = ['str', 'dex', 'con', 'int', 'wis', 'cha'];

/** The structured-output tool the model fills to level a character up by one. Kept minimal + defensive — the
 *  parser clamps everything, so the schema just guides the model toward the fields the apply needs. */
export const LEVEL_UP_TOOL = {
  name: 'level_up_character',
  description:
    'Level a character up by ONE level. Use mode "vanilla" to grant the class/subclass features the character ' +
    'would standardly gain at the new level (from the standard options provided), or mode "custom" to invent ' +
    'balanced homebrew features/feats/buffs that fit the character\'s class, subclass, and species. Always set ' +
    'the HP gained and any ability-score increase (a standard ASI is +2 to one ability or +1 to two).',
  input_schema: {
    type: 'object',
    properties: {
      mode: { type: 'string', enum: ['vanilla', 'custom'], description: 'vanilla = standard class features; custom = invented balanced content.' },
      hpGained: { type: 'integer', minimum: 0, description: 'Hit points gained at this level (rolled or the class average + CON).' },
      abilityIncreases: {
        type: 'object',
        description: 'Ability increases applied this level (an ASI). Each value is +1 or +2. Omit if none.',
        properties: Object.fromEntries(ABILITY_KEYS.map((k) => [k, { type: 'integer', minimum: 1, maximum: 2 }])),
      },
      subclass: { type: 'string', description: 'The subclass chosen this level, if the level grants the choice.' },
      features: {
        type: 'array',
        description: 'The features/feats/buffs gained this level, each with a name and rules text.',
        items: { type: 'object', properties: { name: { type: 'string' }, body: { type: 'string' } }, required: ['name', 'body'] },
      },
      notes: { type: 'string', description: 'Optional note about the choices made.' },
    },
    required: ['mode', 'features'],
  },
} as const;

/** Turn an AI tool call into a validated LevelUpDraft (or the defensive default). Same parser the UI uses. */
export function parseLevelUpToolCall(raw: unknown, currentLevel: number): LevelUpDraft {
  return parseLevelUpDraft(raw, { currentLevel });
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'feature';
const capAbility = (score: number, add: number) => Math.min(30, Math.max(1, score + add));

/**
 * Apply a validated LevelUpDraft to a character, returning a NEW Character (input untouched). Sets the level,
 * appends the new features (sourced + flagged custom for the DM's review), applies the ability increases
 * (capped at 30 for Epic-Boon headroom), and adds the HP gained. Deterministic — feature ids derive from the
 * level + name, so re-applying the same draft is idempotent and testable (no clock/random).
 */
export function applyLevelUpDraft(char: Character, draft: LevelUpDraft): Character {
  const next: Character = {
    ...char,
    meta: { ...char.meta, level: draft.toLevel },
    abilities: { ...char.abilities },
    features: [...(char.features ?? [])],
    combat: { ...char.combat },
  };

  // Ability increases (the ASI).
  for (const k of ABILITY_KEYS) {
    const add = draft.abilityIncreases[k];
    if (add) next.abilities[k] = capAbility(next.abilities[k] ?? 10, add);
  }

  // New features — sourced to the level, flagged custom when invented so they show in the DM's review.
  const source = draft.mode === 'custom' ? `Custom · Level ${draft.toLevel}` : `Level ${draft.toLevel}`;
  for (const f of draft.features) {
    next.features.push({
      id: `lvl-${draft.toLevel}-${slug(f.name)}`,
      name: f.name,
      source,
      body: f.body ? [f.body] : [],
      unlockLevel: draft.toLevel,
      customized: draft.mode === 'custom',
    });
  }

  // HP gained.
  if (draft.hpGained != null && typeof next.combat.maxHp === 'number') {
    next.combat.maxHp = next.combat.maxHp + draft.hpGained;
  }

  // Record the chosen subclass on meta when the level granted it and none is set yet.
  if (draft.subclass && !next.meta.subclass) {
    next.meta = { ...next.meta, subclass: draft.subclass };
  }

  return next;
}

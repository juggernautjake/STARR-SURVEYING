// lib/dnd/systems/pathfinder2e/ai.ts — the AI-customize path for the PF2 builder. Pure, testable core:
// a structured-output tool schema the model fills, a defensive normalizer that turns the model's JSON
// into safe PF2Picks, and a grounding system prompt that pins the AI to the real Pathfinder 2e Remaster
// rules + the vanilla catalog so invented content matches its mechanics. Anything outside the catalog is
// still placed on the sheet — the AI is additive, never a correctness path.
import type { PF2Picks } from './builder';
import type { PF2AttributeKey } from './model';
import { PF2_ATTRIBUTES } from './model';
import { pf2Catalog } from './catalog';
import { systemRulesBlock } from '../../system-rules';
import { PF2_EDIT_OPS, parsePf2Edit, type PF2Edit } from './edit';

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const strArr = (v: unknown): string[] => (Array.isArray(v) ? v.map(str).filter(Boolean) : []);
const clampNum = (v: unknown, lo: number, hi: number, dflt: number): number => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, Math.round(n))) : dflt;
};
const isAttr = (k: string): k is PF2AttributeKey => (PF2_ATTRIBUTES as readonly string[]).includes(k);

/** Normalize an arbitrary object (an LLM tool call, or any JSON) into safe PF2Picks. Pure + defensive. */
export function parsePF2Picks(raw: unknown): PF2Picks {
  const p = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const attributes: Partial<Record<PF2AttributeKey, number>> = {};
  if (p.attributes && typeof p.attributes === 'object') {
    for (const k of PF2_ATTRIBUTES) {
      const v = (p.attributes as Record<string, unknown>)[k];
      if (v != null && Number.isFinite(Number(v))) attributes[k] = clampNum(v, -5, 12, 0); // PF2 uses modifiers
    }
  }
  const key = str(p.keyAttribute).toUpperCase();
  const freeBoosts = strArr(p.freeBoosts).map((s) => s.toUpperCase()).filter(isAttr) as PF2AttributeKey[];
  return {
    name: str(p.name) || undefined,
    level: clampNum(p.level, 1, 20, 1),
    ancestry: str(p.ancestry) || undefined,
    heritage: str(p.heritage) || undefined,
    background: str(p.background) || undefined,
    className: str(p.className ?? p.class) || undefined,
    subclass: str(p.subclass) || undefined,
    deity: str(p.deity) || undefined,
    keyAttribute: isAttr(key) ? key : undefined,
    attributes: Object.keys(attributes).length ? attributes : undefined,
    freeBoosts: freeBoosts.length ? freeBoosts : undefined,
    trainedSkills: strArr(p.trainedSkills),
    armor: str(p.armor) || undefined,
    weapon: str(p.weapon) || undefined,
    feats: strArr(p.feats),
    spells: strArr(p.spells),
    languages: strArr(p.languages),
    bio: str(p.bio) || undefined,
  };
}

/** The structured-output tool the model fills with a full PF2 build. */
export const PF2_PICKS_TOOL = {
  name: 'pathfinder2e_build',
  description: 'A complete Pathfinder 2e (Remaster) character build. Use attribute MODIFIERS (e.g. +4), not scores. Prefer names from the vanilla catalog; content outside it is still placed but should match PF2 mechanics.',
  input_schema: {
    type: 'object' as const,
    properties: {
      name: { type: 'string' }, level: { type: 'integer', minimum: 1, maximum: 20 },
      ancestry: { type: 'string' }, heritage: { type: 'string' }, background: { type: 'string' },
      className: { type: 'string' }, subclass: { type: 'string' }, deity: { type: 'string' },
      keyAttribute: { type: 'string', enum: [...PF2_ATTRIBUTES] },
      attributes: {
        type: 'object',
        description: 'Final attribute MODIFIERS after all boosts (PF2 has no scores in play).',
        properties: Object.fromEntries(PF2_ATTRIBUTES.map((k) => [k, { type: 'integer', minimum: -5, maximum: 12 }])),
      },
      freeBoosts: { type: 'array', items: { type: 'string', enum: [...PF2_ATTRIBUTES] }, description: 'Used only if attributes are omitted.' },
      trainedSkills: { type: 'array', items: { type: 'string' } },
      armor: { type: 'string', description: 'Worn armor name (e.g. "Full Plate", "Leather", "Unarmored").' },
      weapon: { type: 'string', description: 'Primary wielded weapon (e.g. "Longsword", "Longbow", "Rapier").' },
      languages: { type: 'array', items: { type: 'string' } },
      bio: { type: 'string' },
    },
    required: ['name'],
  },
};

// ── In-play edit tool (Area SQ4) — change ONE thing on a PF2 character in place (HP + the death track), the
//    PF2 counterpart of edit_ig_sheet. Reuses the pure parser so the AI can never emit an edit the manual path
//    wouldn't accept. ──────────────────────────────────────────────────────────────────────────────────────
export const PF2_EDIT_TOOL = {
  name: 'edit_pf2_sheet',
  description:
    "Change ONE thing on a Pathfinder 2e character's sheet in place: apply damage (apply_damage with `amount` — soaked by temp HP first, floors at 0), heal (heal with `amount` — regaining HP while Dying clears Dying), set temporary HP (set_temp_hp with `amount`, 0 clears), set the death track (set_dying with `value` 0–4 where 4 = dead; set_wounded with `value`, 0 clears), or set a condition (set_condition with `name` e.g. \"Frightened\"/\"Sickened\"/\"Prone\" and `value` — its numeric value, or 0 to clear; the sheet folds active conditions into rolls under PF2's non-stacking penalty rule), or set an attribute modifier (set_attribute with `attribute` STR/DEX/CON/INT/WIS/CHA and `value` the modifier, −5..12; PF2 tracks modifiers, not scores). You can also ADD CONTENT: add_feat (`name`, plus `level` and `track` when you know them) and add_spell (`name` and `rank`, where rank 0 is a cantrip — PF2 uses ranks, not spell levels), with remove_feat / remove_spell to undo. A vanilla character can only take what its class, level and tradition actually grant; anything outside that is refused with a reason, so pick content the character is genuinely eligible for.",
  input_schema: {
    type: 'object' as const,
    properties: {
      op: { type: 'string', enum: [...PF2_EDIT_OPS], description: 'The edit operation.' },
      amount: { type: 'integer', minimum: 0, description: 'For apply_damage / heal / set_temp_hp: how many HP.' },
      value: { type: 'integer', description: 'For set_dying (0–4) / set_wounded / set_hero_points (0–3) / set_condition: the track/points/condition value (0 clears). For set_attribute: the modifier (−5..12).' },
      name: { type: 'string', description: 'For set_condition: the condition name, e.g. "Frightened", "Sickened", "Prone". For add_feat / remove_feat: the feat name. For add_spell / remove_spell: the spell name.' },
      attribute: { type: 'string', enum: ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'], description: 'For set_attribute: which attribute modifier to set.' },
      // Content-adding fields (S13). `offRules` is deliberately NOT offered — it is stamped by the
      // rules gate after its own check, and letting the model set it would turn "this isn't
      // off-rules" into a claim rather than a fact.
      rank: { type: 'integer', minimum: 0, maximum: 10, description: 'For add_spell: the spell RANK (0 = cantrip). PF2 uses ranks, not spell levels — a rank is NOT the character\'s level.' },
      level: { type: 'integer', minimum: 1, maximum: 20, description: 'For add_feat: the level at which the feat becomes available.' },
      track: { type: 'string', enum: ['ancestry', 'class', 'skill', 'general', 'archetype', 'feature'], description: 'For add_feat: which of PF2\'s feat tracks it comes from. Each track has its own level schedule.' },
      prepared: { type: 'boolean', description: 'For add_spell: prepared today (prepared casters only; a spontaneous caster\'s repertoire is always castable).' },
      focus: { type: 'boolean', description: 'For add_spell: a focus spell, cast from Focus Points rather than a slot.' },
    },
    required: ['op'],
  },
};

/** Turn an AI tool call into a validated PF2Edit (or an error). Same parser the API route uses. */
export function parsePF2EditToolCall(raw: unknown): { edit: PF2Edit } | { error: string } {
  return parsePf2Edit(raw);
}

/** The grounding system prompt: PF2 rules + the vanilla catalog so an AI build matches the real system. */
export function pf2BuilderSystemPrompt(): string {
  const cat = pf2Catalog().map((g) => `${g.title}: ${g.entries.map((e) => e.name).join(', ')}`).join('\n');
  return [
    'You build characters for PATHFINDER 2e (Remaster). Fill the pathfinder2e_build tool.',
    'Use attribute MODIFIERS (e.g. +4), not scores. Proficiency is a RANK (untrained→legendary) that adds',
    'your level when trained or better. Level 1–20. Never mix in D&D 5e or other systems’ rules.',
    'Prefer content from the vanilla catalog below; content outside it is still placed on the sheet, so',
    'never pass off homebrew as official Paizo content.',
    '',
    systemRulesBlock('pathfinder2e'),
    '',
    'VANILLA CATALOG (prefer these exact names):',
    cat,
  ].join('\n');
}

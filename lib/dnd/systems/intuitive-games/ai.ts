// lib/dnd/systems/intuitive-games/ai.ts — the AI-customize path for the Intuitive Games builder (full-sheet
// Slice 10). Pure, testable core: a structured-output tool schema the model fills, a normalizer that turns
// the model's JSON into safe IGPicks, and a grounding system prompt that pins the AI to the real system so
// invented content matches its mechanics. Anything not in the vanilla catalog is auto-flagged custom by the
// same provenance classifier the builder + approval panel use — the AI is additive, never a correctness path.
import type { IGPicks } from './builder';
import { systemRulesBlock } from '../../system-rules';
import { igCatalog } from './catalog';
import { IG_EDIT_OPS, parseIgEdit, type IGEdit } from './edit';
import { IG_STANCE_DEFS, IG_CONDITIONS } from './content';

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const strArr = (v: unknown): string[] => (Array.isArray(v) ? v.map(str).filter(Boolean) : []);
const clampNum = (v: unknown, lo: number, hi: number, dflt: number): number => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, Math.round(n))) : dflt;
};

/** Normalize an arbitrary object (an LLM tool call, or any JSON) into safe IGPicks. Pure + defensive. */
export function parseIGPicks(raw: unknown): IGPicks {
  const p = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const abilities: Record<string, number> = {};
  if (p.abilities && typeof p.abilities === 'object') {
    for (const k of ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA']) {
      const v = (p.abilities as Record<string, unknown>)[k];
      if (v != null && Number.isFinite(Number(v))) abilities[k] = clampNum(v, 1, 30, 10);
    }
  }
  const picks: IGPicks = {
    name: str(p.name) || undefined,
    level: clampNum(p.level, 1, 10, 1),
    ancestry: str(p.ancestry) || undefined,
    className: str(p.className ?? p.class) || undefined,
    subclass: str(p.subclass) || undefined,
    specialization: str(p.specialization) || undefined,
    background: str(p.background) || undefined,
    alignment: str(p.alignment) || undefined,
    culture: str(p.culture) || undefined,
    bio: str(p.bio) || undefined,
    defensivePower: str(p.defensivePower) || undefined,
    companionType: str(p.companionType) || undefined,
    companionName: str(p.companionName) || undefined,
    abilities: Object.keys(abilities).length ? abilities : undefined,
    stances: strArr(p.stances),
    powers: strArr(p.powers),
    feats: strArr(p.feats),
    weapons: strArr(p.weapons),
    weaponTypes: strArr(p.weaponTypes),
  };
  return picks;
}

/** The structured-output tool the model fills with a full Intuitive Games build. */
export const IG_PICKS_TOOL = {
  name: 'intuitive_games_build',
  description: 'A complete Intuitive Games character build. Prefer names from the vanilla catalog; you may invent content that matches the system’s mechanics — it will be flagged CUSTOM automatically.',
  input_schema: {
    type: 'object' as const,
    properties: {
      name: { type: 'string' }, level: { type: 'integer', minimum: 1, maximum: 10 },
      ancestry: { type: 'string' }, className: { type: 'string' }, subclass: { type: 'string' },
      specialization: { type: 'string' }, background: { type: 'string' },
      alignment: { type: 'string' }, culture: { type: 'string' }, bio: { type: 'string' },
      abilities: {
        type: 'object',
        properties: Object.fromEntries(['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'].map((k) => [k, { type: 'integer', minimum: 1, maximum: 30 }])),
      },
      stances: { type: 'array', items: { type: 'string' } },
      powers: { type: 'array', items: { type: 'string' } },
      feats: { type: 'array', items: { type: 'string' } },
      weaponTypes: { type: 'array', items: { type: 'string' } },
      weapons: { type: 'array', items: { type: 'string' } },
      defensivePower: { type: 'string' },
      companionType: { type: 'string' }, companionName: { type: 'string' },
    },
    required: ['name'],
  },
};

// ── AI incremental edit (parity with the manual ig-edit route) ──────────────────────────────────────
// The AI can change ONE thing on an existing IG sheet — enter/leave a stance, apply/remove a condition —
// using the exact same validated ops the sheet controls use (parseIgEdit → applyIgEdit). Owner: "make sure
// the AI has access to everything we are building so that it can also edit things."

/** The structured-output tool the model fills to edit a stance/condition on an IG character. */
export const IG_EDIT_TOOL = {
  name: 'edit_ig_sheet',
  description:
    "Change ONE thing on an Intuitive Games character's sheet in place: enter a stance (set_active_stance, one active at a time), leave the stance (clear_stance), apply a condition (add_condition), or remove a condition (remove_condition). Use the EXACT Intuitive Games stance/condition name.",
  input_schema: {
    type: 'object' as const,
    properties: {
      op: { type: 'string', enum: [...IG_EDIT_OPS], description: 'The edit operation.' },
      name: { type: 'string', description: 'The stance or condition name (omit for clear_stance).' },
    },
    required: ['op'],
  },
};

/** Turn an AI tool call into a validated IGEdit (or an error). Reuses the same parser the API route uses,
 *  so the AI can never emit an edit the manual path wouldn't accept. */
export function parseIGEditToolCall(raw: unknown): { edit: IGEdit } | { error: string } {
  return parseIgEdit(raw);
}

/** Grounding for the edit tool: the exact stance + condition names the AI may use (IG source only). */
export function igEditToolInstruction(): string {
  return [
    'To change a stance or condition on the current Intuitive Games character, call edit_ig_sheet.',
    `Valid stances (use the name without the word "Stance"): ${IG_STANCE_DEFS.map((s) => s.name).join(', ')}.`,
    `Valid conditions: ${IG_CONDITIONS.map((c) => c.name).join(', ')}.`,
    'Only one stance is active at a time — set_active_stance replaces the current one. Use the exact names above; do not invent a stance or condition.',
  ].join('\n');
}

/** The grounding system prompt: the IG rules + the vanilla catalog so an AI build matches the real system. */
export function igBuilderSystemPrompt(): string {
  const cat = igCatalog().map((g) => `${g.title}: ${g.entries.map((e) => e.name).join(', ')}`).join('\n');
  return [
    'You build characters for the INTUITIVE GAMES tabletop system. Fill the intuitive_games_build tool.',
    'Use ability SCORES (e.g. 16), not modifiers. Level 1–10.',
    'Prefer content from the vanilla catalog below; you MAY invent thematically-fitting content that matches',
    'the system’s mechanics — it will be flagged CUSTOM automatically, so never pass off homebrew as official.',
    '',
    systemRulesBlock('intuitive-games'),
    '',
    'VANILLA CATALOG (prefer these exact names):',
    cat,
  ].join('\n');
}

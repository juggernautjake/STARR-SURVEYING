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
      languages: { type: 'array', items: { type: 'string' } },
      bio: { type: 'string' },
    },
    required: ['name'],
  },
};

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

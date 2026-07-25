// lib/dnd/variant-summary.ts — the AI variant summary (VT). Each version of a character gets a short,
// human summary: for the ORIGINAL, a description of who they are; for a VARIANT, how it differs from the
// original (same-but-in-a-campaign, a few levels higher with new feats, a different-system reimagining, a
// renamed alt, …). This module is the pure part: a defensive per-system digest of a sheet, a stable hash of
// that digest (so the UI can flag a stale summary after edits), and the prompt builders. The route calls the
// AI with these and persists the result into the slot metadata.
import { normalizeSystem, systemLabel } from './systems';
import { sheetClassBreakdown, breakdownLabel } from './variant-breakdown';

/** A compact, readable digest of a sheet — enough for the AI to describe it and to compare two versions.
 *  Read defensively from any system's `data` blob (PF2/IG sidecars + shared 5e meta). */
export interface VariantDigest {
  name: string;
  system: string;
  systemLabel: string;
  level: number;
  classLine: string;
  species: string;
  background: string;
  abilities: Record<string, number>;
  feats: string[];
  features: string[];
  spells: string[];
  notes: string;
}

const asStr = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' ? (v as Record<string, unknown>) : {});

/** Names out of a list of items (strings, or objects with a name-ish field). Deduped, capped. */
function namesFrom(v: unknown, cap = 40): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const item of v) {
    let name = '';
    if (typeof item === 'string') name = item.trim();
    else if (item && typeof item === 'object') {
      const o = item as Record<string, unknown>;
      name = asStr(o.name) || asStr(o.featKey) || asStr((o.homebrew as { name?: string } | undefined)?.name) || asStr(o.title);
    }
    if (name && !out.includes(name)) out.push(name);
    if (out.length >= cap) break;
  }
  return out;
}

/** Pull the six ability scores out of an abilities object (defensive: keys may be upper/lowercase). */
function abilitiesOf(v: unknown): Record<string, number> {
  const src = obj(v);
  const out: Record<string, number> = {};
  for (const k of ['str', 'dex', 'con', 'int', 'wis', 'cha']) {
    const val = src[k] ?? src[k.toUpperCase()];
    const n = typeof val === 'number' ? val : (val && typeof val === 'object' ? (val as { score?: number }).score : undefined);
    if (typeof n === 'number' && Number.isFinite(n)) out[k.toUpperCase()] = Math.round(n);
  }
  return out;
}

/** Build the digest for a sheet's `data` under `system`. */
export function variantDigest(data: unknown, system: string): VariantDigest {
  const sys = normalizeSystem(system);
  const d = obj(data);
  const breakdown = sheetClassBreakdown(data, sys);
  const base: VariantDigest = {
    name: '', system: sys, systemLabel: systemLabel(sys),
    level: breakdown.level, classLine: breakdownLabel(breakdown) || `Level ${breakdown.level}`,
    species: '', background: '', abilities: {}, feats: [], features: [], spells: [], notes: '',
  };

  const pf2 = obj(d.pf2e);
  if (sys === 'pathfinder2e' && Object.keys(pf2).length) {
    const id = obj(pf2.identity);
    return {
      ...base,
      name: asStr(id.name), species: asStr(id.ancestry) + (asStr(id.heritage) ? ` (${asStr(id.heritage)})` : ''),
      background: asStr(id.background), abilities: abilitiesOf(pf2.abilities),
      feats: namesFrom(pf2.feats), spells: namesFrom(pf2.spells), notes: asStr(id.bio),
    };
  }

  const ig = obj(d.ig);
  if (sys === 'intuitive-games' && Object.keys(ig).length) {
    const id = obj(ig.identity);
    return {
      ...base,
      name: asStr(id.name), species: asStr(id.ancestry), background: asStr(id.background),
      abilities: abilitiesOf(ig.abilities),
      feats: [...namesFrom(ig.feats), ...namesFrom(ig.powers), ...namesFrom(ig.stances)].slice(0, 40),
      notes: asStr(id.bio),
    };
  }

  // 5e / ambiguous — shared meta + top-level arrays.
  const meta = obj(d.meta);
  const build = obj(d.build);
  return {
    ...base,
    name: asStr(meta.name), species: asStr(meta.species), background: asStr(meta.background),
    abilities: abilitiesOf(d.abilities),
    feats: namesFrom(build.choices), features: namesFrom(d.features), spells: namesFrom(d.spells),
    notes: asStr((meta as { kicker?: string }).kicker) || asStr(d.notes),
  };
}

/** A stable, cheap hash of a digest (djb2 over canonical JSON) — used to tell whether a saved summary is stale
 *  after the sheet changed. Deterministic and Date-free so it works in any environment. */
export function digestHash(dig: VariantDigest): string {
  const canonical = JSON.stringify(dig);
  let h = 5381;
  for (let i = 0; i < canonical.length; i++) h = ((h << 5) + h + canonical.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

/** Convenience: the hash of a sheet's current digest, for comparing against a stored `summaryHash`. */
export function sheetSummaryHash(data: unknown, system: string): string {
  return digestHash(variantDigest(data, system));
}

const SUMMARY_SYSTEM =
  'You write concise, flavourful one-paragraph summaries of tabletop RPG characters for a character-sheet app. ' +
  'Be specific and grounded in the data given — reference real class, level, ability scores, notable feats/spells, ' +
  'race and notes. Never invent facts not present. 2–4 sentences, no preamble, no markdown, no bullet points.';

/** Prompt for the ORIGINAL character — a standalone description of who they are. */
export function originalSummaryUser(dig: VariantDigest): string {
  return [
    'Summarise THIS character (the original) in 2–4 sentences — who they are, their build and vibe:',
    JSON.stringify(dig, null, 2),
  ].join('\n\n');
}

/** Prompt for a VARIANT — describe it and how it differs from the original. */
export function variantSummaryUser(original: VariantDigest, variant: VariantDigest): string {
  return [
    'Summarise the VARIANT below and how it DIFFERS from the ORIGINAL, in 2–4 sentences. Guidance:',
    '- If the variant is mechanically identical and only lives in a different campaign or has a different name, ' +
      'say that plainly (e.g. "The same character as the original, playing in <campaign>").',
    '- If it is the same build but a few levels higher, say so and name the key new feats / ability changes.',
    '- If it is a different system, name, class, race or concept, describe the variant’s own vibe and how it ' +
      'diverges from the original.',
    '- Focus on what a player would want to know at a glance. Never invent facts.',
    '',
    `ORIGINAL:\n${JSON.stringify(original, null, 2)}`,
    '',
    `VARIANT:\n${JSON.stringify(variant, null, 2)}`,
  ].join('\n');
}

export interface SummaryInputs { data: unknown; system: string }

/**
 * Generate a summary for a sheet. When `original` is provided AND differs from the target, produces a
 * difference-focused summary; otherwise (the target IS the original) a standalone description. Returns the
 * text + the digest hash it was built from. `complete` is injected (the route passes `dndComplete`) so this
 * stays pure/testable.
 */
export async function generateVariantSummary(
  target: SummaryInputs,
  original: SummaryInputs | null,
  complete: (opts: { system: string; user: string; maxTokens?: number; temperature?: number }) => Promise<string>,
): Promise<{ summary: string; hash: string }> {
  const targetDig = variantDigest(target.data, target.system);
  const isOriginal = !original || (original.data === target.data);
  const user = isOriginal
    ? originalSummaryUser(targetDig)
    : variantSummaryUser(variantDigest(original!.data, original!.system), targetDig);
  const summary = await complete({ system: SUMMARY_SYSTEM, user, maxTokens: 400, temperature: 0.6 });
  return { summary: summary.trim(), hash: digestHash(targetDig) };
}

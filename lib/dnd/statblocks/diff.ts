// lib/dnd/statblocks/diff.ts — what actually changed between two stat blocks (N3-5).
//
// Owner, 2026-07-30, on the variants beneath a creature: ***"All differences in the variant stat block
// should be noted."***
//
// That is a DIFF, not a badge. `dnd_creature_variants` holds 4,378 weak/elite derivations, each with a
// one-line derivation sentence — *"+2 to AC, attacks, DCs and saves; +15 HP at level 5"* — and a sentence
// is a claim about what a formula intended, not a record of what it did. A DM reading an Elite block wants
// to know which numbers moved and by how much, and the honest way to answer is to compare the two blocks
// rather than to reprint the recipe.
//
// ── WHY THE COMPARISON AND NOT THE FORMULA ──────────────────────────────────────────────────────────
//
// The derivation sentence and the actual block CAN disagree, and this is what makes that visible. The PF2
// adjustment says it shifts "AC, attacks, DCs and saves", and `deriveVariant` shifts AC, saves, skills and
// each entry's `toHit` — a DC written inside an action's prose ("DC 16 Fortitude") is untouched. Computing
// the diff from the blocks reports that truthfully; rendering the sentence would keep repeating a promise
// the data does not keep.
//
// Pure, total and non-mutating, like every other transform here. No field is invented: a value absent from
// both sides produces no row, and a value present on one side only is reported as added or removed rather
// than compared against a zero nobody wrote.
import type { Statblock, StatblockEntry } from '@/lib/dnd/homebrew/statblock';

export interface StatDiff {
  /** Stable machine key — `ac`, `abilities.str`, `entry.Bite.toHit`. Used for React keys and tests. */
  key: string;
  /** How it reads on the page: "Armor Class", "STR", "Bite — to hit". */
  label: string;
  /** `null` means the field is absent on that side, which is not the same as zero or an empty string. */
  from: string | null;
  to: string | null;
  /** Which way a NUMBER moved. `changed` covers text, and numbers that cannot be compared. */
  direction: 'up' | 'down' | 'changed';
}

/** The scalar fields, in the order a stat block reads them. Order is the whole reason this is a list and
 *  not an object: a diff that jumps from Actions back up to Armor Class is harder to read than the block. */
const FIELDS: Array<[keyof Statblock, string]> = [
  ['ac', 'Armor Class'],
  ['acNote', 'Armor'],
  ['hp', 'Hit Points'],
  ['hitDice', 'Hit Dice'],
  ['speed', 'Speed'],
  ['proficiencyBonus', 'Proficiency Bonus'],
  ['saves', 'Saving Throws'],
  ['skills', 'Skills'],
  ['senses', 'Senses'],
  ['languages', 'Languages'],
  ['cr', 'Challenge'],
  ['xp', 'XP'],
  ['resistances', 'Resistances'],
  ['immunities', 'Immunities'],
  ['vulnerabilities', 'Vulnerabilities'],
  ['conditionImmunities', 'Condition Immunities'],
  ['spellcasting', 'Spellcasting'],
];

const ABILITIES = ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const;

/** A displayable string, or null when the field is genuinely absent. `0` is a value; `''` is not. */
function show(v: unknown): string | null {
  if (v === undefined || v === null) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : null;
  const s = String(v).trim();
  return s === '' ? null : s;
}

/**
 * Which way it moved, for anything that reads as a number.
 *
 * Handles the signed-modifier strings the game is written in — `"+7"` → `"+9"` is an increase — because
 * `shiftModifiers` produces exactly those and a diff that called every to-hit change "changed" would drop
 * the one thing a DM is reading for. A multi-number string like "DEX +5, CON +6" has no single direction,
 * so it stays `changed` rather than being scored on its first number.
 */
function direction(from: string | null, to: string | null): StatDiff['direction'] {
  if (from === null || to === null) return 'changed';
  const one = /^[+-]?\d+(\.\d+)?$/;
  if (!one.test(from) || !one.test(to)) return 'changed';
  const a = Number(from);
  const b = Number(to);
  if (!Number.isFinite(a) || !Number.isFinite(b) || a === b) return 'changed';
  return b > a ? 'up' : 'down';
}

function row(key: string, label: string, from: string | null, to: string | null): StatDiff | null {
  // Identical, or absent on both sides — nothing happened, so nothing is reported. A diff padded with
  // unchanged rows is a table of the stat block, which the reader already has above it.
  if (from === to) return null;
  return { key, label, from, to, direction: direction(from, to) };
}

const entryKey = (e: StatblockEntry) => e.name.trim().toLowerCase();

/** A one-line summary of an entry, for the added/removed case where there is nothing to compare against. */
function entrySummary(e: StatblockEntry): string {
  const bits = [e.toHit && `${e.toHit} to hit`, e.damage, e.uses].filter(Boolean);
  return bits.length ? bits.join(', ') : e.body.slice(0, 80);
}

/**
 * Every difference between a base stat block and a variant of it, in reading order.
 *
 * Returns `[]` when they are identical — which the UI must handle rather than assume away, because a
 * variant whose formula produced no change (a creature with no AC and no HP to shift) is a real row in
 * the database and "no differences" is the honest thing to show for it.
 */
export function diffStatblocks(base: Statblock, variant: Statblock): StatDiff[] {
  const out: StatDiff[] = [];

  for (const [field, label] of FIELDS) {
    const r = row(String(field), label, show(base[field]), show(variant[field]));
    if (r) out.push(r);
  }

  // Scores and modifiers are separate fields on purpose (a PF2 block has modifiers and no scores), so both
  // are compared. Labelled differently, because "+3" and "16" are not the same claim.
  for (const a of ABILITIES) {
    const s = row(`abilities.${a}`, a.toUpperCase(), show(base.abilities?.[a]), show(variant.abilities?.[a]));
    if (s) out.push(s);
    const m = row(`abilityMods.${a}`, `${a.toUpperCase()} mod`, show(base.abilityMods?.[a]), show(variant.abilityMods?.[a]));
    if (m) out.push(m);
  }

  // ── ENTRIES, MATCHED BY NAME ──────────────────────────────────────────────────────────────────────
  //
  // By name rather than by index: a variant that adds a trait would otherwise shift every later entry and
  // report the whole action list as changed, which is a diff nobody can read. Name is stable across the
  // derivations that exist (they only re-pitch numbers) and it is what a reader looks the entry up by.
  const baseEntries = new Map((base.entries ?? []).map((e) => [entryKey(e), e]));
  const varEntries = new Map((variant.entries ?? []).map((e) => [entryKey(e), e]));

  for (const [k, b] of baseEntries) {
    const v = varEntries.get(k);
    if (!v) {
      out.push({ key: `entry.${k}`, label: b.name, from: entrySummary(b), to: null, direction: 'changed' });
      continue;
    }
    for (const [prop, suffix] of [['toHit', 'to hit'], ['damage', 'damage'], ['uses', 'uses'], ['cost', 'cost']] as const) {
      const r = row(`entry.${k}.${prop}`, `${b.name} — ${suffix}`, show(b[prop]), show(v[prop]));
      if (r) out.push(r);
    }
    // Prose last and reported as a fact rather than a pair of paragraphs: the from/to are full rules text,
    // and the renderer decides how much of it to show.
    const body = row(`entry.${k}.body`, `${b.name} — text`, show(b.body), show(v.body));
    if (body) out.push(body);
  }

  for (const [k, v] of varEntries) {
    if (baseEntries.has(k)) continue;
    out.push({ key: `entry.${k}`, label: v.name, from: null, to: entrySummary(v), direction: 'changed' });
  }

  return out;
}

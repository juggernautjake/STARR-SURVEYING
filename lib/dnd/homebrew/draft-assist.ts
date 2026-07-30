// lib/dnd/homebrew/draft-assist.ts — "fill in everything from the name and a sentence" (P6-15b).
//
// P6-15 gave every prose field its own ✨ button. This is the owner's other half: describe the piece once
// and have the whole form proposed at you.
//
// IT WAS SPLIT OUT FOR A REASON, AND THIS FILE IS THAT REASON. From the P6-15b note: *"a multi-field
// proposal needs a per-field accept/reject UI to stay honest — one all-or-nothing button would quietly
// become the auto-apply this slice exists to avoid."* So the unit of decision here is the FIELD, not the
// proposal: `draftProposalRows` returns one row per field with the author's current value beside the
// suggested one, and `applyDraftChoices` takes an explicit list of accepted keys. There is no code path
// that applies everything without being told which everything.
//
// The contrast with `mergeIngest` is deliberate. Ingest fills only what is EMPTY — it can add and never
// overwrite, which is right for a document you uploaded and have not read. Whole-draft assist is asked for
// by name, so it must be able to replace what is there; the safety comes from the author ticking the row,
// not from the merge refusing.
import { fieldsForKind, type FieldSpec } from './kinds';
import type { HomebrewKind } from './model';
import { fieldAcceptsIngest } from './ingest';
import { normalizeStatblock, STATBLOCK_ABILITIES, type Statblock } from './statblock';

/**
 * Fields a whole-draft proposal may fill.
 *
 * Everything ingest may fill, PLUS the statblock — and that difference is P13-8.
 *
 * Ingest and draft were the same set because structured editors "are not text", which is the right rule
 * for INGEST: it reads a document you uploaded and have not necessarily read, and a document is not a
 * schema. Drafting is asked for by name, from a sentence describing a creature, and **a creature draft
 * with no numbers is not a draft** — it fills in the name, the summary and the alignment and leaves the
 * author to do the actual work. P13-8 is "describe it → STATBLOCK → retry / accept / edit"; without this
 * the middle step was missing.
 *
 * Safe because nothing is trusted: the model's object goes through `normalizeStatblock`, which drops any
 * field that is unparseable or out of range rather than clamping it, and the author still has to tick the
 * row. `levels` and `list` stay excluded — they carry ordering and per-row identity that a flat proposal
 * cannot express, so accepting one would silently discard structure the author had.
 */
export const fieldAcceptsDraft = (f: FieldSpec): boolean => fieldAcceptsIngest(f) || f.type === 'statblock';

export function draftFields(kind: HomebrewKind): FieldSpec[] {
  return fieldsForKind(kind).filter(fieldAcceptsDraft);
}

export const DRAFT_SYSTEM_PROMPT = [
  'You are helping an author draft a piece of tabletop homebrew content.',
  'You will be given a content KIND, a game SYSTEM, a NAME, and one or two sentences describing the idea.',
  'Return a JSON object whose keys are the field keys you were given and whose values are your suggested content.',
  'Only include a key when you have something genuinely useful to say about it. Omitting a field is better than padding it.',
  'Match the tone of published rules text for that system: concrete, mechanical, and free of marketing language.',
  'Never invent a rule that contradicts the named system. If a field would require a rule you are unsure of, omit it.',
].join(' ');

/** The instruction, naming exactly the fields this kind has. */
export function draftUserPrompt(args: {
  kind: HomebrewKind;
  system: string;
  name: string;
  idea: string;
}): string {
  const specs = draftFields(args.kind);
  const fields = specs
    .map((f) => `- ${f.key} (${f.label}${f.help ? `: ${f.help}` : ''})`)
    .join('\n');

  // The statblock is the one field whose SHAPE has to be spelled out — every other field is prose, and a
  // model asked for "the statblock" with no schema returns a paragraph describing one. Pathfinder gets a
  // different instruction because it states ability MODIFIERS and has no scores behind them (B1-5);
  // asking for scores there would produce invented numbers the source does not have.
  const wantsStatblock = specs.some((f) => f.type === 'statblock');
  const pf2 = args.system === 'pathfinder2e';
  const statblockShape = wantsStatblock ? [
    '',
    'The `statblock` field is an OBJECT, not prose. Use these keys, and omit any you are unsure of:',
    '  ac (number), acNote, hp (number), hitDice, speed, saves, skills, senses, languages,',
    '  resistances, immunities, conditionImmunities,',
    pf2
      ? '  abilityMods: { str, dex, con, int, wis, cha } — Pathfinder 2e states MODIFIERS, which may be negative. Do not invent ability scores.'
      : '  abilities: { str, dex, con, int, wis, cha } — ability SCORES from 1 to 30, not modifiers.',
    '  entries: [{ kind, name, body, toHit, damage }] where kind is one of trait, action, bonus, reaction, legendary, lair.',
    'Numbers must be numbers, not strings. A field you cannot state confidently should be omitted rather than guessed —',
    'an omitted line renders as absent, and a wrong one gets read off the page mid-combat.',
  ].join('\n') : '';

  return [
    `KIND: ${args.kind}`,
    `SYSTEM: ${args.system}`,
    `NAME: ${args.name}`,
    `IDEA: ${args.idea}`,
    '',
    'FIELDS you may fill:',
    fields,
    statblockShape,
    '',
    'Respond with JSON only.',
  ].join('\n');
}

/** One field's worth of proposal, ready to render as a row with its own accept control. */
export interface DraftRow {
  key: string;
  label: string;
  /** What the author already has. Empty string when they have nothing. */
  current: string;
  /** What the model suggests. */
  proposed: string;
  /** True when accepting this row would REPLACE existing work rather than fill a blank. The UI must say
   *  so: overwriting a paragraph someone typed is a different act from filling an empty box, and a review
   *  screen that presents them identically is a review screen that gets clicked through. */
  overwrites: boolean;
  /**
   * The STRUCTURED value to write, when the field is not text.
   *
   * `proposed` stays the human-readable line the review panel shows — "AC 15 · HP 52 (8d8 + 16) · …" — so
   * the reviewer reads a stat block rather than a JSON blob, while what actually gets written is the
   * normalized object. Absent for every text field, where `proposed` IS the value.
   */
  value?: unknown;
}

/**
 * A stat block as one readable line, for the review row.
 *
 * The panel shows `current` beside `proposed` and asks the author to choose. Two JSON objects side by side
 * is not a choice anyone can make, so this prints what a stat block prints, in the order it prints it.
 */
export function summariseStatblock(sb: Statblock): string {
  const parts: string[] = [];
  if (sb.ac !== undefined) parts.push(`AC ${sb.ac}${sb.acNote ? ` (${sb.acNote})` : ''}`);
  if (sb.hp !== undefined) parts.push(`HP ${sb.hp}${sb.hitDice ? ` (${sb.hitDice})` : ''}`);
  if (sb.speed) parts.push(sb.speed);
  const scores = STATBLOCK_ABILITIES.filter((a) => sb.abilities?.[a] !== undefined);
  if (scores.length) parts.push(scores.map((a) => `${a.toUpperCase()} ${sb.abilities![a]}`).join(' '));
  // Pathfinder states modifiers and has no scores behind them — see B1-5. Printing them as scores here
  // would misread the proposal in exactly the way the split field exists to prevent.
  const mods = STATBLOCK_ABILITIES.filter((a) => sb.abilityMods?.[a] !== undefined);
  if (mods.length) parts.push(mods.map((a) => `${a.toUpperCase()} ${sb.abilityMods![a]! >= 0 ? '+' : ''}${sb.abilityMods![a]}`).join(' '));
  if (sb.saves) parts.push(`Saves ${sb.saves}`);
  if (sb.skills) parts.push(`Skills ${sb.skills}`);
  if (sb.senses) parts.push(sb.senses);
  if (sb.entries?.length) parts.push(`${sb.entries.length} trait/action${sb.entries.length === 1 ? '' : 's'}`);
  return parts.join(' · ');
}

const asText = (v: unknown): string => {
  if (v == null) return '';
  if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean).join(', ');
  return String(v).trim();
};

/**
 * Turn a raw model object into reviewable rows.
 *
 * Unknown keys are DROPPED, not surfaced: the builder spreads accepted values into its form state, and a
 * stray key there becomes a stray key in the saved payload. Same rule as `normalizeIngest`, and for the
 * same reason.
 *
 * A proposal identical to what the author already wrote is dropped too. A review list padded with rows that
 * change nothing trains the reader to stop reading it.
 */
export function draftProposalRows(
  kind: HomebrewKind,
  current: Record<string, unknown>,
  raw: unknown,
): DraftRow[] {
  if (!raw || typeof raw !== 'object') return [];
  const r = raw as Record<string, unknown>;
  const allowed = new Map(draftFields(kind).map((f) => [f.key, f]));
  const rows: DraftRow[] = [];

  for (const f of draftFields(kind)) {
    if (!(f.key in r)) continue;
    const spec = allowed.get(f.key)!;

    if (spec.type === 'statblock') {
      // NORMALIZED BEFORE IT IS SHOWN, not on the way in to the form. `normalizeStatblock` drops anything
      // unparseable or out of range rather than clamping it, so a model that invents `ac: "very high"` or
      // a Strength of 400 produces a row missing that line — which the reviewer can see — instead of a
      // plausible wrong number they would have to catch.
      const sb = normalizeStatblock(r[f.key]);
      const proposed = summariseStatblock(sb);
      if (!proposed) continue;
      const existing = summariseStatblock(normalizeStatblock(current[f.key]));
      if (existing && existing === proposed) continue;
      rows.push({ key: spec.key, label: spec.label, current: existing, proposed, overwrites: !!existing, value: sb });
      continue;
    }

    const proposed = asText(r[f.key]);
    if (!proposed) continue;
    const existing = asText(current[f.key]);
    if (existing && existing === proposed) continue;
    rows.push({ key: spec.key, label: spec.label, current: existing, proposed, overwrites: !!existing });
  }
  // Blank fields first: they are the uncontroversial ones, and putting them at the top means the rows that
  // need real thought are not buried under twelve obvious yeses.
  return rows.sort((a, b) => Number(a.overwrites) - Number(b.overwrites));
}

/**
 * Apply exactly the rows the author accepted.
 *
 * `accepted` is a list of keys, not a boolean. There is deliberately no `applyAll` here: the moment this
 * module offers one, the UI grows a button for it and the per-field review becomes decorative — which is
 * the failure the whole split was made to avoid. A caller that genuinely wants everything passes every key,
 * which is a thing they have to mean.
 *
 * Values are written back in the field's own shape: a `tags` field takes an array, not the comma-joined
 * string the review row displayed.
 */
export function applyDraftChoices(
  kind: HomebrewKind,
  current: Record<string, unknown>,
  rows: readonly DraftRow[],
  accepted: readonly string[],
): { values: Record<string, unknown>; applied: string[] } {
  const want = new Set(accepted);
  const byKey = new Map(draftFields(kind).map((f) => [f.key, f]));
  const values = { ...current };
  const applied: string[] = [];

  for (const row of rows) {
    if (!want.has(row.key)) continue;
    const spec = byKey.get(row.key);
    if (!spec) continue;
    // A structured row writes its OBJECT, never its summary line — writing "AC 15 · HP 52 · …" into the
    // statblock field would replace the creature's numbers with a sentence.
    if (row.value !== undefined) {
      values[row.key] = row.value;
    } else if (spec.type === 'tags') {
      values[row.key] = row.proposed.split(',').map((s) => s.trim()).filter(Boolean);
    } else if (spec.type === 'number') {
      const n = Number(row.proposed);
      if (!Number.isFinite(n)) continue;
      values[row.key] = n;
    } else {
      values[row.key] = row.proposed;
    }
    applied.push(row.key);
  }
  return { values, applied };
}

/** A one-line summary of a proposal, for the panel header. */
export function describeDraftProposal(rows: readonly DraftRow[]): string {
  if (!rows.length) return 'Nothing to suggest.';
  const over = rows.filter((r) => r.overwrites).length;
  const fresh = rows.length - over;
  const parts = [fresh ? `${fresh} empty field${fresh === 1 ? '' : 's'}` : '', over ? `${over} that would replace what you wrote` : ''].filter(Boolean);
  return `Suggestions for ${parts.join(' and ')}.`;
}

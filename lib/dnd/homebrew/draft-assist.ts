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

/** Fields a whole-draft proposal may fill. The same set ingest may fill — structured editors (statblock,
 *  levels, lists) are excluded there for the same reason they are excluded here: they are not text. */
export const fieldAcceptsDraft = fieldAcceptsIngest;

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
  const fields = draftFields(args.kind)
    .map((f) => `- ${f.key} (${f.label}${f.help ? `: ${f.help}` : ''})`)
    .join('\n');
  return [
    `KIND: ${args.kind}`,
    `SYSTEM: ${args.system}`,
    `NAME: ${args.name}`,
    `IDEA: ${args.idea}`,
    '',
    'FIELDS you may fill:',
    fields,
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
    if (spec.type === 'tags') {
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

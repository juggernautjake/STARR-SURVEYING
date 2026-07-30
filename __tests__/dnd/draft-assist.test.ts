// __tests__/dnd/draft-assist.test.ts — "fill in everything from the name and a sentence" (P6-15b).
//
// P6-15 gave every prose field its own ✨ button. This is the other half — and it was SPLIT OFF with a
// specific warning, which is what these tests exist to hold:
//
//   "a multi-field proposal needs a per-field accept/reject UI to stay honest — one all-or-nothing button
//    would quietly become the auto-apply this slice exists to avoid."
//
// So the assertions below are mostly about what the module REFUSES to make easy.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  draftProposalRows, applyDraftChoices, draftFields, draftUserPrompt, describeDraftProposal,
  DRAFT_SYSTEM_PROMPT,
} from '@/lib/dnd/homebrew/draft-assist';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
const KIND = 'creature' as const;

/** The keys this kind actually offers, so the fixtures use real ones rather than invented names. */
const keys = draftFields(KIND).map((f) => f.key);

describe('the proposal is per FIELD', () => {
  it('one row per suggested field, carrying current beside proposed', () => {
    const rows = draftProposalRows(KIND, { summary: 'A big bird.' }, { summary: 'A vast carrion bird.' });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ key: 'summary', current: 'A big bird.', proposed: 'A vast carrion bird.', overwrites: true });
  });

  it('OVERWRITES IS FLAGGED, because those two acts are not the same', () => {
    // Filling an empty box and replacing a paragraph someone typed are different decisions. A review
    // screen that presents them identically is a review screen that gets clicked through.
    const rows = draftProposalRows(KIND, { summary: '' }, { summary: 'A vast carrion bird.' });
    expect(rows[0].overwrites).toBe(false);
  });

  it('blank fields sort FIRST, so the rows needing thought are not buried', () => {
    const rows = draftProposalRows(KIND, { summary: 'mine' }, { summary: 'theirs', description: 'new' });
    expect(rows.map((r) => r.overwrites)).toEqual([false, true]);
  });

  it('drops a suggestion identical to what is already written', () => {
    // A review list padded with rows that change nothing trains the reader to stop reading it.
    expect(draftProposalRows(KIND, { summary: 'same' }, { summary: 'same' })).toEqual([]);
    expect(draftProposalRows(KIND, { summary: 'same' }, { summary: '  same  ' })).toEqual([]);
  });

  it('drops unknown keys rather than surfacing them', () => {
    // The builder spreads accepted values into its form state; a stray key there becomes a stray key in
    // the saved payload. Same rule as `normalizeIngest`.
    const rows = draftProposalRows(KIND, {}, { summary: 'ok', not_a_field: 'x', __proto__: 'y' });
    expect(rows.map((r) => r.key)).toEqual(['summary']);
  });

  it('and drops an empty suggestion', () => {
    expect(draftProposalRows(KIND, {}, { summary: '   ', description: 'real' }).map((r) => r.key)).toEqual(['description']);
  });

  it('survives junk without throwing', () => {
    for (const raw of [null, undefined, 'nope', 42, []]) {
      expect(draftProposalRows(KIND, {}, raw), String(raw)).toEqual([]);
    }
  });
});

describe('APPLYING TAKES AN EXPLICIT LIST — there is no applyAll', () => {
  const rows = draftProposalRows(KIND, {}, { summary: 'A vast carrion bird.', description: 'It follows armies.' });

  it('applies only the keys named', () => {
    const { values, applied } = applyDraftChoices(KIND, {}, rows, ['summary']);
    expect(applied).toEqual(['summary']);
    expect(values.summary).toBe('A vast carrion bird.');
    expect(values.description).toBeUndefined();
  });

  it('an empty accept list changes nothing', () => {
    const { values, applied } = applyDraftChoices(KIND, { summary: 'mine' }, rows, []);
    expect(applied).toEqual([]);
    expect(values).toEqual({ summary: 'mine' });
  });

  it('the module exports NO way to apply everything at once', () => {
    // The guard that keeps the split meaningful. The moment this module offers an `applyAll`, the UI grows
    // a button for it and the per-field review becomes decoration.
    const src = read('lib/dnd/homebrew/draft-assist.ts').replace(/\/\*[\s\S]*?\*\//g, '');
    expect(src).not.toMatch(/export function applyAll/);
    expect(src).not.toMatch(/acceptAll/);
  });

  it('a caller that wants everything has to say so, key by key', () => {
    const { applied } = applyDraftChoices(KIND, {}, rows, rows.map((r) => r.key));
    expect(applied.sort()).toEqual(['description', 'summary']);
  });

  it('and it never invents a key that was not proposed', () => {
    const { values } = applyDraftChoices(KIND, {}, rows, ['summary', 'not_proposed']);
    expect(Object.keys(values)).toEqual(['summary']);
  });
});

describe('values go back in the FIELD’S shape, not the row’s display shape', () => {
  const tagField = draftFields(KIND).find((f) => f.type === 'tags');

  it('a tags field takes an array, not the comma-joined string the row showed', () => {
    if (!tagField) return; // the kind has none; nothing to assert
    const rows = draftProposalRows(KIND, {}, { [tagField.key]: ['undead', 'flying'] });
    expect(rows[0].proposed).toBe('undead, flying');
    const { values } = applyDraftChoices(KIND, {}, rows, [tagField.key]);
    expect(values[tagField.key]).toEqual(['undead', 'flying']);
  });

  it('and a non-numeric suggestion for a number field is skipped rather than stored as NaN', () => {
    const numField = draftFields(KIND).find((f) => f.type === 'number');
    if (!numField) return;
    const rows = draftProposalRows(KIND, {}, { [numField.key]: 'quite a lot' });
    const { applied } = applyDraftChoices(KIND, {}, rows, [numField.key]);
    expect(applied).toEqual([]);
  });
});

describe('the prompt', () => {
  it('names the kind, the system, and the real field keys', () => {
    const p = draftUserPrompt({ kind: KIND, system: 'dnd5e-2024', name: 'Bone Choir', idea: 'a choir of skulls' });
    expect(p).toContain('KIND: creature');
    expect(p).toContain('SYSTEM: dnd5e-2024');
    expect(p).toContain('Bone Choir');
    for (const k of keys.slice(0, 3)) expect(p, k).toContain(k);
  });

  it('and the system prompt forbids inventing rules', () => {
    expect(DRAFT_SYSTEM_PROMPT).toMatch(/[Nn]ever invent a rule/);
    expect(DRAFT_SYSTEM_PROMPT).toMatch(/Omitting a field is better/);
  });
});

describe('the summary distinguishes the two kinds of row', () => {
  it('counts blanks and overwrites separately', () => {
    const rows = draftProposalRows(KIND, { summary: 'mine' }, { summary: 'theirs', description: 'new' });
    const s = describeDraftProposal(rows);
    expect(s).toContain('1 empty field');
    expect(s).toContain('replace what you wrote');
  });

  it('and says so when there is nothing', () => {
    expect(describeDraftProposal([])).toBe('Nothing to suggest.');
  });
});

describe('the route', () => {
  const route = read('app/api/dnd/homebrew/draft/route.ts');

  it('returns ROWS, not a values blob', () => {
    // The difference that keeps the review real: a values blob arriving at the client grows an "apply"
    // button, and the per-field decision disappears.
    expect(route).toContain('draftProposalRows(kind, current, raw)');
    expect(route).toContain('return NextResponse.json({ rows,');
  });

  it('requires a session, checks AI is configured, and enforces the AI limits', () => {
    expect(route).toContain("if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });");
    expect(route).toContain('dndAiConfigured()');
    expect(route).toContain('enforceAiLimits(session.userId)');
  });

  it('bounds the free-text idea, which goes straight into a prompt', () => {
    // A megabyte of "idea" is either a mistake or an attempt to smuggle instructions past the system
    // prompt, and neither deserves a model call.
    expect(route).toMatch(/idea\.length > 2000/);
  });

  it('validates the kind against the registry rather than trusting the client', () => {
    expect(route).toContain('isHomebrewKind(kind)');
  });

  it('and writes nothing — "you review it first" is structural, not a promise', () => {
    expect(route).not.toContain('supabaseAdmin');
  });
});

describe('AND IT HAS A DOOR', () => {
  const ui = read('app/dnd/_ui/DraftAssistPanel.tsx');
  const builder = read('app/dnd/_ui/ContentBuilder.tsx');
  /** The panel with its comments removed. Its header argues AGAINST a "Use everything" button by naming
   *  the phrase, so a negative assertion run against the raw file matches the explanation rather than the
   *  code. Fifth time this pass — the rule is now simply: negative source assertions run on stripped code. */
  const uiCode = ui.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

  it('the builder mounts it beside the file ingest', () => {
    expect(builder).toContain('<DraftAssistPanel');
    expect(builder).toContain('applyDraftChoices(spec.kind, values, rows, accepted)');
  });

  it('the BUILDER owns the merge, so the form has one writer', () => {
    // A panel that wrote into `values` itself would be a second writer of this form's state.
    expect(ui).toContain('onApply(');
    expect(uiCode).not.toContain('setValues');
  });

  it('there is a "use all the empty ones" and NOT a "use everything"', () => {
    // Filling blanks is a low-stakes bulk action; overwriting an author's paragraphs is not. Collapsing
    // the two is exactly the slide this design guards against.
    expect(ui).toContain('takeBlanks');
    expect(ui).toMatch(/!r\.overwrites/);
    expect(uiCode).not.toMatch(/Use everything|acceptAll|applyAll/);
  });

  it('and a row that would overwrite SHOWS what it would replace', () => {
    expect(ui).toContain('would replace what you wrote');
    expect(ui).toContain('line-through');
  });
});

describe('the statblock, which drafting excluded and P13-8 needs (B-final)', () => {
  const sb = (over: Record<string, unknown> = {}) => ({
    ac: 15, acNote: 'natural armor', hp: 52, hitDice: '8d8 + 16', speed: '30 ft.',
    abilities: { str: 16, dex: 12, con: 15, int: 6, wis: 11, cha: 8 },
    entries: [{ kind: 'action', name: 'Claw', body: 'Melee Weapon Attack.' }],
    ...over,
  });

  it('offers a statblock row at all — the middle step of "describe it → statblock → accept"', () => {
    // fieldAcceptsDraft was fieldAcceptsIngest, which excludes structured editors because "they are not
    // text". Right for ingest, which reads a document; wrong for drafting, where a creature with no
    // numbers is not a draft.
    const rows = draftProposalRows('creature', {}, { statblock: sb() });
    expect(rows.map((r) => r.key)).toContain('statblock');
  });

  it('shows a stat block, not a JSON blob — the reviewer has to be able to decide', () => {
    const row = draftProposalRows('creature', {}, { statblock: sb() }).find((r) => r.key === 'statblock')!;
    expect(row.proposed).toContain('AC 15 (natural armor)');
    expect(row.proposed).toContain('HP 52 (8d8 + 16)');
    expect(row.proposed).toContain('STR 16');
    expect(row.proposed).not.toContain('{');
  });

  it('writes the OBJECT on accept, never the summary line', () => {
    // Writing "AC 15 · HP 52 · …" into the statblock field would replace the creature's numbers with a
    // sentence, and the form would happily save it.
    const rows = draftProposalRows('creature', {}, { statblock: sb() });
    const { values } = applyDraftChoices('creature', {}, rows, ['statblock']);
    expect((values.statblock as { ac?: number }).ac).toBe(15);
    expect(typeof values.statblock).toBe('object');
  });

  it('DROPS a value the model invented rather than clamping it', () => {
    // normalizeStatblock refuses out-of-range and unparseable values, so the row simply lacks that line —
    // visible to the reviewer — instead of showing a plausible wrong number they have to catch.
    const rows = draftProposalRows('creature', {}, { statblock: sb({ ac: 'very high', abilities: { str: 400 } }) });
    const row = rows.find((r) => r.key === 'statblock')!;
    expect(row.proposed).not.toContain('very high');
    expect(row.proposed).not.toContain('400');
  });

  it('marks a statblock row as overwriting when the author already has numbers', () => {
    const rows = draftProposalRows('creature', { statblock: sb({ ac: 12 }) }, { statblock: sb() });
    expect(rows.find((r) => r.key === 'statblock')?.overwrites).toBe(true);
  });

  it('keeps levels and lists out, because a flat proposal cannot carry their ordering', () => {
    const rows = draftProposalRows('class', {}, { levels: [{ level: 1 }] });
    expect(rows.map((r) => r.key)).not.toContain('levels');
  });

  it('tells the model the SHAPE, and tells Pathfinder it states modifiers', () => {
    // A model asked for "the statblock" with no schema returns a paragraph describing one. And asking
    // Pathfinder for ability SCORES invents numbers its rules do not have (B1-5).
    const dnd = draftUserPrompt({ kind: 'creature', system: 'dnd5e-2014', name: 'X', idea: 'y' });
    expect(dnd).toMatch(/ability SCORES from 1 to 30/);
    expect(dnd).not.toMatch(/abilityMods/);

    const pf2 = draftUserPrompt({ kind: 'creature', system: 'pathfinder2e', name: 'X', idea: 'y' });
    expect(pf2).toMatch(/abilityMods/);
    expect(pf2).toMatch(/Do not invent ability scores/);
  });

  it('says nothing about statblocks for a kind that has none', () => {
    expect(draftUserPrompt({ kind: 'feat', system: 'dnd5e-2014', name: 'X', idea: 'y' })).not.toMatch(/statblock` field is an OBJECT/);
  });
});

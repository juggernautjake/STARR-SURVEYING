// lib/dnd/homebrew/ingest.ts — build a piece from a document the author already has (P6-16).
//
// The owner's ask: *"the user needs to be able to upload a pdf or file that describes the feat or homebrewed
// things and have AI analyze it and build the thing from the provided content."*
//
// This is the path the owner themselves used to get the Pugilist into the repo — a class exists as a PDF
// somewhere and retyping it is the barrier. So the bar is not "extract some text": it is that the fields
// come back **as written in the document**, because a paraphrased class is a different class.
//
// THE REVIEW STEP IS "IT FILLS THE FORM, NOT THE DATABASE". Ingest returns a draft; the builder applies it
// to the form and the author sees every field before anything is saved. That is a genuine review, unlike a
// route that writes a row and tells you to go check it. And it fills only EMPTY fields by default, so it
// can never eat work someone already did.
import { homebrewKindLabel, type HomebrewKind } from './model';
import { fieldsForKind, kindSpec, kindIsMechanicalIn, type FieldSpec } from './kinds';
import { systemLabel, normalizeSystem } from '@/lib/dnd/systems';

/** What the model may fill. Prose and simple scalars only — the structured editors (statblock, levels,
 *  effects, lists) are deliberately out of scope for this slice: getting a level ladder subtly wrong from a
 *  PDF is worse than leaving it blank, because the author would have to check all twenty levels to find the
 *  one that drifted. They read as normal text in `description` and can be entered deliberately. */
export function fieldAcceptsIngest(f: FieldSpec): boolean {
  return f.type === 'text' || f.type === 'textarea' || f.type === 'tags' || f.type === 'number';
}

/** The MIME types worth accepting, and what each becomes in the request. */
export const INGEST_MIME: Record<string, 'document' | 'image' | 'text'> = {
  'application/pdf': 'document',
  'image/png': 'image',
  'image/jpeg': 'image',
  'image/webp': 'image',
  'image/gif': 'image',
  'text/plain': 'text',
  'text/markdown': 'text',
  'application/json': 'text',
};

export const INGEST_ACCEPT = Object.keys(INGEST_MIME).join(',');

export const INGEST_SYSTEM_PROMPT = [
  'You read a document describing a piece of tabletop RPG content and transcribe it into structured fields.',
  '',
  'You are TRANSCRIBING, not designing. The document is the authority.',
  '',
  'RULES:',
  '· Use the document\'s own wording wherever you can. Do not paraphrase rules text — a reworded rule is a',
  '  different rule, and the author will not notice the difference until it matters at a table.',
  '· Do not invent anything the document does not contain. If a field is not covered, omit it entirely',
  '  rather than guessing a plausible value.',
  '· If the document describes something at length (a class with features at many levels), put the full',
  '  text in "description" and keep it complete. Length is fine; loss is not.',
  '· If the document is not about the kind of content you were told to expect, say so in "warning" and fill',
  '  in whatever you can.',
  '',
  'Respond with ONLY a JSON object whose keys are the field names you were given. Omit any field the',
  'document does not cover. You may also include "warning" with one sentence about anything the author',
  'should check.',
].join('\n');

/** The field list the model is asked to fill, described so it knows what each one means. */
export function ingestFieldBrief(kind: HomebrewKind): string {
  return fieldsForKind(kind)
    .filter(fieldAcceptsIngest)
    .map((f) => {
      const type = f.type === 'tags' ? 'array of short strings' : f.type === 'number' ? 'number' : 'string';
      return `· ${f.key} (${type}) — ${f.label}${f.help ? `: ${f.help}` : ''}`;
    })
    .join('\n');
}

export function ingestUserPrompt(kind: HomebrewKind, system: string): string {
  const spec = kindSpec(kind);
  const scope = system === 'any' ? 'any system (system-agnostic)' : systemLabel(normalizeSystem(system));
  const lines = [
    `Transcribe the attached document as a ${homebrewKindLabel(kind).toLowerCase()} — ${spec.blurb}`,
    `Intended system: ${scope}`,
    '',
    'Fill these fields:',
    ingestFieldBrief(kind),
  ];
  if (system !== 'any' && !kindIsMechanicalIn(kind, system)) {
    lines.push('', `NOTE: this platform stores a ${homebrewKindLabel(kind).toLowerCase()} in ${scope} as rules text, so put every mechanic into "description" in full.`);
  }
  return lines.join('\n');
}

export interface IngestResult {
  /** Only the fields the document actually covered, keyed to the kind's own schema. */
  values: Record<string, unknown>;
  warning?: string;
}

/**
 * Read the model's output, keeping ONLY keys that are real fields of this kind and that ingest is allowed
 * to fill. An unknown key is dropped rather than merged: the builder spreads this into its form state, and
 * a stray key there becomes a stray key in the saved payload.
 */
export function normalizeIngest(kind: HomebrewKind, raw: unknown): IngestResult {
  const out: Record<string, unknown> = {};
  if (!raw || typeof raw !== 'object') return { values: out };
  const r = raw as Record<string, unknown>;
  const allowed = new Map(fieldsForKind(kind).filter(fieldAcceptsIngest).map((f) => [f.key, f]));

  for (const [key, value] of Object.entries(r)) {
    const f = allowed.get(key);
    if (!f || value == null) continue;
    if (f.type === 'tags') {
      const arr = (Array.isArray(value) ? value : String(value).split(','))
        .map((x) => String(x).trim()).filter(Boolean);
      if (arr.length) out[key] = arr;
    } else if (f.type === 'number') {
      const n = Number(value);
      if (Number.isFinite(n)) out[key] = n;
    } else {
      const s = String(value).trim();
      if (s) out[key] = s;
    }
  }
  const warning = typeof r.warning === 'string' && r.warning.trim() ? r.warning.trim() : undefined;
  return { values: out, ...(warning ? { warning } : {}) };
}

/** Merge an ingest into a form's current values, filling ONLY what is empty.
 *
 *  This is the rule that makes ingest safe to press twice, and safe to press after typing: it can add, and
 *  it can never overwrite. Returns the merged values and the field keys it actually touched, so the UI can
 *  say what changed rather than leaving the author to diff a form by eye. */
export function mergeIngest(
  current: Record<string, unknown>,
  ingested: Record<string, unknown>,
): { values: Record<string, unknown>; filled: string[] } {
  const values = { ...current };
  const filled: string[] = [];
  for (const [k, v] of Object.entries(ingested)) {
    const existing = values[k];
    const isEmpty = existing == null || existing === '' || (Array.isArray(existing) && existing.length === 0);
    if (!isEmpty) continue;
    values[k] = v;
    filled.push(k);
  }
  return { values, filled };
}

// lib/research/catalogue-schema.ts — what we read off a plat, and how sure we are of each piece.
//
// Owner, 2026-09-23: "If the document has specific names and dates and locations and surveying
// companies/rpls names/numbers listed, we catalogue all of that information and save it to the
// file... Please make there be a confidence rating for everything. Like, if we are not confident
// about the rpls number, then it should make that known."
//
// ── WHY CONFIDENCE IS PER FIELD AND NOT PER DOCUMENT ────────────────────────────────────────────
//
// One sheet is legible in places and not in others. A 1963 plat can give up its surveyor's seal
// perfectly and its acreage not at all, and a single number for the whole document would average
// those into something true of neither. The owner's example is exactly right: the RPLS number is
// the field where being wrong is worst, and it is often the faintest thing on the sheet.
//
// ── AN ORDINAL, NOT A PERCENTAGE ────────────────────────────────────────────────────────────────
//
// A model asked for "0.73" produces false precision — the third digit means nothing and invites a
// threshold nobody can justify. Asked whether it is sure, it is usefully honest. So: high, medium,
// low. `extracted_data_points.extraction_confidence` is a DECIMAL column, so the ordinal is bucketed
// into it for compatibility, and the WORD is kept alongside as the authority.
//
// ── THE QUOTE IS WORTH MORE THAN THE RATING ─────────────────────────────────────────────────────
//
// Every value carries the verbatim text it was read from. "CHARLES L. MILLER, REGISTERED PUBLIC
// SURVEYOR NO. 719" beside the value `719` lets a person confirm it in a second. A rating alone
// tells you to doubt something without telling you how to resolve the doubt.

export const CATALOGUE_VERSION = 1;

/** How sure the reader was. Ordered: `CONFIDENCE_ORDER.indexOf(x)` gives a comparable rank. */
export const CONFIDENCE_LEVELS = ['low', 'medium', 'high'] as const;
export type Confidence = (typeof CONFIDENCE_LEVELS)[number];

/** For `extracted_data_points.extraction_confidence`, which is a DECIMAL.
 *
 *  Deliberately coarse and deliberately not 0/50/100: these are buckets standing in for a word, not
 *  a measurement, and round numbers invite being read as probabilities. The word in
 *  `confidence_reasoning` is the authority. */
export const CONFIDENCE_SCORE: Record<Confidence, number> = { high: 90, medium: 65, low: 35 };

/** One extracted value, with its provenance. */
export interface CataloguedField<T = string> {
  value: T | null;
  confidence: Confidence;
  /** Verbatim from the sheet. The thing a human checks. */
  source_text: string | null;
}

export interface CataloguedSurveyor {
  name: CataloguedField;
  firm: CataloguedField;
  /** The field the owner named specifically. Often the faintest text on an old sheet. */
  rpls_number: CataloguedField;
}

export interface DocumentCatalogue {
  subdivision_name: CataloguedField;
  surveyors: CataloguedSurveyor[];
  recorded_date: CataloguedField;
  recording_reference: CataloguedField;
  county: CataloguedField;
  state: CataloguedField;
  original_survey: CataloguedField;
  abstract_number: CataloguedField;
  lots: CataloguedField;
  blocks: CataloguedField;
  acreage: CataloguedField<number>;
  city: CataloguedField;
  owners: CataloguedField[];
  adjoining_subdivisions: CataloguedField[];
  /** Distinctive terms actually present on the sheet — the search handles, not a summary. */
  keywords: string[];
  /** Said plainly when the sheet could not be read at all, rather than returning empty fields. */
  unreadable?: boolean;
  notes?: string | null;
}

/**
 * May this value be used to satisfy a research want without a person looking?
 *
 * ── THE RULE THAT MAKES CONFIDENCE MEAN SOMETHING ───────────────────────────────────────────────
 *
 * A rating that changes nothing is decoration. This is what it changes: a `low` value is stored,
 * indexed and shown to people — it is still worth having, because a human reading the catalogue can
 * confirm it from the quote in a second — but it never silently stands in for the document. The
 * library already had one version of this failure: a "hit" that suppressed fetching a plat the run
 * then did not have. Matching a run against a doubtful RPLS number would be the same mistake with a
 * worse blast radius, because the wrong surveyor on a boundary opinion is a professional problem.
 *
 * `medium` is allowed for descriptive fields and refused for identifying ones. Being half-sure the
 * acreage is 38.5 is useful; being half-sure of a licence number is not.
 */
const IDENTIFYING_FIELDS = new Set(['rpls_number', 'recording_reference', 'abstract_number', 'recorded_date']);

export function mayMatchAutomatically(field: string, confidence: Confidence): boolean {
  if (confidence === 'low') return false;
  if (IDENTIFYING_FIELDS.has(field)) return confidence === 'high';
  return true;
}

/** Everything in a catalogue that a person should be asked to confirm, and why. */
export function needsReview(cat: DocumentCatalogue | null | undefined): Array<{ field: string; value: string; source: string | null }> {
  if (!cat) return [];
  const out: Array<{ field: string; value: string; source: string | null }> = [];
  const check = (field: string, f: CataloguedField | CataloguedField<number> | undefined) => {
    if (!f || f.value === null || f.value === undefined) return;
    if (!mayMatchAutomatically(field, f.confidence)) {
      out.push({ field, value: String(f.value), source: f.source_text });
    }
  };
  for (const [k, v] of Object.entries(cat)) {
    if (v && typeof v === 'object' && 'confidence' in v) check(k, v as CataloguedField);
  }
  for (const s of cat.surveyors ?? []) {
    check('name', s.name); check('firm', s.firm); check('rpls_number', s.rpls_number);
  }
  return out;
}

/** The categories in `extracted_data_points` each catalogue field belongs to (seeds/090's CHECK). */
export const FIELD_TO_CATEGORY: Record<string, string> = {
  subdivision_name: 'subdivision_name',
  rpls_number: 'surveyor_info',
  name: 'surveyor_info',
  firm: 'surveyor_info',
  recorded_date: 'date_reference',
  recording_reference: 'recording_reference',
  original_survey: 'legal_description',
  abstract_number: 'legal_description',
  lots: 'lot_block',
  blocks: 'lot_block',
  acreage: 'area',
  adjoining_subdivisions: 'adjoiner',
  owners: 'annotation',
  city: 'annotation',
  county: 'annotation',
  state: 'annotation',
};

/**
 * The instruction given to the reader.
 *
 * Kept here rather than in the sweeper so the prompt and the shape it must produce are one thing —
 * they drift apart the moment they live in different files, and the drift is silent because a
 * missing field just reads as "not on the sheet".
 */
export const CATALOGUE_PROMPT = `You are cataloguing a recorded subdivision plat for a Texas land-surveying firm's document library. A surveyor will rely on this catalogue to decide whether to open the sheet, and may cite what you record.

Return ONLY a JSON object. Every extracted value is an object:
  { "value": <the value, or null>, "confidence": "high" | "medium" | "low", "source_text": "<the exact words on the sheet you read it from, or null>" }

Rules that matter more than completeness:
- NEVER guess. A null with "low" confidence is correct and useful; an invented value is not.
- "high" means you can read it plainly. "medium" means you are reading a partly obscured or ambiguous mark. "low" means you are inferring it from context rather than reading it.
- source_text must be VERBATIM from the sheet — the words around the value, not a paraphrase. It is how a person checks you. Keep it under 100 characters: enough to confirm the value, not a transcription of the sheet.
- Return at most 3 surveyors, 6 owners and 6 adjoining subdivisions — the ones actually named, not every name on the sheet.
- An RPLS / licence number is the field most often wrong. If the digits are faint, broken, or you are completing them from a pattern, say "low".
- If the scan is illegible overall, set "unreadable": true and explain in "notes" rather than returning empty fields.

Shape:
{
  "subdivision_name": Field,
  "surveyors": [{ "name": Field, "firm": Field, "rpls_number": Field }],
  "recorded_date": Field,           // value as ISO yyyy-mm-dd only if a full date is shown
  "recording_reference": Field,     // e.g. "Cabinet C, Slide 123-D" or "Vol. 877, Pg. 272"
  "county": Field,
  "state": Field,
  "original_survey": Field,         // the Texas land-grant survey, e.g. "J.D. Maclin Survey"
  "abstract_number": Field,
  "lots": Field,
  "blocks": Field,
  "acreage": Field,                 // value as a number
  "city": Field,
  "owners": [Field],                // dedicators / owners named on the sheet
  "adjoining_subdivisions": [Field],
  "keywords": [string],             // 5-8 distinctive terms actually printed on the sheet
  "unreadable": boolean,
  "notes": string|null
}`;

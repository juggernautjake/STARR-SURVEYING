// worker/src/infra/canary.ts — did we get the RIGHT data, not just a page (research plan R9).
//
// ── WHY THE STRUCTURAL CHECK IS NOT ENOUGH ──────────────────────────────────────────────────────
//
// R9's first half records whether an adapter's selectors are still on the page. That catches a
// redesign. It does not catch the failure that costs a survey:
//
//   · a county switches its results grid to lazy-load, so the selector matches an empty table;
//   · a portal starts returning the FIRST result for any query, so every property looks identical;
//   · a vendor migration silently swaps acreage from acres to square feet;
//   · a session expires and the page renders a login form that happens to contain the same
//     container ids.
//
// Every one of those leaves the structure intact and the answers wrong, and the wrong answers flow
// straight into a boundary a surveyor is asked to stake. So the semantic layer asks a different
// question: for a property whose facts we already know, does the adapter still return those facts?
//
// That is what `research_adapter_canaries` is for — a golden record per adapter: a query that is
// known to work, and the fields it is known to produce.
//
// ── COMPARISON IS THE WHOLE DESIGN PROBLEM ──────────────────────────────────────────────────────
//
// A canary that demands byte-equality fails every time a county reformats a date, and an alarm that
// cries wolf is one nobody reads. A canary that is too loose passes while the data drifts. So each
// field is compared by KIND:
//
//   identifier   parcel ids, instrument numbers — normalised for case, spaces and punctuation,
//                because "R-12345" and "R12345" are the same parcel and always have been.
//   name         owner names — normalised and compared on tokens, so "SMITH, JOHN A" still matches
//                "JOHN A SMITH". A county reordering its name field is not a break.
//   measure      acreage, distances — compared with a relative tolerance, because 10.02 and 10.0200
//                are the same and a CAD rounding change is not a regression.
//   text         legal descriptions — compared on normalised content, with a similarity floor,
//                because these are long and a stray whitespace change must not fail a check.
//   exact        anything the operator marks as needing to match exactly.

export type FieldKind = 'identifier' | 'name' | 'measure' | 'text' | 'exact';

export interface ExpectedField {
  /** Canonical field name — `parcel_id`, `owner_name`, `acreage`, `legal_description`. */
  field: string;
  kind: FieldKind;
  /** The known-good value. */
  value: string;
  /** For `measure`: allowed relative difference. Defaults to 1%. */
  tolerance?: number;
  /** For `text`: minimum token overlap, 0–1. Defaults to 0.85. */
  minSimilarity?: number;
  /** When false, a miss is a warning rather than a failure. Optional fields drift legitimately. */
  required?: boolean;
}

export type FieldVerdict = 'match' | 'drift' | 'missing' | 'mismatch';

export interface FieldResult {
  field: string;
  kind: FieldKind;
  verdict: FieldVerdict;
  expected: string;
  actual: string | null;
  /** For measures and text: how close it got, 0–1. */
  similarity?: number;
  required: boolean;
}

export type CanaryVerdict = 'pass' | 'drift' | 'fail' | 'no_record';

export interface CanaryEvaluation {
  verdict: CanaryVerdict;
  /** For the health-check row's `semantic` layer. */
  severity: 'none' | 'minor' | 'major';
  producedRecord: boolean;
  fields: FieldResult[];
  missingFields: string[];
  changedFields: string[];
  summary: string;
}

// ── Normalisation ───────────────────────────────────────────────────────────────────────────────

function squash(v: string): string {
  return v.trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Identifiers: case, spaces, hyphens and dots are formatting, not identity. */
export function normaliseIdentifier(v: string): string {
  return v.toLowerCase().replace(/[\s\-._#]/g, '');
}

/** Names: compared as a set of tokens, so field-order changes are not breaks. */
export function nameTokens(v: string): string[] {
  return squash(v)
    .replace(/[.,]/g, ' ')
    .split(' ')
    .filter((t) => t.length > 1)
    .sort();
}

/** Pull a number out of "10.02 acres" / "10.02 AC" / "10.02". */
export function parseMeasure(v: string): number | null {
  const m = /-?\d+(?:\.\d+)?/.exec(v.replace(/,/g, ''));
  return m ? Number(m[0]) : null;
}

/** Token overlap, 0–1. Jaccard, which is symmetric and needs no weighting to be explainable. */
export function tokenSimilarity(a: string, b: string): number {
  const A = new Set(squash(a).split(/[^a-z0-9]+/).filter(Boolean));
  const B = new Set(squash(b).split(/[^a-z0-9]+/).filter(Boolean));
  if (A.size === 0 && B.size === 0) return 1;
  if (A.size === 0 || B.size === 0) return 0;
  let shared = 0;
  for (const t of A) if (B.has(t)) shared++;
  return shared / (A.size + B.size - shared);
}

// ── Field comparison ────────────────────────────────────────────────────────────────────────────

export function compareField(expected: ExpectedField, actualRaw: string | null | undefined): FieldResult {
  const required = expected.required !== false;
  const actual = actualRaw == null || actualRaw === '' ? null : String(actualRaw);
  const base = { field: expected.field, kind: expected.kind, expected: expected.value, actual, required };

  if (actual === null) return { ...base, verdict: 'missing' };

  switch (expected.kind) {
    case 'identifier':
      return { ...base, verdict: normaliseIdentifier(expected.value) === normaliseIdentifier(actual) ? 'match' : 'mismatch' };

    case 'name': {
      const e = nameTokens(expected.value);
      const a = nameTokens(actual);
      if (e.join(' ') === a.join(' ')) return { ...base, verdict: 'match' };
      const sim = tokenSimilarity(expected.value, actual);
      // A shared surname is not a match; a reordered full name is.
      return { ...base, verdict: sim >= 0.6 ? 'drift' : 'mismatch', similarity: sim };
    }

    case 'measure': {
      const e = parseMeasure(expected.value);
      const a = parseMeasure(actual);
      if (e === null || a === null) return { ...base, verdict: 'mismatch' };
      if (e === 0) return { ...base, verdict: a === 0 ? 'match' : 'mismatch' };
      const rel = Math.abs(a - e) / Math.abs(e);
      const tol = expected.tolerance ?? 0.01;
      // Beyond ten times the tolerance is not drift — it is a different number, and the acres/square
      // feet swap lands here rather than being averaged away as noise.
      return { ...base, verdict: rel <= tol ? 'match' : rel <= tol * 10 ? 'drift' : 'mismatch', similarity: 1 - Math.min(1, rel) };
    }

    case 'text': {
      const sim = tokenSimilarity(expected.value, actual);
      const floor = expected.minSimilarity ?? 0.85;
      return { ...base, verdict: sim >= floor ? 'match' : sim >= floor * 0.7 ? 'drift' : 'mismatch', similarity: sim };
    }

    case 'exact':
    default:
      return { ...base, verdict: expected.value === actual ? 'match' : 'mismatch' };
  }
}

// ── Whole-canary evaluation ─────────────────────────────────────────────────────────────────────

/** Compare a canary's expected fields against what the adapter actually returned.
 *
 *  `actual` being empty is its own verdict — `no_record` — and NOT a field-by-field failure. "The
 *  search returned nothing" and "the search returned the wrong property" are different breaks with
 *  different repairs, and collapsing them would send a repair agent to diagnose the wrong thing. */
export function evaluateCanary(
  expected: ExpectedField[],
  actual: Record<string, string | null | undefined> | null,
): CanaryEvaluation {
  if (!actual || Object.keys(actual).length === 0) {
    return {
      verdict: 'no_record',
      severity: 'major',
      producedRecord: false,
      fields: [],
      missingFields: expected.map((e) => e.field),
      changedFields: [],
      summary: 'The canary query returned no record at all — the search itself is broken, not the parsing.',
    };
  }

  const fields = expected.map((e) => compareField(e, actual[e.field]));
  const requiredBad = fields.filter((f) => f.required && (f.verdict === 'mismatch' || f.verdict === 'missing'));
  const anyDrift = fields.some((f) => f.verdict === 'drift');
  const optionalBad = fields.filter((f) => !f.required && f.verdict !== 'match');

  const verdict: CanaryVerdict = requiredBad.length > 0 ? 'fail' : (anyDrift || optionalBad.length > 0) ? 'drift' : 'pass';

  return {
    verdict,
    severity: verdict === 'fail' ? 'major' : verdict === 'drift' ? 'minor' : 'none',
    producedRecord: true,
    fields,
    missingFields: fields.filter((f) => f.verdict === 'missing').map((f) => f.field),
    changedFields: fields.filter((f) => f.verdict === 'mismatch' || f.verdict === 'drift').map((f) => f.field),
    summary: summarise(verdict, fields, requiredBad),
  };
}

function summarise(verdict: CanaryVerdict, fields: FieldResult[], requiredBad: FieldResult[]): string {
  if (verdict === 'pass') return `All ${fields.length} known field(s) still match for the canary property.`;
  if (verdict === 'fail') {
    // Names the field AND both values: "parcel_id changed" sends somebody to guess; showing
    // R12345 → R99999 tells them the search is matching the wrong property.
    const detail = requiredBad
      .map((f) => f.verdict === 'missing' ? `${f.field} is gone` : `${f.field}: expected "${f.expected}", got "${f.actual}"`)
      .join('; ');
    return `The canary property no longer returns its known values — ${detail}.`;
  }
  const drifted = fields.filter((f) => f.verdict !== 'match').map((f) => f.field).join(', ');
  return `The canary property still resolves, but these field(s) moved: ${drifted}. Worth a look before it becomes a failure.`;
}

/** The `semantic` half of a health check's `layer_results`, in the shape seed 371 documents and the
 *  app's repair agent already reads. */
export function toSemanticLayer(evaluation: CanaryEvaluation): Record<string, unknown> {
  return {
    severity: evaluation.severity,
    produced_record: evaluation.producedRecord,
    missing_fields: evaluation.missingFields,
    changed_fields: evaluation.changedFields,
    verdict: evaluation.verdict,
    fields: evaluation.fields.map((f) => ({
      field: f.field,
      verdict: f.verdict,
      expected: f.expected,
      actual: f.actual,
      ...(f.similarity !== undefined ? { similarity: Number(f.similarity.toFixed(3)) } : {}),
    })),
  };
}

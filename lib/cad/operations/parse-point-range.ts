// lib/cad/operations/parse-point-range.ts
//
// Phase 8 §11.7 Slice 3 — surveyor-shorthand parser for the
// "Type IDs" source mode of the cross-layer transfer dialog.
//
// Accepts the comma-separated, hyphen-range, whitespace-
// tolerant shorthand surveyors use when working from a deed
// call sheet:
//
//   "12, 14-19, 22"       → 12, 14, 15, 16, 17, 18, 19, 22
//   "12 14-19 22"         → same (whitespace = comma)
//   "1, 100-103"          → 1, 100, 101, 102, 103
//   "19-14"               → 14, 15, 16, 17, 18, 19 (reversed
//                                                   range)
//   "5"                   → 5
//
// Each parsed number is then resolved against the document's
// POINT features by `properties.pointNo`. The result groups
// every token into one of:
//
//   - resolved   — exactly one POINT matches
//   - missing    — no POINT carries that pointNo
//   - ambiguous  — two or more POINTs match (e.g. duplicate
//                  point numbers across different layers).
//                  Surveyor decides via the chip UI which to
//                  pull in.
//
// Pure: no DOM, no store reads. Caller passes the lookup
// table as a `Map<number, string[]>` so the parser stays
// testable without zustand.

export interface ParsedRangeToken {
  /** The raw text token the surveyor typed (e.g. "14-19", "22"). */
  raw: string;
  /** Numbers the token expands to. */
  numbers: number[];
  /** Per-number resolution result, in the same order as `numbers`. */
  resolutions: PointResolution[];
}

export type PointResolution =
  | { status: 'RESOLVED'; pointNo: number; featureId: string }
  | { status: 'AMBIGUOUS'; pointNo: number; featureIds: string[] }
  | { status: 'MISSING'; pointNo: number };

export interface ParsePointRangeResult {
  tokens: ParsedRangeToken[];
  /** Every successfully-resolved feature id, deduplicated. */
  resolvedFeatureIds: string[];
  /** Numbers the surveyor typed that didn't match any POINT. */
  missingNumbers: number[];
  /** Numbers that hit two-or-more POINTs — caller asks the
   *  surveyor to disambiguate. */
  ambiguousNumbers: number[];
  /** Tokens that didn't parse as a number / range at all. */
  invalidTokens: string[];
}

const RANGE_RE = /^(-?\d+)\s*-\s*(-?\d+)$/;
const SINGLE_RE = /^-?\d+$/;

/**
 * Expand `from-to` into the inclusive integer range. Handles
 * reversed input (`19-14`) by sorting endpoints. Returns null
 * for malformed input.
 */
function expandRange(from: number, to: number): number[] | null {
  if (!Number.isInteger(from) || !Number.isInteger(to)) return null;
  const lo = Math.min(from, to);
  const hi = Math.max(from, to);
  // Guard against accidental gigantic ranges (typo of an extra
  // zero on a deed sheet shouldn't lock the UI). Cap at 10,000
  // numbers per token; surveyors who genuinely need more than
  // that can split the input.
  if (hi - lo + 1 > 10_000) return null;
  const out: number[] = [];
  for (let n = lo; n <= hi; n += 1) out.push(n);
  return out;
}

/**
 * Tokenise the input string. Whitespace and commas both act
 * as separators; multiple consecutive separators collapse.
 * Empty trailing separator silently dropped.
 */
function tokenise(input: string): string[] {
  return input
    .replace(/[,;]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * Parse a single token into a number list, or return null if
 * the token isn't a valid range / single number.
 */
function parseToken(raw: string): number[] | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const range = trimmed.match(RANGE_RE);
  if (range) {
    return expandRange(parseInt(range[1], 10), parseInt(range[2], 10));
  }
  if (SINGLE_RE.test(trimmed)) {
    const n = parseInt(trimmed, 10);
    return Number.isFinite(n) ? [n] : null;
  }
  return null;
}

/**
 * Resolve the parsed numbers against the document's lookup
 * table. The lookup is `pointNo → [featureId, ...]` so
 * duplicate-point-number cases can be flagged.
 */
export function parsePointRangeString(
  input: string,
  pointNoToFeatureIds: ReadonlyMap<number, ReadonlyArray<string>>,
): ParsePointRangeResult {
  const rawTokens = tokenise(input);
  const tokens: ParsedRangeToken[] = [];
  const invalidTokens: string[] = [];
  const resolvedFeatureIds: string[] = [];
  const seen = new Set<string>();
  const missingNumbers: number[] = [];
  const ambiguousNumbers: number[] = [];

  for (const raw of rawTokens) {
    const numbers = parseToken(raw);
    if (numbers == null) {
      invalidTokens.push(raw);
      continue;
    }
    const resolutions: PointResolution[] = [];
    for (const n of numbers) {
      const matches = pointNoToFeatureIds.get(n);
      if (!matches || matches.length === 0) {
        resolutions.push({ status: 'MISSING', pointNo: n });
        missingNumbers.push(n);
      } else if (matches.length === 1) {
        const fid = matches[0];
        resolutions.push({ status: 'RESOLVED', pointNo: n, featureId: fid });
        if (!seen.has(fid)) {
          resolvedFeatureIds.push(fid);
          seen.add(fid);
        }
      } else {
        resolutions.push({ status: 'AMBIGUOUS', pointNo: n, featureIds: [...matches] });
        ambiguousNumbers.push(n);
      }
    }
    tokens.push({ raw, numbers, resolutions });
  }

  return {
    tokens,
    resolvedFeatureIds,
    missingNumbers,
    ambiguousNumbers,
    invalidTokens,
  };
}

/**
 * Helper for callers that already have a feature list: build
 * the `pointNoToFeatureIds` map in one walk. Skips features
 * without a numeric `properties.pointNo`.
 */
export function buildPointNoIndex(
  features: ReadonlyArray<{ id: string; type: string; properties: { pointNo?: unknown } }>,
): Map<number, string[]> {
  const out = new Map<number, string[]>();
  for (const f of features) {
    if (f.type !== 'POINT') continue;
    const raw = f.properties?.pointNo;
    const n = typeof raw === 'number' ? raw : typeof raw === 'string' ? parseInt(raw, 10) : NaN;
    if (!Number.isFinite(n)) continue;
    const list = out.get(n) ?? [];
    list.push(f.id);
    out.set(n, list);
  }
  return out;
}

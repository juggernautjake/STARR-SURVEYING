// lib/research/relevance.ts
//
// §10.1 (subject anchor) + §10.3 (relevance-gated classification)
// of docs/planning/completed/RESEARCH_SOFTWARE_OPTIMIZATION_2026-06-21.md.
//
// Pure helpers — no DB, no network. The AI extractor uses these to
// answer one question for every datum it pulls off a county portal:
//
//   "Is this about the subject property, an adjoiner, or someone
//    else's parcel?"
//
// §10.2 (adjoiner resolution from GIS adjacency + deed-calls) builds
// the inputs to these helpers in a later slice. The pipeline wiring
// (§10.4 two-pass for large multi-parcel docs, §10.5 spatial result
// filtering, §10.6 disambiguation surfacing) consumes the output.

import type {
  CanonicalProperty,
  CanonicalValue,
  RelevanceClassification,
  RelevanceContext,
  RelevanceTag,
} from './canonical-schema';
import { unwrap } from './canonical-schema';

// ── §10.1 Subject anchor resolution ──────────────────────────────

/** The set of identities that uniquely (or near-uniquely) identify
 *  the subject property. Stronger identities resolve to a single
 *  parcel; weaker ones (owner, address) can match many. The
 *  extractor uses the FIRST anchor that resolves. */
export type SubjectAnchorKind =
  | 'parcel_id'
  | 'geometry_centroid'
  | 'legal_description'
  | 'owner'
  | 'address';

export interface SubjectAnchor {
  kind: SubjectAnchorKind;
  /** The normalized value the matcher compares against. */
  value: string | [number, number];
  /** Strength of the anchor on a 0–1 scale. Used to set the
   *  per-classification confidence floor. */
  strength: number;
  /** Human-readable rationale ("parcel_id from the project subject"). */
  source: string;
}

/** Order matters — first to resolve wins. Anchors below
 *  `parcel_id` are still produced (and stamped on the
 *  `SubjectAnchor`) but the classifier prefers stronger ones when
 *  multiple match. */
const ANCHOR_ORDER: SubjectAnchorKind[] = [
  'parcel_id',
  'geometry_centroid',
  'legal_description',
  'owner',
  'address',
];

const STRENGTH: Record<SubjectAnchorKind, number> = {
  parcel_id:         1.0,
  geometry_centroid: 0.95,
  legal_description: 0.8,
  owner:             0.55,
  address:           0.45,
};

/** Produce every anchor the project subject can hand the extractor,
 *  ordered strongest-first. Pure. */
export function resolveSubjectAnchors(
  subject: RelevanceContext['subject'],
): SubjectAnchor[] {
  const out: SubjectAnchor[] = [];
  if (subject.parcel_id) {
    out.push({
      kind: 'parcel_id',
      value: normalizeParcelId(subject.parcel_id),
      strength: STRENGTH.parcel_id,
      source: 'project subject.parcel_id',
    });
  }
  if (subject.centroid_lonlat) {
    out.push({
      kind: 'geometry_centroid',
      value: subject.centroid_lonlat,
      strength: STRENGTH.geometry_centroid,
      source: 'project subject.centroid_lonlat',
    });
  }
  if (subject.legal_description) {
    out.push({
      kind: 'legal_description',
      value: normalizeLegal(subject.legal_description),
      strength: STRENGTH.legal_description,
      source: 'project subject.legal_description',
    });
  }
  if (subject.owner) {
    out.push({
      kind: 'owner',
      value: normalizeOwnerName(subject.owner),
      strength: STRENGTH.owner,
      source: 'project subject.owner',
    });
  }
  if (subject.address) {
    out.push({
      kind: 'address',
      value: normalizeAddress(subject.address),
      strength: STRENGTH.address,
      source: 'project subject.address',
    });
  }
  // Sort by ANCHOR_ORDER (stable across runs).
  out.sort((a, b) => ANCHOR_ORDER.indexOf(a.kind) - ANCHOR_ORDER.indexOf(b.kind));
  return out;
}

/** True when the project subject can be anchored to at least one
 *  identity. Surfaces the §10.6 "no anchor, can't extract anything"
 *  state to the caller. */
export function hasUsableAnchor(subject: RelevanceContext['subject']): boolean {
  return resolveSubjectAnchors(subject).length > 0;
}

// ── §10.3 Relevance classification ───────────────────────────────

/** What the extractor pulled off a portal and now wants classified. */
export interface RelevanceCandidate {
  /** Optional — the vendor parcel id the candidate belongs to. When
   *  present + matches a subject/adjoiner parcel_id, this is the
   *  highest-confidence match. */
  parcel_id?: string;
  /** Optional centroid (WGS84) for distance-based matching. */
  centroid_lonlat?: [number, number];
  legal_description?: string;
  owner?: string;
  address?: string;
}

/** Classify one extracted candidate against the project's relevance
 *  context. Pure. The classifier walks the strongest anchors first
 *  and stops at the first confident match; if nothing matches it
 *  returns `unrelated` so the extractor drops the candidate. */
export function classifyRelevance(
  candidate: RelevanceCandidate,
  context: RelevanceContext,
): RelevanceClassification {
  if (!context.subject || !hasUsableAnchor(context.subject)) {
    return {
      tag: 'unknown',
      confidence: 0,
      rationale: 'no usable subject anchor on the project',
    };
  }

  // 1. Try the subject anchors strongest-first.
  for (const anchor of resolveSubjectAnchors(context.subject)) {
    const m = matchesAnchor(candidate, anchor);
    if (m) {
      return {
        tag: 'subject',
        matched_parcel_ref: context.subject.parcel_id ?? candidate.parcel_id,
        confidence: m.confidence,
        rationale: `${anchor.kind} match: ${m.reason}`,
      };
    }
  }

  // 2. Try the adjoiners. Adjoiner identities are typically weaker
  //    than the subject's (we don't have geometry centroids for
  //    them yet), so an adjoiner parcel_id or owner match is enough.
  for (const adj of context.adjoiners ?? []) {
    if (adj.parcel_id && candidate.parcel_id && sameParcelId(adj.parcel_id, candidate.parcel_id)) {
      return {
        tag: 'adjoiner',
        matched_parcel_ref: adj.parcel_id,
        confidence: 0.95,
        rationale: `parcel_id match against adjoiner from ${adj.source}`,
      };
    }
    if (adj.owner && candidate.owner && sameOwner(adj.owner, candidate.owner)) {
      return {
        tag: 'adjoiner',
        matched_parcel_ref: adj.parcel_id,
        confidence: 0.6,
        rationale: `owner match against adjoiner from ${adj.source}`,
      };
    }
    if (
      adj.legal_reference &&
      candidate.legal_description &&
      legalReferenceMatches(adj.legal_reference, candidate.legal_description)
    ) {
      return {
        tag: 'adjoiner',
        matched_parcel_ref: adj.parcel_id,
        confidence: 0.7,
        rationale: `legal-reference match against adjoiner from ${adj.source}`,
      };
    }
  }

  // 3. Nothing matched.
  return {
    tag: 'unrelated',
    confidence: 0.9,
    rationale: 'no anchor matched; candidate is outside the relevance set',
  };
}

/** Convenience: classify every canonical property in a batch + drop
 *  the unrelated ones. Pure. Returns the kept records (with
 *  `relevance` + per-field stamps already applied) + a count of
 *  what was dropped so the caller can show "we excluded N unrelated
 *  parcels" to the user. */
export function filterRelevantRecords(
  records: CanonicalProperty[],
  context: RelevanceContext,
): { kept: CanonicalProperty[]; dropped_count: number; classifications: RelevanceClassification[] } {
  const kept: CanonicalProperty[] = [];
  const classifications: RelevanceClassification[] = [];
  let dropped = 0;
  for (const r of records) {
    const cand = candidateFromRecord(r);
    const c = classifyRelevance(cand, context);
    classifications.push(c);
    if (c.tag === 'subject' || c.tag === 'adjoiner' || c.tag === 'unknown') {
      kept.push({ ...r, relevance: c.tag });
    } else {
      dropped += 1;
    }
  }
  return { kept, dropped_count: dropped, classifications };
}

// ── Internal: anchor matching ────────────────────────────────────

interface AnchorMatch {
  confidence: number;
  reason: string;
}

function matchesAnchor(candidate: RelevanceCandidate, anchor: SubjectAnchor): AnchorMatch | null {
  switch (anchor.kind) {
    case 'parcel_id':
      if (!candidate.parcel_id) return null;
      if (sameParcelId(anchor.value as string, candidate.parcel_id)) {
        return { confidence: 1.0, reason: 'parcel_id matched exactly' };
      }
      return null;

    case 'geometry_centroid': {
      if (!candidate.centroid_lonlat) return null;
      const distMeters = haversineMeters(
        anchor.value as [number, number],
        candidate.centroid_lonlat,
      );
      // <= 25m → almost certainly the same parcel (subject)
      // <= 150m → very likely an adjoiner; we still tag as subject
      //          here because centroids on small parcels overlap; the
      //          adjoiner check above runs first when geometry is
      //          available on adjoiners.
      if (distMeters <= 25) {
        return { confidence: 0.95, reason: `centroid within ${distMeters.toFixed(1)}m` };
      }
      return null;
    }

    case 'legal_description':
      if (!candidate.legal_description) return null;
      if (legalReferenceMatches(anchor.value as string, candidate.legal_description)) {
        return { confidence: 0.85, reason: 'legal description shares lot/block/abstract tokens' };
      }
      return null;

    case 'owner':
      if (!candidate.owner) return null;
      if (sameOwner(anchor.value as string, candidate.owner)) {
        return { confidence: 0.6, reason: 'owner normalized name matched' };
      }
      return null;

    case 'address':
      if (!candidate.address) return null;
      if (sameAddress(anchor.value as string, candidate.address)) {
        return { confidence: 0.55, reason: 'address normalized form matched' };
      }
      return null;
  }
}

// ── Normalization helpers ────────────────────────────────────────
//
// Parcel IDs and legal text vary across vendors in cosmetic ways
// that matter for comparison: leading zeros, dashes, casing, the
// "ETUX" marker on owners, "0" filler on lot numbers, etc. The
// helpers below collapse them to comparable forms.

export function normalizeParcelId(raw: string): string {
  const cleaned = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
  // Strip leading zeros from any numeric run (handles bare numerics
  // like "00012345" → "12345" AND letter-prefixed ones like
  // "R-00012345" → "R12345"). Lookbehind matches the start of the
  // string OR a letter immediately before the run of zeros.
  return cleaned.replace(/(?<=^|[A-Z])0+(?=\d)/g, '');
}

export function sameParcelId(a: string, b: string): boolean {
  return normalizeParcelId(a) === normalizeParcelId(b);
}

const OWNER_NOISE = new Set([
  'ETUX', 'ETVIR', 'ETAL', 'AND', '&',
  'JR', 'SR', 'II', 'III', 'IV',
  'TRUSTEE', 'TRUST', 'ESTATE', 'OF',
  'INC', 'LLC', 'LP', 'LLP', 'CORP', 'COMPANY', 'CO',
  'WIFE', 'HUSBAND', 'SPOUSE',
]);

export function normalizeOwnerName(raw: string): string {
  const cleaned = raw
    .toUpperCase()
    .replace(/[,.]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const tokens = cleaned.split(' ').filter((t) => t && !OWNER_NOISE.has(t));
  return tokens.sort().join(' ');
}

export function sameOwner(a: string, b: string): boolean {
  const na = normalizeOwnerName(a);
  const nb = normalizeOwnerName(b);
  if (!na || !nb) return false;
  return na === nb;
}

export function normalizeAddress(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/[.,]/g, ' ')
    .replace(/\bROAD\b/g, 'RD')
    .replace(/\bSTREET\b/g, 'ST')
    .replace(/\bAVENUE\b/g, 'AVE')
    .replace(/\bDRIVE\b/g, 'DR')
    .replace(/\bBOULEVARD\b/g, 'BLVD')
    .replace(/\bHIGHWAY\b/g, 'HWY')
    .replace(/\bSUITE\b/g, 'STE')
    .replace(/\s+/g, ' ')
    .trim();
}

export function sameAddress(a: string, b: string): boolean {
  return normalizeAddress(a) === normalizeAddress(b);
}

/** Collapse a legal description into the structured tokens that
 *  actually identify the parcel: subdivision, lot/block, section,
 *  tract, abstract number. Two legal strings match if their token
 *  sets intersect on a strong identifier (lot+block, abstract+tract,
 *  subdivision+lot, etc.). */
export function normalizeLegal(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/[.,]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const LEGAL_KEY_PATTERNS: Array<{ key: string; re: RegExp }> = [
  { key: 'LOT',      re: /\bLOT\s+([A-Z0-9-]+)/g },
  { key: 'BLOCK',    re: /\bBLOCK\s+([A-Z0-9-]+)/g },
  { key: 'TRACT',    re: /\bTRACT\s+([A-Z0-9-]+)/g },
  { key: 'SECTION',  re: /\bSECTION\s+([A-Z0-9-]+)/g },
  { key: 'ABSTRACT', re: /\bABSTRACT\s+([A-Z0-9-]+)|\bABS\s+([A-Z0-9-]+)|\bA-(\d+)/g },
];

function legalTokens(raw: string): Set<string> {
  const norm = normalizeLegal(raw);
  const out = new Set<string>();
  for (const { key, re } of LEGAL_KEY_PATTERNS) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(norm))) {
      const val = m[1] ?? m[2] ?? m[3];
      if (val) out.add(`${key}:${val}`);
    }
  }
  return out;
}

/** A legal-reference match requires: (1) at least one strong
 *  token (LOT:42, BLOCK:A, ABSTRACT:1234) is shared between the
 *  two descriptions, AND (2) no conflict on any shared key — if
 *  both sides specify a LOT they must agree on the value, otherwise
 *  they're describing different parcels in the same subdivision.
 *  Free prose ("BEING A TRACT OF LAND") doesn't count. */
export function legalReferenceMatches(a: string, b: string): boolean {
  const ta = legalTokens(a);
  const tb = legalTokens(b);
  if (ta.size === 0 || tb.size === 0) return false;

  // Group b's tokens by key so we can detect conflicts (same key,
  // different values).
  const tbByKey = new Map<string, Set<string>>();
  for (const tok of tb) {
    const idx = tok.indexOf(':');
    const k = tok.slice(0, idx);
    const v = tok.slice(idx + 1);
    if (!tbByKey.has(k)) tbByKey.set(k, new Set());
    tbByKey.get(k)!.add(v);
  }

  let shared = 0;
  for (const tok of ta) {
    const idx = tok.indexOf(':');
    const k = tok.slice(0, idx);
    const v = tok.slice(idx + 1);
    const tbVals = tbByKey.get(k);
    if (!tbVals) continue;          // b doesn't constrain this key → fine
    if (!tbVals.has(v)) return false; // conflict on a key both sides specify
    shared += 1;
  }
  return shared > 0;
}

// ── Geometry helper ──────────────────────────────────────────────

/** Great-circle distance in meters between two [lon, lat] points.
 *  Cheap; sufficient for the small distances (<1km) the relevance
 *  classifier compares. */
export function haversineMeters(a: [number, number], b: [number, number]): number {
  const R = 6371008.8;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b[1] - a[1]);
  const dLon = toRad(b[0] - a[0]);
  const lat1 = toRad(a[1]);
  const lat2 = toRad(b[1]);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

// ── CanonicalProperty → RelevanceCandidate ───────────────────────

/** Flatten a canonical property into the lightweight shape the
 *  classifier needs. Handles both bare-value and wrapped fields. */
export function candidateFromRecord(rec: CanonicalProperty): RelevanceCandidate {
  const owner = unwrap(rec.owner);
  const legal = unwrap(rec.legal);
  const situs = unwrap(rec.situs_address);
  const mailing = unwrap(rec.mailing_address);
  const geom = unwrap(rec.geometry);
  return {
    parcel_id: rec.parcel_id,
    centroid_lonlat: geom ? geojsonCentroid(geom.geojson as GeoJsonPolygonish) : undefined,
    legal_description: legal?.text,
    owner: owner?.display_name,
    address: situs?.formatted ?? mailing?.formatted,
  };
}

type GeoJsonPolygonish =
  | { type: 'Polygon'; coordinates: number[][][] }
  | { type: 'MultiPolygon'; coordinates: number[][][][] };

/** Cheap centroid of a GeoJSON Polygon / MultiPolygon (arithmetic
 *  mean of vertices on the outer ring of the first part). Adequate
 *  for distance bucketing; we don't need the area-weighted true
 *  centroid here. */
export function geojsonCentroid(g: GeoJsonPolygonish): [number, number] | undefined {
  const ring =
    g.type === 'Polygon'
      ? g.coordinates[0]
      : g.coordinates[0]?.[0];
  if (!ring || ring.length === 0) return undefined;
  let sx = 0;
  let sy = 0;
  let n = 0;
  for (const [x, y] of ring) {
    sx += x;
    sy += y;
    n += 1;
  }
  return n > 0 ? [sx / n, sy / n] : undefined;
}

// ── Helper to drop a single classification onto a wrapped field ──

/** Apply a relevance classification to a single CanonicalValue<T>.
 *  Pure. Returns the field unchanged when the classification is
 *  `unknown` so we never overwrite a real tag with uncertainty. */
export function stampFieldRelevance<T>(
  field: CanonicalValue<T>,
  c: RelevanceClassification,
): CanonicalValue<T> {
  if (c.tag === 'unknown') return field;
  return {
    ...field,
    relevance: c.tag as RelevanceTag,
    parcel_ref: c.matched_parcel_ref,
  };
}

// lib/research/adjoiner-extraction.ts
//
// §10.2 (deed-call half) of
// docs/planning/completed/RESEARCH_SOFTWARE_OPTIMIZATION_2026-06-21.md.
//
// Pure NLP — extract the adjoiner references named in a legal
// description ("thence along the South line of the John Smith
// tract", "along the West line of Lot 7 Block A", "Survey A-1234",
// deed citations like "Vol. 1234 Pg. 567" / "Doc. 2024-12345"). The
// output feeds the `RelevanceContext.adjoiners` array that
// `classifyRelevance` from slice 3 consumes.
//
// Conservative-by-design: false positives are bad (we'd pull
// unrelated parcels into the boundary), false negatives are OK
// (a missed adjoiner just means we don't auto-include it — the user
// can add it manually via the §8 registration wizard's adjoiner
// editor in a future slice).
//
// The GIS-adjacency half of §10.2 (polygon-touching query against
// the CAD parcel layer) is a separate slice — it needs either a
// pure polygon-intersection algorithm or a network call to the
// county's ArcGIS endpoint. This file is internal-only, deterministic,
// and testable without either.

import type { RelevanceContext } from './canonical-schema';
import { normalizeOwnerName } from './relevance';

/** Output type matches the shape `RelevanceContext.adjoiners[number]`
 *  expects (with `source: 'deed_call'` so we can tell GIS-derived
 *  from text-derived adjoiners apart). */
export type DeedCallAdjoiner = RelevanceContext['adjoiners'][number] & {
  /** Free-form rationale ("matched 'JOHN SMITH tract' near 'thence
   *  along'") so a human reviewer can see why we surfaced it. */
  evidence: string;
};

interface RawHit {
  kind: 'named_tract' | 'lot_block' | 'abstract' | 'deed_citation' | 'survey';
  owner?: string;
  legal_reference?: string;
  evidence: string;
}

/** Apex entry point. Pure. Returns the deduped list of adjoiners
 *  the deed-call extractor found in the legal description. Empty
 *  array when nothing matched — never throws. */
export function extractDeedCallAdjoiners(legalDescription: string): DeedCallAdjoiner[] {
  if (!legalDescription || !legalDescription.trim()) return [];

  const hits: RawHit[] = [];
  hits.push(...findNamedTracts(legalDescription));
  hits.push(...findLotBlockReferences(legalDescription));
  hits.push(...findAbstractReferences(legalDescription));
  hits.push(...findDeedCitations(legalDescription));
  hits.push(...findSurveyNames(legalDescription));

  return dedupeAdjoiners(hits);
}

// ── Named tract / property / heirs ───────────────────────────────
//
// Patterns the extractor recognizes in Texas deed prose:
//   - "the [OWNER NAME] tract"
//   - "the [OWNER NAME] property"
//   - "the [OWNER NAME] heirs"
//   - "[OWNER NAME] estate"
//   - "land owned by [OWNER NAME]"
// Owner names are 1–4 capitalized tokens; we exclude common nouns
// ("BEING", "TRACT", "ACRE", etc.) so we don't pluck "the South
// boundary tract" as an owner.

const COMMON_NOUNS_BLOCKLIST = new Set([
  'THE', 'A', 'AN', 'AND', 'OF', 'IN', 'ON', 'AT', 'TO', 'FROM', 'BY', 'WITH',
  'NORTH', 'SOUTH', 'EAST', 'WEST', 'NORTHEAST', 'NORTHWEST', 'SOUTHEAST', 'SOUTHWEST',
  'BEING', 'BEGINNING', 'CONTAINING', 'CALLED', 'KNOWN', 'DESCRIBED',
  'TRACT', 'PROPERTY', 'PARCEL', 'LAND', 'LANDS', 'BOUNDARY', 'LINE', 'LINES',
  'ACRE', 'ACRES', 'CORNER', 'POINT', 'STAKE', 'IRON', 'ROD', 'PIPE',
  'SUBDIVISION', 'ADDITION', 'SECTION', 'BLOCK', 'LOT', 'PLAT', 'ABSTRACT', 'A',
  'STREET', 'ROAD', 'AVENUE', 'DRIVE', 'BOULEVARD', 'HIGHWAY',
  'FEET', 'FOOT', 'VARAS', 'CHAINS', 'RODS',
  'COUNTY', 'TEXAS', 'STATE',
]);

const NAMED_TRACT_RE =
  /\b(?:the\s+)?((?:[A-Z][A-Za-z'.]+(?:\s+[A-Z][A-Za-z'.]+){0,3}))\s+(tract|property|heirs|estate)\b/g;
const LAND_OWNED_BY_RE =
  /\bland\s+owned\s+by\s+((?:[A-Z][A-Za-z'.]+(?:\s+[A-Z][A-Za-z'.]+){0,3}))/g;

function findNamedTracts(text: string): RawHit[] {
  const out: RawHit[] = [];

  NAMED_TRACT_RE.lastIndex = 0;
  let m;
  while ((m = NAMED_TRACT_RE.exec(text))) {
    const candidate = m[1]?.trim();
    if (!candidate) continue;
    if (!isPlausibleOwner(candidate)) continue;
    out.push({
      kind: 'named_tract',
      owner: candidate,
      evidence: `matched "${candidate} ${m[2]}" in deed prose`,
    });
  }

  LAND_OWNED_BY_RE.lastIndex = 0;
  while ((m = LAND_OWNED_BY_RE.exec(text))) {
    const candidate = m[1]?.trim();
    if (!candidate) continue;
    if (!isPlausibleOwner(candidate)) continue;
    out.push({
      kind: 'named_tract',
      owner: candidate,
      evidence: `matched "land owned by ${candidate}"`,
    });
  }

  return out;
}

function isPlausibleOwner(name: string): boolean {
  const tokens = name.toUpperCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return false;
  // Every token must be either uppercase-initial (we matched [A-Z]...)
  // and NOT in the common-nouns blocklist. Single-token owners are
  // allowed (e.g. "Smith tract") but only when the token is at least
  // 3 characters — guards against "I tract" / "A tract".
  if (tokens.length === 1 && tokens[0]!.length < 3) return false;
  for (const t of tokens) {
    if (COMMON_NOUNS_BLOCKLIST.has(t)) return false;
  }
  return true;
}

// ── Lot N Block X references ─────────────────────────────────────
//
// "Lot 7 Block A" / "Lot 7, Block A" / "Lots 4-6 Block C" — each is
// a potential adjoiner if the subject is a different lot/block in
// the same subdivision. We emit the full "LOT N BLOCK X" string as
// the `legal_reference` so the §10.3 classifier can match it
// against any candidate's `legal.text`.

const LOT_BLOCK_RE =
  /\bLOTS?\s+([A-Z0-9-]+(?:\s*[-,&]\s*[A-Z0-9-]+)*)\s*,?\s*BLOCK\s+([A-Z0-9-]+)/gi;

function findLotBlockReferences(text: string): RawHit[] {
  const out: RawHit[] = [];
  LOT_BLOCK_RE.lastIndex = 0;
  let m;
  while ((m = LOT_BLOCK_RE.exec(text))) {
    const lot = m[1]!.trim().replace(/\s+/g, '');
    const block = m[2]!.trim();
    out.push({
      kind: 'lot_block',
      legal_reference: `LOT ${lot} BLOCK ${block}`,
      evidence: `matched "Lot ${lot} Block ${block}"`,
    });
  }
  return out;
}

// ── Abstract / survey-number references ──────────────────────────
//
// Texas original surveys are identified by an abstract number:
// "A-1234" or "Abstract 1234" or "A 1234". The full reference often
// includes the surveyor's name ("J. Smith Survey, A-1234") so the
// `legal_reference` we emit is the bare abstract for stable matching
// + the named survey as a fallback `owner` field.

const ABSTRACT_RE = /\bABSTRACT\s+(\d+)|\bA-\s*(\d+)|\bA\s+(\d+)\b/gi;

function findAbstractReferences(text: string): RawHit[] {
  const out: RawHit[] = [];
  ABSTRACT_RE.lastIndex = 0;
  let m;
  while ((m = ABSTRACT_RE.exec(text))) {
    const num = m[1] ?? m[2] ?? m[3];
    if (!num) continue;
    out.push({
      kind: 'abstract',
      legal_reference: `ABSTRACT ${num}`,
      evidence: `matched abstract reference "${m[0]}"`,
    });
  }
  return out;
}

// ── Survey names ("the J. Smith Survey") ─────────────────────────
//
// Same pattern as named tracts but with the trigger word "Survey".

const SURVEY_RE =
  /\b(?:the\s+)?((?:[A-Z]\.?\s+)?[A-Z][A-Za-z.]+(?:\s+[A-Z][A-Za-z.]+){0,2})\s+survey\b/gi;

function findSurveyNames(text: string): RawHit[] {
  const out: RawHit[] = [];
  SURVEY_RE.lastIndex = 0;
  let m;
  while ((m = SURVEY_RE.exec(text))) {
    const candidate = m[1]?.trim();
    if (!candidate) continue;
    // Drop bare "the" or surveys we already matched above
    if (!isPlausibleOwner(candidate.replace(/^[A-Z]\.?\s+/, ''))) continue;
    out.push({
      kind: 'survey',
      owner: candidate,
      evidence: `matched "${candidate} Survey"`,
    });
  }
  return out;
}

// ── Deed citations ───────────────────────────────────────────────
//
// "Vol. 1234, Pg. 567" / "Volume 1234 Page 567" / "Doc. 2024-12345"
// "Instrument No. 2024-12345". These cite specific instruments that
// reference adjoining parcels by their own legal descriptions.

const VOL_PAGE_RE =
  /\bVOL(?:UME)?\.?\s+(\d+)[,\s]+(?:PG|PAGE)\.?\s+(\d+)/gi;
const DOC_RE =
  /\b(?:DOC(?:UMENT)?|INSTRUMENT)\.?\s+(?:NO\.?\s+)?([0-9]{4}-?[0-9]{4,})/gi;

function findDeedCitations(text: string): RawHit[] {
  const out: RawHit[] = [];

  VOL_PAGE_RE.lastIndex = 0;
  let m;
  while ((m = VOL_PAGE_RE.exec(text))) {
    out.push({
      kind: 'deed_citation',
      legal_reference: `VOL ${m[1]} PG ${m[2]}`,
      evidence: `matched volume/page citation "${m[0]}"`,
    });
  }

  DOC_RE.lastIndex = 0;
  while ((m = DOC_RE.exec(text))) {
    out.push({
      kind: 'deed_citation',
      legal_reference: `DOC ${m[1]}`,
      evidence: `matched document citation "${m[0]}"`,
    });
  }

  return out;
}

// ── Dedupe ───────────────────────────────────────────────────────
//
// A legal description routinely references the same adjoiner
// multiple times ("along the South line of the John Smith tract …
// thence with the John Smith tract"). Collapse on a normalized
// fingerprint so the relevance set doesn't carry duplicates.

function dedupeAdjoiners(hits: RawHit[]): DeedCallAdjoiner[] {
  const seen = new Map<string, DeedCallAdjoiner>();
  for (const h of hits) {
    const key = fingerprint(h);
    if (seen.has(key)) {
      // Append the new evidence so a multi-mention adjoiner shows
      // every place it appeared. Cap length so a pathological
      // input can't blow up the rationale field.
      const prev = seen.get(key)!;
      const merged = `${prev.evidence}; ${h.evidence}`;
      seen.set(key, { ...prev, evidence: merged.slice(0, 400) });
      continue;
    }
    seen.set(key, {
      parcel_id: undefined,
      owner: h.owner,
      legal_reference: h.legal_reference,
      source: 'deed_call',
      evidence: h.evidence,
    });
  }
  return Array.from(seen.values());
}

function fingerprint(h: RawHit): string {
  if (h.owner) return `o:${normalizeOwnerName(h.owner)}`;
  if (h.legal_reference) return `l:${h.legal_reference.toUpperCase().replace(/\s+/g, ' ')}`;
  return `k:${h.kind}:${h.evidence}`;
}

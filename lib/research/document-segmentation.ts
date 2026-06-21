// lib/research/document-segmentation.ts
//
// §10.4 (first-pass segmentation) of
// docs/planning/in-progress/RESEARCH_SOFTWARE_OPTIMIZATION_2026-06-21.md.
//
// Large multi-parcel documents (subdivision plats with 100 lots,
// multi-tract deeds with adjoining tracts, bulk clerk-record dumps)
// would blow up the per-token cost of the §10.4 deep extractor AND
// bleed unrelated data into the boundary if we naively fed the whole
// document at it.
//
// This is the cheap pass: split the document into candidate parcel
// segments using deterministic deed-call patterns (slice 4), score
// each segment by overlap with the relevance context (slices 3+4+5
// downstream), and return the top-N segments for the expensive pass
// to deep-extract. Pure — no AI calls, no DB, no network.

import type { RelevanceContext } from './canonical-schema';
import { extractDeedCallAdjoiners, type DeedCallAdjoiner } from './adjoiner-extraction';
import { normalizeOwnerName } from './relevance';

/** One slice of the document corresponding to (most likely) a
 *  single parcel. */
export interface DocumentSegment {
  /** The segment's text. */
  text: string;
  /** Byte offsets into the original document for re-locating the
   *  segment. */
  span: [number, number];
  /** Adjoiner-style references found inside the segment via the
   *  slice-4 extractor. The expensive pass will use these to
   *  decide which parcel the segment describes. */
  references: DeedCallAdjoiner[];
  /** Composite relevance score (0..1) — how strongly the segment
   *  appears to be about the subject + its adjoiners. The
   *  expensive pass typically only runs on segments with
   *  `relevance_score ≥ scoreFloor`. */
  relevance_score: number;
  /** Human-readable rationale ("matched subject parcel_id 12345;
   *  also references adjoiner Mary Jones"). Surfaced in the §10
   *  preview so a reviewer can see why we picked the segments we
   *  picked. */
  rationale: string;
}

export interface SegmentationOptions {
  /** Drop segments with composite score below this floor. Default
   *  0.1 (everything that doesn't share a single token with the
   *  relevance set is dropped). */
  scoreFloor?: number;
  /** Cap the output at N segments. Default 25 — enough headroom
   *  for the subject + most of its adjoiners, far below the
   *  Sonnet-pass token budget. */
  limit?: number;
}

/** Pure. Segment a long multi-parcel document by deed-call markers,
 *  score each segment by overlap with the relevance context, return
 *  the top-N segments for the expensive extractor pass. */
export function segmentMultiParcelDocument(
  text: string,
  context: RelevanceContext,
  opts: SegmentationOptions = {},
): DocumentSegment[] {
  if (!text || !text.trim()) return [];

  const floor = opts.scoreFloor ?? 0.1;
  const limit = opts.limit ?? 25;

  const markers = findParcelMarkers(text);
  if (markers.length === 0) {
    // No segmentation markers — treat the whole document as one
    // segment so the caller still gets something to grade.
    return rankSingleton(text, context, floor, limit);
  }

  const segments = buildSegments(text, markers);
  const scored = scoreSegments(segments, context);
  return scored.filter((s) => s.relevance_score >= floor).slice(0, limit);
}

// ── Marker detection ─────────────────────────────────────────────
//
// Each marker is a strong "this is a new parcel" signal in Texas
// deed prose. We use the same family of patterns the slice-4
// adjoiner extractor knows about so the two pieces stay consistent.

interface ParcelMarker {
  start: number;
  end: number;
  kind: 'lot_block' | 'tract' | 'abstract' | 'deed_citation' | 'beginning';
  raw: string;
}

const MARKER_PATTERNS: Array<{ kind: ParcelMarker['kind']; re: RegExp }> = [
  // BEGINNING tends to start a new parcel description in long
  // deeds; gives the segmenter a natural boundary even when no
  // explicit Lot/Block follows.
  { kind: 'beginning', re: /\bBEGINNING\b/gi },
  { kind: 'lot_block', re: /\bLOTS?\s+[A-Z0-9-]+(?:\s*[-,&]\s*[A-Z0-9-]+)*\s*,?\s*BLOCK\s+[A-Z0-9-]+/gi },
  { kind: 'tract',     re: /\bTRACT\s+(?:[A-Z0-9-]+|\#?\d+)/gi },
  { kind: 'abstract',  re: /\bA-\s*\d+|\bABSTRACT\s+\d+/gi },
  { kind: 'deed_citation', re: /\bVOL(?:UME)?\.?\s+\d+[,\s]+(?:PG|PAGE)\.?\s+\d+/gi },
];

function findParcelMarkers(text: string): ParcelMarker[] {
  const found: ParcelMarker[] = [];
  for (const { kind, re } of MARKER_PATTERNS) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      found.push({ start: m.index, end: m.index + m[0].length, kind, raw: m[0] });
    }
  }
  // Sort by position; dedupe markers that overlap (keep the first).
  found.sort((a, b) => a.start - b.start);
  const deduped: ParcelMarker[] = [];
  for (const m of found) {
    const last = deduped[deduped.length - 1];
    if (last && m.start < last.end) continue;
    deduped.push(m);
  }
  return deduped;
}

// ── Segment construction ─────────────────────────────────────────

interface RawSegment {
  text: string;
  span: [number, number];
}

function buildSegments(text: string, markers: ParcelMarker[]): RawSegment[] {
  const segs: RawSegment[] = [];

  // Anything before the first marker is "preamble" — usually
  // boilerplate, low information value. We emit it so the score
  // function can rate it correctly (typically 0) without losing
  // the byte-offset accounting.
  if (markers[0]!.start > 0) {
    segs.push({ text: text.slice(0, markers[0]!.start), span: [0, markers[0]!.start] });
  }

  for (let i = 0; i < markers.length; i += 1) {
    const start = markers[i]!.start;
    const end = i + 1 < markers.length ? markers[i + 1]!.start : text.length;
    segs.push({ text: text.slice(start, end), span: [start, end] });
  }

  // Drop fully-empty (whitespace-only) segments — pathological
  // input where two markers sit adjacent.
  return segs.filter((s) => s.text.trim().length > 0);
}

// ── Scoring ─────────────────────────────────────────────────────

function scoreSegments(rawSegments: RawSegment[], context: RelevanceContext): DocumentSegment[] {
  const subjectTokens = buildSubjectTokenSet(context);
  const adjoinerTokens = buildAdjoinerTokenSet(context);

  const out: DocumentSegment[] = [];
  for (const seg of rawSegments) {
    const references = extractDeedCallAdjoiners(seg.text);
    const refTokens = referenceTokenSet(references, seg.text);

    let score = 0;
    const hits: string[] = [];

    // Subject overlap is worth ~1.0 per hit; adjoiner overlap ~0.5.
    for (const t of refTokens) {
      if (subjectTokens.has(t)) {
        score += 1.0;
        hits.push(`subject ${t}`);
      } else if (adjoinerTokens.has(t)) {
        score += 0.5;
        hits.push(`adjoiner ${t}`);
      }
    }

    // Normalize against the total reference count so a long segment
    // with many random references doesn't dominate just by
    // hit-volume.
    const denom = Math.max(refTokens.size, 1) + 1;
    const normalized = score / denom;

    out.push({
      text: seg.text,
      span: seg.span,
      references,
      relevance_score: Math.max(0, Math.min(1, normalized)),
      rationale: hits.length > 0
        ? `matched ${hits.slice(0, 3).join('; ')}${hits.length > 3 ? '…' : ''}`
        : 'no subject/adjoiner overlap',
    });
  }

  out.sort((a, b) => b.relevance_score - a.relevance_score);
  return out;
}

function buildSubjectTokenSet(ctx: RelevanceContext): Set<string> {
  const out = new Set<string>();
  if (ctx.subject.parcel_id) out.add(`parcel:${ctx.subject.parcel_id.toUpperCase()}`);
  if (ctx.subject.owner)     out.add(`owner:${normalizeOwnerName(ctx.subject.owner)}`);
  if (ctx.subject.legal_description) {
    for (const t of legalRefTokens(ctx.subject.legal_description)) out.add(t);
  }
  return out;
}

function buildAdjoinerTokenSet(ctx: RelevanceContext): Set<string> {
  const out = new Set<string>();
  for (const adj of ctx.adjoiners ?? []) {
    if (adj.parcel_id) out.add(`parcel:${adj.parcel_id.toUpperCase()}`);
    if (adj.owner) out.add(`owner:${normalizeOwnerName(adj.owner)}`);
    if (adj.legal_reference) {
      for (const t of legalRefTokens(adj.legal_reference)) out.add(t);
    }
  }
  return out;
}

function referenceTokenSet(references: DeedCallAdjoiner[], segmentText: string): Set<string> {
  const out = new Set<string>();
  for (const ref of references) {
    if (ref.owner) out.add(`owner:${normalizeOwnerName(ref.owner)}`);
    if (ref.legal_reference) {
      for (const t of legalRefTokens(ref.legal_reference)) out.add(t);
    }
  }
  // Bare parcel ids that appear inside the segment text (some
  // documents quote them next to ownership info without the slice-4
  // patterns matching).
  const idRe = /\b(?:R[0-9]+|[0-9]{5,8})\b/g;
  let m: RegExpExecArray | null;
  while ((m = idRe.exec(segmentText)) !== null) out.add(`parcel:${m[0].toUpperCase()}`);
  return out;
}

/** Composite-key token builder. Critical: emit `LOT-BLOCK:4-A` as a
 *  SINGLE token, never bare `LOT:4` or `BLOCK:A` alone. In a single
 *  subdivision every parcel shares the BLOCK token, so scoring on
 *  the block alone would treat every Lot in OAK SUBDIVISION as
 *  relevant to subject Lot 4. The composite key carries the
 *  identifying signal. */
function legalRefTokens(raw: string): string[] {
  const norm = raw.toUpperCase().replace(/\s+/g, ' ');
  const out: string[] = [];

  // LOT N BLOCK X → composite (single identifying token).
  const lotBlockRe = /\bLOT\s+([A-Z0-9-]+)\s*,?\s*BLOCK\s+([A-Z0-9-]+)/g;
  let m: RegExpExecArray | null;
  while ((m = lotBlockRe.exec(norm)) !== null) {
    out.push(`LOT-BLOCK:${m[1]}-${m[2]}`);
  }

  // ABSTRACT N — strong identifier on its own.
  const absRe = /\bABSTRACT\s+(\d+)|\bA-(\d+)/g;
  while ((m = absRe.exec(norm)) !== null) {
    const v = m[1] ?? m[2];
    if (v) out.push(`ABSTRACT:${v}`);
  }

  // TRACT N — strong identifier on its own.
  const tractRe = /\bTRACT\s+([A-Z0-9-]+)/g;
  while ((m = tractRe.exec(norm)) !== null) {
    out.push(`TRACT:${m[1]}`);
  }

  // Vol/Pg — composite citation.
  const docRe = /\bVOL\s+(\d+)\s+PG\s+(\d+)/g;
  while ((m = docRe.exec(norm)) !== null) {
    out.push(`DOC:VOL-${m[1]}-PG-${m[2]}`);
  }

  return out;
}

function rankSingleton(
  text: string,
  context: RelevanceContext,
  floor: number,
  limit: number,
): DocumentSegment[] {
  const scored = scoreSegments([{ text, span: [0, text.length] }], context);
  return scored.filter((s) => s.relevance_score >= floor).slice(0, limit);
}

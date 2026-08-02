// lib/research/fact-evidence.ts — "the AI said" vs "here is the deed, at this line" (plan R17).
//
// ── THE DEFECT ──────────────────────────────────────────────────────────────────────────────────
//
// Every extracted fact renders identically in the review UI. The collapsed row shows one number —
// `extraction_confidence` — which is the model's opinion of its own output, not evidence. So a fact
// the model asserted with nothing behind it, at 95% confidence, outranks a fact quoted verbatim from
// a deed at 70%. And `DataPointsPanel` offers "View in source document" on EVERY row, including rows
// with no excerpt to find and no region to scroll to, where the button opens a document and lands
// nowhere.
//
// `extracted_data_points.source_bounding_box` has existed since seed 090 and is written as a literal
// `null` at the only place data points are built (`analysis.service.ts`). The column is not partly
// populated — it has never held a value.
//
// ── WHAT EVIDENCE ACTUALLY MEANS HERE ───────────────────────────────────────────────────────────
//
// Five strengths, because the difference between them changes what a reviewer can do:
//
//   located  — page + region: the UI can open the image and scroll to the spot
//   quoted   — page + verbatim excerpt: the UI can find and highlight it in the text layer
//   page     — we know the document and the page, nothing finer
//   document — we know which document, not where in it
//   asserted — nothing. The model produced this from context.
//
// `asserted` is not a bug to be hidden. Some facts legitimately come from cross-referencing rather
// than from a line on a page. The bug is showing it as though it came from a document.

import type { ExtractedDataPoint } from '@/types/research';

export type EvidenceStrength = 'located' | 'quoted' | 'page' | 'document' | 'asserted';

export interface FactEvidence {
  strength: EvidenceStrength;
  /** Short chip text for the collapsed row, beside (not instead of) confidence. */
  label: string;
  /** What a reviewer can do about it — the sentence under the fact when expanded. */
  detail: string;
  /** Can "view in source" land somewhere meaningful? False means the button must not be offered as
   *  though it will, because a button that opens a document and lands nowhere teaches a reviewer
   *  that the whole affordance is unreliable. */
  canLocate: boolean;
  /** Ranks below every evidenced fact when sorting a review queue. */
  rank: number;
}

const ORDER: Record<EvidenceStrength, number> = {
  located: 0, quoted: 1, page: 2, document: 3, asserted: 4,
};

/** A bounding box is stored as FRACTIONS of the page, 0–1 — never pixels.
 *
 *  Page images are re-rendered at whatever width the viewer is, and are re-uploaded at different
 *  resolutions over a project's life. A box in pixels is correct exactly once, against the one
 *  rendering it was measured on, and silently points at the wrong part of the page ever after. */
export function isNormalisedBox(
  box: { x: number; y: number; width: number; height: number } | null | undefined,
): boolean {
  if (!box) return false;
  const vals = [box.x, box.y, box.width, box.height];
  if (vals.some((v) => typeof v !== 'number' || !Number.isFinite(v))) return false;
  if (box.width <= 0 || box.height <= 0) return false;
  // Anything above 1 is a pixel value that leaked in. Rejecting it is better than scrolling a
  // reviewer to the wrong line and letting them believe it.
  return vals.every((v) => v >= 0 && v <= 1) && box.x + box.width <= 1.001 && box.y + box.height <= 1.001;
}

export function evidenceFor(dp: Pick<
  ExtractedDataPoint,
  'source_bounding_box' | 'source_text_excerpt' | 'source_page' | 'source_location' | 'document_id'
>): FactEvidence {
  const hasBox = isNormalisedBox(dp.source_bounding_box);
  const excerpt = (dp.source_text_excerpt ?? '').trim();
  const hasPage = dp.source_page != null;

  if (hasBox && hasPage) {
    return {
      strength: 'located', label: 'located', rank: ORDER.located, canLocate: true,
      detail: `Marked on page ${dp.source_page}. Opening the source scrolls to the region it was read from.`,
    };
  }
  if (excerpt.length > 0) {
    return {
      strength: 'quoted', label: 'quoted', rank: ORDER.quoted, canLocate: true,
      detail: hasPage
        ? `Quoted verbatim from page ${dp.source_page}. The source view highlights this text.`
        : 'Quoted verbatim from the document. The source view searches for this text — the page was not recorded.',
    };
  }
  if (hasPage) {
    return {
      strength: 'page', label: `page ${dp.source_page}`, rank: ORDER.page, canLocate: true,
      detail: `Attributed to page ${dp.source_page}, but no quote was captured — you will have to find it on the page.`,
    };
  }
  if (dp.document_id) {
    return {
      strength: 'document', label: 'document only', rank: ORDER.document, canLocate: true,
      detail: 'Attributed to this document, but neither a page nor a quote was recorded. Verify it by reading the document.',
    };
  }
  return {
    strength: 'asserted', label: 'no source', rank: ORDER.asserted, canLocate: false,
    detail:
      'No document, page or quote is recorded for this value — it came from the model, not from a line on a page. ' +
      'Treat it as a lead to verify, not as a reading.',
  };
}

/** Find an excerpt in a page's text so the viewer can highlight it without a bounding box.
 *
 *  The honest fallback for text-based extraction, which cannot produce pixel coordinates at all.
 *  Whitespace is normalised on both sides because OCR breaks lines wherever the scan does, so a
 *  quote that reads cleanly in the packet rarely matches the page's raw text byte for byte. */
export function locateExcerpt(
  excerpt: string | null | undefined,
  pageText: string | null | undefined,
): { start: number; end: number } | null {
  if (!excerpt || !pageText) return null;
  const squash = (s: string) => s.replace(/\s+/g, ' ').trim();
  const needle = squash(excerpt).toLowerCase();
  if (needle.length < 4) return null; // too short to be a unique match

  // Walk the original text building a squashed copy, keeping a map back to original offsets, so the
  // returned range indexes the REAL text a viewer will render rather than the normalised copy.
  const map: number[] = [];
  let squashed = '';
  let inGap = false;
  for (let i = 0; i < pageText.length; i++) {
    const ch = pageText[i]!;
    if (/\s/.test(ch)) {
      if (!inGap && squashed.length > 0) { squashed += ' '; map.push(i); }
      inGap = true;
    } else {
      squashed += ch.toLowerCase(); map.push(i); inGap = false;
    }
  }

  const at = squashed.indexOf(needle);
  if (at === -1) return null;
  const start = map[at];
  const end = map[Math.min(at + needle.length - 1, map.length - 1)];
  if (start == null || end == null) return null;
  return { start, end: end + 1 };
}

export interface EvidenceTotals {
  total: number;
  byStrength: Record<EvidenceStrength, number>;
  /** Facts with no document, page or quote at all. */
  unevidenced: number;
  headline: string;
}

/** The count a reviewer should see before reading a single fact.
 *
 *  Leads with what is unevidenced rather than with the total, because "412 data points extracted"
 *  reads as thoroughness while "412 extracted, 38 with no source" reads as a work list. */
export function evidenceTotals(
  points: Array<Parameters<typeof evidenceFor>[0]>,
): EvidenceTotals {
  const byStrength: Record<EvidenceStrength, number> = {
    located: 0, quoted: 0, page: 0, document: 0, asserted: 0,
  };
  for (const p of points) byStrength[evidenceFor(p).strength]++;

  const total = points.length;
  const unevidenced = byStrength.asserted;

  const headline = total === 0
    ? 'No data points have been extracted yet.'
    : unevidenced > 0
      ? `${total} facts extracted — ${unevidenced} with no source recorded. Those came from the model, not from a page.`
      : `${total} facts extracted, every one attributed to a document.`;

  return { total, byStrength, unevidenced, headline };
}

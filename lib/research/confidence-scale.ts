// lib/research/confidence-scale.ts — one scale for `ocr_confidence`, and one way to show it.
//
// ── TWO SCALES IN ONE COLUMN, AND TWO VIEWERS EACH ASSUMING A DIFFERENT ONE ─────────────────────
//
// `research_documents.ocr_confidence` is written by both halves of this system, on two different
// scales, because each half is internally consistent and neither knew about the other:
//
//   WRITER                                            SCALE   EVIDENCE
//   lib/research/analysis.service.ts                  0–100   prompts.ts asks for
//                                                             `"overall_confidence": 0-100`
//   lib/research/document.service.ts                  0–100   same prompt
//   worker/src/research/file-generic-document.ts      0–1     ai-extraction.ts's prompt says
//                                                             "Set confidence per-call (0.0-1.0)"
//
// And then two components read the same column:
//
//   SourceDocumentViewer.tsx   `{doc.ocr_confidence}%`               correct for 0–100, and a
//                                                                   worker row renders "0.92%"
//   ReviewDocCard.tsx          `Math.round(x * 100)}%`               correct for 0–1, and an app
//                                                                   row renders "9000%"
//
// So the same document could be described as 92% confident on one screen and 0.92% on another, and
// a reviewer had no way to tell which number was the lie.
//
// ── WHY 0–1 IS THE STORED SCALE ─────────────────────────────────────────────────────────────────
//
// The worker already has `normaliseConfidence` in `infra/ocr-quality.ts`, whose doc comment says
// exactly why it exists — "Guessing wrong by a factor of 100 would either fail every page or pass
// every page" — and it returns 0–1. `assessOcr`'s own threshold, `MIN_CONFIDENCE`, is 0.5. Choosing
// 0–100 would mean changing that reasoning; choosing 0–1 means matching it.
//
// This file is the app-side half of the same rule, deliberately duplicated rather than shared: the
// app cannot import from `worker/src`, and a third copy of the logic living in each of the five call
// sites is how the divergence happened in the first place.
//
// ── THE AMBIGUITY THAT CANNOT BE RESOLVED, AND IS NOT PRETENDED AWAY ────────────────────────────
//
// A stored `1` is 100% on one scale and 1% on the other. It is read as 100%, matching the worker's
// rule, because a provider that emits 0–100 and lands on exactly 1 is reporting a failure so total
// that the document is unreadable by every other measure in `assessOcr` anyway — while a 0–1
// provider hitting 1.0 is ordinary. Stated here rather than left as a silent tie-break.

/**
 * A confidence on the stored 0–1 scale, whichever scale it arrived on.
 *
 * Null in, null out. Negative and non-finite inputs are null: a confidence is not a measurement
 * that can be negative, and returning 0 would claim the extraction was certainly wrong rather than
 * that we do not know.
 */
export function toConfidenceFraction(raw: number | null | undefined): number | null {
  if (raw == null || typeof raw !== 'number' || !Number.isFinite(raw)) return null;
  if (raw < 0) return null;
  return raw > 1 ? Math.min(raw / 100, 1) : raw;
}

/**
 * A confidence rendered for a person, e.g. `"92%"`.
 *
 * Takes a value on either scale so a caller reading a legacy row does not have to know which one it
 * is. Returns null when there is nothing to show — a caller must render nothing rather than "0%",
 * which reads as "we checked and it is terrible" instead of "we never measured".
 */
export function confidencePercentLabel(raw: number | null | undefined): string | null {
  const f = toConfidenceFraction(raw);
  return f == null ? null : `${Math.round(f * 100)}%`;
}

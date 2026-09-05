// lib/research/analysis-estimate.ts — the standardized AI-analysis cost/time estimator (plan E1).
//
// The owner wants a FIXED, predictable price for AI analysis: "standardize the cost as much as
// possible based on the number of pages." So analysis is quoted at a flat $/page rate — the same
// whether a page is a dense plat or a blank back — and the quote is a firm number shown before the
// user commits, both for a whole project (all gathered files) and for one file at a time.
//
// This is intentionally NOT the live token-cost estimate (that lives in analysis.service and only
// bounds the run). This is the customer-facing PRICE. It is pure so the number the UI shows and the
// number a per-file button charges come from one place and are unit-tested.

/**
 * The standardized price per page for AI analysis, in USD. This is a BUSINESS rate the owner sets —
 * it must stay at or above the real model cost per page (well under a cent at current vision
 * pricing) with margin. Kept here as the single knob; change it in one place.
 */
export const ANALYSIS_RATE_USD_PER_PAGE = 0.25;

/** Rough processing time per page, for the "how long will it take" estimate. */
export const ANALYSIS_SECONDS_PER_PAGE = 8;

export interface AnalysisEstimate {
  pages: number;
  costUsd: number;
  etaSeconds: number;
}

/** Quote a fixed price + time for analysing `pages` pages. Negative/NaN pages are treated as 0. */
export function estimateAnalysis(pages: number): AnalysisEstimate {
  const p = Number.isFinite(pages) && pages > 0 ? Math.ceil(pages) : 0;
  return {
    pages: p,
    costUsd: round2(p * ANALYSIS_RATE_USD_PER_PAGE),
    etaSeconds: p * ANALYSIS_SECONDS_PER_PAGE,
  };
}

/** A document's analysable page count — `page_count` when present, else 1 (a file is at least a page). */
export function pageCountOf(doc: { page_count?: number | null }): number {
  const n = doc?.page_count;
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? Math.ceil(n) : 1;
}

/** Quote the WHOLE project: sum pages across every gathered file, at the fixed rate. */
export function estimateForDocuments(docs: Array<{ page_count?: number | null }>): AnalysisEstimate {
  const pages = (docs ?? []).reduce((sum, d) => sum + pageCountOf(d), 0);
  return estimateAnalysis(pages);
}

/** "~45 sec" / "~3 min" / "~1 hr 5 min" — a human ETA for the quote. */
export function formatEta(seconds: number): string {
  const s = Number.isFinite(seconds) && seconds > 0 ? Math.round(seconds) : 0;
  if (s < 60) return `~${s} sec`;
  const mins = Math.round(s / 60);
  if (mins < 60) return `~${mins} min`;
  const hr = Math.floor(mins / 60);
  const rem = mins % 60;
  return rem ? `~${hr} hr ${rem} min` : `~${hr} hr`;
}

/** "$3.25" — the price label for a quote. */
export function formatUsd(usd: number): string {
  const n = Number.isFinite(usd) && usd > 0 ? usd : 0;
  return `$${n.toFixed(2)}`;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// worker/src/services/document-intelligence.ts
// Phase 2 §2.8: Document relevance scoring — decides what's worth downloading.
//
// The harvester searches many name variants and instrument numbers, producing
// a large raw result list.  This module scores each result 0-100 and assigns
// a download priority so the harvester fetches high-value documents first
// (plats, deeds) and skips low-value ones (liens, old affidavits).
//
// Scoring factors:
//   +50  Plat / replat                   (highest boundary value)
//   +40  Warranty deed                   (primary boundary source)
//   +35  ROW document                    (road boundary info)
//   +30  Referenced in Phase 1 CAD data  (already known relevant)
//   +30  Easement
//   +25  Restrictive covenant / CC&R
//   +20  Directly involves target owner
//   +15  References subdivision name
//   +10  Involves an adjacent owner
//   +5   Deed of trust
//   +10  Recorded within last 5 years
//   +5   Recorded within last 15 years
//   -5   Recorded > 50 years ago
//   +2   Lien (rarely has boundary data)

import type { ClerkDocumentResult } from '../adapters/clerk-adapter.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DocumentRelevanceScore {
  instrumentNumber: string;
  relevanceScore: number;       // 0–100
  reason: string;               // Human-readable explanation (semi-colon delimited)
  shouldDownload: boolean;      // true when relevanceScore >= 20
  priority: 'high' | 'medium' | 'low' | 'skip';
}

export interface ScoringContext {
  targetOwner: string;
  subdivisionName?: string;
  adjacentOwners?: string[];
  /** Instrument numbers already found in Phase 1 CAD records */
  knownInstruments?: string[];
  /**
   * Reference year for recency scoring.  Callers should pass a fixed year
   * (e.g. `new Date().getFullYear()`) once per harvest session so all
   * documents in the same batch are scored consistently.
   * Defaults to the current calendar year when omitted.
   */
  currentYear?: number;
}

// ── Scoring function ──────────────────────────────────────────────────────────

/**
 * Score a single clerk search result for download priority.
 *
 * Returns a `DocumentRelevanceScore` with a 0–100 score, the reasoning, and
 * a `priority` bucket.  The harvester uses this to sort results and skip
 * low-value documents (priority === 'skip').
 */
export function scoreDocumentRelevance(
  result: ClerkDocumentResult,
  context: ScoringContext,
): DocumentRelevanceScore {
  let score = 0;
  const reasons: string[] = [];

  const type = result.documentType;

  // ── Document type ────────────────────────────────────────────────────────────

  if (type === 'plat' || type === 'replat' || type === 'amended_plat' || type === 'vacating_plat') {
    score += 50;
    reasons.push('Plat — highest value for boundary data');
  } else if (type === 'warranty_deed' || type === 'special_warranty_deed') {
    score += 40;
    reasons.push('Deed — primary boundary source');
  } else if (type === 'right_of_way') {
    score += 35;
    reasons.push('ROW document — road boundary info');
  } else if (
    type === 'easement' ||
    type === 'utility_easement' ||
    type === 'access_easement' ||
    type === 'drainage_easement'
  ) {
    score += 30;
    reasons.push('Easement — affects property boundaries');
  } else if (
    type === 'restrictive_covenant' ||
    type === 'deed_restriction' ||
    type === 'ccr'
  ) {
    score += 25;
    reasons.push('Restrictions — important for development');
  } else if (type === 'quitclaim_deed') {
    score += 20;
    reasons.push('Quitclaim deed — may convey boundary rights');
  } else if (type === 'dedication') {
    score += 20;
    reasons.push('Dedication — may affect road/easement boundaries');
  } else if (type === 'deed_of_trust') {
    score += 5;
    reasons.push('Deed of trust — usually no boundary info');
  } else if (
    type === 'mechanics_lien' ||
    type === 'tax_lien' ||
    type === 'release_of_lien'
  ) {
    score += 2;
    reasons.push('Lien — rarely has boundary data');
  } else if (type === 'affidavit' || type === 'correction_instrument') {
    score += 8;
    reasons.push('Correction/affidavit — may fix a deed or plat');
  } else if (type === 'oil_gas_lease' || type === 'mineral_deed') {
    score += 3;
    reasons.push('Mineral/O&G — surface boundary rarely described');
  }

  // ── Owner relevance ──────────────────────────────────────────────────────────

  const grantees = result.grantees.join(' ').toUpperCase();
  const grantors = result.grantors.join(' ').toUpperCase();
  const targetUpper = context.targetOwner.toUpperCase();

  if (grantees.includes(targetUpper) || grantors.includes(targetUpper)) {
    score += 20;
    reasons.push('Directly involves target owner');
  }

  if (context.subdivisionName) {
    const subUpper = context.subdivisionName.toUpperCase();
    if (grantees.includes(subUpper) || grantors.includes(subUpper)) {
      score += 15;
      reasons.push('References subdivision name');
    }
  }

  // ── Adjacent owner relevance ─────────────────────────────────────────────────

  if (context.adjacentOwners) {
    for (const adj of context.adjacentOwners) {
      if (
        grantees.includes(adj.toUpperCase()) ||
        grantors.includes(adj.toUpperCase())
      ) {
        score += 10;
        reasons.push(`Involves adjacent owner: ${adj}`);
        break;
      }
    }
  }

  // ── Known instrument bonus ───────────────────────────────────────────────────

  if (context.knownInstruments?.includes(result.instrumentNumber)) {
    score += 30;
    reasons.push('Referenced in Phase 1 CAD records');
  }

  // ── Recency bonus ────────────────────────────────────────────────────────────

  if (result.recordingDate) {
    const rawDate = result.recordingDate;
    // Accept ISO dates (2023-04-12) and US dates (04/12/2023 or 4/12/2023)
    const isoMatch  = rawDate.match(/^(\d{4})-\d{2}-\d{2}$/);
    const usMatch   = rawDate.match(/^\d{1,2}\/\d{1,2}\/(\d{4})$/);
    const yearStr   = isoMatch ? isoMatch[1] : usMatch ? usMatch[1] : null;

    if (yearStr) {
      const year    = parseInt(yearStr, 10);
      // Use injected year when provided so callers get consistent scores
      // across a single request; fall back to current calendar year.
      const refYear = context.currentYear ?? new Date().getFullYear();
      const age     = refYear - year;
      if (age <= 5)       { score += 10; reasons.push('Recorded within last 5 years');  }
      else if (age <= 15) { score +=  5; reasons.push('Recorded within last 15 years'); }
      else if (age > 50)  { score -=  5; reasons.push('Recorded > 50 years ago');       }
    }
  }

  // ── Normalise ────────────────────────────────────────────────────────────────

  const finalScore = Math.min(100, Math.max(0, score));

  return {
    instrumentNumber: result.instrumentNumber,
    relevanceScore:   finalScore,
    reason:           reasons.length > 0 ? reasons.join('; ') : 'No matching scoring criteria',
    shouldDownload:   finalScore >= 20,
    priority:
      finalScore >= 60 ? 'high'   :
      finalScore >= 35 ? 'medium' :
      finalScore >= 20 ? 'low'    :
      'skip',
  };
}

// ── Bulk scoring helper ───────────────────────────────────────────────────────

/**
 * Score and sort a list of results, returning only those worth downloading
 * (score >= 20) ordered from highest to lowest score.
 *
 * @param results   Raw results from a ClerkAdapter search method
 * @param context   Scoring context (owner, subdivision, known instruments)
 * @param maxItems  Cap the returned list at this many items (default 20)
 */
export function filterAndRankResults(
  results: ClerkDocumentResult[],
  context: ScoringContext,
  maxItems = 20,
): Array<{ result: ClerkDocumentResult; score: DocumentRelevanceScore }> {
  return results
    .map((result) => ({ result, score: scoreDocumentRelevance(result, context) }))
    .filter(({ score }) => score.shouldDownload)
    .sort((a, b) => b.score.relevanceScore - a.score.relevanceScore)
    .slice(0, maxItems);
}

// app/admin/research/[projectId]/_sections/gis-quality-data.ts — B1a, fourteenth extraction.
//
// ── THE ARTIFACTS TAB'S CAST ────────────────────────────────────────────────────────────────────
//
// Seven keys across two nesting levels, read off `analysis_metadata.result.gisQualityReport` and
// declared by hand in `page.tsx`. The worker builds the object by hand in
// `worker/src/counties/bell/orchestrator.ts`; the page declared by hand what it expected to find;
// nothing connected the two. Same shape as the Survey (29), Summary (26) and Easements (27) casts.
//
// Checked when this was extracted: all seven names match. There is no live key bug here. What there
// was is the same *failure mode* as its predecessors —
//
//     if (!qr || !qr.checks?.length) return null;
//
// — so a single renamed key does not throw, does not warn, and does not render. The section simply
// is not there, which is indistinguishable from "this run produced no GIS quality report", which is
// the normal case. A defect with no symptom.
//
// ── AND IT HAD NEVER RENDERED ───────────────────────────────────────────────────────────────────
//
// Measured 2026-08-31: **0 of 50 projects** carry a `gisQualityReport` with checks. Only the Bell
// orchestrator writes one, only when GIS screenshots exist and AI credits are not depleted.
//
// That is why four unreadable colours sat in this card untouched while every instrument reported
// green, and it is worth being precise about which instrument missed what, because they missed it
// for two different reasons:
//
//   · `check-portal-themes.mjs` measures RENDERED text. This section renders `null` on every
//     project in the database, so there was nothing to measure — the same blind spot that hid the
//     Document Library's row colours until G18 made the rows appear.
//   · `audit-research-contrast.mjs` reads inline style objects. This card's colour is a TERNARY
//     assigned to a local (`const color = score >= 70 ? '#22c55e' : …`) and then spread in as
//     `style={{ color }}`. There is no literal in the style object to find.
//
// Neither instrument was wrong. Between them they cover "rendered" and "written literally", and
// this was neither. The tones below are named constants for exactly that reason: a value with a
// name is a value an audit can follow.

import type { ResearchProject } from '@/types/research';

/** One screenshot's assessment. Field-for-field what the orchestrator writes. */
export interface GisQualityCheck {
  label: string;
  qualityScore: number;
  zoomAssessment: string;
  whatIsShown: string;
  recommendations: string[];
}

export interface GisQualityReport {
  summary: string;
  checks: GisQualityCheck[];
  actionableAdjustments: string[];
}

/**
 * Every key this module reads, so the contract test can hold the list against `worker/src` rather
 * than against a second hand-written copy of it.
 */
export const GIS_QUALITY_KEYS = [
  'summary', 'checks', 'actionableAdjustments',
  'label', 'qualityScore', 'zoomAssessment', 'whatIsShown', 'recommendations',
] as const;

/** `aiUsage` is written by the orchestrator and deliberately not read here — it is billing, not
 *  quality, and the Billing tab is where it belongs. Named so the contract test does not report it
 *  as a key the page forgot. */
export const GIS_QUALITY_IGNORED_KEYS = ['aiUsage'] as const;

/**
 * The score bands.
 *
 * 70 and 40 are the orchestrator's own thresholds — it emits `✓ / ⚠ / ✗` per check against exactly
 * these numbers when it writes the pipeline log. That makes this the SECOND copy, and the two live
 * on opposite sides of the app/worker boundary, so they cannot share a module without a shared
 * package. They are named and asserted here instead, and the contract test reads the worker's
 * literals: if somebody moves the worker's bands, this fails rather than the product quietly
 * showing a green tick beside a number the log called a warning.
 */
export const GIS_SCORE_GOOD = 70;
export const GIS_SCORE_FAIR = 40;

export type GisTone = 'good' | 'fair' | 'poor';

export function toneForScore(score: number): GisTone {
  if (score >= GIS_SCORE_GOOD) return 'good';
  if (score >= GIS_SCORE_FAIR) return 'fair';
  return 'poor';
}

/**
 * Reads the report off a project, or `null` when there is not one.
 *
 * Tolerant of `analysis_metadata` arriving as a JSON STRING. PostgREST returns `jsonb` parsed, but
 * this page has been handed both, and `document-rows.ts` was caught by exactly that difference —
 * reading `.pageUrls` off a string yields `undefined` and iterating it yields `0,1,2…`. Cheap to
 * handle, expensive to diagnose.
 */
export function gisQualityOf(project: ResearchProject | null): GisQualityReport | null {
  if (!project) return null;

  let meta: unknown = project.analysis_metadata;
  if (typeof meta === 'string') {
    try { meta = JSON.parse(meta); } catch { return null; }
  }

  const result = (meta as { result?: unknown } | null)?.result;
  const raw = (result as { gisQualityReport?: unknown } | null)?.gisQualityReport;
  if (!raw || typeof raw !== 'object') return null;

  const r = raw as Record<string, unknown>;

  // A report with no checks is not a report. The page's own guard said the same thing; it is here
  // now so the page cannot forget it and render an empty card with a heading.
  const rawChecks = Array.isArray(r.checks) ? r.checks : [];
  if (rawChecks.length === 0) return null;

  const checks: GisQualityCheck[] = rawChecks
    .filter((c): c is Record<string, unknown> => !!c && typeof c === 'object')
    .map((c) => ({
      label: typeof c.label === 'string' && c.label.trim() ? c.label : 'Screenshot',
      // A missing score must not read as zero. Zero is "we looked and it was terrible"; the honest
      // answer for an absent number is the bottom of the FAIR band, which shows a warning rather
      // than a false failure.
      qualityScore: typeof c.qualityScore === 'number' && Number.isFinite(c.qualityScore)
        ? Math.max(0, Math.min(100, c.qualityScore))
        : GIS_SCORE_FAIR,
      zoomAssessment: typeof c.zoomAssessment === 'string' ? c.zoomAssessment : '',
      whatIsShown: typeof c.whatIsShown === 'string' ? c.whatIsShown : '',
      recommendations: Array.isArray(c.recommendations)
        ? c.recommendations.filter((x): x is string => typeof x === 'string' && x.trim() !== '')
        : [],
    }));

  if (checks.length === 0) return null;

  return {
    summary: typeof r.summary === 'string' ? r.summary : '',
    checks,
    actionableAdjustments: Array.isArray(r.actionableAdjustments)
      ? r.actionableAdjustments.filter((x): x is string => typeof x === 'string' && x.trim() !== '')
      : [],
  };
}

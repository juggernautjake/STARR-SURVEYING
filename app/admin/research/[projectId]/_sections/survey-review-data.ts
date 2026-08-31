// app/admin/research/[projectId]/_sections/survey-review-data.ts — B1a.
//
// What the Review tab's Survey panel reads out of `analysis_metadata.result`, as a declared shape
// rather than a 25-line inline cast.
//
// ── WHY THE SHAPE IS THE POINT ──────────────────────────────────────────────────────────────────
//
// This panel reads **29 keys** across four nested structures, every one of them written by hand on
// both sides: the worker builds the object in `worker/src/index.ts`, and this file's cast declares
// what it expects to find. A `as` cast is a claim, not a check — TypeScript will happily let this
// read `result.platSummaries` from an object whose key is `platSummary`, and the panel renders an
// empty section that looks exactly like "this deed had no plats".
//
// That is [[project_map_and_surveying_backend_complete]]'s "written in units nobody produces"
// defect, and this repository has shipped it more than once. All 29 keys were verified against the
// worker on 2026-08-31 and all 29 are produced; `review-reads-what-the-worker-writes.test.ts` keeps
// it that way, because the next key added is the one that will not be.
//
// The verification took three attempts, and the first two were the probe rather than the code:
// accepting `foo,` anywhere reported every key produced (it matches any variable in an argument
// list), and rejecting it reported `platAnalyses` as never produced when the worker writes exactly
// that, in shorthand, on its own line.

export interface SurveyBoundary {
  bearingsAndDistances?: string[];
  lotDimensions?: string[];
  monuments?: string[];
  curves?: string[];
  rowWidths?: string[];
  platEasements?: string[];
  callCount?: number;
  confidence?: number;
}

export interface ChainOfTitleEntry {
  order: number;
  instrumentNumber: string | null;
  date: string | null;
  from: string;
  to: string;
  type: string;
}

export interface PlatAnalysis {
  name: string;
  instrumentNumber: string | null;
  date: string | null;
  narrative: string;
  bearingsAndDistances: string[];
  lotDimensions: string[];
  monuments: string[];
  easements: string[];
  curves: string[];
  rowWidths: string[];
  adjacentReferences: string[];
  changesFromPrevious: string[];
}

export interface SurveyReviewData {
  boundary: SurveyBoundary | null;
  chainOfTitle: ChainOfTitleEntry[];
  platAnalyses: PlatAnalysis[];
  crossValidation: string[];
  deedSummary: string;
  platSummary: string;
  /** The boundary section renders only when there is at least one call to put in it. */
  hasBoundary: boolean;
  hasChain: boolean;
  hasPlats: boolean;
}

/**
 * Read the survey data off a project's analysis metadata.
 *
 * Every list defaults to `[]` and every summary to `''`, so the panel never has to ask whether a
 * field is missing or empty — a distinction it does not draw and should not have to. `boundary`
 * stays nullable because the panel DOES draw that one: no boundary at all gets an explanation of
 * why (plat images need AI analysis), which an empty array would not.
 */
export function surveyReviewData(analysisMetadata: unknown): SurveyReviewData {
  const meta = (analysisMetadata ?? null) as Record<string, unknown> | null;
  const result = (meta?.result ?? null) as Record<string, unknown> | null;

  const list = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
  const text = (v: unknown): string => (typeof v === 'string' ? v : '');

  const boundary = (result?.boundary ?? null) as SurveyBoundary | null;
  const chainOfTitle = list<ChainOfTitleEntry>(result?.chainOfTitle);
  const platAnalyses = list<PlatAnalysis>(result?.platAnalyses);

  return {
    boundary,
    chainOfTitle,
    platAnalyses,
    crossValidation: list<string>(result?.crossValidation),
    deedSummary: text(result?.deedSummary),
    platSummary: text(result?.platSummary),
    // `boundary && …` returned the object itself when there were no calls, so this was a truthy
    // object rather than a boolean and `hasBoundary ? … : …` took the wrong branch for a boundary
    // with an empty call list. Coerced, and asserted.
    hasBoundary: (boundary?.bearingsAndDistances?.length ?? 0) > 0,
    hasChain: chainOfTitle.length > 0,
    hasPlats: platAnalyses.length > 0,
  };
}

/** Every key this panel reads, for the contract test. Nested paths use dots. */
export const SURVEY_RESULT_KEYS = [
  'boundary', 'chainOfTitle', 'platAnalyses', 'crossValidation', 'deedSummary', 'platSummary',
  'boundary.bearingsAndDistances', 'boundary.lotDimensions', 'boundary.monuments',
  'boundary.curves', 'boundary.rowWidths', 'boundary.platEasements', 'boundary.callCount',
  'boundary.confidence',
  'chainOfTitle.order', 'chainOfTitle.instrumentNumber', 'chainOfTitle.date',
  'chainOfTitle.from', 'chainOfTitle.to', 'chainOfTitle.type',
  'platAnalyses.name', 'platAnalyses.instrumentNumber', 'platAnalyses.date',
  'platAnalyses.narrative', 'platAnalyses.bearingsAndDistances', 'platAnalyses.lotDimensions',
  'platAnalyses.monuments', 'platAnalyses.easements', 'platAnalyses.curves',
  'platAnalyses.rowWidths', 'platAnalyses.adjacentReferences', 'platAnalyses.changesFromPrevious',
] as const;

// app/admin/research/[projectId]/_sections/coherence-review-data.ts — B1a.
//
// The Review → Summary tab's "Quality & Coherence Review" panel: seventeen keys read off
// `analysis_metadata.coherence_review` through an unchecked cast, plus the colour maps that turn a
// verdict into something a reader sees.
//
// ── THIS PANEL'S PRODUCER IS NOT THE WORKER ────────────────────────────────────────────────────
//
// Every other extraction in this folder is held against `worker/src` by
// `review-reads-what-the-worker-writes.test.ts`. This one cannot be: `coherence_review` appears
// NOWHERE in `worker/src` — checked with a control, because a bare negative from a grep is how this
// repository has been wrong nine times. It is written by `lib/research/analysis.service.ts`, the
// APP-side pipeline, and its shape is defined by the `COHERENCE_SYNTHESIS` prompt's declared JSON
// schema in `lib/research/prompts.ts`.
//
// That is the doc's "READ FIRST — there are TWO research pipelines" made concrete: the contract for
// this panel lives in a prompt, and a prompt is edited far more casually than a type. So the keys
// are listed at the bottom and `coherence-review-contract.test.ts` holds them against the prompt
// text itself.
//
// ── AND THE COLOURS ARE HERE FOR A REASON ──────────────────────────────────────────────────────
//
// `style={{ color: verdictColors[verdict] }}` is a colour chosen from a map BY KEY, so no hex ever
// appears at the style site. `scripts/audit-research-contrast.mjs` matches literals inside style
// objects — it therefore could not see any of these four colours, and never could. Not "skipped":
// invisible. Moving the map here makes it a value a test can iterate, which is the only way this
// particular shape gets covered.

/** The surfaces these colours actually sit on, from `AdminResearch.css`. */
export const COHERENCE_BACKGROUNDS = {
  /** `.coherence-review__header` — `var(--theme-bg-elevated, #F9FAFB)`. */
  header: '#F9FAFB',
  /** `.coherence-review` — `var(--theme-bg-surface, #fff)`. */
  surface: '#FFFFFF',
  /** `.coherence-review__score-bar` — a flat `#E5E7EB`, no token. The bar fill sits on this. */
  track: '#E5E7EB',
} as const;

// ── Verdict presentation ────────────────────────────────────────────────────────────────────────
//
// The four verdicts are an enum in the COHERENCE_SYNTHESIS prompt. `ready_for_fieldwork` is the one
// that tells a surveyor the research is good enough to go out on, and it was the LEAST readable
// thing on the panel — `#059669` at 3.61:1 on the header. `AdminResearch.css:12` had already
// retired that exact hex (`--recon-success: #047857; /* 5.48:1 on white — was #059669 at 3.77 */`);
// this block escaped that sweep because an inline colour is not a stylesheet rule.

export const VERDICT_COLORS: Record<string, string> = {
  ready_for_fieldwork: '#047857',   // was #059669 — 3.61:1 on the header
  needs_attention: '#B45309',       // was #D97706 — 3.05:1, the worst on the panel
  significant_issues: '#DC2626',    // 4.62:1 — already passing, left alone
  unreliable: '#991B1B',            // 7.95:1
};

/** An unrecognised verdict still has to render, and still has to be readable: 4.63:1. */
export const VERDICT_FALLBACK_COLOR = '#6B7280';

export const VERDICT_LABELS: Record<string, string> = {
  ready_for_fieldwork: 'Ready for Fieldwork',
  needs_attention: 'Needs Attention',
  significant_issues: 'Significant Issues',
  unreliable: 'Unreliable',
};

/** Bar FILL — a non-text graphic, so 3:1 against the track rather than 4.5:1. */
export function scoreFillColor(score: number): string {
  if (score >= 70) return '#047857';
  if (score >= 40) return '#B45309';
  return '#DC2626';
}

/**
 * The pass-1 → pass-3 delta arrow. Green means the score went UP after deeper analysis.
 * Text on `surface`, so it needs 4.5:1 — `#059669` was 3.77:1 here.
 */
export function deltaColor(current: number, pass1: number): string {
  return current < pass1 ? '#DC2626' : '#047857';
}

/** "Complete" / "Incomplete" on the deed-chain box. Text on `surface`. */
export function deedCompleteColor(complete: boolean): string {
  return complete ? '#047857' : '#DC2626';
}

/** `Breaks: n` on the deed-chain stats row — only rendered when there ARE breaks. 4.62:1. */
export const DEED_BREAKS_COLOR = '#DC2626';

/**
 * The "Missing instruments:" label. Was `#D97706` at 3.05:1 on `surface` — and at 0.72rem it is
 * emphatically not large text, so 4.5:1 applies. `#B45309` is 4.90:1.
 */
export const MISSING_INSTRUMENTS_COLOR = '#B45309';

/** Every colour this panel can paint text in, with the surface it sits on — for the guard. */
export const COHERENCE_TEXT_COLORS: Array<{ color: string; on: string; what: string }> = [
  ...Object.entries(VERDICT_COLORS).map(([k, color]) => ({
    color, on: COHERENCE_BACKGROUNDS.header, what: `verdict ${k}`,
  })),
  { color: VERDICT_FALLBACK_COLOR, on: COHERENCE_BACKGROUNDS.header, what: 'verdict fallback' },
  { color: deltaColor(1, 2), on: COHERENCE_BACKGROUNDS.surface, what: 'score delta down' },
  { color: deltaColor(2, 1), on: COHERENCE_BACKGROUNDS.surface, what: 'score delta up' },
  { color: deedCompleteColor(true), on: COHERENCE_BACKGROUNDS.surface, what: 'deed chain complete' },
  { color: deedCompleteColor(false), on: COHERENCE_BACKGROUNDS.surface, what: 'deed chain incomplete' },
  { color: DEED_BREAKS_COLOR, on: COHERENCE_BACKGROUNDS.surface, what: 'deed chain breaks' },
  { color: MISSING_INSTRUMENTS_COLOR, on: COHERENCE_BACKGROUNDS.surface, what: 'missing instruments label' },
];

/**
 * The score bar's fill, against the track it sits in. A non-text graphic: WCAG 1.4.11 asks 3:1, not
 * 4.5:1. Kept in its own list so the guard cannot silently apply the wrong floor to either group.
 */
export const COHERENCE_GRAPHIC_COLORS: Array<{ color: string; on: string; what: string }> =
  [100, 70, 69, 40, 39, 0].map((score) => ({
    color: scoreFillColor(score),
    on: COHERENCE_BACKGROUNDS.track,
    what: `score fill at ${score}`,
  }));

// ── Shape ───────────────────────────────────────────────────────────────────────────────────────

export interface CoherenceIssue {
  severity: string;
  area: string;
  title: string;
  description: string;
  recommendation: string;
  found_in?: string;
}

export interface PipelineIssue {
  severity: string;
  category: string;
  title: string;
  description: string;
  suggested_fix: string;
}

export interface DataQualityEntry {
  score: number;
  pass1_score?: number;
  adjustment?: string;
  assessment: string;
}

export interface BoundaryDetail {
  traverse_summary?: string;
  closure_status?: string;
  call_count?: number;
  issues_found?: number;
  critical_calls?: string[];
}

export interface DeedChainDetail {
  chain_summary?: string;
  complete?: boolean;
  deeds_found?: number;
  breaks?: number;
  missing_instruments?: string[];
}

export interface PassComparison {
  pass1_issues_confirmed?: number;
  pass2_new_issues?: number;
  pass1_false_alarms?: number;
  total_issues?: number;
}

export interface CoherenceReviewData {
  verdict: string;
  verdictLabel: string;
  verdictColor: string;
  score: number;
  statement: string;
  execSummary: string;
  techSummary: string;
  passCount: number;
  dataQuality: Record<string, DataQualityEntry> | null;
  coherenceIssues: CoherenceIssue[];
  pipelineIssues: PipelineIssue[];
  fieldNotes: string[];
  missing: string[];
  boundaryDetail: BoundaryDetail | null;
  deedDetail: DeedChainDetail | null;
  passComparison: PassComparison | null;
  /** Whether the boundary box has anything to say. */
  showBoundaryDetail: boolean;
  /** Whether the deed-chain box has anything to say — see the note on `deeds_found`. */
  showDeedDetail: boolean;
}

export interface CoherenceProject {
  analysis_metadata?: unknown;
}

const arr = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const nOr = (v: unknown, d: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : d;

/** `null` when the run produced no coherence review at all — the panel renders nothing. */
export function coherenceReviewData(project: CoherenceProject): CoherenceReviewData | null {
  const meta = (project.analysis_metadata ?? null) as Record<string, unknown> | null;
  const cr = (meta?.coherence_review ?? null) as Record<string, unknown> | null;
  if (!cr || typeof cr !== 'object') return null;

  const verdict = str(cr.overall_verdict) || 'unknown';
  const boundaryDetail = (cr.boundary_detail ?? null) as BoundaryDetail | null;
  const deedDetail = (cr.deed_chain_detail ?? null) as DeedChainDetail | null;

  return {
    verdict,
    verdictLabel: VERDICT_LABELS[verdict] || verdict,
    verdictColor: VERDICT_COLORS[verdict] || VERDICT_FALLBACK_COLOR,
    score: nOr(cr.overall_score, 0),
    statement: str(cr.confidence_statement),
    execSummary: str(cr.executive_summary),
    techSummary: str(cr.summary),
    // `_pass_count` is set to 3 in code, not by the model. Default 1 so the "3-pass" badge is
    // shown only when the field really is there.
    passCount: nOr(cr._pass_count, 1),
    dataQuality: (cr.data_quality ?? null) as Record<string, DataQualityEntry> | null,
    coherenceIssues: arr<CoherenceIssue>(cr.coherence_issues),
    pipelineIssues: arr<PipelineIssue>(cr.pipeline_issues),
    fieldNotes: arr<string>(cr.field_survey_notes),
    missing: arr<string>(cr.missing_information),
    boundaryDetail,
    deedDetail,
    passComparison: (cr.pass_comparison ?? null) as PassComparison | null,
    showBoundaryDetail: Boolean(
      boundaryDetail && (boundaryDetail.traverse_summary || boundaryDetail.closure_status
        || boundaryDetail.call_count != null || boundaryDetail.issues_found != null),
    ),
    // ── ZERO DEEDS FOUND IS THE FINDING ───────────────────────────────────────────────────────
    //
    // This was `deedDetail && (chain_summary || deeds_found)`. `deeds_found: 0` is falsy, so a
    // deed chain where the pipeline found NO deeds hid the entire box — and with it
    // `complete: false`, the break count, and the list of missing instruments. The one state a
    // surveyor most needs to see was the one state that rendered nothing.
    //
    // Fourth instance of this exact shortcut in the research portal in two days (the document
    // count on the run panel, the document count on this same tab, `result.acreage ? …` on the
    // property tab). `!= null` throughout: absent hides the box, zero shows it.
    showDeedDetail: Boolean(
      deedDetail && (deedDetail.chain_summary || deedDetail.deeds_found != null
        || deedDetail.complete != null || deedDetail.breaks != null
        || (deedDetail.missing_instruments?.length ?? 0) > 0),
    ),
  };
}

/**
 * Every key this panel reads off `coherence_review`, for the contract test.
 *
 * Nested keys are written `parent.child` and are asserted against the same prompt text.
 */
export const COHERENCE_RESULT_KEYS = [
  'overall_verdict', 'overall_score', 'confidence_statement', 'executive_summary', 'summary',
  'data_quality', 'coherence_issues', 'pipeline_issues', 'field_survey_notes',
  'missing_information', 'boundary_detail', 'deed_chain_detail', 'pass_comparison',
  'data_quality.score', 'data_quality.pass1_score', 'data_quality.adjustment',
  'data_quality.assessment',
  'coherence_issues.severity', 'coherence_issues.area', 'coherence_issues.title',
  'coherence_issues.description', 'coherence_issues.recommendation', 'coherence_issues.found_in',
  'pipeline_issues.severity', 'pipeline_issues.category', 'pipeline_issues.title',
  'pipeline_issues.description', 'pipeline_issues.suggested_fix',
  'boundary_detail.traverse_summary', 'boundary_detail.closure_status',
  'boundary_detail.call_count', 'boundary_detail.issues_found', 'boundary_detail.critical_calls',
  'deed_chain_detail.chain_summary', 'deed_chain_detail.complete', 'deed_chain_detail.deeds_found',
  'deed_chain_detail.breaks', 'deed_chain_detail.missing_instruments',
  'pass_comparison.pass1_issues_confirmed', 'pass_comparison.pass2_new_issues',
  'pass_comparison.pass1_false_alarms', 'pass_comparison.total_issues',
] as const;

/**
 * `_pass_count` is deliberately NOT in the list above: it is attached by
 * `analysis.service.ts` after the model responds, so it is not in the prompt schema and a test
 * that looked for it there would fail for the wrong reason.
 */
export const COHERENCE_CODE_ATTACHED_KEYS = ['_pass_count', '_pass1', '_pass2'] as const;

/** The verdicts the prompt declares. A verdict outside this set renders via the fallback. */
export const COHERENCE_VERDICTS = [
  'ready_for_fieldwork', 'needs_attention', 'significant_issues', 'unreliable',
] as const;

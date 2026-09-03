// worker/src/research/abort-reason.ts — an abort says who aborted it.
//
// ── "PIPELINE CANCELLED BY USER", ON A RUN NOBODY CANCELLED ─────────────────────────────────────
//
// Measured 2026-09-03. The owner's screen showed, for one run:
//
//     Activity     ✕ Pipeline — Pipeline cancelled by user
//     stop_reason  budget_reached
//
// Two fields describing one event and disagreeing. The owner's words: "it is saying it stoped
// because it reached its time limit, and it is also saying it stopped because I cancelled it. I did
// not cancel it."
//
// They were right. `index.ts:1341` aborts the run when the budget is exhausted:
//
//     if (!budget.ok && !pipelineAbortController.signal.aborted) { ... abort() }
//
// and `counties/bell/orchestrator.ts:108` then threw
//
//     new DOMException('Pipeline cancelled by user', 'AbortError')
//
// for ANY abort, because `signal.aborted` is a boolean and a boolean cannot say who set it. The
// budget wound the run down — a normal, successful early finish — and the run recorded it as the
// operator pressing cancel.
//
// ── THIS WAS ALREADY FIXED ONCE, FOR HALF THE SURFACES ──────────────────────────────────────────
//
// Both abort sites already set `stopReason` on the `activePipelines` entry before aborting, with a
// comment describing this exact defect. That fixed the STATUS endpoint. It did not fix the thrown
// exception, because the orchestrator cannot see `activePipelines` — and the exception's message is
// what lands in `research_runs.message` and in the Activity log the owner was reading.
//
// So the fix reached the surface that was checked and not the surface that was displayed. Carrying
// the reason ON THE SIGNAL closes that: `signal.reason` is readable anywhere the signal is, which
// is everywhere an abort can be observed.

/** Why a run was aborted. Every abort must be one of these — a bare `abort()` is what produced a
 *  run that blamed the operator for the budget's decision. */
export type AbortKind = 'budget' | 'operator' | 'shutdown';

export class RunAbort extends Error {
  readonly kind: AbortKind;
  /** True when this ending is a normal outcome rather than a failure. A run that finishes at the
   *  ceiling the operator set has succeeded at the thing it was asked to do. */
  readonly isExpected: boolean;

  constructor(kind: AbortKind, message: string, isExpected: boolean) {
    super(message);
    this.name = 'RunAbort';
    this.kind = kind;
    this.isExpected = isExpected;
  }
}

/** The budget ceiling wound the run down. Expected: this is the system doing its job. */
export class BudgetAbort extends RunAbort {
  constructor(message: string) {
    super('budget', message, true);
  }
}

/** A person pressed cancel. Expected: they meant it. */
export class OperatorAbort extends RunAbort {
  constructor(message: string) {
    super('operator', message, true);
  }
}

/** The worker is going down. Not expected — the run did not get to finish. */
export class ShutdownAbort extends RunAbort {
  constructor(message = 'The worker shut down while this run was in progress.') {
    super('shutdown', message, false);
  }
}

/**
 * What actually stopped this run, read off the signal.
 *
 * Falls back to a sentence that does NOT name a cause when the signal carries no reason — an
 * unattributed abort is an unknown, and "we do not know why this stopped" is a worse-looking and
 * far more useful answer than a confident wrong one. Every abort inside this worker sets a reason;
 * a bare one means something outside it did, and pretending to know would be the original bug.
 */
export function describeAbort(reason: unknown): { kind: AbortKind | 'unknown'; message: string; isExpected: boolean } {
  if (reason instanceof RunAbort) {
    return { kind: reason.kind, message: reason.message, isExpected: reason.isExpected };
  }
  if (reason instanceof Error && reason.message) {
    return { kind: 'unknown', message: reason.message, isExpected: false };
  }
  return {
    kind: 'unknown',
    message:
      'This run was stopped, and the stop carried no reason — so it is not known whether a person ' +
      'cancelled it, a limit was reached, or the worker went down.',
    isExpected: false,
  };
}

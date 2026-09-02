// worker/src/research/run-outcome.ts — D2: one verdict, said once.
//
// ── THE LOG THAT SAID BOTH ──────────────────────────────────────────────────────────────────────
//
// From the Milam run of 2026-09-02, ten minutes apart, about the same run:
//
//     [00:10:53]  Pipeline FAILED in 261.9s
//     [00:15:58]  [Pipeline Lifecycle] Pipeline Complete
//
// Neither line was lying. They are about different things and neither said which:
//
//   · `pipeline.ts` was reporting the RESULT — `status: 'failed'`, meaning the run found no
//     property record and no documents.
//   · `index.ts` was reporting the LIFECYCLE — the pipeline function resolved rather than throwing,
//     which it does whatever the result says. It logged `.success()` unconditionally, so a run that
//     found nothing was announced as a success.
//
// A reader cannot reconcile those, and the one they see last wins.
//
// ── WHY "FAILED" WAS THE WRONG WORD TO BEGIN WITH ───────────────────────────────────────────────
//
// `status = 'failed'` is set when there is no boundary, no property id and no documents. The run
// executed correctly and found nothing — which on the reference run is exactly what happened, with
// the CAD unreachable and the clerk's index returning nothing for an address.
//
// That is a finding, not a fault, and it is a DIFFERENT finding from the pipeline throwing. Calling
// both "FAILED" is the same conflation this plan keeps meeting: a run that stopped at a budget was
// rendered as a failure, a document that was never written was rendered as a success. So the word
// "failed" is reserved here for the case where the pipeline actually threw, and a run that finished
// empty says so in words that invite the right next action — check the source, re-run — instead of
// implying the software broke.
//
// Both call sites take their wording from here, which is the "say it once" half of D2.

export type PipelineStatus = 'complete' | 'partial' | 'failed';

export interface RunOutcome {
  /** The short label. The pipeline log and the lifecycle handshake use the SAME one. */
  label: string;
  /** A sentence a person can act on. */
  sentence: string;
  /**
   * Whether this should be reported as a problem rather than a success.
   *
   * `partial` is deliberately NOT a problem. A run that retrieved a good boundary and a short
   * document set is a usable answer plus a caveat, and flagging it red teaches an operator to
   * ignore red.
   */
  isProblem: boolean;
}

function seconds(durationMs: number): string {
  return `${(durationMs / 1000).toFixed(1)}s`;
}

function documents(count: number): string {
  return count === 1 ? '1 document' : `${count} documents`;
}

/** The verdict on a run that RAN. For one that threw, see `describeCrashedRun`. */
export function describeRunOutcome(
  status: PipelineStatus,
  opts: { documents: number; durationMs: number },
): RunOutcome {
  const took = seconds(opts.durationMs);
  const found = documents(opts.documents);

  if (status === 'complete') {
    return {
      label: 'Research Complete',
      sentence: `Finished in ${took} with ${found}.`,
      isProblem: false,
    };
  }

  if (status === 'partial') {
    return {
      label: 'Research Partial',
      sentence:
        `Finished in ${took} with ${found}. Some sources did not answer, so the record may be ` +
        `incomplete — the run says which ones above.`,
      isProblem: false,
    };
  }

  return {
    label: 'Research Found Nothing',
    sentence:
      `Ran for ${took} and found no property record and no documents. That is a result about this ` +
      `search, not proof the records do not exist: check the sources listed above, then re-run.`,
    isProblem: true,
  };
}

/** The pipeline threw. This is the only case that gets the word "failed". */
export function describeCrashedRun(message: string, durationMs?: number): RunOutcome {
  const took = durationMs === undefined ? '' : ` after ${seconds(durationMs)}`;
  return {
    label: 'Research Failed',
    sentence: `The run stopped with an error${took}: ${message}`,
    isProblem: true,
  };
}

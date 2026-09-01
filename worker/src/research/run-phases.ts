// worker/src/research/run-phases.ts — how far along a run actually is.
//
// ── WHAT THE PROGRESS BAR WAS MEASURING ─────────────────────────────────────────────────────────
//
// Nothing the worker said. `app/admin/research/components/run-progress.ts` took the worker's
// free-text status *message* and ran regexes over it:
//
//     if (/stage\s*3(?!\.\d)/i.test(message) || /extract/i.test(lower) …) return 'extracting';
//
// Then it turned the matched name's INDEX IN A LIST OF EIGHT into a percentage. So the bar answered
// "which of eight labels did a regex match on the last message we happened to poll", which is not a
// measure of completeness and is not even a measure of progress:
//
//   · It cannot move within a phase. Stage 2 downloading document 3 of 40 and Stage 2 downloading
//     document 39 of 40 produce the same percentage, and Stage 2 is most of the run.
//   · It has no idea what the run is FOR. A Bell County run emits `GIS`, `Clerk`, `Plats`,
//     `Deed Analysis`, `FEMA`, `TxDOT`, `Tax`, `Adjacent`, `Map Capture`, `Survey Plan` — not one of
//     which contains the word "stage". They all fell through to the final `return 'analyzing'`, so a
//     Bell run sat at 3/8 for most of its length and then jumped to done.
//   · It goes BACKWARDS. The phases interleave — a late enrichment pass posts another
//     `Stage 2: Fetching deed record…` after Stage 3 has begun — and the bar walks back to 25%.
//   · `CountyResearchProgress.pct` has existed on the type since the router was written and NOTHING
//     HAS EVER SET IT. The field the worker was supposed to answer with was declared and left empty,
//     which is why the client was reduced to guessing from prose in the first place.
//
// ── SO THE WORKER ANSWERS, AND THE ANSWER IS MONOTONIC ──────────────────────────────────────────
//
// This module is the ladder every phase name maps onto, with a weight per rung that reflects how
// long that rung actually takes rather than pretending eight phases are eight equal eighths.
// Document retrieval is 30% of the bar because it is roughly 30% of a run.
//
// And a tracker that never moves backwards. That is not cosmetic: a bar that retreats is read as
// "something went wrong and it is starting over", and the whole complaint this fixes is people
// concluding a healthy run had died. Interleaved phases are normal in this pipeline — enrichment
// re-enters retrieval by design — so the display rule has to be "furthest rung reached", not "rung
// named by the most recent message".

/** A rung on the ladder. `weight` is its share of the run, not its position. */
export interface RunPhase {
  id: string;
  label: string;
  /** Share of the whole run, in arbitrary units. Normalised against the total. */
  weight: number;
  /**
   * Phase names and message fragments that land on this rung.
   *
   * Matched against the worker's `progress.phase` first and the message second. Both are needed:
   * the generic pipeline names its phases in the MESSAGE (`Stage 3: Running Claude AI…`) while the
   * county orchestrators name them in the PHASE field (`Deed Analysis`).
   */
  match: RegExp[];
}

/**
 * The ladder, in the order a run climbs it.
 *
 * Every name here was taken from a live `onProgress({ phase: … })` call or an `updateStatus()`
 * message in this repository — not invented. Adding a phase to the worker without adding it here
 * means it lands on the rung already reached, which is the safe direction: the bar stalls rather
 * than lying.
 */
export const RUN_PHASES: RunPhase[] = [
  {
    id: 'routing',
    label: 'Routing the request',
    weight: 2,
    match: [/^router$/i, /^starting$/i, /^stage\s*0\b/i, /normaliz/i],
  },
  {
    id: 'property',
    label: 'Identifying the property',
    weight: 8,
    match: [/^stage\s*1\b/i, /\bcad\b/i, /^gis$/i, /appraisal/i, /parcel\s+lookup/i],
  },
  {
    id: 'discovery',
    label: 'Finding what exists',
    weight: 12,
    match: [/^discovery$/i, /^sibling/i, /address-to-lot/i, /discover/i],
  },
  {
    id: 'retrieval',
    label: 'Retrieving documents',
    weight: 30,
    match: [/^clerk$/i, /^plats$/i, /^stage\s*2\b/i, /retriev/i, /downloading/i, /fetching deed/i],
  },
  {
    id: 'context',
    label: 'Flood, right-of-way and tax',
    weight: 8,
    match: [/^fema$/i, /^txdot$/i, /^tax$/i, /flood/i, /right.of.way/i],
  },
  {
    id: 'imagery',
    label: 'Capturing maps and imagery',
    weight: 8,
    match: [/^screenshots$/i, /^gis viewer$/i, /^map capture$/i, /screenshot/i, /imagery/i],
  },
  {
    id: 'extraction',
    label: 'Reading the documents',
    weight: 16,
    // `(?!\.\d)` so "Stage 3.5" does not land here — it is reconciliation, a later rung. This is the
    // same trap that made the client's stage-3.5 branch unreachable; it is worth not repeating.
    match: [/^deed analysis$/i, /^plat analysis$/i, /^stage\s*3(?!\.\d)\b/i, /extract/i, /\bclaude\b/i, /\bocr\b/i],
  },
  {
    id: 'reconciliation',
    label: 'Reconciling the geometry',
    weight: 8,
    match: [/^stage\s*3\.5\b/i, /reconcil/i, /closure/i, /traverse/i],
  },
  {
    id: 'validation',
    label: 'Validating and cross-checking',
    weight: 5,
    match: [/^validation$/i, /^adjacent$/i, /^stage\s*4\b/i, /validat/i, /cross.check/i, /discrepanc/i],
  },
  {
    id: 'reporting',
    label: 'Building the report',
    weight: 3,
    match: [/^survey plan$/i, /^phase\s*4$/i, /^stage\s*5\b/i, /completeness/i, /summar/i, /report/i],
  },
];

const TOTAL_WEIGHT = RUN_PHASES.reduce((sum, p) => sum + p.weight, 0);

/** Cumulative percentage at the END of each phase, by index. */
const CUMULATIVE: number[] = (() => {
  const out: number[] = [];
  let acc = 0;
  for (const p of RUN_PHASES) {
    acc += p.weight;
    out.push((acc / TOTAL_WEIGHT) * 100);
  }
  return out;
})();

/** Index of the phase a (phase, message) pair belongs to, or -1 when nothing matches.
 *
 *  The PHASE field wins over the message. A county orchestrator's phase name is a fact it stated
 *  about itself; the message is prose written for a human, and matching prose first is how
 *  "Stage 2: …no documents found, moving to extraction" gets filed under extraction while the run
 *  is still in retrieval. */
export function resolvePhaseIndex(phase: string | undefined, message?: string): number {
  const p = (phase ?? '').trim();
  if (p) {
    for (let i = 0; i < RUN_PHASES.length; i++) {
      if (RUN_PHASES[i].match.some((re) => re.test(p))) return i;
    }
  }
  const m = (message ?? '').trim();
  if (m) {
    for (let i = 0; i < RUN_PHASES.length; i++) {
      if (RUN_PHASES[i].match.some((re) => re.test(m))) return i;
    }
  }
  return -1;
}

/** The percentage a run sits at when it has *entered* the phase at `index` and is `fraction`
 *  of the way through it.
 *
 *  Entering a phase does not credit its weight — that is what "in progress" means. A run that has
 *  just started retrieval is at the END of discovery, not the end of retrieval. */
export function percentAt(index: number, fraction = 0): number {
  if (index < 0) return 0;
  const clampedIndex = Math.min(index, RUN_PHASES.length - 1);
  const start = clampedIndex === 0 ? 0 : CUMULATIVE[clampedIndex - 1];
  const end = CUMULATIVE[clampedIndex];
  const f = Math.min(1, Math.max(0, fraction));
  return start + (end - start) * f;
}

export interface RunProgressSnapshot {
  /** Phase id, e.g. `retrieval`. */
  phaseId: string;
  /** Human label for the phase. */
  phaseLabel: string;
  /** 0-based rung. */
  phaseIndex: number;
  /** How many rungs there are, so a client can render a stepper without knowing the list. */
  phaseCount: number;
  /** 0–99 while running; only a finished run reaches 100. */
  percent: number;
  /** The raw phase name the worker emitted, kept so the console can show the truth. */
  rawPhase: string | null;
}

/**
 * Tracks a single run's progress, monotonically.
 *
 * ── WHY THE CEILING IS 99 AND NOT 96 ──────────────────────────────────────────────────────────
 *
 * The old client clamped to 96 while running. The number is arbitrary either way; what matters is
 * that it is BELOW 100 and that 100 is reachable ONLY by `finish()`. A bar that reaches 100 while
 * work continues is the same lie as one that shows failed while work continues, and this whole
 * module exists because of that class of lie.
 */
export class RunProgressTracker {
  private highestIndex = -1;
  private highestPercent = 0;
  private rawPhase: string | null = null;
  private finished = false;

  /** Feed a progress event. Returns the snapshot to report. */
  observe(phase: string | undefined, message?: string, fractionWithinPhase = 0): RunProgressSnapshot {
    if (this.finished) return this.snapshot();

    const index = resolvePhaseIndex(phase, message);
    if (index >= 0) {
      // A LATER rung raises the floor. An EARLIER one does not lower it — enrichment re-entering
      // retrieval after extraction has begun is normal here, and walking the bar back for it is
      // exactly the behaviour that reads as "it crashed and restarted".
      if (index > this.highestIndex) this.highestIndex = index;
      const candidate = percentAt(index, fractionWithinPhase);
      if (candidate > this.highestPercent) this.highestPercent = candidate;
    }
    if (phase) this.rawPhase = phase;

    return this.snapshot();
  }

  /** Mark the run finished. Only this reaches 100, and only on a real completion. */
  finish(outcome: 'complete' | 'failed' | 'interrupted' | 'cancelled'): RunProgressSnapshot {
    this.finished = true;
    if (outcome === 'complete') {
      this.highestIndex = RUN_PHASES.length - 1;
      this.highestPercent = 100;
    }
    // A failed, interrupted or cancelled run keeps the percentage it actually reached. That number
    // is the useful one: "it died at 68%" tells somebody roughly what they still hold, and pinning
    // it to 0 or 100 throws that away.
    return this.snapshot();
  }

  snapshot(): RunProgressSnapshot {
    const index = Math.max(0, this.highestIndex);
    const phase = RUN_PHASES[index];
    const percent = this.finished
      ? Math.round(this.highestPercent)
      : Math.min(99, Math.round(this.highestPercent));
    return {
      phaseId: phase.id,
      phaseLabel: phase.label,
      phaseIndex: index,
      phaseCount: RUN_PHASES.length,
      percent,
      rawPhase: this.rawPhase,
    };
  }
}

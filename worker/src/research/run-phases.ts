// worker/src/research/run-phases.ts — how far along a run actually is.
//
// ── THE 92% BUG, AND WHY IT WAS INEVITABLE ──────────────────────────────────────────────────────
//
// Reported by the owner: the bar "quickly jumps up to 92% after the research has begun and then
// loads slowly from there until complete… deceiving for it to get to 92% in a few seconds and then
// slowly build to 100% for 15-30 minutes."
//
// 92% was exactly the boundary where the old `validation` rung began. And `counties/router.ts:412`
// emits this BEFORE ANY WORK STARTS:
//
//     onProgress({ phase: 'Validation', message: 'Verifying address and county match...' })
//
// The old ladder matched `/^validation$/i` and filed it under late cross-checking. The tracker is
// monotonic, so the first second of every run pinned the bar at 92% permanently. Production agreed:
// of four recorded runs, one sat at `progress_percent = 92` and another at 98 while still in
// "Phase 2".
//
// The root cause is a NAME COLLISION — "Validation" the cheap input pre-check versus "Validation"
// the expensive late verification — and the old design made that collision unavoidable, because it
// matched loose single words against free-text messages: `/validat/i`, `/report/i`, `/summar/i`,
// `/extract/i`. Any message containing any of those words anywhere could leap the bar to the end.
// With a monotonic tracker, one false match is permanent.
//
// ── THE INVERSION THAT FIXES THE WHOLE CLASS ────────────────────────────────────────────────────
//
// Old rule: an unrecognised string is matched against loose patterns and MAY advance the bar.
// New rule: only an EXPLICITLY RECOGNISED name advances the bar. Everything else leaves the
// milestone where it is and lets the clock keep interpolating.
//
// That is strictly safer in the direction that matters. An unknown phase now costs a bar that
// creeps on time alone until the next known milestone — mildly imprecise, self-correcting. Under
// the old rule it cost a bar wrong by 90 points, permanently, on every run.
//
// ── AND WHY THE BAR NOW MOVES LIKE A CLOCK ──────────────────────────────────────────────────────
//
// The second half of the complaint was that progress felt "jumpy and artificial" — it stepped at
// phase boundaries and froze between them. A run emits a progress event every few minutes; the
// screen polls every three seconds. Nothing moved in between.
//
// So each phase declares HOW LONG IT USUALLY TAKES, and its share of the bar is DERIVED from that
// duration rather than declared separately. One number, one source: a phase that is 30% of the
// wall clock is 30% of the bar, and the two cannot drift apart because there is nothing to drift.
// Between milestones the bar interpolates on elapsed time, so it advances every second.
//
// That is what makes it feel linear: the bar is a clock that gets corrected by milestones, rather
// than a milestone counter that jumps.

/** A rung on the ladder.
 *
 *  `expectedSec` is the ONLY tuning number. Weight, cumulative position and the interpolation rate
 *  all derive from it. To make the bar match reality better, change a duration — never a percentage,
 *  because a percentage that disagrees with its duration is exactly how a bar starts lying. */
export interface RunPhase {
  id: string;
  label: string;
  /** Typical wall-clock seconds for this phase on a full run. Measured/estimated, not invented as
   *  a share — see the header. */
  expectedSec: number;
  /**
   * Phase names and message fragments that land on this rung, ANCHORED.
   *
   * Every pattern here is either an exact name or anchored at the start of the string. Loose
   * substring words are banned by construction: `/validat/i` is what pinned every run at 92%.
   */
  match: RegExp[];
}

/**
 * The ladder, in the order a run climbs it.
 *
 * Finer-grained than it was, at the owner's suggestion — thirteen rungs rather than ten, so the
 * steps between milestones are smaller and the movement reads as continuous rather than as three
 * big lurches.
 *
 * Every name below was taken from a live `onProgress({ phase })` call or an `updateStatus()`
 * message in this repository, checked against the phase strings actually present in
 * `research_runs`. The old list contained rungs whose names nothing ever emitted, which is its own
 * kind of lie: a bar that cannot reach a milestone it displays.
 */
export const RUN_PHASES: RunPhase[] = [
  {
    id: 'precheck',
    label: 'Checking the request',
    expectedSec: 8,
    // `Validation` belongs HERE, not at the far end. This is the router's address/county sanity
    // check, which runs before any work and is the single line that caused the 92% jump.
    match: [/^validation$/i, /^router$/i, /^starting$/i, /^stage\s*0\b/i, /^normaliz/i],
  },
  {
    id: 'property',
    label: 'Identifying the property',
    expectedSec: 70,
    match: [/^gis$/i, /^stage\s*1\b/i, /^phase\s*1$/i, /^cad\b/i, /^appraisal/i],
  },
  {
    id: 'discovery',
    label: 'Finding what exists',
    expectedSec: 60,
    match: [/^discovery$/i, /^deed chain$/i, /^sibling/i, /^address-to-lot/i],
  },
  {
    id: 'clerk_search',
    label: 'Searching the county records',
    expectedSec: 120,
    // The generic pipeline names its steps in the MESSAGE, so `Stage 2: Clerk search` is matched
    // here while `Stage 2: Downloading…` falls to retrieval below. Anchored, so a message merely
    // mentioning a clerk cannot reach it.
    match: [/^clerk$/i, /^stage\s*2:\s*clerk\s+search/i],
  },
  {
    id: 'retrieval',
    label: 'Retrieving documents',
    expectedSec: 360,
    match: [
      /^plats$/i, /^phase\s*2$/i,
      /^stage\s*2:\s*(retriev|download|fetch)/i,
      /^stage\s*2\b/i,
    ],
  },
  {
    id: 'purchase',
    label: 'Obtaining paid documents',
    // CONDITIONAL, so this is the average across ALL runs, not the duration when it happens.
    // Most runs buy nothing — paid documents are switched off, or the free sources sufficed — and a
    // rung weighted for the run where it DOES happen makes the bar leap by its whole share on every
    // run where it does not. A trace showed exactly that: two ~10-point steps mid-run. The honest
    // number for a bar predicting a typical run is the average, not the best case.
    expectedSec: 30,
    match: [/^purchase$/i, /^stage\s*2\.5\b/i],
  },
  {
    id: 'context',
    label: 'Flood, right-of-way and tax',
    expectedSec: 90,
    match: [/^fema$/i, /^txdot$/i, /^tax$/i],
  },
  {
    id: 'imagery',
    label: 'Capturing maps and imagery',
    expectedSec: 150,
    match: [/^screenshots$/i, /^gis viewer$/i, /^map capture$/i, /^capture$/i],
  },
  {
    id: 'ocr',
    label: 'Reading the document text',
    // Conditional in the same way — see 'purchase' above. Only a run that retrieved page images
    // OCRs them, so the ladder carries the average rather than the when-it-happens duration.
    expectedSec: 45,
    match: [/^ocr$/i, /^stage\s*3:\s*ocr/i, /^phase\s*3b$/i],
  },
  {
    id: 'extraction',
    label: 'Extracting the deed and plat data',
    expectedSec: 240,
    // `(?!\.\d)` so "Stage 3.5" is not swallowed here — it is reconciliation, a later rung. The old
    // file had this same guard and it was still defeated, because the loose `/extract/i` beside it
    // matched anything.
    match: [
      /^deed analysis$/i, /^plat analysis$/i, /^phase\s*3$/i,
      /^stage\s*3(?!\.\d)\b/i,
    ],
  },
  {
    id: 'reconciliation',
    label: 'Reconciling the geometry',
    expectedSec: 70,
    match: [/^stage\s*3\.5\b/i, /^phase\s*3d$/i, /^reconciliation$/i],
  },
  {
    id: 'validation',
    label: 'Cross-checking and adjoiners',
    expectedSec: 70,
    // NOT `/^validation$/i` — that name is taken by the pre-check at the top of this list, which is
    // the whole bug. Bell's late verification step is `Phase 3C`; the adjoiner pass is `Adjacent`.
    match: [/^adjacent$/i, /^phase\s*3c$/i, /^stage\s*4\b/i, /^cross.?valid/i],
  },
  {
    id: 'reporting',
    label: 'Building the report',
    expectedSec: 30,
    match: [/^survey plan$/i, /^phase\s*4$/i, /^stage\s*5\b/i, /^report assembly/i],
  },
];

const TOTAL_SEC = RUN_PHASES.reduce((sum, p) => sum + p.expectedSec, 0);

/** Cumulative percentage at the END of each phase. Derived from duration — see the header. */
const CUMULATIVE: number[] = (() => {
  const out: number[] = [];
  let acc = 0;
  for (const p of RUN_PHASES) {
    acc += p.expectedSec;
    out.push((acc / TOTAL_SEC) * 100);
  }
  return out;
})();

/** Where a phase begins, as a percentage. */
function phaseStartPercent(index: number): number {
  return index <= 0 ? 0 : CUMULATIVE[index - 1];
}

/** A phase's share of the bar, in percentage points. */
function phaseSpanPercent(index: number): number {
  return CUMULATIVE[index] - phaseStartPercent(index);
}

/**
 * Index of the phase a (phase, message) pair belongs to, or **-1 when nothing is recognised**.
 *
 * -1 is a real answer and the caller must honour it: an unrecognised name leaves the milestone
 * alone. That is the inversion described in the header, and it is the entire fix for a whole class
 * of "the bar jumped and never came back".
 *
 * The PHASE field is consulted before the message, because a phase name is a fact the worker stated
 * about itself while a message is prose written for a person.
 */
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

/**
 * How far through a phase the clock says we are, 0–1.
 *
 * Linear to the expected duration, then asymptotic. A phase that runs long keeps creeping toward
 * its own ceiling without ever crossing it, so a slow retrieval looks like slow progress rather
 * than a frozen bar — and never claims work it has not finished.
 *
 *   t = 0        → 0.00
 *   t = T/2      → 0.45
 *   t = T        → 0.90
 *   t = 2T       → 0.96
 *   t = 100T     → 1.00 (saturates in floating point)
 *
 * It saturates at 1 rather than approaching it forever, and that is fine: fraction 1 means "the end
 * of THIS phase", which is the most a phase can honestly claim. It can never reach into the next
 * phase's span, and the overall bar is capped at 99 until a genuine completion. An earlier version
 * of this comment claimed 1.0 was never reached — a test caught the discrepancy, and the guarantee
 * worth stating is the one below, not an asymptote nobody depends on.
 */
export function timeFraction(elapsedSec: number, expectedSec: number): number {
  if (!(expectedSec > 0) || !(elapsedSec > 0)) return 0;
  const r = elapsedSec / expectedSec;
  if (r <= 1) return 0.9 * r;
  return 0.9 + 0.1 * (1 - Math.exp(-(r - 1)));
}

/**
 * The percentage a run sits at when it has entered phase `index` and is `fraction` through it.
 *
 * Entering a phase does not credit its span — that is what "in progress" means.
 */
export function percentAt(index: number, fraction = 0): number {
  if (index < 0) return 0;
  const i = Math.min(index, RUN_PHASES.length - 1);
  const f = Math.min(1, Math.max(0, fraction));
  return phaseStartPercent(i) + phaseSpanPercent(i) * f;
}

export interface RunProgressSnapshot {
  phaseId: string;
  phaseLabel: string;
  phaseIndex: number;
  phaseCount: number;
  /** 0–99 while running; only a finished run reaches 100. */
  percent: number;
  /** The raw phase name the worker emitted, kept so the console can show the truth. */
  rawPhase: string | null;
  /** Seconds still expected, from the ladder. Null once finished. */
  etaSec: number | null;
}

/**
 * Tracks a single run's progress, monotonically and on a clock.
 *
 * ── WHY IT INTERPOLATES AT READ TIME ──────────────────────────────────────────────────────────
 *
 * `snapshot()` recomputes from the current time, not from the last `observe()`. Progress events
 * arrive minutes apart; the screen polls every three seconds. Without this the bar would sit
 * perfectly still between events and then hop — which is the "jumpy and artificial" half of the
 * complaint, independent of the 92% bug.
 */
export class RunProgressTracker {
  private highestIndex = -1;
  private highestPercent = 0;
  private rawPhase: string | null = null;
  private finished = false;
  /** When the current phase was entered, for interpolation. */
  private phaseEnteredAtMs: number;
  /** Explicit fraction from the worker (documents 12/40), when it supplies one. */
  private reportedFraction = 0;

  constructor(nowMs: number = Date.now()) {
    this.phaseEnteredAtMs = nowMs;
  }

  /**
   * Feed a progress event.
   *
   * `fractionWithinPhase` is the worker's own count when it has one — "document 12 of 40" is better
   * evidence than the clock, so it wins whenever it is larger.
   */
  observe(
    phase: string | undefined,
    message?: string,
    fractionWithinPhase = 0,
    nowMs: number = Date.now(),
  ): RunProgressSnapshot {
    if (this.finished) return this.snapshot(nowMs);

    const index = resolvePhaseIndex(phase, message);

    // An unrecognised name does NOT move the milestone. It is not evidence of anything, and the old
    // behaviour — guess from a loose word match — is what pinned every run at 92%.
    if (index >= 0 && index > this.highestIndex) {
      this.highestIndex = index;
      this.phaseEnteredAtMs = nowMs;
      this.reportedFraction = 0;
    }

    if (fractionWithinPhase > this.reportedFraction) this.reportedFraction = fractionWithinPhase;
    if (phase) this.rawPhase = phase;

    return this.snapshot(nowMs);
  }

  /** Mark the run finished. Only this reaches 100, and only on a real completion. */
  finish(outcome: 'complete' | 'failed' | 'interrupted' | 'cancelled', nowMs: number = Date.now()): RunProgressSnapshot {
    if (outcome === 'complete') {
      this.highestIndex = RUN_PHASES.length - 1;
      this.highestPercent = 100;
    }
    // A failed, interrupted or cancelled run keeps the percentage it actually reached. "It died at
    // 68%" tells somebody roughly what they still hold; pinning it to 0 or 100 throws that away.
    this.finished = true;
    return this.snapshot(nowMs);
  }

  snapshot(nowMs: number = Date.now()): RunProgressSnapshot {
    const index = Math.max(0, this.highestIndex);
    const phase = RUN_PHASES[index];

    if (this.finished) {
      const pct = Math.round(this.highestPercent);
      return {
        phaseId: phase.id, phaseLabel: phase.label, phaseIndex: index,
        phaseCount: RUN_PHASES.length, percent: pct, rawPhase: this.rawPhase, etaSec: null,
      };
    }

    const elapsedSec = Math.max(0, (nowMs - this.phaseEnteredAtMs) / 1000);
    const byClock = timeFraction(elapsedSec, phase.expectedSec);
    // The worker's own count beats the clock when it has one.
    const fraction = Math.max(byClock, Math.min(1, this.reportedFraction));

    const candidate = percentAt(index, fraction);
    // Monotonic. The clock only ever adds, and a milestone correction can only raise the floor.
    if (candidate > this.highestPercent) this.highestPercent = candidate;

    const percent = Math.min(99, Math.round(this.highestPercent));

    return {
      phaseId: phase.id,
      phaseLabel: phase.label,
      phaseIndex: index,
      phaseCount: RUN_PHASES.length,
      percent,
      rawPhase: this.rawPhase,
      etaSec: estimateRemainingSec(index, fraction),
    };
  }
}

/**
 * Roughly how long is left, in seconds.
 *
 * The remainder of the current phase plus every phase after it. Deliberately coarse — it is a
 * ladder average, not a prediction about this property — and it exists because "68%" answers a
 * different question from "about twelve minutes left", and the second is the one an operator
 * deciding whether to wait actually has.
 */
export function estimateRemainingSec(index: number, fraction: number): number {
  const i = Math.max(0, Math.min(index, RUN_PHASES.length - 1));
  const remainingHere = RUN_PHASES[i].expectedSec * (1 - Math.min(1, Math.max(0, fraction)));
  let rest = 0;
  for (let k = i + 1; k < RUN_PHASES.length; k++) rest += RUN_PHASES[k].expectedSec;
  return Math.round(remainingHere + rest);
}

/** Total expected seconds for a full run, exported so a caller can show "of about N minutes". */
export const EXPECTED_TOTAL_SEC = TOTAL_SEC;

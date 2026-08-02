// worker/src/infra/queue-worker.ts — many runs without trampling each other (plan R29).
//
// ── WHAT THIS CLOSES ────────────────────────────────────────────────────────────────────────────
//
// R2 computed how many pipelines this box can hold. R12 stopped concurrent requests hammering one
// county's servers. R28 built the queue, the deduplicated request and the atomic claim. Nothing
// pulled from that queue — so the whole unattended path ended at a table nobody read.
//
// ── THREE LIMITS, AND THEY ARE NOT THE SAME LIMIT ───────────────────────────────────────────────
//
// 1. MACHINE — how many pipelines fit in RAM and cores (R2). Exceeding it does not slow the box
//    down gracefully; Chromium is OOM-killed and every run in flight dies with it.
// 2. COUNTY — how many runs may touch ONE county at once. This is 1, always. R12 paces requests to
//    a host, but three concurrent runs on Bell County still means three browser sessions logging
//    into one small clerk portal, and the pacing only spaces out the collision.
// 3. POLITENESS — the per-host gap, already enforced inside the run.
//
// The machine limit is about us falling over. The county limit is about somebody else falling over,
// which is the one that loses access permanently — so it is a hard serialisation, not a delay.

export interface QueuedRequest {
  id: string;
  address: string;
  county: string;
  /** Higher runs first. A job with a crew scheduled tomorrow outranks a speculative lookup. */
  priority?: number;
  queued_at: string;
}

export interface RunningRun {
  requestId: string;
  county: string;
  startedAt: number;
}

export interface AdmissionDecision {
  admit: QueuedRequest[];
  /** Requests deliberately left in the queue this tick, each with the reason. Reported rather than
   *  silently skipped: a request that never starts and never explains itself is indistinguishable
   *  from a queue that is broken. */
  held: Array<{ request: QueuedRequest; reason: string }>;
  freeSlots: number;
}

/** Normalise a county for comparison. "Bell" and "Bell County" are one county, and treating them as
 *  two would let both run at once against the same clerk. */
export function countyKey(county: string): string {
  return county.trim().toUpperCase().replace(/\s+COUNTY$/, '').replace(/[^A-Z0-9]/g, '');
}

/** Which queued requests may start right now.
 *
 *  Ordered by priority then by age, so a high-priority request cannot be starved by a steady trickle
 *  of ordinary ones, and two requests of equal priority are served oldest-first — otherwise a busy
 *  queue can leave one request waiting indefinitely while newer ones overtake it. */
export function admit(
  queued: QueuedRequest[],
  running: RunningRun[],
  maxConcurrent: number,
): AdmissionDecision {
  const freeSlots = Math.max(0, maxConcurrent - running.length);
  const busyCounties = new Set(running.map((r) => countyKey(r.county)));

  const ordered = [...queued].sort((a, b) => {
    const p = (b.priority ?? 0) - (a.priority ?? 0);
    return p !== 0 ? p : a.queued_at.localeCompare(b.queued_at);
  });

  const admit: QueuedRequest[] = [];
  const held: AdmissionDecision['held'] = [];

  for (const req of ordered) {
    const key = countyKey(req.county);

    if (busyCounties.has(key)) {
      held.push({
        request: req,
        reason: `${req.county} County already has a run in progress. Counties are handled one at a time — three browser sessions on one small clerk portal is how a firm loses access to it.`,
      });
      continue;
    }
    if (admit.length >= freeSlots) {
      held.push({
        request: req,
        reason: `No free slot: ${running.length + admit.length} of ${maxConcurrent} pipelines are running. Exceeding this gets Chromium OOM-killed, which takes every run in flight down with it.`,
      });
      continue;
    }

    admit.push(req);
    // Claim the county for this tick too, or two queued requests for one county would both be
    // admitted in the same pass — the bug the running-set check alone does not catch.
    busyCounties.add(key);
  }

  return { admit, held, freeSlots };
}

// ── Back-pressure ───────────────────────────────────────────────────────────────────────────────

export interface BacklogStatus {
  queued: number;
  running: number;
  maxConcurrent: number;
  /** Rough wait for something joining the back of the queue now. */
  estimatedWaitMinutes: number | null;
  /** True when the queue is growing faster than it drains — the signal to stop accepting, or to add
   *  a machine, rather than letting it silently stretch to days. */
  saturated: boolean;
  headline: string;
}

/** Typical run length, minutes. The owner's own figure for a full run, used only to turn a queue
 *  depth into something a person can act on. */
export const TYPICAL_RUN_MINUTES = 25;
/** Past this many waiting per slot, the queue is not a queue any more. */
export const SATURATION_RATIO = 4;

export function backlogStatus(
  queued: number,
  running: number,
  maxConcurrent: number,
  runMinutes = TYPICAL_RUN_MINUTES,
): BacklogStatus {
  const slots = Math.max(1, maxConcurrent);
  // Waves of `slots` runs, each taking runMinutes. A request at position N waits for the waves ahead.
  const estimatedWaitMinutes = queued === 0 ? 0 : Math.ceil((queued + running) / slots) * runMinutes;
  const saturated = queued > slots * SATURATION_RATIO;

  const headline = queued === 0 && running === 0
    ? 'Nothing queued or running.'
    : saturated
      ? `${queued} waiting for ${slots} slot(s) — about ${estimatedWaitMinutes} minutes to the back of the queue. ` +
        'This is not a queue any more; either stop accepting requests or add a machine.'
      : `${running} running, ${queued} waiting — roughly ${estimatedWaitMinutes} minutes for a request joining now.`;

  return { queued, running, maxConcurrent, estimatedWaitMinutes, saturated, headline };
}

// ── The poll loop ───────────────────────────────────────────────────────────────────────────────

export interface PollerDeps {
  /** Claim one request from the app's queue. Returns null when nothing is available. */
  claim: () => Promise<QueuedRequest | null>;
  /** Run it to completion. Rejecting is a failed run, not a crashed poller. */
  run: (req: QueuedRequest) => Promise<{ projectId?: string; packetId?: string }>;
  /** Report the outcome so the requester is notified either way (R28). */
  report: (req: QueuedRequest, outcome: 'complete' | 'failed', detail: { projectId?: string; packetId?: string; failureReason?: string }) => Promise<void>;
  currentRunning: () => RunningRun[];
  maxConcurrent: () => number;
  log?: (msg: string) => void;
}

/** One tick: claim and start as many as the limits allow.
 *
 *  Claims ONE AT A TIME rather than fetching a batch, because the claim is what makes the race safe
 *  (R28) and a batch read reintroduces exactly the window it closes. Returns how many started, so a
 *  caller can back off when the queue is dry instead of hammering the app every second. */
export async function pollOnce(deps: PollerDeps): Promise<number> {
  const log = deps.log ?? (() => {});
  let started = 0;

  for (;;) {
    const running = deps.currentRunning();
    const max = deps.maxConcurrent();
    if (running.length >= max) {
      if (started === 0) log(`[Queue] All ${max} pipeline slot(s) busy — not claiming.`);
      break;
    }

    const req = await deps.claim();
    if (!req) break;

    // The county check happens AFTER the claim because the claim is the only atomic operation
    // available. A request claimed for a busy county is released back to the queue rather than run
    // — losing the race to ourselves is not a reason to start a second session on one clerk.
    if (deps.currentRunning().some((r) => countyKey(r.county) === countyKey(req.county))) {
      log(`[Queue] ${req.county} County is already running — releasing ${req.id} back to the queue.`);
      await deps.report(req, 'failed', {
        failureReason: `Released: ${req.county} County already had a run in progress. Requeued rather than run concurrently.`,
      });
      continue;
    }

    started++;
    log(`[Queue] Starting ${req.address}, ${req.county} County (${running.length + 1}/${max}).`);

    // Deliberately NOT awaited: the point of the loop is to fill the free slots. Each run reports
    // its own outcome, and a throw here must not stop the poller — a crashed poller means a queue
    // that stops draining with no error anywhere.
    void deps.run(req)
      .then((r) => deps.report(req, 'complete', r))
      .catch((e) => deps.report(req, 'failed', { failureReason: e instanceof Error ? e.message : String(e) })
        .catch(() => log(`[Queue] Could not report the failure of ${req.id} — it will look stuck.`)));
  }

  return started;
}

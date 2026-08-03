// worker/src/infra/queue-poller.ts — the loop that actually pulls from the queue (plans R28/R29).
//
// R28 built the queue, the deduplicated request, the atomic claim and the notify-either-way
// reporting. R29 built `pollOnce` — admission, per-county serialisation, priority, back-pressure.
// Both were proven from both ends, and **nothing called `pollOnce`**, so the unattended path still
// ended at a table nobody read.
//
// This is the driver. It is deliberately small: everything that decides *what* to run is in
// `queue-worker.ts`, and everything here is about *when* to ask, and about not making things worse
// when the answer is an error.
//
// ── WHY IT IS OFF BY DEFAULT ────────────────────────────────────────────────────────────────────
//
// This is the one loop in the platform that spends money and touches other people's servers with no
// human in the loop: each tick can start a 20–30 minute run that logs into a county clerk portal and
// may buy pages. The plan gates outward-facing scheduled work behind an env flag for exactly that
// reason, so `RESEARCH_QUEUE_POLLER` must be set to `1` before anything polls at all. An unset flag
// means a worker that boots, says so, and stays idle.
//
// That also makes "deploy the box" a configuration step rather than a code change, which is what the
// plan meant by the wiring belonging with the deployment.
//
// ── THE FAILURES A NAIVE TIMER HAS ──────────────────────────────────────────────────────────────
//
// `setInterval(poll, 5000)` is wrong in three ways that all present as the same symptom — a queue
// that stops draining with nothing in the logs:
//
//   * OVERLAP. A tick that takes longer than the interval starts a second tick beside itself, and
//     two ticks claiming concurrently is the race R28's atomic claim exists to make survivable, not
//     one to invite. Ticks here never overlap.
//   * A THROW ENDS IT. An unhandled rejection inside an interval callback kills the timer in some
//     runtimes and is silent in all of them. Every tick is wrapped.
//   * NO BACKOFF. An empty queue polled every five seconds is a request per second per worker
//     against the app forever. When a tick starts nothing, the next wait grows.

export interface PollerLoopDeps {
  /** One tick. Returns how many runs it started — 0 means the queue was dry or the box was full. */
  tick: () => Promise<number>;
  log?: (msg: string) => void;
  /** Injected so tests do not wait in real time. */
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
}

export interface PollerOptions {
  /** Wait after a tick that started work — short, because there may be more. */
  busyIntervalMs?: number;
  /** Wait after a tick that started nothing. Grows to `maxIdleIntervalMs`. */
  idleIntervalMs?: number;
  maxIdleIntervalMs?: number;
  /** Wait after a tick that threw. Separate from idle: an erroring app should be asked less often
   *  than a merely empty one, and asking harder is how a struggling app is pushed over. */
  errorIntervalMs?: number;
}

export const DEFAULT_BUSY_MS = 2_000;
export const DEFAULT_IDLE_MS = 15_000;
export const DEFAULT_MAX_IDLE_MS = 120_000;
export const DEFAULT_ERROR_MS = 60_000;

/** Is the poller allowed to run at all?
 *
 *  Kept as a function so the reason lives in one place, and so a boot log can say which of the two
 *  missing pieces stopped it — "not enabled" and "enabled but has no key" are different problems and
 *  the second one is a misconfiguration somebody needs to hear about. */
export function pollerEnabled(env: NodeJS.ProcessEnv = process.env): { enabled: boolean; reason: string } {
  if (env.RESEARCH_QUEUE_POLLER !== '1') {
    return {
      enabled: false,
      reason: 'RESEARCH_QUEUE_POLLER is not set to 1 — this worker will not pull from the research queue. Queued requests wait for a worker that has it enabled.',
    };
  }
  if (!env.WORKER_API_KEY) {
    return {
      enabled: false,
      reason: 'RESEARCH_QUEUE_POLLER=1 but WORKER_API_KEY is not set — the claim endpoint would reject every call with 401. Refusing to poll rather than logging an auth failure every tick.',
    };
  }
  if (!env.APP_BASE_URL) {
    return {
      enabled: false,
      reason: 'RESEARCH_QUEUE_POLLER=1 but APP_BASE_URL is not set — there is no queue to poll. Refusing to start.',
    };
  }
  return { enabled: true, reason: 'Polling the research queue.' };
}

export interface PollerHandle {
  /** Stop scheduling further ticks. Runs already in flight are NOT cancelled — see below. */
  stop: () => void;
  /** For tests and for a health endpoint. */
  stats: () => { ticks: number; started: number; errors: number; running: boolean };
}

/** Start the loop. Returns a handle whose `stop()` prevents further ticks.
 *
 *  `stop()` deliberately does not cancel in-flight runs. A run is a 20–30 minute pipeline that has
 *  already claimed its request and may have spent money; killing it mid-flight leaves the request
 *  claimed, unreported and indistinguishable from one still working — which is the exact state R28's
 *  notify-either-way rule exists to prevent. Draining is the correct shutdown, and a supervisor that
 *  wants a hard stop should kill the process, which at least leaves the claim visibly stale. */
export function startPoller(deps: PollerLoopDeps, opts: PollerOptions = {}): PollerHandle {
  const busyMs = opts.busyIntervalMs ?? DEFAULT_BUSY_MS;
  const idleMs = opts.idleIntervalMs ?? DEFAULT_IDLE_MS;
  const maxIdleMs = opts.maxIdleIntervalMs ?? DEFAULT_MAX_IDLE_MS;
  const errorMs = opts.errorIntervalMs ?? DEFAULT_ERROR_MS;

  const log = deps.log ?? (() => {});
  const setTimer = deps.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
  const clearTimer = deps.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));

  let stopped = false;
  let handle: unknown = null;
  let currentIdle = idleMs;
  const stats = { ticks: 0, started: 0, errors: 0, running: false };

  const schedule = (ms: number) => {
    if (stopped) return;
    handle = setTimer(() => { void tickOnce(); }, ms);
  };

  const tickOnce = async (): Promise<void> => {
    if (stopped) return;
    // A tick never overlaps another. The guard is here rather than in the scheduler because a
    // manually triggered tick has to respect it too.
    if (stats.running) return;

    stats.running = true;
    stats.ticks++;
    try {
      const started = await deps.tick();
      stats.started += started;

      if (started > 0) {
        // Something started, so there may be more room. Reset the backoff and look again soon.
        currentIdle = idleMs;
        schedule(busyMs);
      } else {
        schedule(currentIdle);
        // Grow the wait for the NEXT empty tick. A dry queue polled at a fixed short interval is a
        // request per second per worker against the app, forever.
        currentIdle = Math.min(currentIdle * 2, maxIdleMs);
      }
    } catch (err) {
      stats.errors++;
      // Never rethrown. A throw escaping here stops the loop, and a stopped poller is a queue that
      // silently stops draining — the failure mode with no error anywhere.
      log(`[Queue] Poll tick failed: ${err instanceof Error ? err.message : String(err)}. Retrying in ${errorMs / 1000}s.`);
      schedule(errorMs);
    } finally {
      stats.running = false;
    }
  };

  // First tick immediately: a worker that boots beside a full queue should not wait out an interval
  // before doing anything.
  schedule(0);

  return {
    stop: () => {
      stopped = true;
      if (handle !== null) clearTimer(handle);
      log('[Queue] Poller stopped — no further ticks. Runs already in flight are left to finish and report.');
    },
    stats: () => ({ ...stats }),
  };
}

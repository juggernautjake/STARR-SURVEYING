// lib/research/worker-watchdog.ts — decide whether a worker state change is worth waking somebody.
//
// ── THE FAILURE THIS EXISTS FOR ─────────────────────────────────────────────────────────────────
//
// The previous research worker died by silently never coming back. Nothing watched it, so the first
// person to learn was the first person who needed it — which is the worst possible order.
//
// `interpretWorkerProbe` already says WHICH of four states the worker is in, and `/admin/research`
// renders that. What neither can do is notice unprompted, because a banner requires somebody to be
// looking at it, and the whole problem was that nobody was.
//
// ── WHY THIS IS A SEPARATE PURE MODULE ──────────────────────────────────────────────────────────
//
// The cron route does I/O: probe, read the last state, notify, write the new state. The *decision* —
// is this change worth a notification, and what should it say — is a pure function of (previous
// state, current state). Splitting it that way is what makes the alerting policy testable without a
// worker, a database or a clock, and the policy is the part with the interesting mistakes in it.
//
// ── ALERT ON THE TRANSITION, NOT ON THE STATE ───────────────────────────────────────────────────
//
// This is the entire design, and getting it wrong is how monitoring becomes noise. A worker that is
// down for three days is ONE piece of news, not seventy-two. If the cron notified whenever the state
// was bad, the third day would look exactly like the first, everybody would mute the alert, and the
// next real outage would arrive in a muted channel.
//
// So: notify when the state CHANGES, and say what it changed from.
//
// ── RECOVERY IS ALSO NEWS ───────────────────────────────────────────────────────────────────────
//
// A watchdog that only ever reports bad news teaches people that silence is ambiguous — is it fine,
// or did the watchdog itself die? Announcing the recovery closes the loop, and it is the message
// that tells somebody they can stop worrying.
//
// ── `degraded` IS WORSE THAN `unreachable` ──────────────────────────────────────────────────────
//
// It looks up. It answers health checks, accepts work, and then fails that work twenty minutes in
// after a run has already spent money on documents. So it escalates higher than being down.

import type { WorkerState, WorkerVerdict } from '@/lib/research/worker-status';

/** How loudly a transition should arrive. Mirrors `NotifyOptions['escalation_level']`. */
export type WatchdogLevel = 'low' | 'normal' | 'high' | 'urgent' | 'critical';

export interface WatchdogDecision {
  /** Whether to send anything at all. */
  notify: boolean;
  level: WatchdogLevel;
  title: string;
  body: string;
  /** Always returned, so the caller can persist it whether or not it notified. */
  state: WorkerState;
}

/** States in which the worker cannot take a deep run. `not_configured` is NOT one of them: a
 *  deployment with no worker is a valid configuration, not a fault, and paging somebody about it
 *  every hour would be the definition of a bad alert. */
const BAD: ReadonlySet<WorkerState> = new Set<WorkerState>(['unreachable', 'degraded']);

const HUMAN: Record<WorkerState, string> = {
  ok: 'healthy',
  degraded: 'degraded',
  unreachable: 'unreachable',
  not_configured: 'not configured',
};

/**
 * Decide what, if anything, to say about this tick.
 *
 * @param previous  The state at the last tick, or null on the very first run.
 * @param verdict   This tick's verdict, straight from `interpretWorkerProbe`.
 */
export function decideWatchdogAlert(
  previous: WorkerState | null,
  verdict: WorkerVerdict,
): WatchdogDecision {
  const state = verdict.state;
  const base = { state, level: 'normal' as WatchdogLevel };

  // FIRST EVER TICK. Staying quiet on a healthy first run matters more than it looks: enabling a
  // watchdog should not itself generate an alert, or the alert people remember is the meaningless
  // one. A first tick that is already BAD is worth saying, because nobody has been told yet.
  if (previous === null) {
    if (!BAD.has(state)) return { ...base, notify: false, title: '', body: '' };
    return {
      ...base,
      notify: true,
      level: state === 'degraded' ? 'urgent' : 'high',
      title: `Research worker is ${HUMAN[state]}`,
      body: `${verdict.headline}${verdict.hint ? ` ${verdict.hint}` : ''}`,
    };
  }

  // NOTHING CHANGED. The single most important branch in this file: a worker that is down for three
  // days is one piece of news, not seventy-two.
  if (previous === state) return { ...base, notify: false, title: '', body: '' };

  // RECOVERED. Reported so that silence stays unambiguous — otherwise nobody can tell a healthy
  // worker from a dead watchdog.
  //
  // `state === 'ok'`, NOT `!BAD.has(state)`. Written the loose way first, and an exhaustive test
  // over every (previous, current) pair caught it: `unreachable → not_configured` is not a recovery,
  // it is somebody removing `WORKER_URL` from a deployment that had a broken worker. Announcing
  // "the research worker is back" there would be a cheerful lie, and the kind nobody double-checks
  // because good news is not suspicious.
  if (BAD.has(previous) && state === 'ok') {
    return {
      ...base,
      notify: true,
      level: 'normal',
      title: 'Research worker is back',
      body: `Recovered from ${HUMAN[previous]}. ${verdict.headline}`
        + (verdict.version ? ` Running v${verdict.version}.` : ''),
    };
  }

  // BROKE, or moved between two kinds of broken (unreachable → degraded is a real change: it went
  // from honestly down to dishonestly up).
  if (BAD.has(state)) {
    return {
      ...base,
      notify: true,
      // `degraded` outranks `unreachable` because it looks up: it will accept a run and fail it
      // twenty minutes in, after documents have been paid for.
      level: state === 'degraded' ? 'urgent' : 'high',
      title: `Research worker is ${HUMAN[state]}`,
      body: `Was ${HUMAN[previous]}. ${verdict.headline}${verdict.hint ? ` ${verdict.hint}` : ''}`,
    };
  }

  // Everything else is a transition between two non-failing states — ok ↔ not_configured, which
  // happens when somebody sets or clears WORKER_URL. Worth recording, not worth a phone banner.
  return { ...base, notify: false, title: '', body: '' };
}

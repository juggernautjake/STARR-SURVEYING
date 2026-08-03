// The loop that pulls from the queue (plans R28/R29).
//
// R28 built the queue and the atomic claim; R29 built `pollOnce` with its admission and per-county
// limits. Both were proven from both ends and NOTHING CALLED `pollOnce`, so the unattended path
// ended at a table nobody read. This is the driver, and these are the ways a naive timer breaks.
//
// All three failure modes below present as the same symptom — a queue that stops draining with
// nothing in the logs — which is why each has its own test rather than being covered by "it polls".

import { describe, it, expect, vi } from 'vitest';
import {
  DEFAULT_ERROR_MS,
  DEFAULT_IDLE_MS,
  pollerEnabled,
  startPoller,
} from '../infra/queue-poller.js';

/** A controllable clock: collects scheduled callbacks so a test can advance them deliberately. */
function fakeTimer() {
  const queue: Array<{ fn: () => void; ms: number }> = [];
  return {
    setTimer: (fn: () => void, ms: number) => { queue.push({ fn, ms }); return queue.length - 1; },
    clearTimer: () => {},
    /** Run the most recently scheduled callback. */
    async fire() {
      const next = queue.pop();
      if (!next) throw new Error('nothing scheduled');
      next.fn();
      // Let the async tick settle.
      await new Promise((r) => setImmediate(r));
      return next.ms;
    },
    lastDelay: () => queue[queue.length - 1]?.ms,
    pending: () => queue.length,
  };
}

describe('the gate — off unless explicitly enabled', () => {
  it('does not poll when the flag is unset', () => {
    const g = pollerEnabled({} as NodeJS.ProcessEnv);
    expect(g.enabled).toBe(false);
    expect(g.reason).toContain('RESEARCH_QUEUE_POLLER is not set to 1');
  });

  it('refuses when enabled without a key, rather than 401-ing every tick', () => {
    // Polling into an auth failure forever is worse than not polling: it is noise that hides the
    // misconfiguration causing it.
    const g = pollerEnabled({ RESEARCH_QUEUE_POLLER: '1', APP_BASE_URL: 'https://x' } as NodeJS.ProcessEnv);
    expect(g.enabled).toBe(false);
    expect(g.reason).toContain('WORKER_API_KEY is not set');
  });

  it('refuses when there is no app to poll', () => {
    const g = pollerEnabled({ RESEARCH_QUEUE_POLLER: '1', WORKER_API_KEY: 'k' } as NodeJS.ProcessEnv);
    expect(g.enabled).toBe(false);
    expect(g.reason).toContain('APP_BASE_URL is not set');
  });

  it('runs when all three are present', () => {
    const g = pollerEnabled({
      RESEARCH_QUEUE_POLLER: '1', WORKER_API_KEY: 'k', APP_BASE_URL: 'https://x',
    } as NodeJS.ProcessEnv);
    expect(g.enabled).toBe(true);
  });
});

describe('a throw must not stop the loop', () => {
  it('keeps scheduling after a failed tick', async () => {
    // An unhandled rejection inside a timer callback kills the loop in some runtimes and is silent
    // in all of them. A stopped poller is a queue that silently stops draining.
    const timer = fakeTimer();
    const tick = vi.fn().mockRejectedValueOnce(new Error('app is down')).mockResolvedValue(0);

    const p = startPoller({ tick, ...timer }, {});
    await timer.fire();                       // the failing tick

    expect(p.stats().errors).toBe(1);
    expect(timer.pending()).toBeGreaterThan(0);   // still scheduled
    p.stop();
  });

  it('backs off harder after an error than after an empty queue', async () => {
    // An erroring app should be asked LESS often than a merely empty one — asking harder is how a
    // struggling app is pushed over.
    const timer = fakeTimer();
    const p = startPoller({ tick: vi.fn().mockRejectedValue(new Error('boom')), ...timer }, {});
    await timer.fire();
    expect(timer.lastDelay()).toBe(DEFAULT_ERROR_MS);
    expect(DEFAULT_ERROR_MS).toBeGreaterThan(DEFAULT_IDLE_MS);
    p.stop();
  });

  it('reports the error rather than swallowing it silently', async () => {
    const timer = fakeTimer();
    const log = vi.fn();
    const p = startPoller({ tick: vi.fn().mockRejectedValue(new Error('app is down')), log, ...timer }, {});
    await timer.fire();
    expect(log.mock.calls.flat().join(' ')).toContain('app is down');
    p.stop();
  });
});

describe('backoff on an empty queue', () => {
  it('grows the wait each time nothing starts', async () => {
    // A dry queue polled at a fixed short interval is a request per second per worker, forever.
    const timer = fakeTimer();
    const p = startPoller({ tick: vi.fn().mockResolvedValue(0), ...timer }, {});

    await timer.fire();
    const first = timer.lastDelay()!;
    await timer.fire();
    const second = timer.lastDelay()!;

    expect(second).toBeGreaterThan(first);
    p.stop();
  });

  it('caps the wait so a woken queue is not ignored for an hour', async () => {
    const timer = fakeTimer();
    const p = startPoller({ tick: vi.fn().mockResolvedValue(0), ...timer }, { maxIdleIntervalMs: 40, idleIntervalMs: 10 });
    for (let i = 0; i < 8; i++) await timer.fire();
    expect(timer.lastDelay()).toBeLessThanOrEqual(40);
    p.stop();
  });

  it('resets the backoff as soon as something starts', async () => {
    const timer = fakeTimer();
    const tick = vi.fn().mockResolvedValueOnce(0).mockResolvedValueOnce(0).mockResolvedValueOnce(1);
    const p = startPoller({ tick, ...timer }, { busyIntervalMs: 5, idleIntervalMs: 10 });

    await timer.fire();
    await timer.fire();
    await timer.fire();                       // this one started work
    expect(timer.lastDelay()).toBe(5);        // busy interval, not the grown idle one
    p.stop();
  });
});

describe('ticks never overlap', () => {
  it('does not start a second tick while one is in flight', async () => {
    // Two ticks claiming concurrently is the race the atomic claim makes SURVIVABLE, not one to
    // invite.
    const timer = fakeTimer();
    let resolve!: (n: number) => void;
    const tick = vi.fn(() => new Promise<number>((r) => { resolve = r; }));

    const p = startPoller({ tick, ...timer }, {});
    void timer.fire();                        // starts tick 1, does not resolve
    await new Promise((r) => setImmediate(r));

    expect(tick).toHaveBeenCalledTimes(1);
    expect(p.stats().running).toBe(true);

    resolve(0);
    await new Promise((r) => setImmediate(r));
    expect(p.stats().running).toBe(false);
    p.stop();
  });
});

describe('stopping', () => {
  it('schedules nothing further', async () => {
    const timer = fakeTimer();
    const tick = vi.fn().mockResolvedValue(0);
    const p = startPoller({ tick, ...timer }, {});
    p.stop();
    await timer.fire().catch(() => {});
    expect(tick).not.toHaveBeenCalled();
  });

  it('counts what it did, for a health endpoint', async () => {
    const timer = fakeTimer();
    const p = startPoller({ tick: vi.fn().mockResolvedValue(2), ...timer }, {});
    await timer.fire();
    expect(p.stats()).toMatchObject({ ticks: 1, started: 2, errors: 0 });
    p.stop();
  });

  it('polls immediately on boot rather than waiting out an interval', async () => {
    // A worker that boots beside a full queue should not idle first.
    const timer = fakeTimer();
    const p = startPoller({ tick: vi.fn().mockResolvedValue(0), ...timer }, {});
    expect(timer.lastDelay()).toBe(0);
    p.stop();
  });
});

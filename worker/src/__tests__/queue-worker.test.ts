// Many runs without trampling each other (research plan R29).
//
// R2 computed how many pipelines this box can hold. R12 stopped concurrent requests hammering one
// county's servers. R28 built the queue, the deduplicated request and the atomic claim. Nothing
// pulled from that queue — so the whole unattended path ended at a table nobody read.
//
// Three limits, and they are not the same limit. The MACHINE limit is about us falling over:
// exceeding it does not degrade gracefully, Chromium is OOM-killed and every run in flight dies. The
// COUNTY limit is about somebody else falling over — three browser sessions on one small clerk
// portal — and that is the one that loses access permanently, so it is a hard serialisation rather
// than a delay.

import { describe, it, expect, vi } from 'vitest';
import {
  SATURATION_RATIO,
  TYPICAL_RUN_MINUTES,
  admit,
  backlogStatus,
  countyKey,
  pollOnce,
  type QueuedRequest,
  type RunningRun,
} from '../infra/queue-worker.js';

const req = (id: string, county: string, over: Partial<QueuedRequest> = {}): QueuedRequest => ({
  id, county, address: `${id} Main St`, queued_at: '2026-08-02T10:00:00.000Z', ...over,
});

const running = (county: string): RunningRun => ({ requestId: `r-${county}`, county, startedAt: 0 });

describe('one county at a time, always', () => {
  it('holds a second request for a county already running', () => {
    const d = admit([req('a', 'Bell')], [running('Bell')], 6);
    expect(d.admit).toHaveLength(0);
    expect(d.held[0]!.reason).toContain('how a firm loses access to it');
  });

  it('does not admit two queued requests for one county in the same pass', () => {
    // The bug the running-set check alone does not catch: nothing is running yet, so both look free.
    const d = admit([req('a', 'Bell'), req('b', 'Bell')], [], 6);
    expect(d.admit).toHaveLength(1);
    expect(d.held).toHaveLength(1);
  });

  it('treats "Bell" and "Bell County" as one county', () => {
    // Treating them as two would let both run at once against the same clerk.
    expect(countyKey('Bell')).toBe(countyKey('Bell County'));
    expect(admit([req('a', 'Bell County')], [running('Bell')], 6).admit).toHaveLength(0);
  });

  it('runs different counties concurrently', () => {
    const d = admit([req('a', 'Bell'), req('b', 'Coryell')], [], 6);
    expect(d.admit).toHaveLength(2);
  });
});

describe('the machine limit', () => {
  it('stops at the configured concurrency', () => {
    const d = admit([req('a', 'Bell'), req('b', 'Coryell'), req('c', 'Milam')], [], 2);
    expect(d.admit).toHaveLength(2);
    expect(d.held[0]!.reason).toContain('OOM-killed');
  });

  it('counts what is already running against the limit', () => {
    const d = admit([req('a', 'Bell')], [running('Coryell'), running('Milam')], 2);
    expect(d.admit).toHaveLength(0);
    expect(d.freeSlots).toBe(0);
  });

  it('reports every held request with a reason', () => {
    // A request that never starts and never explains itself is indistinguishable from a broken queue.
    const d = admit([req('a', 'Bell'), req('b', 'Coryell')], [], 1);
    expect(d.held).toHaveLength(1);
    expect(d.held[0]!.reason.length).toBeGreaterThan(20);
  });
});

describe('ordering', () => {
  it('runs higher priority first', () => {
    // A job with a crew scheduled tomorrow outranks a speculative lookup.
    const d = admit([
      req('low', 'Bell', { priority: 0 }),
      req('high', 'Coryell', { priority: 10 }),
    ], [], 1);
    expect(d.admit[0]!.id).toBe('high');
  });

  it('serves equal priority oldest-first', () => {
    // Otherwise a busy queue leaves one request waiting indefinitely while newer ones overtake it.
    const d = admit([
      req('new', 'Bell', { queued_at: '2026-08-02T12:00:00.000Z' }),
      req('old', 'Coryell', { queued_at: '2026-08-01T09:00:00.000Z' }),
    ], [], 1);
    expect(d.admit[0]!.id).toBe('old');
  });
});

describe('back-pressure', () => {
  it('turns queue depth into a wait somebody can act on', () => {
    const b = backlogStatus(6, 0, 3);
    expect(b.estimatedWaitMinutes).toBe(2 * TYPICAL_RUN_MINUTES);
    expect(b.headline).toContain('roughly 50 minutes');
  });

  it('says when the queue has stopped being a queue', () => {
    // It stretches to days without anybody noticing, and the first symptom is a customer asking
    // where their survey is.
    const b = backlogStatus(3 * SATURATION_RATIO + 1, 0, 3);
    expect(b.saturated).toBe(true);
    expect(b.headline).toContain('either stop accepting requests or add a machine');
  });

  it('is not saturated at a normal depth', () => {
    expect(backlogStatus(4, 1, 3).saturated).toBe(false);
  });

  it('reports an idle queue as idle', () => {
    expect(backlogStatus(0, 0, 3).headline).toBe('Nothing queued or running.');
  });
});

describe('the poll loop', () => {
  const baseDeps = (overrides: Partial<Parameters<typeof pollOnce>[0]> = {}) => {
    const started: string[] = [];
    const reports: Array<{ id: string; outcome: string }> = [];
    return {
      started, reports,
      deps: {
        claim: vi.fn(async () => null),
        run: vi.fn(async (r: QueuedRequest) => { started.push(r.id); return {}; }),
        report: vi.fn(async (r: QueuedRequest, outcome: string) => { reports.push({ id: r.id, outcome }); }),
        currentRunning: () => [] as RunningRun[],
        maxConcurrent: () => 2,
        ...overrides,
      } as Parameters<typeof pollOnce>[0],
    };
  };

  it('does not claim when every slot is busy', async () => {
    // Claiming a request we cannot start takes it off the queue and holds it hostage.
    const { deps } = baseDeps({ currentRunning: () => [running('Bell'), running('Coryell')] });
    expect(await pollOnce(deps)).toBe(0);
    expect(deps.claim).not.toHaveBeenCalled();
  });

  it('claims one at a time, not a batch', async () => {
    // A batch read reintroduces exactly the race the atomic claim closes (R28).
    let n = 0;
    const { deps } = baseDeps({ claim: vi.fn(async () => (n++ < 2 ? req(`q${n}`, `C${n}`) : null)) });
    expect(await pollOnce(deps)).toBe(2);
    expect(deps.claim).toHaveBeenCalledTimes(3); // two hits and the empty one that ends the loop
  });

  it('releases a request claimed for a county already running', async () => {
    // Losing the race to ourselves is not a reason to start a second session on one clerk.
    let n = 0;
    const { deps, reports } = baseDeps({
      claim: vi.fn(async () => (n++ === 0 ? req('a', 'Bell') : null)),
      currentRunning: () => [running('Bell')],
      maxConcurrent: () => 3,
    });
    await pollOnce(deps);
    expect(reports).toEqual([{ id: 'a', outcome: 'failed' }]);
    expect(deps.run).not.toHaveBeenCalled();
  });

  it('reports a failed run instead of killing the poller', async () => {
    // A crashed poller means a queue that stops draining with no error anywhere.
    let n = 0;
    const { deps, reports } = baseDeps({
      claim: vi.fn(async () => (n++ === 0 ? req('a', 'Bell') : null)),
      run: vi.fn(async () => { throw new Error('Kofile login rejected'); }),
    });
    await expect(pollOnce(deps)).resolves.toBe(1);
    await new Promise(r => setTimeout(r, 5));
    expect(reports).toEqual([{ id: 'a', outcome: 'failed' }]);
  });

  it('does not await the run, so the free slots fill', async () => {
    // The whole point of the loop.
    let n = 0;
    let resolveRun: (() => void) | null = null;
    const { deps } = baseDeps({
      claim: vi.fn(async () => (n++ < 2 ? req(`q${n}`, `C${n}`) : null)),
      run: vi.fn(() => new Promise<{ projectId?: string }>((res) => { resolveRun = () => res({}); })),
    });
    expect(await pollOnce(deps)).toBe(2);
    expect(resolveRun).not.toBeNull();
  });
});

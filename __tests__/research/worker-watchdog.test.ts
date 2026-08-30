// The worker watchdog's alerting policy.
//
// Pure function of (previous state, current verdict), which is why it can be tested exhaustively
// without a worker, a database or a clock. The policy is the part with the interesting mistakes in
// it — every one of these tests is a specific way monitoring turns into noise.

import { describe, it, expect } from 'vitest';
import { decideWatchdogAlert } from '@/lib/research/worker-watchdog';
import type { WorkerState, WorkerVerdict } from '@/lib/research/worker-status';

function verdict(state: WorkerState, over: Partial<WorkerVerdict> = {}): WorkerVerdict {
  return {
    state,
    headline: `The worker is ${state}.`,
    canRunDeep: state === 'ok',
    offerLite: state !== 'ok',
    latencyMs: 120,
    warnings: [],
    ...over,
  };
}

const ALL: WorkerState[] = ['ok', 'degraded', 'unreachable', 'not_configured'];

describe('watchdog — the transition is the news, not the state', () => {
  it('says NOTHING when a bad state persists', () => {
    // The single most important assertion here. A worker down for three days is one piece of news,
    // not seventy-two. Alert on every tick and everybody mutes the channel, and the NEXT real
    // outage arrives somewhere nobody is reading.
    for (const s of ['unreachable', 'degraded'] as WorkerState[]) {
      expect(decideWatchdogAlert(s, verdict(s)).notify).toBe(false);
    }
  });

  it('says nothing when a good state persists', () => {
    expect(decideWatchdogAlert('ok', verdict('ok')).notify).toBe(false);
  });

  it('alerts when it breaks, and names what it was before', () => {
    const d = decideWatchdogAlert('ok', verdict('unreachable'));
    expect(d.notify).toBe(true);
    expect(d.body).toMatch(/was healthy/i);
  });

  it('alerts when it RECOVERS — silence must not be ambiguous', () => {
    // A watchdog that only reports bad news teaches people that quiet could mean "fine" or could
    // mean "the watchdog died". The recovery message is the one that says stop worrying.
    const d = decideWatchdogAlert('unreachable', verdict('ok', { version: '5.1.0' }));
    expect(d.notify).toBe(true);
    expect(d.title).toMatch(/back/i);
    expect(d.body).toMatch(/recovered from unreachable/i);
    expect(d.body).toContain('5.1.0');
  });

  it('treats unreachable → degraded as a real change', () => {
    // It went from honestly down to dishonestly up. That is worth knowing precisely because the
    // second one looks better and is worse.
    const d = decideWatchdogAlert('unreachable', verdict('degraded'));
    expect(d.notify).toBe(true);
    expect(d.level).toBe('urgent');
  });
});

describe('watchdog — degraded outranks unreachable', () => {
  it('escalates degraded higher than down', () => {
    // `degraded` LOOKS UP. It answers health checks, accepts work, and fails it twenty minutes in,
    // after a run has already paid for documents. Being plainly down is the cheaper failure.
    expect(decideWatchdogAlert('ok', verdict('degraded')).level).toBe('urgent');
    expect(decideWatchdogAlert('ok', verdict('unreachable')).level).toBe('high');
  });
});

describe('watchdog — not_configured is a setting, not a fault', () => {
  it('never alerts on not_configured', () => {
    // A deployment with no worker is a valid configuration — a fresh clone, a firm that never bought
    // one. Paging somebody hourly about a deliberate choice is the definition of a bad alert.
    for (const prev of [...ALL, null] as (WorkerState | null)[]) {
      expect(decideWatchdogAlert(prev, verdict('not_configured')).notify).toBe(false);
    }
  });

  it('still alerts when a configured worker breaks, even coming FROM not_configured', () => {
    // Control for the rule above: it must suppress the not_configured STATE, not any transition
    // that happens to touch it.
    expect(decideWatchdogAlert('not_configured', verdict('unreachable')).notify).toBe(true);
  });
});

describe('watchdog — the first tick', () => {
  it('is quiet when the worker is already healthy', () => {
    // Enabling a watchdog should not itself generate an alert, or the first alert anybody sees is
    // the meaningless one and they learn to skim.
    expect(decideWatchdogAlert(null, verdict('ok')).notify).toBe(false);
  });

  it('speaks up when the very first observation is bad', () => {
    // Nobody has been told yet, so there is no prior news to be redundant with.
    const d = decideWatchdogAlert(null, verdict('degraded'));
    expect(d.notify).toBe(true);
    expect(d.level).toBe('urgent');
  });
});

describe('watchdog — the state is always returned', () => {
  it('returns the observed state on every path, including the quiet ones', () => {
    // The caller persists this whether or not it notified. If the row were written only on an alert,
    // a deliberately-quiet recovery would leave `unreachable` on disk and the next genuine outage
    // would compare bad-to-bad and say nothing. Silent, and the worst kind.
    for (const prev of [...ALL, null] as (WorkerState | null)[]) {
      for (const cur of ALL) {
        expect(decideWatchdogAlert(prev, verdict(cur)).state).toBe(cur);
      }
    }
  });
});

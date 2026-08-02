// Not looking like a load test (research plan R12).
//
// Everything else in Phase B assumes we can still reach the county. An adapter whose IP has been
// blocked is not a broken adapter — it is an unfixable one: the repair agent cannot diagnose a page
// it cannot load, the canary cannot prove anything, and no amount of registry editing brings the
// access back.
//
// The exposure grew this session: the health monitor opens every registered portal on a timer, the
// capacity ceiling allows six concurrent runs, and each run hits a county's search, results and
// document pages repeatedly. Nothing coordinated any of it.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  DEFAULT_MIN_INTERVAL_MS,
  hostOf,
  maySolveCaptcha,
  postureFrom,
  resetPoliteness,
  trackedHosts,
  withPoliteness,
} from '../infra/politeness.js';

beforeEach(() => resetPoliteness());

describe('pacing is per HOST', () => {
  it('groups counties that share a vendor’s infrastructure', () => {
    // Five counties on *.tx.publicsearch.us are five hosts but ONE Tyler. Keying on the host is
    // what makes that visible; keying on county or adapter would pace each separately and still
    // deliver five times the traffic to the same servers.
    expect(hostOf('https://bell.tx.publicsearch.us/results?q=1')).toBe('bell.tx.publicsearch.us');
    expect(hostOf('https://BELL.TX.PublicSearch.us/doc/5')).toBe('bell.tx.publicsearch.us');
  });

  it('gives a malformed URL its own bucket', () => {
    // Two bad URLs should not serialise against each other for no reason.
    expect(hostOf('not a url')).not.toBe(hostOf('also not a url'));
  });
});

describe('one request at a time, with a gap', () => {
  it('serialises calls to the same host', async () => {
    const order: string[] = [];
    const slow = (label: string, ms: number) => async () => {
      order.push(`${label}:start`);
      await new Promise((r) => setTimeout(r, ms));
      order.push(`${label}:end`);
    };
    const noSleep = async () => {};
    await Promise.all([
      withPoliteness('https://a.example/1', slow('first', 20), { minIntervalMs: 0, jitterMs: 0 }, () => 0, noSleep),
      withPoliteness('https://a.example/2', slow('second', 1), { minIntervalMs: 0, jitterMs: 0 }, () => 0, noSleep),
    ]);
    // Not interleaved: the second waits for the first to finish.
    expect(order).toEqual(['first:start', 'first:end', 'second:start', 'second:end']);
  });

  it('does NOT serialise different hosts against each other', async () => {
    const order: string[] = [];
    const noSleep = async () => {};
    await Promise.all([
      withPoliteness('https://a.example/1', async () => { order.push('a:start'); await new Promise((r) => setTimeout(r, 20)); order.push('a:end'); }, { minIntervalMs: 0, jitterMs: 0 }, () => 0, noSleep),
      withPoliteness('https://b.example/1', async () => { order.push('b:start'); order.push('b:end'); }, { minIntervalMs: 0, jitterMs: 0 }, () => 0, noSleep),
    ]);
    // b finished while a was still in flight.
    expect(order.indexOf('b:end')).toBeLessThan(order.indexOf('a:end'));
  });

  it('waits out the minimum interval between requests to one host', async () => {
    const slept: number[] = [];
    const sleep = async (ms: number) => { slept.push(ms); };
    let clock = 0;
    const now = () => clock;

    await withPoliteness('https://a.example/1', async () => { clock += 10; }, { minIntervalMs: 1000, jitterMs: 0 }, now, sleep);
    await withPoliteness('https://a.example/2', async () => {}, { minIntervalMs: 1000, jitterMs: 0 }, now, sleep);

    // First contact does not sleep at all — a never-visited host has nothing to be polite about, and
    // paying a full interval there would cost half a minute across a 21-county sweep to protect
    // nobody. The second call waits 1000ms minus the 10ms that elapsed inside the first.
    expect(slept).toEqual([990]);
  });

  it('releases the host when the request throws', async () => {
    // A thrown error must not wedge every later request to that county behind a promise that never
    // settles — which would look exactly like the county having gone down.
    const noSleep = async () => {};
    await expect(
      withPoliteness('https://a.example/1', async () => { throw new Error('boom'); }, { minIntervalMs: 0, jitterMs: 0 }, () => 0, noSleep),
    ).rejects.toThrow('boom');

    const after = await withPoliteness('https://a.example/2', async () => 'ok', { minIntervalMs: 0, jitterMs: 0 }, () => 0, noSleep);
    expect(after).toBe('ok');
  });

  it('defaults slower than a person clicking', () => {
    expect(DEFAULT_MIN_INTERVAL_MS).toBeGreaterThanOrEqual(1000);
  });

  it('reports how many hosts are being paced', async () => {
    await withPoliteness('https://a.example/1', async () => {}, { minIntervalMs: 0, jitterMs: 0 }, () => 0, async () => {});
    expect(trackedHosts()).toBe(1);
  });
});

describe('captcha policy', () => {
  it('refuses when nobody has read the county’s terms', () => {
    // `unknown` is a refusal, not a shrug. "Go ahead unless somebody said no" means the first time
    // anybody reads the terms is after a complaint.
    const d = maySolveCaptcha('unknown', 'Bell');
    expect(d.allowed).toBe(false);
    expect(d.reason).toContain('nobody has confirmed');
    expect(d.reason).toContain('automation_posture');
  });

  it('refuses outright where automation is prohibited', () => {
    const d = maySolveCaptcha('prohibited', 'Harris');
    expect(d.allowed).toBe(false);
    expect(d.reason).toContain('not a grey area');
  });

  it('allows only where somebody recorded that it is permitted', () => {
    expect(maySolveCaptcha('permitted', 'Bell').allowed).toBe(true);
  });

  it('reads the posture off the adapter, defaulting to unknown', () => {
    // Posture is DATA on the adapter, not a constant here: which counties this firm is willing to
    // automate is an owner decision.
    expect(postureFrom({ automation_posture: 'permitted' })).toBe('permitted');
    expect(postureFrom({ automation_posture: 'nonsense' })).toBe('unknown');
    expect(postureFrom(null)).toBe('unknown');
  });
});

describe('the wiring', () => {
  const ROOT = process.cwd();
  const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');

  it('paces the health monitor, which hits every portal on a timer', () => {
    const monitor = read('src/infra/site-health-monitor.ts');
    expect(monitor).toContain('withPoliteness(check.url');
  });

  it('enforces the captcha policy at the factory, not at each call site', () => {
    // A policy with eleven enforcement points has eleven chances to be forgotten.
    const solver = read('src/lib/captcha-solver.ts');
    expect(solver).toContain('withAutomationPolicy(solver)');
    expect(solver).toContain('class CaptchaPolicyError');
  });

  it('records a refusal like any other attempt', () => {
    // A silently skipped county looks identical to one that has no captcha.
    const solver = read('src/lib/captcha-solver.ts');
    const wrapper = solver.slice(solver.indexOf('export function withAutomationPolicy'));
    expect(wrapper).toContain('recordSolveAttempt');
    expect(wrapper).toContain('policy:');
  });

  it('distinguishes "we could not" from "we would not"', () => {
    const solver = read('src/lib/captcha-solver.ts');
    expect(solver).toContain('isPolicyRefusal');
  });
});

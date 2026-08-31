// worker/src/__tests__/host-circuit.test.ts
//
// From the owner's 2026-08-30 run. `esearch.bellcad.org` refused the worker at the connection level
// on the first attempt, and the pipeline spent 213 seconds discovering that same fact five more
// times — three 26s keyword retries, an 8s recaptcha probe, and a 70s Playwright navigation, each
// correct in isolation and none aware the host had already refused a TCP connection.

import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  HOST_CIRCUIT_TTL_MS,
  hostCircuit,
  hostOfUrl,
  isConnectionLevelFailure,
  resetHostCircuits,
  trippedHostCount,
  tripHost,
} from '../infra/host-circuit.js';

const CAD = 'https://esearch.bellcad.org/Search/Result';

beforeEach(() => resetHostCircuits());

describe('what counts as "nothing answered"', () => {
  it('recognises the exact error from the run log', () => {
    expect(isConnectionLevelFailure(new Error('fetch failed'))).toBe(true);
  });

  it('recognises DNS, refusal and connect timeouts', () => {
    for (const m of ['getaddrinfo ENOTFOUND esearch.bellcad.org', 'connect ECONNREFUSED', 'ETIMEDOUT', 'socket hang up', 'Connect Timeout Error']) {
      expect(isConnectionLevelFailure(new Error(m)), m).toBe(true);
    }
    expect(isConnectionLevelFailure({ code: 'ECONNRESET' })).toBe(true);
  });

  it('recognises the aborted-by-timeout wording the log used', () => {
    expect(isConnectionLevelFailure(new Error('The operation was aborted due to timeout'))).toBe(true);
  });

  it('does NOT trip on an HTTP status — the host answered', () => {
    // A 403 means a working host with a problem; the next request may well succeed. Tripping on
    // these would blacklist a live portal over one bad page. This is the same distinction that
    // three different Google 403s turned on earlier in this project.
    for (const m of ['HTTP 403', 'HTTP 500 Internal Server Error', 'Failed to parse body', 'Not Found']) {
      expect(isConnectionLevelFailure(new Error(m)), m).toBe(false);
    }
  });

  it('treats an unrecognised error as NOT connection-level', () => {
    // Conservative on purpose: an unfamiliar failure degrades to today's behaviour (retry), never
    // to a blacklisted host.
    expect(isConnectionLevelFailure(new Error('something nobody has seen before'))).toBe(false);
    expect(isConnectionLevelFailure(null)).toBe(false);
    expect(isConnectionLevelFailure(undefined)).toBe(false);
  });
});

describe('tripping and reading the circuit', () => {
  it('opens after a connection-level failure and reports why', () => {
    expect(hostCircuit(CAD).down).toBe(false);
    expect(tripHost(CAD, new Error('fetch failed'))).toBe(true);

    const state = hostCircuit(CAD);
    expect(state.down).toBe(true);
    expect(state.reason).toContain('fetch failed');
  });

  it('does not open on an HTTP failure', () => {
    expect(tripHost(CAD, new Error('HTTP 403'))).toBe(false);
    expect(hostCircuit(CAD).down).toBe(false);
  });

  it('is per HOST, so a different portal is unaffected', () => {
    // The run proved this matters: the CAD was unreachable while the CLERK on a different host
    // worked perfectly for the whole hour. A per-county or global flag would have skipped both.
    tripHost(CAD, new Error('fetch failed'));
    expect(hostCircuit('https://bell.tx.publicsearch.us/results').down).toBe(false);
  });

  it('covers every path on the same host', () => {
    tripHost(CAD, new Error('fetch failed'));
    expect(hostCircuit('https://esearch.bellcad.org/Property/View/350347').down).toBe(true);
  });

  it('closes again after the TTL — a host outage must not become a dead adapter', () => {
    const t0 = 1_000_000;
    tripHost(CAD, new Error('fetch failed'), t0);
    expect(hostCircuit(CAD, t0 + HOST_CIRCUIT_TTL_MS - 1).down).toBe(true);
    expect(hostCircuit(CAD, t0 + HOST_CIRCUIT_TTL_MS).down).toBe(false);
    // and the expired entry is cleared as it is read, not left to accumulate
    expect(trippedHostCount()).toBe(0);
  });

  it('keeps the FIRST reason, not the last', () => {
    tripHost(CAD, new Error('fetch failed'), 1000);
    tripHost(CAD, new Error('ETIMEDOUT'), 2000);
    expect(hostCircuit(CAD, 3000).reason).toContain('fetch failed');
  });

  it('survives an unparseable URL without throwing', () => {
    expect(() => hostOfUrl('not a url')).not.toThrow();
    expect(hostCircuit('not a url').down).toBe(false);
  });
});

describe('the CAD paths actually consult it', () => {
  const src = fs.readFileSync(path.resolve(__dirname, '../services/bis-cad.ts'), 'utf8')
    .split('\r\n').join('\n')
    .replace(/^[ \t]*\/\/[^\n]*$/gm, '')
    .replace(/^[ \t]*\/\*[\s\S]*?\*\//gm, '');

  it('trips the circuit where the host is found unreachable', () => {
    expect(src).toMatch(/tripHost\(baseUrl, err\)/);
  });

  it('guards the HTTP path', () => {
    expect(src).toMatch(/const httpCircuit = hostCircuit\(baseUrl\)/);
  });

  it('guards the Playwright path — the single largest timeout in the run', () => {
    // 70s, on a host that had already refused a TCP connection twice.
    expect(src).toMatch(/const pwCircuit = hostCircuit\(baseUrl\)/);
  });
});

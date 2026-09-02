import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  hostGate,
  noteHostAnswered,
  noteHostUnreachable,
  classifyTransportError,
  resetDeadHosts,
} from '../infra/dead-host.js';

// A3 — "one unreachable host should cost one timeout, not twelve."
//
// The failure being guarded is not that a probe fails; it is that the twelfth probe repeats the
// first one's discovery. The two things that must both stay true are in tension, so both are tested:
// a dead host must stop costing timeouts, and a LIVE host answering 404 must not be mistaken for one.

const U = 'https://gis.bisclient.com/milamcad/rest/services/X/MapServer/0/query?f=json';
const OTHER = 'https://gis.bisclient.com:8443/other/query';

beforeEach(() => resetDeadHosts());

describe('classifying what actually went wrong', () => {
  it('reads a timeout from AbortSignal.timeout', () => {
    const err = Object.assign(new Error('The operation was aborted'), { name: 'TimeoutError' });
    expect(classifyTransportError(err)).toBe('timeout');
  });

  it('digs the code out of undici\'s nested cause', () => {
    const err = Object.assign(new TypeError('fetch failed'), {
      cause: Object.assign(new Error('getaddrinfo ENOTFOUND'), { code: 'ENOTFOUND' }),
    });
    expect(classifyTransportError(err)).toBe('connect');
  });

  it('does NOT classify a parse failure as a transport failure', () => {
    // The host answered. It answered with junk, which is a bad endpoint, not a dead server.
    expect(classifyTransportError(new SyntaxError('Unexpected token < in JSON'))).toBeNull();
  });
});

describe('a host that never answers stops costing timeouts', () => {
  it('gates after two consecutive timeouts, not after one', () => {
    expect(hostGate(U).blocked).toBe(false);

    expect(noteHostUnreachable(U, 'timeout').justGated).toBe(false);
    expect(
      hostGate(U).blocked,
      'one 10s timeout is ambiguous — a heavy spatial query on a live server can exceed it',
    ).toBe(false);

    expect(noteHostUnreachable(U, 'timeout').justGated).toBe(true);
    expect(hostGate(U).blocked).toBe(true);
  });

  it('gates on the FIRST connection error, which is unambiguous', () => {
    expect(noteHostUnreachable(U, 'connect').justGated).toBe(true);
    expect(hostGate(U).blocked).toBe(true);
  });

  it('says which host and why, so the log explains the skip', () => {
    noteHostUnreachable(U, 'connect');
    expect(hostGate(U).reason).toMatch(/gis\.bisclient\.com/);
  });

  it('reports justGated only once, so the log says it once and not twelve times', () => {
    noteHostUnreachable(U, 'connect');
    expect(noteHostUnreachable(U, 'connect').justGated).toBe(false);
    expect(noteHostUnreachable(U, 'timeout').justGated).toBe(false);
  });

  it('gates the host, not the URL — a different path on the same host is also skipped', () => {
    // This is the whole point: the loops vary the PATH, so a per-URL gate would never fire.
    noteHostUnreachable(U, 'connect');
    const sameHostDifferentPath = 'https://gis.bisclient.com/milamcad/rest/services/Y/MapServer/3/query';
    expect(hostGate(sameHostDifferentPath).blocked).toBe(true);
  });

  it('does not gate an unrelated host', () => {
    noteHostUnreachable(U, 'connect');
    expect(hostGate('https://gis.bisclient.com.evil.test/q').blocked).toBe(false);
    expect(hostGate(OTHER).blocked, 'a different port is a different host').toBe(false);
  });

  it('lets the host prove itself again after the revival window', () => {
    const t0 = 1_000_000;
    noteHostUnreachable(U, 'connect', t0);
    expect(hostGate(U, t0 + 60_000).blocked).toBe(true);
    expect(hostGate(U, t0 + 5 * 60_000 + 1).blocked).toBe(false);
  });
});

describe('a live host is never mistaken for a dead one', () => {
  it('a 404 clears the counter — CONTROL for the whole guard', () => {
    // If this ever fails, the gate is condemning live servers, and the layer search that finds Bell's
    // parcel layer partway down the candidate list would be cancelled before it got there.
    noteHostUnreachable(U, 'timeout');
    noteHostAnswered(U); // ← a 404 still calls this
    expect(noteHostUnreachable(U, 'timeout').justGated).toBe(false);
    expect(hostGate(U).blocked).toBe(false);
  });

  it('un-gates a host that comes back', () => {
    noteHostUnreachable(U, 'connect');
    expect(hostGate(U).blocked).toBe(true);
    noteHostAnswered(U);
    expect(hostGate(U).blocked).toBe(false);
  });

  it('survives a malformed URL rather than throwing into the pipeline', () => {
    expect(hostGate('not a url').blocked).toBe(false);
    expect(noteHostUnreachable('not a url', 'connect').host).toBeNull();
  });
});

describe('the gate is actually wired to the code that spends the timeouts', () => {
  // Wiring tests must check the CALLER. A perfect gate nothing calls is this repo's signature defect.
  const SRC = fs.readFileSync(
    path.join(process.cwd(), 'src/services/bis-cad.ts'),
    'utf8',
  );
  const fn = SRC.slice(
    SRC.indexOf('async function queryArcGisLayer'),
    SRC.indexOf('function selectBestGisFeature'),
  );

  it('bis-cad imports the gate', () => {
    expect(SRC).toMatch(/import \{[^}]*hostGate[^}]*\} from '\.\.\/infra\/dead-host\.js'/);
  });

  it('queryArcGisLayer checks the gate BEFORE it fetches', () => {
    expect(fn.length, 'could not locate queryArcGisLayer — the control for this whole block').toBeGreaterThan(200);
    const gateAt = fn.indexOf('hostGate(');
    const fetchAt = fn.indexOf('await fetch(');
    expect(gateAt, 'queryArcGisLayer never consults the gate').toBeGreaterThan(-1);
    expect(fetchAt).toBeGreaterThan(-1);
    expect(gateAt, 'the gate is checked after the timeout has already been spent').toBeLessThan(fetchAt);
  });

  it('records an answer on every response, not only on ok ones', () => {
    const answeredAt = fn.indexOf('noteHostAnswered(');
    const okCheckAt = fn.indexOf('if (!resp.ok)');
    expect(answeredAt).toBeGreaterThan(-1);
    expect(
      answeredAt,
      'noteHostAnswered sits behind the resp.ok check, so a 404 no longer clears the host',
    ).toBeLessThan(okCheckAt);
  });

  it('records unreachability on the catch path', () => {
    expect(fn).toMatch(/noteHostUnreachable\(/);
    expect(fn).toMatch(/classifyTransportError\(/);
  });
});

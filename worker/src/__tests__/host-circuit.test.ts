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

// ── THE CHECK ABOVE NAMED THE DOORS THAT WERE GUARDED ───────────────────────────────────────────
//
// `httpCircuit` and `pwCircuit` were the two entry points somebody thought of, and asserting those
// two by name proves only that they still exist. It cannot notice a THIRD door.
//
// There was one. `searchCadHttpRawKeyword` — reached from four call sites: PropertyId,
// StreetNumber-only, StreetName-only and OwnerName — ran a reCAPTCHA probe (8s), a homepage fetch
// (10s) and a token request (8s) before its search, with no circuit check at all. That function's
// label is the one that appears three times in the owner's log as the 26-second repeats:
//
//     26002ms  Stage1A-Keyword — Failed to acquire session token
//     26003ms  Stage1A-Keyword (again, different variant)
//     26002ms  Stage1A-Keyword (again)
//
// **Two guarded doors and one open one is the same as no guard, for anything that walks through the
// open one.** So this checks the property rather than the list: every function in the file that
// reaches the network on `baseUrl` must consult the circuit first.
describe('every door is guarded, not just the two somebody listed', () => {
  const raw = fs.readFileSync(path.resolve(__dirname, '../services/bis-cad.ts'), 'utf8')
    .split('\r\n').join('\n');
  // ── THE STRIPPER ATE 6,000 CHARACTERS OF CODE ───────────────────────────────────────────────
  //
  // The obvious block-comment pattern — `/\/\*[\s\S]*?\*\//` — is wrong on this file, and the way
  // it is wrong is invisible:
  //
  //     'Accept': 'application/json, text/plain, */*',
  //
  // That MIME type contains `/*`. An unanchored stripper starts a comment there, runs to the next
  // `*/` several hundred lines later, and blanks every line between — including the very
  // `requestSessionToken` call this check exists to find. The region came back as real code with a
  // hole in it, and the check reported the hole as "no network call here".
  //
  // Anchoring to the start of a line fixes it: every block comment in this codebase begins a line,
  // and a `*/*` inside a string never does. Length-preserving, so slices by index still land.
  const src = raw
    .replace(/^[ \t]*\/\*[\s\S]*?\*\//gm, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:'"`])\/\/[^\n]*/g, (m, p1: string) => p1 + ' '.repeat(m.length - p1.length));

  /**
   * The file split at each top-level `function` declaration: each region runs from its own
   * declaration to the next one.
   *
   * Brace-matching was the first version and it silently truncated — this file carries regex
   * literals and template strings whose braces do not balance under a naive counter, so
   * `searchCadHttpRawKeyword` came back as a 900-character fragment that did not even contain
   * `requestSessionToken`. A check reading the wrong half of a function is worse than no check:
   * it reports clean on the half that has no network call in it.
   *
   * Splitting at declarations cannot truncate. It can only over-include — the tail of the last
   * region — and over-including makes this check STRICTER, never more permissive.
   */
  function topLevelFunctions(): Array<{ name: string; body: string }> {
    const marks: Array<{ name: string; at: number }> = [];
    for (const m of src.matchAll(/^(?:export\s+)?(?:async\s+)?function\s+([A-Za-z0-9_]+)/gm)) {
      marks.push({ name: m[1]!, at: m.index! });
    }
    return marks.map((mk, i) => ({
      name: mk.name,
      body: src.slice(mk.at, i + 1 < marks.length ? marks[i + 1]!.at : src.length),
    }));
  }

  const fns = topLevelFunctions();

  it('control: the file was parsed into real functions', () => {
    // Without this every assertion below passes against an empty list, which is precisely how the
    // third door stayed open under a green test.
    expect(fns.length, 'no top-level functions parsed out of bis-cad.ts').toBeGreaterThan(10);
    expect(fns.map((f) => f.name)).toContain('searchCadHttpRawKeyword');
    expect(fns.map((f) => f.name)).toContain('searchCadHttp');
  });

  it('control: the parser captured whole bodies, not fragments', () => {
    const keyword = fns.find((f) => f.name === 'searchCadHttpRawKeyword')!;
    expect(keyword.body.length).toBeGreaterThan(1500);
    expect(keyword.body).toContain('requestSessionToken');
  });

  it('every function that reaches baseUrl over the network consults the circuit first', () => {
    // `page.goto` counts too: the Playwright layer's 70s navigation was the single largest timeout
    // in the 213 seconds.
    const reachesNetwork = (b: string) =>
      /await\s+(?:noting|fetch)\s*\(\s*`?\$?\{?baseUrl/.test(b)
      || /await\s+fetch\(baseUrl/.test(b)
      || /await\s+noting\(baseUrl/.test(b)
      || /\.goto\(\s*`?\$?\{?baseUrl/.test(b);

    const networked = fns.filter((f) => reachesNetwork(f.body));
    expect(networked.length, 'no networked functions found — the matcher is broken')
      .toBeGreaterThanOrEqual(2);

    const unguarded = networked
      .filter((f) => !/hostCircuit\s*\(/.test(f.body))
      .map((f) => f.name);
    expect(unguarded,
      `these reach the CAD host without checking whether it just refused a connection:\n  ${unguarded.join('\n  ')}`)
      .toEqual([]);
  });

  it('and the keyword path specifically, since that is the one that was open', () => {
    const keyword = fns.find((f) => f.name === 'searchCadHttpRawKeyword')!;
    expect(keyword.body).toMatch(/hostCircuit\(baseUrl\)/);
    expect(keyword.body, 'a connection failure there must also trip the circuit')
      .toMatch(/tripHost\(baseUrl, err\)/);
  });

  it('control: the matcher would notice an unguarded function', () => {
    const fake = 'function x() { const r = await fetch(`${baseUrl}/a`); }';
    expect(/await\s+(?:noting|fetch)\s*\(\s*`?\$?\{?baseUrl/.test(fake)).toBe(true);
    expect(/hostCircuit\s*\(/.test(fake)).toBe(false);
  });
});

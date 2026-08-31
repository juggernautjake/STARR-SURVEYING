// __tests__/research/worker-endpoint-contract.test.ts
//
// Every worker endpoint the app calls is one the worker serves.
//
// ── THE BOUNDARY NOTHING ELSE CHECKS ────────────────────────────────────────────────────────────
//
// The app and the worker are separate processes, deployed separately, in separate directories, with
// separate test suites. They agree on a set of HTTP paths and NOTHING enforces that agreement:
// `tsc` sees two unrelated string literals, both suites pass, and the production build is happy. A
// path that drifts produces a 404 at runtime, in whichever route proxies it, on the machine that
// spends money.
//
// This is the same shape as three defects found on 2026-08-31 — `skipped_work` (`{step}` written,
// `{what}` read), `limits` (`maxWallClockMs` written, `maxMinutes` read), and five research selects
// naming columns that do not exist. Each lived only in the gap between a producer and a consumer,
// and each was invisible to every check that looked at either side alone.
//
// ── IT PASSES TODAY ─────────────────────────────────────────────────────────────────────────────
//
// Nineteen paths called, sixty-nine served, zero mismatches. Clean is the result, and the controls
// below are what make that mean something: this check has to be able to fail before a pass from it
// is worth reading.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();

/**
 * Paths the worker serves, with `:param` segments normalised.
 *
 * `\s*` between `app.post(` and the path matters: **twelve of the seventy registrations put the
 * path on the NEXT line**, `/research/flood-zone` among them. A line-based grep sees 58 and would
 * quietly under-count the served set — which produces FALSE POSITIVES here, the direction that
 * sends somebody to "fix" a route that works.
 */
function servedPaths(): Set<string> {
  const idx = fs.readFileSync(path.join(ROOT, 'worker/src/index.ts'), 'utf8');
  const out = new Set<string>();
  for (const m of idx.matchAll(/app\.(get|post|put|patch|delete)\(\s*['"`]([^'"`]+)['"`]/g)) {
    out.add(m[2].replace(/:[A-Za-z_]\w*/g, ':p').replace(/\/+$/, ''));
  }
  return out;
}

function walk(dir: string, out: string[] = []): string[] {
  const abs = path.join(ROOT, dir);
  if (!fs.existsSync(abs)) return out;
  for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.') || e.name === 'dist') continue;
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) walk(rel, out);
    else if (/\.(ts|tsx)$/.test(e.name) && !e.name.includes('.test.')) out.push(rel);
  }
  return out;
}

interface Call { path: string; file: string; line: number }

/** Every `${WORKER_URL}/…` the app builds, normalised the same way. */
function calledPaths(files: string[]): Call[] {
  const calls: Call[] = [];
  for (const file of files) {
    const raw = fs.readFileSync(path.join(ROOT, file), 'utf8');
    for (const m of raw.matchAll(/\$\{WORKER_URL\}([^`"']*)/g)) {
      const p = m[1]
        .replace(/\$\{[^}]*\}/g, ':p')   // a template hole is a path parameter
        .replace(/\?.*$/, '')            // the query string is not part of the route
        .replace(/\/+$/, '')
        .trim();
      if (!p.startsWith('/')) continue;  // `${WORKER_URL}` alone, or a non-path use
      calls.push({ path: p, file, line: raw.slice(0, m.index!).split('\n').length });
    }
  }
  return calls;
}

const SERVED = servedPaths();
const CALLS = calledPaths([...walk('app'), ...walk('lib')]);

describe('the check can fail', () => {
  it('read the worker routes, including the multi-line registrations', () => {
    expect(SERVED.size).toBeGreaterThan(50);
    // The specific one a line-based scan misses: `app.post(\n  '/research/flood-zone',`.
    expect(SERVED.has('/research/flood-zone'), 'multi-line registrations are being missed').toBe(true);
  });

  it('read the app calls', () => {
    expect(CALLS.length).toBeGreaterThan(10);
    expect(new Set(CALLS.map((c) => c.path)).size).toBeGreaterThan(10);
  });

  it('SEES a call to a path the worker does not serve', () => {
    const probe = [
      'const WORKER_URL = process.env.WORKER_URL!;',
      'export async function probe(id: string) {',
      '  return fetch(`${WORKER_URL}/research/does-not-exist/${id}`);',
      '}',
    ].join('\n');
    const tmp = path.join(ROOT, 'lib/research/__worker_contract_probe__.ts');
    fs.writeFileSync(tmp, probe);
    try {
      const found = calledPaths(['lib/research/__worker_contract_probe__.ts'])
        .filter((c) => !SERVED.has(c.path));
      expect(found.map((c) => c.path)).toEqual(['/research/does-not-exist/:p']);
    } finally {
      fs.unlinkSync(tmp);
    }
  });

  it('normalises parameters on both sides, so `:projectId` matches `${projectId}`', () => {
    // Without this every parameterised route reads as a mismatch and the check is pure noise.
    expect(SERVED.has('/research/logs/:p')).toBe(true);
    const logs = CALLS.filter((c) => c.path === '/research/logs/:p');
    expect(logs.length, 'the app calls /research/logs/:id — it should normalise to the same shape')
      .toBeGreaterThan(0);
  });

  it('drops the query string — a route is its path', () => {
    // `/research/access/plan/${fips}?county=${name}` is served as `/research/access/plan/:p`.
    expect(CALLS.some((c) => c.path === '/research/access/plan/:p')).toBe(true);
  });
});

describe('every worker endpoint the app calls is served', () => {
  it('has no path the worker does not answer', () => {
    const missing = CALLS.filter((c) => !SERVED.has(c.path));
    const lines = [...new Set(missing.map((c) => `${c.path}  (${c.file}:${c.line})`))];
    expect(
      lines,
      lines.length
        ? 'The app proxies these to the worker and the worker does not serve them. Nothing catches '
          + 'this: tsc sees two unrelated strings, both suites pass, and the failure is a 404 at '
          + `runtime on the machine that spends money:\n  ${lines.join('\n  ')}`
        : '',
    ).toEqual([]);
  });
});

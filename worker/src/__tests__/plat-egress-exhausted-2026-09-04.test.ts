import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  noteBrowserRouteExhausted,
  browserRouteExhausted,
  _resetRefusedHosts,
} from '../services/county-plats.js';

// ── C2: when every egress is refused, stop asking ────────────────────────────────────────────────
//
// The direct route 403s the worker; the browser route (another IP) is the only road left. When THAT
// also fails, the repository is unreachable by any egress we have — and the run's remaining letter
// pages must not each spend another paid browser session retrying it.

beforeEach(() => _resetRefusedHosts());

describe('browserRouteExhausted', () => {
  it('is false until both egresses have failed for a host', () => {
    expect(browserRouteExhausted('https://www.bellcountytx.com/a.php')).toBe(false);
  });

  it('is true for the whole host once recorded — every path under it stops asking', () => {
    noteBrowserRouteExhausted('https://www.bellcountytx.com/county_clerk/a.php', 'Bell repo');
    expect(browserRouteExhausted('https://www.bellcountytx.com/county_clerk/b.php')).toBe(true);
    expect(browserRouteExhausted('https://www.bellcountytx.com/docs/plats/A/OAKS.pdf')).toBe(true);
    // a different host is unaffected
    expect(browserRouteExhausted('https://hayscad.com/sublista/')).toBe(false);
  });

  it('expires after the hour, so a site that comes back is tried again', () => {
    const t0 = 1_000_000;
    noteBrowserRouteExhausted('https://www.bellcountytx.com/a.php', 'Bell repo', t0);
    expect(browserRouteExhausted('https://www.bellcountytx.com/a.php', t0 + 59 * 60_000)).toBe(true);
    expect(browserRouteExhausted('https://www.bellcountytx.com/a.php', t0 + 61 * 60_000)).toBe(false);
  });

  it('the reset clears it (a fresh process asks again)', () => {
    noteBrowserRouteExhausted('https://www.bellcountytx.com/a.php', 'Bell repo');
    _resetRefusedHosts();
    expect(browserRouteExhausted('https://www.bellcountytx.com/a.php')).toBe(false);
  });
});

describe('both fetch paths honour the exhaustion', () => {
  const src = fs.readFileSync(path.resolve(process.cwd(), 'src/services/county-plats.ts'), 'utf8');
  it('the index fetch and the file fetch each skip when exhausted and record it when the browser route fails', () => {
    // two early-return guards (index + file)
    expect((src.match(/if \(browserRouteExhausted\(/g) ?? []).length).toBe(2);
    // the definition plus a record site in each of the two fetch paths
    expect((src.match(/noteBrowserRouteExhausted\(/g) ?? []).length).toBeGreaterThanOrEqual(3);
  });
});

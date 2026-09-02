import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { hasKofileConfig, getKofileBaseUrl, KOFILE_UNREACHABLE } from '../services/bell-clerk.js';
import { getClerkSystem, KOFILE_FIPS_SET } from '../services/clerk-registry.js';
import { lookupCountyFIPS } from '../lib/county-fips.js';

// ── THREE REGISTRIES, AND ONLY ONE OF THEM DECIDES ANYTHING ─────────────────────────────────────
//
// Coryell was wrong in all three, and I fixed the two that do not matter first.
//
//   adapters/clerk-registry.ts   descriptive. Powers a coverage TABLE in the admin UI.
//   services/clerk-registry.ts   routes `getClerkAdapter` by FIPS. Used by chain-of-title, the
//                                document-access orchestrator and the Testing Lab.
//   services/bell-clerk.ts       KOFILE_CONFIGS — what the GENERIC PIPELINE reads, via
//                                `hasKofileConfig()`. The run does not call `getClerkAdapter` at all.
//
// So a Coryell run's clerk search went to `coryell.tx.publicsearch.us`, which does not resolve —
// verified twice with a control on 2026-09-02: `bell.` and `milam.tx.publicsearch.us` both answer
// 200 and coryell returns nothing, the identical result to a deliberately nonexistent subdomain.
//
// Fixing the two registries nobody reads while leaving the one the run uses is the same mistake one
// layer down, and it is the second time in a day this codebase has had two tables disagree about
// Coryell.

const SRC = fs.readFileSync(
  path.join(process.cwd(), 'src/services/bell-clerk.ts'),
  'utf8',
);

const codeOnly = SRC
  .split(/\r?\n/)
  .filter((l) => {
    const t = l.trim();
    return !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*');
  })
  .join('\n');

describe('the table the run actually reads', () => {
  it('CONTROL: it still holds the counties that work', () => {
    // Without this, "delete everything" would satisfy the assertions below.
    expect(hasKofileConfig('Bell')).toBe(true);
    expect(hasKofileConfig('Milam')).toBe(true);
    expect(getKofileBaseUrl('Bell')).toContain('bell.tx.publicsearch.us');
  });

  it('no longer claims Coryell is a Kofile county', () => {
    // The host does not resolve, and the run has been searching it on every Coryell property.
    expect(hasKofileConfig('Coryell')).toBe(false);
    expect(codeOnly, 'the dead subdomain is back').not.toContain('coryell.tx.publicsearch.us');
  });

  it('and the routing registry agrees Coryell is not Kofile', () => {
    // The two must not drift again. This is the assertion that would have caught it the first time.
    const fips = lookupCountyFIPS('Coryell', 'TX');
    expect(fips).toBeTruthy();
    expect(KOFILE_FIPS_SET.has(fips), 'the FIPS registry calls Coryell a Kofile county').toBe(false);
    expect(getClerkSystem(fips)).toBe('edoctec');
  });

  it('holds no county that was measured unreachable', () => {
    // The general form of the Coryell bug. All 72 entries were probed once each on 2026-09-02,
    // rate-limited, with a live and a nonexistent control in the same run. 43 did not answer —
    // the same result as the nonexistent control — so for 43 of 72 counties the run searched a
    // host that is not there and then reported no clerk records, which reads as "this property
    // has no deeds" rather than "we could not look".
    const overlap = Object.keys(KOFILE_UNREACHABLE).filter((c) => hasKofileConfig(c));
    expect(
      overlap,
      `These are in KOFILE_CONFIGS and were measured unreachable: ${overlap.join(", ")}. ` +
      `The run reads KOFILE_CONFIGS, so an entry here costs a real search on every run for that county.`,
    ).toEqual([]);
  });

  it('records WHEN each unreachable county was checked', () => {
    // A dead host list with no date is a list nobody can safely act on: "is this still true?" has
    // no answer, and the obvious repair is to add them all back.
    for (const [county, entry] of Object.entries(KOFILE_UNREACHABLE)) {
      // Parsed rather than pattern-matched: a regex written through a shell layer has lost its
      // backslashes five times today, and `/^d{4}-d{2}-d{2}$/` silently matches nothing at all.
      const parsed = Date.parse(entry.checked);
      expect(Number.isNaN(parsed), `${county} has no usable check date: ${entry.checked}`).toBe(false);
      expect(entry.checked.length, `${county}'s date is not ISO yyyy-mm-dd`).toBe(10);
    }
  });

  it('CONTROL: the unreachable list is not empty and not everything', () => {
    // Both directions matter. An empty list would make the first assertion vacuous; a list holding
    // every county would mean the probe failed rather than that Texas has no clerk portals.
    const dead = Object.keys(KOFILE_UNREACHABLE).length;
    expect(dead).toBeGreaterThan(10);
    expect(hasKofileConfig('Bell'), 'the probe removed a county known to work').toBe(true);
  });
});

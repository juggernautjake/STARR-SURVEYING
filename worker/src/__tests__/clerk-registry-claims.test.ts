// A county belongs in the registry because its portal ANSWERED (research plan R38).
//
// The Kofile list held 53 counties, taken from a vendor marketing page in 2024, with a header saying
// the unlisted ones "follow the default subdomain pattern automatically". Probing every entry on
// 2026-08-02 showed **32 of them have no reachable portal at all** — including Coryell, McLennan,
// Falls, Lampasas, Burnet and Bosque, all inside the 80-mile radius the owner asked to be covered.
//
// Research for those counties routed to a dead domain, and the failure surfaced as "no records
// found": a statement about the property rather than about our routing. That is the worst shape a
// failure can take here, because it is indistinguishable from a real answer.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { KOFILE_FIPS_SET, getClerkSystem } from '../services/clerk-registry.js';

const raw = fs.readFileSync(path.join(process.cwd(), 'src/services/clerk-registry.ts'), 'utf8');
/** Comment prefixes and wrapping stripped, so an assertion matches prose rather than layout. */
const src = raw.replace(/^\s*(\/\*\*|\*|\/\/)\s?/gm, '').replace(/\s+/g, ' ');

/** Verified live on 2026-08-02: each returned 200 on `https://<county>.tx.publicsearch.us/`. */
const VERIFIED = [
  '48027', '48029', '48041', '48083', '48085', '48121', '48185', '48251', '48259', '48289',
  '48313', '48325', '48331', '48339', '48347', '48355', '48375', '48439', '48453', '48471', '48491',
];

/** Probed and unreachable. These must NOT be routed to Kofile. */
const UNREACHABLE = {
  '48309': 'McLennan', '48099': 'Coryell', '48145': 'Falls', '48281': 'Lampasas',
  '48053': 'Burnet', '48035': 'Bosque', '48055': 'Caldwell', '48455': 'Trinity',
  '48473': 'Waller', '48477': 'Washington', '48143': 'Erath', '48139': 'Ellis',
};

describe('the registry holds only counties whose portal answered', () => {
  it('contains every verified county', () => {
    for (const fips of VERIFIED) expect(KOFILE_FIPS_SET.has(fips), fips).toBe(true);
  });

  it('contains none of the unreachable ones', () => {
    for (const [fips, name] of Object.entries(UNREACHABLE)) {
      expect(KOFILE_FIPS_SET.has(fips), `${name} (${fips})`).toBe(false);
    }
  });

  it('is exactly the verified set — no drift back in', () => {
    expect([...KOFILE_FIPS_SET].sort()).toEqual([...VERIFIED].sort());
  });
});

describe('what an unreachable county routes to instead', () => {
  it('falls through to TexasFile, which serves all 254 counties', () => {
    // Removing them is not a loss of coverage — it is the difference between a working adapter and
    // a dead domain.
    for (const [fips, name] of Object.entries(UNREACHABLE)) {
      expect(getClerkSystem(fips), name).not.toBe('kofile');
    }
    expect(getClerkSystem('48099')).toBe('texasfile');   // Coryell — 31 miles from Bell
    expect(getClerkSystem('48309')).toBe('texasfile');   // McLennan — Waco
  });

  it('does not silently hand a county to another adapter that cannot reach its site', () => {
    // Trimming the Kofile list must not swallow a county a different adapter handles — but probing
    // afterwards found that Henschen's and iDocket's base URLs are ALL dead too, so those counties
    // now fall through to TexasFile as well (see vendor-reachability.test.ts). Routing to a working
    // fallback beats routing to a vendor we cannot reach.
    expect(getClerkSystem('48209')).toBe('texasfile');   // Hays — Henschen county, dead URLs
    expect(getClerkSystem('48293')).toBe('texasfile');   // Limestone — iDocket county, 404s
  });
});

describe('the assumption that caused it is recorded', () => {
  it('says the default-subdomain assumption was the bug', () => {
    // Without this, the next person adds a county from a vendor page and reintroduces it.
    expect(src).toContain('follow the default subdomain pattern automatically');
    expect(src).toContain('that assumption is what put 32 counties');
  });

  it('states the rule for adding a county', () => {
    expect(src).toContain('because its portal ANSWERED, not because a vendor page listed it');
  });

  it('records why removing them costs no coverage', () => {
    expect(src).toContain('TexasFile is the universal fallback');
  });
});

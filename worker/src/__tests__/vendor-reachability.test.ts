// An adapter must reach its site before research is routed to it (research plan R38).
//
// Every base URL in the Tyler, Henschen, iDocket and Fidlar registries was probed on 2026-08-02.
// **All 54 are unreachable.** Not some — all:
//
//   Henschen   <county>.co.texas.us       a domain pattern that does not exist
//   iDocket    idocket.com/TX/<County>    404 on every county
//   Fidlar     <county>.fidlar.com        unreachable
//   Tyler      deed.dallascounty.org …    dead, though dallascounty.org itself answers
//
// So four of the six clerk adapters routed research to domains that are not there, and the failure
// surfaced as "no records found" — a statement about the property rather than about our routing, and
// indistinguishable from a real answer.
//
// TexasFile answered 200 and serves all 254 Texas counties, so falling through to it is strictly
// better than reaching for a dead host.
//
// ── RE-PROBED 2026-08-27, AND THE FINDING HOLDS ────────────────────────────────────────────────
//
// Three weeks later, spot-checked rather than taken on trust — a dead site can come back, and a
// stale "all dead" is as misleading as a stale "all fine":
//
//   laredo.fidlar.com / jasper.fidlar.com   still unreachable   (the adapter's own pattern)
//   idocket.com/TX/Collin                   still 404
//   deed.traviscountyclerk.org              still unreachable   (Henschen)
//
// BUT ONE LIVE FIDLAR PORTAL TURNED UP, and it is not the shape this adapter builds:
//
//   ava.fidlar.com/TXGalveston/AvaWeb/      200   ← live
//   ava.fidlar.com/TXBrazoria/AvaWeb/       404   ← so it is NOT a universal pattern
//   ava.fidlar.com/                         403   ← host alive, no root page
//
// So Fidlar is not uniformly dead; the ADAPTER is pointed at the wrong URL shape. `<county>.fidlar.com`
// is fabricated. `ava.fidlar.com/TX<County>/AvaWeb/` is real for at least Galveston and not for
// Brazoria, which means proving Fidlar is per-county URL discovery, not a pattern fix.
//
// Deliberately NOT promoted to PROVEN_VENDORS on the strength of this. A 200 from a landing page is
// reachability, not proof: the rule is that an adapter must be DRIVEN against a real county and
// return a real document. Pinging is the cheap half.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { TYLER_EAGLE_FIPS_SET, getClerkSystem, isVendorProven } from '../services/clerk-registry.js';
// From their own modules: the registry imports these rather than re-exporting them.
import { HENSCHEN_FIPS_SET } from '../adapters/henschen-clerk-adapter.js';
import { IDOCKET_FIPS_SET } from '../adapters/idocket-clerk-adapter.js';
import { FIDLAR_FIPS_SET } from '../adapters/fidlar-clerk-adapter.js';
import { TYLER_FIPS_SET } from '../adapters/tyler-clerk-adapter.js';

const prose = fs
  .readFileSync(path.join(process.cwd(), 'src/services/clerk-registry.ts'), 'utf8')
  .replace(/^\s*(\/\*\*|\*|\/\/)\s?/gm, '')
  .replace(/\s+/g, ' ');

describe('only proven vendors are routed to', () => {
  it('trusts the two that answered', () => {
    expect(isVendorProven('kofile')).toBe(true);
    expect(isVendorProven('texasfile')).toBe(true);
  });

  it('does not trust the ones whose every URL was dead', () => {
    for (const v of ['henschen', 'idocket', 'fidlar', 'countyfusion'] as const) {
      expect(isVendorProven(v), v).toBe(false);
    }
  });

  it('trusts Tyler only through the Eagle portals that were driven', () => {
    // Tyler moved into the proven set on 2026-08-02, but NOT because the old TylerClerkAdapter's
    // URLs came back — they are still dead. Nine Tyler Eagle Self-Service deployments were found on
    // a corrected host pattern and driven end to end (plan R39).
    //
    // The distinction matters: routing by the OLD TYLER_FIPS_SET would send counties to hosts that
    // do not resolve, so the registry consults TYLER_EAGLE_FIPS_SET instead.
    expect(isVendorProven('tyler')).toBe(true);
    expect(TYLER_EAGLE_FIPS_SET.has('48309')).toBe(true);   // McLennan — driven
    // A county in the old set but NOT in the Eagle set must not route to Tyler.
    const oldOnly = [...TYLER_FIPS_SET].filter((f) => !TYLER_EAGLE_FIPS_SET.has(f));
    for (const fips of oldOnly) expect(getClerkSystem(fips), fips).not.toBe('tyler');
  });
});

describe('counties fall through to something that works', () => {
  it('sends a Henschen county to TexasFile rather than a non-existent domain', () => {
    // hays.co.texas.us does not resolve. TexasFile does.
    expect(HENSCHEN_FIPS_SET.has('48209')).toBe(true);   // the knowledge is kept
    expect(getClerkSystem('48209')).toBe('texasfile');   // the routing is honest
  });

  it('does the same for iDocket, Fidlar and Tyler counties', () => {
    expect(IDOCKET_FIPS_SET.has('48293')).toBe(true);
    expect(getClerkSystem('48293')).toBe('texasfile');   // Limestone
    expect(FIDLAR_FIPS_SET.has('48113')).toBe(true);
    expect(TYLER_FIPS_SET.has('48113')).toBe(true);
    expect(getClerkSystem('48113')).toBe('texasfile');   // Dallas
  });

  it('still routes the counties whose Kofile portal answered', () => {
    for (const fips of ['48027', '48331', '48289', '48453']) {
      expect(getClerkSystem(fips), fips).toBe('kofile');
    }
  });

  it('leaves no county unrouted', () => {
    // TexasFile is the universal fallback; every FIPS resolves to something.
    for (const fips of ['48099', '48309', '48145', '48001', '48507']) {
      expect(getClerkSystem(fips), fips).toBeTruthy();
    }
  });
});

describe('the knowledge is kept, only the pretence is dropped', () => {
  it('keeps the county lists rather than emptying them', () => {
    // Knowing Hays is a Henschen county is real knowledge worth preserving; what is not preserved is
    // the claim that we can reach it.
    expect(HENSCHEN_FIPS_SET.size).toBeGreaterThan(0);
    expect(IDOCKET_FIPS_SET.size).toBeGreaterThan(0);
    expect(FIDLAR_FIPS_SET.size).toBeGreaterThan(0);
    expect(prose).toContain('The county LISTS are kept');
  });

  it('records what was probed and what was found', () => {
    expect(prose).toContain('All 54 of them are unreachable');
    expect(prose).toContain('co.texas.us');
  });

  it('states how a vendor gets switched back on', () => {
    // One line to edit, once somebody has proven the URLs.
    expect(prose).toContain('only after probing its base URLs');
  });

  it('names why the failure mode was dangerous', () => {
    expect(prose).toContain('a statement about the property rather than about our routing');
  });
});

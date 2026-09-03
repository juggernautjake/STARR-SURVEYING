import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { toDocumentResult } from '../services/clerk-vendor-search.js';
import { getClerkSystem } from '../services/clerk-registry.js';
import { hasKofileConfig, KOFILE_UNREACHABLE } from '../services/bell-clerk.js';
import { lookupCountyFIPS } from '../lib/county-fips.js';
import type { ClerkDocumentResult } from '../adapters/clerk-adapter.js';

// C2 — a clerk source for the counties that are not Kofile.
//
// ── THE GAP ─────────────────────────────────────────────────────────────────────────────────────
//
// The generic pipeline's clerk search is `bell-clerk.ts`, which is Kofile-only and reads its own
// table. It never calls `getClerkAdapter`, so all the vendor routing in `services/clerk-registry.ts`
// governed chain-of-title, the document-access orchestrator and the Testing Lab — and nothing in a
// normal run.
//
// Measured 2026-09-02: 43 of the 72 counties `KOFILE_CONFIGS` claimed pointed at hosts that do not
// resolve. That leaves 29 counties with a clerk search and every other county in Texas with none —
// and `searchClerkRecords` returned `[]` for them, which the pipeline reads as "the clerk holds
// nothing for this owner".
//
// A run reported no clerk records having never contacted a clerk.

const SRC = fs.readFileSync(
  path.join(process.cwd(), 'src/services/bell-clerk.ts'),
  'utf8',
);

const clerkRec = SRC.slice(
  SRC.indexOf('export async function searchClerkRecords('),
  SRC.indexOf('export async function searchClerkRecords(') + 2400,
);

const doc = (over: Partial<ClerkDocumentResult> = {}): ClerkDocumentResult => ({
  instrumentNumber: '2020-12345',
  documentType: 'deed' as ClerkDocumentResult['documentType'],
  recordingDate: '2020-03-04',
  grantors: ['SMITH, JOHN'],
  grantees: ['JONES, MARY'],
  source: 'edoctec',
  ...over,
});

describe('a non-Kofile county now reaches its real vendor', () => {
  it('CONTROL: a Kofile county still uses the Kofile path', () => {
    // Without this, "always delegate to the vendor adapter" would satisfy the rest and would route
    // Bell — the home county, with a working portal — through a slower generic path.
    expect(hasKofileConfig('Bell')).toBe(true);
    // Re-pointed 2026-09-03. This pinned the literal `KOFILE_CONFIGS[county.toLowerCase()]`, which
    // is now the DEFECT: `.toLowerCase()` leaves the space in "Fort Bend", the table is keyed
    // `fort_bend`, and six counties never matched. The intent — a Kofile county still takes the
    // Kofile path — is unchanged and now also asserts the key is normalised.
    expect(clerkRec).toContain('lookupByCounty(KOFILE_CONFIGS, county)');
    expect(clerkRec, 'the raw lookup is back — multi-word counties will miss again')
      .not.toContain('KOFILE_CONFIGS[county.toLowerCase()]');
  });

  it('the no-config branch no longer returns an empty array', () => {
    // `return []` here is what the pipeline reads as "the clerk holds nothing".
    const branch = clerkRec.slice(clerkRec.indexOf('if (!config)'), clerkRec.indexOf('const searchNames'));
    expect(branch, 'the empty-array shortcut is back').not.toMatch(/return \[\];/);
    expect(branch).toContain('searchClerkByVendor(');
  });

  it('it asks the registry which vendor the county actually uses', () => {
    expect(clerkRec).toContain('lookupCountyFIPS(county');
  });

  it('and states the outcome either way', () => {
    // "The index answered and holds nothing" and "we never reached a vendor" are different facts.
    // Both used to arrive as an empty array.
    expect(clerkRec).toContain('outcome.statement');
  });
});

describe('the counties this actually covers', () => {
  it('every county removed as unreachable now routes to a real vendor', () => {
    // The 43 that were searching a dead Kofile host. If any of them routes to `texasfile`, that is
    // still a source — the universal fallback — rather than nothing.
    const unrouted: string[] = [];
    for (const county of Object.keys(KOFILE_UNREACHABLE)) {
      const fips = lookupCountyFIPS(county, 'TX');
      if (!fips) { unrouted.push(`${county} (no FIPS)`); continue; }
      const vendor = getClerkSystem(fips);
      if (!vendor) unrouted.push(county);
    }
    expect(
      unrouted,
      `These counties lost their dead Kofile host and route nowhere: ${unrouted.join(', ')}`,
    ).toEqual([]);
  });

  it('CONTROL: the routing really does vary by county', () => {
    // If every county resolved to the same vendor the assertion above would be meaningless.
    const vendors = new Set(
      Object.keys(KOFILE_UNREACHABLE)
        .map((c) => lookupCountyFIPS(c, 'TX'))
        .filter(Boolean)
        .map((f) => getClerkSystem(f)),
    );
    expect(vendors.size, 'every county routes to the same vendor — the registry is not being read')
      .toBeGreaterThan(1);
  });
});

describe('C3: a paywall is reported as a paywall, not as an empty index', () => {
  const VENDOR = fs.readFileSync(
    path.join(process.cwd(), 'src/services/clerk-vendor-search.ts'), 'utf8',
  );

  it('reads the adapter verdict that nothing used to read', () => {
    // `TexasFileAdapter.lastAccess` has been set on every search since the adapter was written and
    // read by nothing, so "5,000 records exist here and we cannot open them" reached a
    // console.warn and stopped there.
    expect(VENDOR).toContain('lastAccess');
  });

  it('carries it out on the outcome, not just into a log line', () => {
    expect(VENDOR).toContain('paywall: { recordCount: number | null; statement: string } | null;');
  });

  it('a paywalled county does NOT read as "no documents"', () => {
    // The distinction that decides whether to buy a subscription or look somewhere else. Rendering
    // both as an empty result is the defect this entire plan is about.
    expect(VENDOR).toContain('The records EXIST');
    expect(VENDOR).toContain('absence of access, not of documents');
  });

  it('keeps the COUNT, which is the part that makes it actionable', () => {
    // "5,000 records" is a purchasing decision. "Some records" is not.
    expect(VENDOR).toContain('paywall.recordCount');
  });

  it('CONTROL: an open search still reports its documents normally', () => {
    // Without this, "always report a paywall" would satisfy the assertions above and would tell an
    // operator to buy a subscription for a county that answered perfectly well.
    expect(VENDOR).toContain('document(s) found for');
    expect(VENDOR).toContain("access?.state === 'paywalled'");
  });
});

describe('a vendor result becomes a document the pipeline can carry', () => {
  it('maps the fields the run needs', () => {
    const d = toDocumentResult(doc(), 'edoctec');
    expect(d.ref.instrumentNumber).toBe('2020-12345');
    expect(d.ref.recordingDate).toBe('2020-03-04');
    expect(d.ref.grantors).toEqual(['SMITH, JOHN']);
    expect(d.ref.documentType).toBe('deed');
  });

  it('keeps volume and page when the vendor gives them', () => {
    const d = toDocumentResult(doc({ volumePage: { volume: '450', page: '12' } }), 'tyler');
    expect(d.ref.volume).toBe('450');
    expect(d.ref.page).toBe('12');
  });

  it('names the VENDOR that answered, not just "clerk"', () => {
    // "Which vendor did we reach" is the first question when a county starts returning nothing, and
    // it is unanswerable after the fact if every result says the same thing.
    expect(toDocumentResult(doc({ source: '' }), 'uslandrecords').ref.source).toBe('uslandrecords');
  });

  it('does not invent an empty instrument number', () => {
    // A document with no instrument is a real thing — Avenu publishes none — and `''` would be
    // deduplicated against every other blank one.
    expect(toDocumentResult(doc({ instrumentNumber: '' }), 'x').ref.instrumentNumber).toBeNull();
  });
});

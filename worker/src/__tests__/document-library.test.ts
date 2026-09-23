// worker/src/__tests__/document-library.test.ts — what the FIRM holds, and what it must not share.
//
// This module decides whether a run fetches a plat and whether it spends money on one, so the two
// things worth pinning are: does it find what we have, and does it refuse to hand over what is not
// ours to hand over.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  heldByCitation, heldByContent, heldPlatForSubdivision, heldForCounty, countyHoldingsSummary,
} from '../research/document-library.js';

/** A Supabase double that records the filters it was given and replays a fixed result. */
function db(rows: Array<Record<string, unknown>>) {
  const calls: Array<{ op: string; args: unknown[] }> = [];
  const builder: Record<string, unknown> = {};
  for (const op of ['select', 'eq', 'is', 'in', 'ilike']) {
    builder[op] = (...args: unknown[]) => { calls.push({ op, args }); return builder; };
  }
  builder.limit = (...args: unknown[]) => { calls.push({ op: 'limit', args }); return Promise.resolve({ data: rows, error: null }); };
  return { client: { from: (t: string) => { calls.push({ op: 'from', args: [t] }); return builder; } }, calls };
}

const ROW = {
  id: 'doc-1',
  document_label: 'GLENDALE ADDITION AMENDED',
  document_type: 'plat',
  county_fips: 'bell',
  identity_key: 'BELL|I:201912345',
  content_sha256: 'abc123',
  storage_path: 'p/artifacts/plat/',
  storage_url: 'https://x/plat.png',
  pages_pdf_url: null,
  recorded_date: '1930-08-14',
  recording_info: 'Vol 9251 Pg 668',
  page_count: 1,
  research_project_id: 'other-project',
  provenance: 'public_record',
  source_vendor: null,
};

const filters = (calls: Array<{ op: string; args: unknown[] }>) =>
  calls.filter((c) => ['eq', 'is', 'in', 'ilike'].includes(c.op)).map((c) => `${c.op}:${String(c.args[0])}=${String(c.args[1])}`);

describe('every library read is fenced the same way', () => {
  beforeEach(() => vi.clearAllMocks());

  it('asks only for shareable, live, non-duplicate rows in the right county', async () => {
    const { client, calls } = db([ROW]);
    await heldByCitation(client, { county: 'Bell County', instrumentNumber: '2019-12345' });
    const f = filters(calls);
    // ── THE ONE THAT MATTERS ────────────────────────────────────────────────────────────────────
    // `shareable` defaults to FALSE (seeds/658), so a client's own uploaded survey and a vendor
    // purchase nobody has licence-checked are invisible here by construction. If this filter is
    // ever dropped, the library starts handing one customer's private file to another.
    expect(f).toContain('eq:shareable=true');
    expect(f).toContain('is:superseded_at=null');
    expect(f).toContain('is:duplicate_of=null');
    // "Bell County" and "bell" are the same county; the key is normalised before it is asked for.
    expect(f).toContain('eq:county_fips=bell');
  });

  it('returns a document another project fetched — that is the whole point', async () => {
    const { client } = db([ROW]);
    const hit = await heldPlatForSubdivision(client, 'Bell', 'Glendale Addition');
    expect(hit?.id).toBe('doc-1');
    // The run asking is not the run that paid for it. A library scoped to the asking project would
    // return nothing here and the run would re-fetch what the firm already has.
    expect(hit?.researchProjectId).toBe('other-project');
  });
});

describe('finding what we already hold', () => {
  it('matches a citation across vendors, not a label', async () => {
    const { client, calls } = db([ROW]);
    await heldByCitation(client, { county: 'bell', instrumentNumber: '2019-12345' });
    // The same deed is `2019-12345` on TexasFile and `V9251 P668` on the county portal. Only the
    // normalised identity key knows they are one document.
    expect(filters(calls).some((x) => x.startsWith('eq:identity_key='))).toBe(true);
  });

  it('refuses to guess when there is no citation to match on', async () => {
    const { client, calls } = db([ROW]);
    expect(await heldByCitation(client, { county: 'bell' })).toBeNull();
    // No query at all — an identity-free lookup would match the first plat in the county.
    expect(calls).toHaveLength(0);
  });

  it('matches bytes, which beats any label', async () => {
    const { client, calls } = db([ROW]);
    const hit = await heldByContent(client, 'bell', 'abc123');
    expect(hit?.id).toBe('doc-1');
    expect(filters(calls)).toContain('eq:content_sha256=abc123');
  });

  it('strips SQL wildcards from the subdivision before it becomes a LIKE pattern', async () => {
    const { client, calls } = db([ROW]);
    // `%` and `_` are wildcards in LIKE. A subdivision called "OAK_RIDGE 50%" would otherwise match
    // half the county and report the wrong plat as held, which suppresses BOTH the fetch and the
    // purchase. Other punctuation is harmless and is left alone.
    await heldPlatForSubdivision(client, 'bell', 'OAK_RIDGE 50%');
    const ilike = calls.find((c) => c.op === 'ilike');
    expect(ilike).toBeTruthy();
    expect(String(ilike!.args[1]).replace(/^%|%$/g, '')).not.toMatch(/[%_]/);
  });

  // ── THE THREE NORMALISERS ────────────────────────────────────────────────────────────────────
  it('keys the county the way the seed and the purchase ledger key it', async () => {
    const { libraryCountyKey } = await import('../research/document-library.js');
    // document-identity's normaliseCounty UPPERCASES; seed 658 stores lower case. Using the wrong
    // one made every lookup ask for BELL against a column holding bell, and a library that matches
    // nothing looks exactly like a library that holds nothing.
    expect(libraryCountyKey('Bell County')).toBe('bell');
    expect(libraryCountyKey('bell')).toBe('bell');
    expect(libraryCountyKey('  Fort Bend County ')).toBe('fort bend');
    // FIPS wins where we have it, matching research_document_purchases.county_fips.
    expect(libraryCountyKey('48027')).toBe('48027');
    expect(libraryCountyKey('')).toBe('');
  });

  it('will not run a wildcard search on a two-letter fragment', async () => {
    const { client, calls } = db([ROW]);
    // `%A%` matches almost every plat in the county and would report the wrong one as held —
    // which suppresses the fetch AND the purchase.
    expect(await heldPlatForSubdivision(client, 'bell', 'A')).toBeNull();
    expect(calls).toHaveLength(0);
  });

  it('looks in both plat document types', async () => {
    const { client, calls } = db([ROW]);
    await heldPlatForSubdivision(client, 'bell', 'Glendale Addition');
    const inCall = calls.find((c) => c.op === 'in');
    expect(inCall?.args[1]).toEqual(['plat', 'subdivision_plat']);
  });
});

describe('a library miss never fails a run', () => {
  it('swallows a thrown query and answers null', async () => {
    const broken = { from: () => { throw new Error('connection reset'); } };
    // The worst case of a miss is fetching something we already had — which is the behaviour this
    // module improves on, not a reason to stop a run that is otherwise fine.
    await expect(heldByCitation(broken, { county: 'bell', instrumentNumber: 'X' })).resolves.toBeNull();
    await expect(heldPlatForSubdivision(broken, 'bell', 'Glendale Addition')).resolves.toBeNull();
    await expect(heldForCounty(broken, 'bell')).resolves.toEqual([]);
  });

  it('answers empty with no database at all', async () => {
    expect(await heldByCitation(null, { county: 'bell', instrumentNumber: 'X' })).toBeNull();
    expect(await heldForCounty(null, 'bell')).toEqual([]);
  });
});

describe('what we hold for a county, in one sentence', () => {
  it('counts by kind', async () => {
    const { client } = db([ROW, { ...ROW, id: 'd2' }, { ...ROW, id: 'd3', document_type: 'deed' }]);
    const s = await countyHoldingsSummary(client, 'Bell');
    expect(s.total).toBe(3);
    expect(s.byType).toEqual({ plat: 2, deed: 1 });
    expect(s.sentence).toContain('2 plat');
  });

  it('says so plainly when the shelf is empty', async () => {
    const { client } = db([]);
    const s = await countyHoldingsSummary(client, 'Coryell');
    expect(s.total).toBe(0);
    expect(s.sentence).toMatch(/Nothing held for Coryell/);
  });
});

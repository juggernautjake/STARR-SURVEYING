import { describe, it, expect } from 'vitest';
import {
  MIN_SCORE,
  buildOpenWebQueries,
  canonicalUrl,
  dedupeAndRank,
  domainAuthority,
  provenanceBand,
  renderFindingsAsDocument,
  rankScore,
  searchOpenWeb,
  unsupportedAngles,
  type OpenWebResult,
} from '@/lib/research/open-web';

// ── WHY THESE TESTS ─────────────────────────────────────────────────────────────────────────────
//
// A bad web search does not throw. It returns six confident, well-formed, irrelevant results, and a
// report built on them looks exactly like a report built on good ones. Every rule this module has
// exists to stop a specific way of being plausibly wrong, so each is pinned here.

const SUBJECT = {
  address: '3779 W FM 436, Belton, TX 76513',
  county: 'Bell',
  ownerName: 'Ash Family Trust',
  subdivision: 'ASH FAMILY TRUST 12.358 ACRE ADDITION',
};

describe('query construction', () => {
  it('builds one query per angle, not one query for everything', () => {
    const qs = buildOpenWebQueries(SUBJECT);
    expect(qs.length).toBe(5);
    expect(new Set(qs.map((q) => q.angle)).size).toBe(5);
  });

  it('will not ask about liens without an owner name', () => {
    // The failure this prevents: searching "lien Bell County Texas" returns the county's general
    // lien page — a plausible finding that answers a question nobody asked, and reads as "checked".
    const { ownerName, ...noOwner } = SUBJECT;
    const angles = buildOpenWebQueries(noOwner).map((q) => q.angle);
    expect(angles).not.toContain('owner-encumbrance');
    expect(unsupportedAngles(noOwner)).toContain('owner-encumbrance');
  });

  it('reports unsupported angles rather than omitting them', () => {
    // An omitted angle is indistinguishable from an angle that found nothing.
    const thin = { county: 'Bell' };
    const supported = buildOpenWebQueries(thin).map((q) => q.angle);
    const unsupported = unsupportedAngles(thin);
    expect(supported.length + unsupported.length).toBe(5);
  });

  it('quotes the subject so the engine treats it as one term', () => {
    const q = buildOpenWebQueries(SUBJECT).find((x) => x.angle === 'permits-planning')!;
    expect(q.query).toContain('"3779 W FM 436, Belton, TX 76513"');
  });

  it('strips embedded quotes that would break the phrase', () => {
    const q = buildOpenWebQueries({ ...SUBJECT, ownerName: 'A "Nickname" Trust' })
      .find((x) => x.angle === 'owner-encumbrance')!;
    // One opening and one closing quote — not four.
    expect(q.query.match(/"/g)?.length).toBe(2);
  });

  it('gives every query a rationale, because the run log is read by people', () => {
    for (const q of buildOpenWebQueries(SUBJECT)) {
      expect(q.rationale.length).toBeGreaterThan(20);
    }
  });
});

describe('domain authority', () => {
  it('ranks government above everything', () => {
    expect(domainAuthority('https://www.bellcountytx.gov/permits')).toBe(1.0);
    expect(domainAuthority('https://bell.tx.us/records')).toBe(1.0);
  });

  it('treats the records vendors we already pay for as primary sources', () => {
    expect(domainAuthority('https://bell.tx.publicsearch.us/doc/1')).toBeGreaterThanOrEqual(0.8);
    expect(domainAuthority('https://esearch.bellcad.org/Property')).toBeGreaterThanOrEqual(0.75);
  });

  it('does not discard the open web, only discounts it', () => {
    // A blog post may be the only public record of a boundary dispute. Filtering it would lose the
    // finding entirely, so this is a weighting rather than a gate.
    expect(domainAuthority('https://someblog.example/post')).toBeGreaterThan(0);
  });

  it('survives an unparseable url', () => {
    expect(() => domainAuthority('not a url')).not.toThrow();
    expect(domainAuthority('not a url')).toBe(0.2);
  });

  it('puts a government page above a more "relevant" content farm', () => {
    const gov = { score: 0.60, authority: domainAuthority('https://co.bell.tx.us/x') };
    const farm = { score: 0.85, authority: domainAuthority('https://leads.example/x') };
    expect(rankScore(gov)).toBeGreaterThan(rankScore(farm));
  });
});

describe('dedupe', () => {
  const res = (url: string, score: number, angle: OpenWebResult['angle']): OpenWebResult => ({
    angle, url, title: 't', content: 'c', score, authority: domainAuthority(url),
  });

  it('collapses the same page found under two angles, keeping the better sighting', () => {
    // Angles overlap on purpose — a lawsuit surfaces under both news and encumbrance. Showing it
    // twice overstates how much was found, which is how a research report lies.
    const out = dedupeAndRank([
      res('https://example.gov/case/1', 0.5, 'news-disputes'),
      res('https://example.gov/case/1', 0.9, 'owner-encumbrance'),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].score).toBe(0.9);
  });

  it('treats tracking parameters and trailing slashes as the same page', () => {
    expect(canonicalUrl('https://example.gov/a/?utm_source=x')).toBe(canonicalUrl('https://example.gov/a'));
    expect(canonicalUrl('https://example.gov/a#frag')).toBe(canonicalUrl('https://example.gov/a'));
  });

  it('keeps genuinely different pages', () => {
    const out = dedupeAndRank([
      res('https://example.gov/a', 0.9, 'news-disputes'),
      res('https://example.gov/b', 0.9, 'news-disputes'),
    ]);
    expect(out).toHaveLength(2);
  });
});

describe('searchOpenWeb', () => {
  it('says it is not configured rather than returning an empty result', async () => {
    // The whole point of the skip taxonomy: "did not run" and "ran and found nothing" are different
    // facts, and collapsing them is how a feature stays broken for months looking like an empty archive.
    const report = await searchOpenWeb(SUBJECT, { apiKey: '', fetchImpl: async () => new Response('{}') });
    expect(report.topResults).toHaveLength(0);
    expect(report.angles.every((a) => a.skipped !== null)).toBe(true);
    expect(report.angles.some((a) => a.skipped === 'not-configured')).toBe(true);
    expect(report.steps.join(' ')).toContain('TAVILY_API_KEY');
  });

  it('does not lose four angles when one fails', async () => {
    // A rate-limit on the owner search is not a reason to discard the permit findings.
    const fetchImpl = (async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      if (body.query.includes('Ash Family Trust')) return new Response('nope', { status: 429 });
      return new Response(JSON.stringify({
        results: [{ url: 'https://example.gov/permit/9', title: 'Permit', content: 'x', score: 0.9 }],
      }), { status: 200 });
    }) as unknown as typeof fetch;

    const report = await searchOpenWeb(SUBJECT, { apiKey: 'k', fetchImpl });
    const failed = report.angles.filter((a) => a.skipped === 'search-failed');
    const ran = report.angles.filter((a) => a.skipped === null);
    expect(failed).toHaveLength(1);
    expect(failed[0].angle).toBe('owner-encumbrance');
    expect(ran.length).toBe(4);
    expect(report.topResults.length).toBeGreaterThan(0);
  });

  it('drops results below the relevance floor', async () => {
    const fetchImpl = (async () => new Response(JSON.stringify({
      results: [
        { url: 'https://example.gov/good', title: 'g', content: 'x', score: 0.9 },
        { url: 'https://example.gov/noise', title: 'n', content: 'x', score: MIN_SCORE - 0.01 },
      ],
    }), { status: 200 })) as unknown as typeof fetch;

    const report = await searchOpenWeb(SUBJECT, { apiKey: 'k', fetchImpl });
    expect(report.topResults.map((r) => r.url)).toEqual(['https://example.gov/good']);
  });

  it('distinguishes a failed search from an unconfigured one', async () => {
    // Telling an operator "not configured" during an outage sends them to change a setting that is
    // already correct.
    const fetchImpl = (async () => { throw new Error('ETIMEDOUT'); }) as unknown as typeof fetch;
    const report = await searchOpenWeb(SUBJECT, { apiKey: 'k', fetchImpl });
    expect(report.angles.every((a) => a.skipped === 'search-failed' || a.skipped === 'insufficient-subject')).toBe(true);
    expect(report.angles.some((a) => a.skipped === 'not-configured')).toBe(false);
  });

  it('honours `only` so a caller can control cost', async () => {
    let calls = 0;
    const fetchImpl = (async () => {
      calls++;
      return new Response(JSON.stringify({ results: [] }), { status: 200 });
    }) as unknown as typeof fetch;

    await searchOpenWeb(SUBJECT, { apiKey: 'k', fetchImpl, only: ['permits-planning'] });
    expect(calls).toBe(1);
  });
});

describe('renderFindingsAsDocument', () => {
  // R1b: the findings become a research_documents row, so this text is what the AI reads and what
  // gets embedded for search. What it omits, the model cannot know.
  const result = (url: string, angle: OpenWebResult['angle'], score = 0.9): OpenWebResult => ({
    angle, url, title: 'Lien filed against Ash Family Trust', content: 'Cause No. 12345  filed 2019',
    score, authority: domainAuthority(url),
  });

  it('keeps the url, the angle and a readable provenance band on every finding', () => {
    // Strip provenance and the AI gets a flat list of equally-credible-looking claims — which is
    // precisely how a confident wrong answer gets written into a survey report.
    const text = renderFindingsAsDocument(
      { address: '3779 W FM 436', county: 'Bell', ownerName: 'Ash Family Trust' },
      { angles: [], topResults: [result('https://co.bell.tx.us/case/1', 'owner-encumbrance')], steps: [] },
    );
    expect(text).toContain('https://co.bell.tx.us/case/1');
    expect(text).toContain('owner-encumbrance');
    expect(text).toContain('government record');
  });

  it('bands a blog differently from a county record', () => {
    expect(provenanceBand(domainAuthority('https://co.bell.tx.us/x'))).toBe('government record');
    expect(provenanceBand(domainAuthority('https://blog.example/x'))).toBe('open web — unverified');
  });

  it('says outright that these are not county records', () => {
    // The document sits beside deeds and CAD extracts in the same list. Without this line a reader
    // — human or model — has no reason to treat it differently.
    const text = renderFindingsAsDocument({ address: 'x' }, { angles: [], topResults: [result('https://a.gov/1', 'news-disputes')], steps: [] });
    expect(text).toMatch(/NOT county records/i);
  });

  it('reports an empty search as a result rather than an error', () => {
    const text = renderFindingsAsDocument({ address: 'x' }, { angles: [], topResults: [], steps: [] });
    expect(text).toContain('This is a result, not an error');
  });

  it('lists angles that did not run, so "could not ask" is not read as "found nothing"', () => {
    const text = renderFindingsAsDocument(
      { address: 'x' },
      {
        angles: [{ angle: 'owner-encumbrance', query: null, results: [], skipped: 'insufficient-subject' }],
        topResults: [result('https://a.gov/1', 'news-disputes')],
        steps: [],
      },
    );
    expect(text).toContain('ANGLES NOT SEARCHED');
    expect(text).toContain('owner-encumbrance: insufficient-subject');
  });
});

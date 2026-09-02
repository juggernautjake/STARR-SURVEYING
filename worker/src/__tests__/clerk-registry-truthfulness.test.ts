import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { CLERK_REGISTRY } from '../adapters/clerk-registry.js';

// ── WHAT THIS GUARDS ────────────────────────────────────────────────────────────────────────────
//
// On 2026-08-26 every `baseUrl` in this registry was fetched. Four were wrong, and the worst was
// Bell — the home county, marked `implemented`, annotated "Fully tested", pointing at
// `www.bellcountyclerk.org` which does not resolve.
//
// Bell County research had never once been broken by it, because `counties/bell/scrapers/
// clerk-scraper.ts` hardcodes the real host and never reads this table. 215 rows in
// `research_documents` came from that real host while the registry named a dead one.
//
// THAT is the failure mode worth a test. A registry entry that is both wrong AND unread is
// indistinguishable from one that is right, and stays that way until the first county that actually
// depends on the table inherits the rot. The Bell entry is the only one we can check for free,
// because it is the only one with a scraper to check against — so it is checked.
//
// These are deliberately OFFLINE assertions. A test that fetches county servers would be flaky, and
// worse, would hammer small government sites on every CI run — the same politeness rule the worker's
// concurrency ceiling exists to honour. Live verification is a periodic chore; consistency is a test.

const BELL_SCRAPER = fs.readFileSync(
  path.join(process.cwd(), 'src/counties/bell/scrapers/clerk-scraper.ts'),
  'utf8',
);

describe('the Bell entry matches the scraper that actually runs', () => {
  const bell = CLERK_REGISTRY.find((e) => e.county === 'Bell')!;

  it('names a host the Bell clerk scraper really uses', () => {
    expect(bell.baseUrl).toBeTruthy();
    const host = new URL(bell.baseUrl!).hostname;
    expect(
      BELL_SCRAPER.includes(host),
      `clerk-registry says Bell is at "${host}", but counties/bell/scrapers/clerk-scraper.ts ` +
        `never mentions that host. One of the two is wrong, and the registry is the one nobody reads.`,
    ).toBe(true);
  });
});

describe('the registry does not overstate itself', () => {
  it('every entry claiming `implemented` has a URL', () => {
    // "Implemented" with no address is a claim that cannot be true.
    for (const e of CLERK_REGISTRY.filter((x) => x.status === 'implemented')) {
      expect(e.baseUrl, `${e.county} is marked implemented but has no baseUrl`).toBeTruthy();
    }
  });

  it('every URL is at least well-formed and https', () => {
    for (const e of CLERK_REGISTRY) {
      if (!e.baseUrl) continue;
      expect(() => new URL(e.baseUrl!), `${e.county}: unparseable baseUrl`).not.toThrow();
      expect(new URL(e.baseUrl!).protocol, `${e.county}: not https`).toBe('https:');
    }
  });

  it('keeps the known-dead URLs annotated rather than quietly present', () => {
    // Verified dead on 2026-08-26. If someone fixes one, this test should be updated in the same
    // commit — which is the point: the annotation and the URL move together or the test complains.
    // Coryell came OFF this list on 2026-09-02, in the same commit that fixed it — which is the
    // workflow the comment above describes.
    //
    // Its entry was not merely stale about a URL, it was wrong about the VENDOR: it said `kofile`
    // pointing at a dead county-website page, while services/clerk-registry.ts has routed Coryell to
    // eDocTec since plan R39 (12,705 documents, driven end to end). The two registries disagreed
    // about whether the county was supported at all. It now carries the adapter's real address,
    // https://mclennan.edoctec.com/CoryellPublicRecords, so there is no dead URL left to annotate.
    //
    // Confirmed with a control: milam. and bell.tx.publicsearch.us answer 200 while
    // coryell.tx.publicsearch.us does not resolve — identical to a nonexistent subdomain. Coryell is
    // genuinely not a Kofile county, so swapping in a Kofile address would have been the wrong fix.
    const deadOrBroken = ['Collin', 'Travis'];
    for (const county of deadOrBroken) {
      const e = CLERK_REGISTRY.find((x) => x.county === county);
      if (!e?.baseUrl) continue; // nulled out later is a fine resolution
      expect(
        /DEAD LINK|UNREACHABLE|REDIRECTS|verified/i.test(e.notes ?? ''),
        `${county} has a baseUrl that failed live verification on 2026-08-26 but carries no note ` +
          `saying so. An unannotated bad URL reads as a working one.`,
      ).toBe(true);
    }
  });

  it('does not mark a county implemented without a note explaining the evidence', () => {
    for (const e of CLERK_REGISTRY.filter((x) => x.status === 'implemented')) {
      expect((e.notes ?? '').length, `${e.county} claims implemented with no note`).toBeGreaterThan(10);
    }
  });
});

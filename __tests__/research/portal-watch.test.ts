// __tests__/research/portal-watch.test.ts
//
// The interesting assertions here are all REJECTIONS.
//
// Searching "<county> clerk records portal new system" always returns something — the vendors sell
// exactly this product, every county has a generic records-search page, and a 2019 announcement
// reads like a 2026 one. So the value of this module is entirely in what it declines to promote. A
// watcher that says "likely" to a vendor's brochure gets muted within a fortnight, and a muted alert
// is worse than no alert, because now there is one everyone has learned to skip.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildPortalWatchQueries,
  buildWatchReport,
  classifyWatchResult,
  describeWatchReport,
  isVendorPage,
  latestYear,
  migrationExcerpt,
  runPortalWatch,
} from '@/lib/research/portal-watch';

const NOW = 2026;

/** The shape `open-web.ts` hands over. */
const result = (over: Partial<{ url: string; title: string; content: string; score: number; authority: number }> = {}) => ({
  url: 'https://www.bellcountytx.gov/clerk/records',
  title: 'Official Public Records',
  content: 'Search official public records online.',
  score: 0.8,
  authority: 0.9,
  ...over,
});

/** The real thing: a county saying it, with a date, on a .gov domain. */
const REAL_ANNOUNCEMENT = result({
  url: 'https://www.bellcountytx.gov/clerk/notice',
  title: 'Bell County Clerk — Notice of Records System Transition',
  content:
    'The Bell County Clerk will transition to a new online records search system effective October 1, 2026. ' +
    'The current portal will no longer be available after that date.',
  authority: 1.0,
});

describe('buildPortalWatchQueries', () => {
  it('asks the county, the press and the commissioners court', () => {
    const qs = buildPortalWatchQueries({ county: 'Bell' });
    expect(qs).toHaveLength(3);
    expect(qs.every((q) => q.query.includes('"Bell County"'))).toBe(true);
    // The contract is approved in open court months before anything visibly changes.
    expect(qs.some((q) => /commissioners court/i.test(q.query))).toBe(true);
  });

  it('names the incumbent vendor when we know it, to catch a switch AWAY from it', () => {
    const qs = buildPortalWatchQueries({ county: 'Bell', currentVendor: 'Kofile' });
    expect(qs).toHaveLength(4);
    expect(qs.some((q) => q.query.includes('replacing Kofile'))).toBe(true);
  });

  it('every query carries a rationale — an unexplained query is an unmaintained one', () => {
    for (const q of buildPortalWatchQueries({ county: 'Bell', currentVendor: 'Tyler' })) {
      expect(q.rationale.length).toBeGreaterThan(20);
    }
  });
});

describe('what it refuses to promote', () => {
  it('never calls a vendor brochure "likely", however well it matches', () => {
    // Kofile's own page names counties, uses every migration word, and is a sales page. This is the
    // single most common false positive available, and it must not be the loudest result.
    const hit = classifyWatchResult(result({
      url: 'https://www.kofile.com/solutions/bell-county',
      title: 'Bell County transitions to Kofile — a new system for official records',
      content: 'Bell County is migrating to our new portal, effective 2026. Modernize your records today.',
      authority: 0.2,
    }), 'Bell', { currentYear: NOW });

    expect(hit.verdict).not.toBe('likely');
    expect(hit.reasons).toContain('vendor marketing — demoted');
  });

  it('demotes an announcement that is years old', () => {
    const hit = classifyWatchResult(result({
      title: 'Bell County Clerk — Notice of Records System Transition',
      content: 'Bell County will transition to a new records system effective October 1, 2019.',
    }), 'Bell', { currentYear: NOW });

    expect(hit.verdict).not.toBe('likely');
    expect(hit.reasons.join(' ')).toMatch(/stale/);
  });

  it('rejects an everyday records page — portal vocabulary is not migration vocabulary', () => {
    // "Search records online" is what a portal says every day of its life. If this scored, every
    // county would be flagged forever.
    const hit = classifyWatchResult(result(), 'Bell', { currentYear: NOW });
    expect(hit.verdict).toBe('noise');
  });

  it('rejects a page about migrations that is not about this county', () => {
    const hit = classifyWatchResult(result({
      url: 'https://www.someothercounty.gov/notice',
      title: 'County Clerk Records System Transition',
      content: 'Coryell County will transition to a new records system effective March 2026.',
    }), 'Bell', { currentYear: NOW });

    expect(hit.verdict).toBe('noise');
    expect(hit.reasons).not.toContain('names Bell');
  });

  it('will not promote a dateless page, because new and old read identically without one', () => {
    const hit = classifyWatchResult({
      url: 'https://www.bellcountytx.gov/clerk/notice',
      title: 'Bell County Clerk records transition',
      content: 'Bell County is transitioning to a new records portal.',
      score: 0.9,
      authority: 1.0,
    }, 'Bell', { currentYear: NOW });

    expect(hit.verdict).toBe('possible');
    expect(hit.verdict).not.toBe('likely');
    expect(hit.reasons).toContain('no date — cannot tell new from old');
  });

  it('drops results the search itself scored as barely relevant', () => {
    expect(classifyWatchResult({ ...REAL_ANNOUNCEMENT, score: 0.1 }, 'Bell', { currentYear: NOW }).verdict).toBe('noise');
  });
});

describe('what it does promote', () => {
  it('rates the real thing "likely" — county, migration language, a date, and a .gov source', () => {
    const hit = classifyWatchResult(REAL_ANNOUNCEMENT, 'Bell', { currentYear: NOW });
    expect(hit.verdict).toBe('likely');
    expect(hit.reasons).toEqual(expect.arrayContaining(['names Bell', 'migration language', 'carries a date', 'official source']));
  });

  it('quotes the sentence that triggered it, so triage does not need the page open', () => {
    const hit = classifyWatchResult(REAL_ANNOUNCEMENT, 'Bell', { currentYear: NOW });
    expect(hit.excerpt).toMatch(/transition to a new online records search system/);
  });

  it('accepts "Bell County" written either way', () => {
    // The target is stored as "Bell"; the page says "Bell County". Requiring an exact match would
    // reject nearly every genuine hit.
    expect(classifyWatchResult(REAL_ANNOUNCEMENT, 'Bell County', { currentYear: NOW }).verdict).toBe('likely');
  });
});

describe('helpers', () => {
  it('isVendorPage knows the Texas records vendors by host, not by mention', () => {
    expect(isVendorPage('https://www.kofile.com/x')).toBe(true);
    expect(isVendorPage('https://www.tylertech.com/products')).toBe(true);
    // A county page that merely MENTIONS the vendor is still a county page.
    expect(isVendorPage('https://www.bellcountytx.gov/kofile-notice')).toBe(false);
  });

  it('latestYear takes the newest plausible year and ignores nonsense', () => {
    expect(latestYear('effective 2019, revised 2026')).toBe(2026);
    expect(latestYear('call 5551234 for records')).toBeNull();
    expect(latestYear('no years here')).toBeNull();
  });

  it('migrationExcerpt returns the migration sentence, not the first sentence', () => {
    const text = 'Welcome to the clerk. Office hours are 8-5. We are transitioning to a new portal in October.';
    expect(migrationExcerpt(text)).toMatch(/^We are transitioning/);
  });
});

describe('the report', () => {
  it('keeps the noise, so a quiet watch is distinguishable from a watch that is not running', () => {
    // The failure this codebase keeps rediscovering. A report showing only hits looks identical to
    // one produced by a broken watcher.
    const report = buildWatchReport('Bell', [result(), result({ url: 'https://x.gov/a' })], { currentYear: NOW });
    expect(report.hits).toHaveLength(2);
    expect(report.counts.noise).toBe(2);
    expect(report.actionable).toBe(false);
  });

  it('says so out loud when it checked things and rejected them all', () => {
    const text = describeWatchReport(buildWatchReport('Bell', [result()], { currentYear: NOW }));
    expect(text).toMatch(/nothing announced/);
    expect(text).toMatch(/checked and rejected/);
  });

  it('dedupes the same announcement arriving from several angles', () => {
    // Three queries, one notice. Counting it three times would overstate what was found.
    const report = buildWatchReport('Bell', [
      REAL_ANNOUNCEMENT,
      { ...REAL_ANNOUNCEMENT, url: REAL_ANNOUNCEMENT.url + '/' },
      { ...REAL_ANNOUNCEMENT, url: REAL_ANNOUNCEMENT.url + '?utm_source=x' },
    ], { currentYear: NOW });

    expect(report.hits).toHaveLength(1);
    expect(report.counts.likely).toBe(1);
  });

  it('sorts likely above possible above noise', () => {
    const report = buildWatchReport('Bell', [
      result({ url: 'https://a.gov/1' }),
      REAL_ANNOUNCEMENT,
      result({
        url: 'https://b.gov/2',
        title: 'Bell County records transition',
        content: 'Bell County is transitioning to a new portal.',
      }),
    ], { currentYear: NOW });

    expect(report.hits.map((h) => h.verdict)).toEqual(['likely', 'possible', 'noise']);
  });

  it('actionable is true only for a likely — possible must never page anybody', () => {
    const possible = buildWatchReport('Bell', [{
      url: 'https://b.gov/2',
      title: 'Bell County records transition',
      content: 'Bell County is transitioning to a new portal.',
      score: 0.9,
      authority: 0.9,
    }], { currentYear: NOW });

    expect(possible.counts.possible).toBe(1);
    expect(possible.actionable).toBe(false);
  });

  it('prints the excerpt and the reasoning for everything it surfaces', () => {
    const text = describeWatchReport(buildWatchReport('Bell', [REAL_ANNOUNCEMENT], { currentYear: NOW }));
    expect(text).toMatch(/\[likely\]/);
    expect(text).toMatch(/transition to a new online records search system/);
    // The reader has to be able to disagree with the machine, which means seeing why it decided.
    expect(text).toMatch(/names Bell; migration language/);
  });
});

// ── The runner ──────────────────────────────────────────────────────────────────────────────────

describe('runPortalWatch', () => {
  const tavily = (results: Array<Record<string, unknown>>) =>
    async () => new Response(JSON.stringify({ results }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });

  it('separates "no key" from "searched and nothing is announced"', async () => {
    const unset = await runPortalWatch({ county: 'Bell' }, { apiKey: '', fetchImpl: tavily([]) });
    const quiet = await runPortalWatch({ county: 'Bell' }, { apiKey: 'k', fetchImpl: tavily([]) });

    // A quiet watch is reassuring. A watch that never ran is not, and they produce the same empty
    // hit list — so the status has to carry the difference.
    expect(unset.status).toBe('not-configured');
    expect(unset.report).toBeNull();
    expect(quiet.status).toBe('searched');
    expect(quiet.report?.hits).toHaveLength(0);
  });

  it('reports a provider outage as an outage', async () => {
    const down = await runPortalWatch({ county: 'Bell' }, {
      apiKey: 'k', fetchImpl: async () => new Response('', { status: 503 }),
    });
    expect(down.status).toBe('search-failed');
    expect(down.status).not.toBe('not-configured');
  });

  it('keeps a query that worked when another one fails', async () => {
    // A rate-limit on the commissioners-court search is not a reason to discard what the clerk's own
    // page said. Each query settles independently.
    let call = 0;
    const run = await runPortalWatch({ county: 'Bell' }, {
      apiKey: 'k',
      currentYear: 2026,
      fetchImpl: async () => {
        call++;
        if (call === 1) return new Response('', { status: 500 });
        return new Response(JSON.stringify({
          results: [{
            url: 'https://www.bellcountytx.gov/clerk/notice',
            title: 'Bell County Clerk — Records System Transition',
            content: 'Bell County will transition to a new records system effective October 1, 2026.',
            score: 0.9,
          }],
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      },
    });

    expect(run.status).toBe('searched');
    expect(run.report?.actionable).toBe(true);
    expect(run.steps.some((s) => s.includes('search-failed'))).toBe(true);
  });

  it('logs a line per query either way, so a silent run is still auditable', async () => {
    const run = await runPortalWatch({ county: 'Bell', currentVendor: 'Kofile' }, {
      apiKey: 'k', fetchImpl: tavily([]),
    });
    expect(run.steps).toHaveLength(4);
    for (const s of run.steps) expect(s).toMatch(/^\[portal-watch\]/);
  });
});

// ── Wiring ──────────────────────────────────────────────────────────────────────────────────────
//
// `lib/research/prioritized-pipeline.ts` in this same directory is 764 lines with zero callers, and
// nobody can now tell whether it ever ran. A module is not shipped because it exists.

describe('the portal watch is reachable from the product', () => {
  const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8');
  const route = read('app/api/admin/research/portal-watch/route.ts');
  const panel = read('app/admin/research/_tabs/PortalWatchPanel.tsx');
  const tab = read('app/admin/research/_tabs/SelfHealTab.tsx');

  it('a route runs it, admin-gated and read-only', () => {
    expect(route).toContain("from '@/lib/research/portal-watch'");
    expect(route).toContain('runPortalWatch(');
    expect(route).toContain('isAdmin(session.user.roles)');
    expect(route).not.toContain('export const POST');
  });

  it('a panel calls the route, and the self-heal tab mounts the panel', () => {
    expect(panel).toContain('/api/admin/research/portal-watch');
    expect(tab).toContain("import PortalWatchPanel from './PortalWatchPanel'");
    expect(tab).toContain('<PortalWatchPanel />');
  });

  it('the panel branches on status and shows what it rejected', () => {
    // Both halves of the same principle: an empty list means different things depending on why, and
    // a panel showing only hits is indistinguishable from a panel whose search is broken.
    expect(panel).toContain('STATUS_COPY');
    expect(panel).toMatch(/counts\.noise/);
    expect(panel).toMatch(/checked and rejected/);
  });
});

describe('the Tavily primitive is shared, not copied', () => {
  it('open-web calls tavilySearch rather than carrying its own fetch', () => {
    // Two copies of this request would grow two relevance floors, two content trims and two ideas of
    // what a failure is, and would drift within a month.
    const openWeb = readFileSync(join(process.cwd(), 'lib/research/open-web.ts'), 'utf8');
    const core = readFileSync(join(process.cwd(), 'lib/research/announcement-watch.ts'), 'utf8');
    const watch = readFileSync(join(process.cwd(), 'lib/research/portal-watch.ts'), 'utf8');

    expect(openWeb).toContain('export async function tavilySearch');
    // The core owns the call now; the watches are profiles over it and must not reach past it.
    expect(core).toContain('tavilySearch');
    expect(watch).not.toContain('api.tavily.com');
    // Exactly one place builds the Tavily request.
    expect(openWeb.match(/api\.tavily\.com/g) ?? []).toHaveLength(1);
    expect(watch).not.toContain('api.tavily.com');
  });
});

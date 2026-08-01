// __tests__/search/search-page.test.tsx — render the search UI (§3b/8e).
//
// The backend was finished and unreachable for exactly as long as it took to write this page, which is
// the condition audit §1.4 named as this repo's signature defect. Source-text assertions would not
// have caught it, and would not catch the next version of it either: a page that renders an empty
// shell type-checks, lints, and passes every string match.
//
// Rendered with react-dom/server, like the rest of the suite (no @testing-library dep).
import { describe, expect, it, vi } from 'vitest';
import React from 'react';
import * as ReactDOMServer from 'react-dom/server';
import { ADMIN_ROUTES } from '@/lib/admin/route-registry';

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams('q=waggoner'),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/admin/search',
}));

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) =>
    React.createElement('a', { href, ...rest }, children),
}));

// The page fetches on a debounce; SSR never reaches it, which is the point — first paint must be
// useful before any data arrives.
vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));

import SearchPage from '@/app/admin/search/page';

const html = () => ReactDOMServer.renderToStaticMarkup(React.createElement(SearchPage));

describe('first paint is useful before any results arrive', () => {
  const out = html();

  it('renders a search box, not an empty shell', () => {
    expect(out).toContain('aria-label="Search everything"');
    expect(out).toMatch(/placeholder="[^"]+"/);
  });

  it('seeds the box from the URL, so a shared link reproduces the search', () => {
    expect(out).toContain('value="waggoner"');
  });

  it('offers the date-role choice up front', () => {
    // Which date is being filtered is not a detail: a deed RECORDED in 1974 was uploaded last week,
    // and filtering the wrong one returns an empty list that reads as an empty archive.
    expect(out).toContain('aria-label="Which date to filter on"');
    expect(out).toContain('Date it happened');
    expect(out).toContain('Date added');
  });

  it('offers a date range', () => {
    expect(out).toContain('aria-label="From date"');
    expect(out).toContain('aria-label="To date"');
  });

  it('tells the user spelling need not be exact, because that is the feature', () => {
    expect(out.toLowerCase()).toMatch(/spelling/);
  });
});

describe('it is reachable — the whole reason the page exists', () => {
  it('is registered, and on the rail rather than palette-only', () => {
    const route = ADMIN_ROUTES.find((r) => r.href === '/admin/search');
    expect(route, '/admin/search must be registered or it is another orphan').toBeDefined();
    expect(route!.showInRail, 'search must be findable without already knowing it exists').not.toBe(false);
    expect(route!.description?.trim()).toBeTruthy();
  });

  it('carries the keywords somebody would actually type into the palette', () => {
    const route = ADMIN_ROUTES.find((r) => r.href === '/admin/search')!;
    for (const k of ['find', 'documents', 'deed', 'customer']) {
      expect(route.keywords, `⌘K should match "${k}"`).toContain(k);
    }
  });
});

describe('honesty rules the page must not lose', () => {
  const src = (require('node:fs') as typeof import('node:fs'))
    .readFileSync(require('node:path').join(process.cwd(), 'app/admin/search/page.tsx'), 'utf8');

  it('renders a failed request as a failure, never as "no results"', () => {
    // §1.1b: three research routes swallowed their errors and reported nothing found, for years. In a
    // search box that conflation is invisible — an empty list is the expected shape of the answer.
    expect(src).toMatch(/data-testid="search-error"/);
    expect(src).toMatch(/not an empty archive/i);
  });

  it('shows what the API ignored or corrected', () => {
    // A silently narrowed search is a quietly wrong answer: a dropped bad date or an inaccessible
    // corpus changes the result set without changing anything the user can see.
    expect(src).toMatch(/data-testid="search-notes"/);
  });

  it('renders a hit with no viewer page as text, not as a dead link', () => {
    // `customers` has no /admin/customers page anywhere in the app. A link would be a 404 dressed as a
    // feature, and a 404 reads as data loss.
    expect(src).toMatch(/if \(!hit\.href\)/);
    expect(src).toMatch(/data-linkless="true"/);
  });

  it('guards against an out-of-order response overwriting a newer one', () => {
    // The classic search-box bug: a slow query for "wag" lands after "waggoner" and silently replaces
    // the right answer with a worse one. Nobody reports it, because it looks like bad ranking.
    expect(src).toMatch(/seq\.current/);
  });

  it('debounces, so typing does not fire a query per keystroke across ten tables', () => {
    expect(src).toMatch(/setTimeout\(run/);
  });
});

// ── §8d: how a result was found is part of the result ────────────────────────────────────────────
//
// A document that matches nothing in the query is a surprising result, and a surprising result with
// no explanation reads as a bug in the search. These render the component rather than reading its
// source, because the failure being guarded against is "renders nothing", which source text cannot
// see.
import { Result } from '@/app/admin/search/page';

const hit = (over: Record<string, unknown> = {}) => ({
  corpus: 'research-documents', corpusLabel: 'Research documents', kind: 'document' as const,
  id: 'd1', title: 'DEED — WHITTENBURG', snippet: 'a strip of land forty (40) feet in width',
  type: 'deed', createdAt: '2026-01-02T00:00:00Z', effectiveAt: null, score: 0.9,
  href: '/admin/research/p7', ...over,
});

const renderHit = (h: ReturnType<typeof hit>) =>
  ReactDOMServer.renderToStaticMarkup(React.createElement(Result, { hit: h as never }));

describe('a semantic-only hit explains itself', () => {
  it('badges a document found by meaning alone', () => {
    const out = renderHit(hit({ semanticOnly: true, passage: 'forty feet along the North boundary' }));
    expect(out).toContain('found by meaning');
    expect(out).toContain('data-testid="hit-semantic-only"');
  });

  it('badges corroboration differently from discovery', () => {
    // "Also matched by meaning" and "only found by meaning" are different facts. Collapsing them
    // would tell the user a result they typed the words for was conjured by the AI.
    const out = renderHit(hit({ alsoFound: true, passage: 'x' }));
    expect(out).toContain('also by meaning');
    expect(out).not.toContain('found by meaning"'); // not the semantic-only testid
  });

  it('shows no badge at all for an ordinary keyword hit', () => {
    const out = renderHit(hit());
    expect(out).not.toContain('by meaning');
    expect(out).toContain('DEED — WHITTENBURG');
  });

  it('still refuses to render a link when the corpus has no viewer page', () => {
    // §8e's rule survives §8d: a semantic hit in a corpus with no page is still not a link.
    const out = renderHit(hit({ href: null, semanticOnly: true }));
    expect(out).toContain('data-linkless="true"');
    expect(out).not.toContain('<a ');
  });
});

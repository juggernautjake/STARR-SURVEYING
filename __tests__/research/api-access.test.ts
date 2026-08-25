// __tests__/research/api-access.test.ts — the research read boundary (C11b-0).
//
// The finding this file exists for, measured against a running server on 2026-08-25 with a plain
// `employee` token carrying no research role of any kind:
//
//     GET /api/admin/research/coverage   200
//     GET /api/admin/research/library    200
//     GET /api/admin/research/pipeline   200
//     GET /api/admin/research/billing    200
//     GET /api/admin/research/sites      200
//     GET /api/admin/research/self-heal/proposals   403   ← the only one that refused
//
// Five of six answered anybody signed in. Not carelessness: `middleware.ts`'s `ROUTE_ROLES` only
// ever ran on PAGE paths, `/api/admin/*` goes through the bundle gate alone, and four of these are
// deliberately bundle-exempt operator tools. The visible gate on `/admin/research` was in front of
// the screen, never in front of the data.
//
// Two things are pinned here. The role list must keep matching `middleware.ts` — that mirror has
// broken seven times in seven slices of this plan, and the only version that has ever held is one a
// test compares against the source. And each route must keep its guard, because a 403 that is one
// deleted line away from a 200 needs something that notices.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { canReadResearch, RESEARCH_READ_ROLES } from '@/lib/research/access';

const repoRoot = path.join(__dirname, '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

/** Source with comments stripped, so no assertion can pass by matching a sentence I wrote.
 *
 *  LINE comments go FIRST, and that ordering is the whole point. Strip block comments first and a
 *  `//` line containing an api path with a star in it — which the guard comment added by this very
 *  slice does — opens a block comment that runs to the next close-marker sixty lines later, taking
 *  the code under test with it. That is exactly how this helper first reported a missing guard that
 *  was sitting right there. The CRLF split matters for the same reason: `$` under /m stops before a
 *  `\r`, so a naive line-comment strip leaves a carriage return per line and nothing else. */
const code = (rel: string) =>
  read(rel)
    .split('\r\n').join('\n')
    .replace(/^[ \t]*\/\/[^\n]*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');

const GUARDED = [
  'app/api/admin/research/coverage/route.ts',
  'app/api/admin/research/library/route.ts',
  'app/api/admin/research/pipeline/route.ts',
  'app/api/admin/research/billing/route.ts',
  'app/api/admin/research/sites/route.ts',
];

describe('canReadResearch (pure)', () => {
  it('admits every role middleware lets through the /admin/research pages', () => {
    for (const r of ['admin', 'developer', 'researcher', 'drawer', 'field_crew', 'tech_support']) {
      expect(canReadResearch([r]), `${r} should be able to read research`).toBe(true);
    }
  });

  it('refuses an account with no research role — the hole this closed', () => {
    expect(canReadResearch(['employee'])).toBe(false);
    expect(canReadResearch(['student'])).toBe(false);
    expect(canReadResearch(['teacher'])).toBe(false);
    expect(canReadResearch(['guest'])).toBe(false);
    // A plain employee is what actually got 200 from five endpoints.
    expect(canReadResearch(['employee', 'student'])).toBe(false);
  });

  it('refuses missing / malformed role sets rather than defaulting open', () => {
    expect(canReadResearch(null)).toBe(false);
    expect(canReadResearch(undefined)).toBe(false);
    expect(canReadResearch([])).toBe(false);
    expect(canReadResearch('admin' as unknown as string[])).toBe(false);
  });

  it('one research role is enough even beside roles that are not', () => {
    expect(canReadResearch(['employee', 'field_crew'])).toBe(true);
  });
});

describe('the list still mirrors middleware', () => {
  it("matches the /admin/research entry in middleware.ts, spelled out", () => {
    const mw = code('middleware.ts');
    // The literal entry, not a paraphrase of it. If somebody edits middleware's list, this fails
    // here rather than silently leaving the API wider or narrower than the page.
    const m = mw.match(/\{\s*prefix:\s*'\/admin\/research',\s*roles:\s*\[([^\]]*)\]\s*\}/);
    expect(m, 'no /admin/research entry found in middleware.ts').toBeTruthy();
    const inMiddleware = m![1].split(',').map((s) => s.trim().replace(/^'|'$/g, '')).filter(Boolean);
    expect([...RESEARCH_READ_ROLES].sort()).toEqual([...inMiddleware].sort());
  });

  it('is derived from RESEARCH_ROLES rather than retyped', () => {
    expect(code('lib/research/access.ts')).toMatch(/\.\.\.RESEARCH_ROLES/);
  });
});

describe('every research read route keeps its guard', () => {
  for (const f of GUARDED) {
    it(`${f.replace('app/api/admin/research/', '').replace('/route.ts', '')} calls canReadResearch and answers 403`, () => {
      const src = code(f);
      expect(src).toMatch(/canReadResearch\(session\.user\.roles\)/);
      expect(src).toMatch(/status: 403/);
      expect(src).toMatch(/from '@\/lib\/research\/access'/);
    });
  }

  it('sites POST still refuses non-admins on its own terms', () => {
    // The read side is what had nothing. The write side already refused, and this slice did not
    // loosen it — worth pinning, because "we added a check here" is exactly when a stricter one
    // elsewhere gets replaced by the new looser one.
    const src = code('app/api/admin/research/sites/route.ts');
    expect(src).toMatch(/!isAdmin\(roles\) && !isDeveloper\(roles\)/);
  });
});

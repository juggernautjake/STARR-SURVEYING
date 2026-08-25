// __tests__/admin/compliance-access.test.ts — the compliance read boundary (C13a).
//
// `GET /api/admin/compliance` answered ANY signed-in account until 2026-08-25 — the whole register:
// the firm's licences, its insurance, and every instrument's calibration record. Every write on the
// same route already called `isAdmin`; only the read had nothing.
//
// The cause is the one C11b-0 found in the research routes and is worth stating again because it is
// structural rather than careless: `middleware.ts`'s ROUTE_ROLES only ever ran on PAGE paths.
// `/api/admin/*` goes through the bundle gate and nothing else. So the three-role gate everybody
// could see on `/admin/compliance` sat in front of the screen and never in front of the data.
//
// Two things are pinned. The list must keep matching middleware — that mirror has drifted in seven
// of the slices before this one — and the guard must stay, because a 403 that is one deleted line
// away from a 200 needs something that notices.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.join(__dirname, '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

/** Source with comments stripped, so no assertion can pass by matching a sentence I wrote.
 *
 *  Line comments FIRST — see the note on the same helper in `__tests__/research/api-access.test.ts`
 *  for the two ways the naive version of this lies. */
const code = (rel: string) =>
  read(rel)
    .split('\r\n').join('\n')
    .replace(/^[ \t]*\/\/[^\n]*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');

describe('the compliance register is not readable by anyone signed in', () => {
  const route = code('app/api/admin/compliance/route.ts');

  it('GET refuses a caller outside the page gate', () => {
    expect(route).toMatch(/COMPLIANCE_READ_ROLES\.some/);
    expect(route).toMatch(/status: 403/);
  });

  it('the writes keep their own, stricter check', () => {
    // This slice added the read side. It must not have relaxed the write side on the way past —
    // "we added a check here" is exactly when a stricter one elsewhere gets replaced by the new one.
    const isAdminGuards = (route.match(/!isAdmin\(session\.user\.roles\)/g) ?? []).length;
    expect(isAdminGuards, 'POST/PUT/DELETE must still each call isAdmin').toBeGreaterThanOrEqual(3);
  });

  it('the list still mirrors middleware, spelled out', () => {
    const mw = code('middleware.ts');
    const m = mw.match(/\{\s*prefix:\s*'\/admin\/compliance',\s*roles:\s*\[([^\]]*)\]\s*\}/);
    expect(m, 'no /admin/compliance entry found in middleware.ts').toBeTruthy();
    const inMiddleware = m![1].split(',').map((s) => s.trim().replace(/^'|'$/g, '')).filter(Boolean);

    const r = route.match(/const COMPLIANCE_READ_ROLES: UserRole\[\] = \[([^\]]*)\]/);
    expect(r, 'COMPLIANCE_READ_ROLES not found').toBeTruthy();
    const inRoute = r![1].split(',').map((s) => s.trim().replace(/^'|'$/g, '')).filter(Boolean);

    expect([...inRoute].sort()).toEqual([...inMiddleware].sort());
  });
});

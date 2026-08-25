// __tests__/admin/notes-access.test.ts — the company-notes boundary (C13c).
//
// Until 2026-08-25 every method on `/api/admin/notes` checked only that the caller was signed in.
// Not just the read — POST, PATCH and DELETE too, so any account with a session could create, edit
// and DELETE the firm's notes.
//
// This is the third endpoint of the shape in this plan, after research (C11b-0) and compliance
// (C13a), and the first where the WRITES were open as well. The cause is the same and structural:
// `middleware.ts`'s ROUTE_ROLES has only ever run on PAGE paths, so the three-role gate everybody
// could see on `/admin/notes` sat in front of the screen and never in front of the data.
//
// Two things are pinned. Every method keeps a guard, because a 403 one deleted line away from a 200
// needs something that notices. And the list keeps matching middleware — that mirror has drifted in
// nine of the slices before this one.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.join(__dirname, '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

/** Source with comments stripped. Line comments FIRST — see the note on the same helper in
 *  `__tests__/research/api-access.test.ts` for the two ways the naive version of this lies. */
const code = (rel: string) =>
  read(rel)
    .split('\r\n').join('\n')
    .replace(/^[ \t]*\/\/[^\n]*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');

describe('company notes are not open to anyone with a session', () => {
  const route = code('app/api/admin/notes/route.ts');

  it('guards every method, not just the read', () => {
    // GET, POST, PATCH, DELETE. The write side is the half that made this worse than the other two:
    // deleting somebody else's company note needed nothing but an account.
    const methods = (route.match(/export const (GET|POST|PATCH|DELETE) =/g) ?? []).length;
    const guards = (route.match(/NOTES_ROLES\.some/g) ?? []).length;
    expect(methods, 'expected four exported methods on this route').toBe(4);
    expect(guards, 'every method must carry the role guard').toBe(methods);
  });

  it('answers 403 rather than quietly returning an empty list', () => {
    expect(route).toMatch(/status: 403/);
  });

  it('the list still mirrors middleware, spelled out', () => {
    const mw = code('middleware.ts');
    const m = mw.match(/\{\s*prefix:\s*'\/admin\/notes',\s*roles:\s*\[([^\]]*)\]\s*\}/);
    expect(m, 'no /admin/notes entry found in middleware.ts').toBeTruthy();
    const inMiddleware = m![1].split(',').map((s) => s.trim().replace(/^'|'$/g, '')).filter(Boolean);

    const r = route.match(/const NOTES_ROLES: UserRole\[\] = \[([^\]]*)\]/);
    expect(r, 'NOTES_ROLES not found').toBeTruthy();
    const inRoute = r![1].split(',').map((s) => s.trim().replace(/^'|'$/g, '')).filter(Boolean);

    expect([...inRoute].sort()).toEqual([...inMiddleware].sort());
  });
});

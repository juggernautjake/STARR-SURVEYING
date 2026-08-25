// __tests__/design/composition-scope.test.ts
//
// W1 of docs/planning/in-progress/DESIGN_STUDIO_SERVES_PAGES_2026-08-24.md — the §8 decision, in code.
//
// Owner: *"The payment portal would look different depending on which role the user has… I want it
// so that we can have full control in the settings as to what all pages are visible and what pages
// are not… I want it so that pages load elements dynamically based on the role of the user."*
//
// ── WHAT GOES WRONG HERE, IF IT GOES WRONG ──────────────────────────────────────────────────────
//
// Not an exception. The failure mode of a precedence cascade is that the WRONG LAYER WINS, quietly,
// for one group of people, with everything looking saved. Somebody rearranges the receipts portal,
// saves, and has changed it only for themselves — or only for admins — and finds out weeks later
// when a colleague mentions the page looks different.
//
// So every rule below is pinned to a specific pair of viewers rather than described. The cases that
// matter are the ones where two rows both apply.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  resolveComposition, roleRank, scopeLabel, scopeMeaning, ROLE_PRECEDENCE,
  type CompositionRow, type Viewer,
} from '@/lib/design/composition';
import { ALL_ROLES } from '@/lib/auth-roles';

const ROUTE = '/admin/receipts';

const row = (over: Partial<CompositionRow> & { id: string }): CompositionRow => ({
  route: ROUTE, stateKey: '', kind: 'composition', scope: 'firm', scopeKey: '', ...over,
});

const viewer = (email: string | null, roles: string[]): Viewer => ({ email, roles });

// ── THE CASCADE ─────────────────────────────────────────────────────────────────────────────────

describe('most specific wins', () => {
  const FIRM = row({ id: 'firm' });
  const ROLE = row({ id: 'role', scope: 'role', scopeKey: 'employee' });
  const USER = row({ id: 'user', scope: 'user', scopeKey: 'jacob@starr.com' });

  it('a user composition beats their role and the firm', () => {
    const got = resolveComposition([FIRM, ROLE, USER], viewer('jacob@starr.com', ['employee']), ROUTE);
    expect(got?.id).toBe('user');
  });

  it('a role composition beats the firm', () => {
    const got = resolveComposition([FIRM, ROLE, USER], viewer('someone@starr.com', ['employee']), ROUTE);
    expect(got?.id).toBe('role');
  });

  it('and the firm catches everyone else', () => {
    const got = resolveComposition([FIRM, ROLE, USER], viewer('guest@starr.com', ['guest']), ROUTE);
    expect(got?.id).toBe('firm');
  });

  it('order in the array changes nothing', () => {
    // The rows arrive from a database in whatever order it likes. A resolver that depended on that
    // would produce a different page on different days and be nearly impossible to reproduce.
    const shuffled = [USER, FIRM, ROLE];
    expect(resolveComposition(shuffled, viewer('jacob@starr.com', ['employee']), ROUTE)?.id).toBe('user');
  });

  it('null is a real answer, not a failure', () => {
    // "No composition" means the portal renders as it was hand-built, which is a working page. If
    // this threw or invented something, a route with no composition — which is all of them today —
    // would be broken rather than normal.
    expect(resolveComposition([], viewer('a@b.c', ['admin']), ROUTE)).toBeNull();
  });
});

describe('a composition applies to one route in one state', () => {
  it('another route\'s composition is not borrowed', () => {
    const other = row({ id: 'other', route: '/admin/payments' });
    expect(resolveComposition([other], viewer('a@b.c', ['admin']), ROUTE)).toBeNull();
  });

  it('and a tab\'s composition is not the route\'s', () => {
    // The same rule V1–V6 spent six slices establishing for traces. A composition of the invoices
    // tab served as the whole billing page is the identical conflation.
    const tab = row({ id: 'tab', stateKey: 'invoices' });
    expect(resolveComposition([tab], viewer('a@b.c', ['admin']), ROUTE)).toBeNull();
    expect(resolveComposition([tab], viewer('a@b.c', ['admin']), ROUTE, 'invoices')?.id).toBe('tab');
  });

  it('a trace is never served as a composition', () => {
    // Every one of the ~470 existing rows is a trace. If `kind` were ignored, turning this on would
    // serve a drawing of rectangles in place of every portal in the product.
    const trace = row({ id: 'trace', kind: 'trace' });
    expect(resolveComposition([trace], viewer('a@b.c', ['admin']), ROUTE)).toBeNull();
  });
});

// ── THE TIE-BREAKS, WHICH ARE THE PART THAT ACTUALLY BITES ──────────────────────────────────────

describe('a viewer with several roles', () => {
  it('sees the more authoritative one', () => {
    // The normal case in this app, not the edge one — an admin is usually also an employee. Without
    // an order, the person with the most authority could be served the most restricted layout.
    const rows = [
      row({ id: 'emp', scope: 'role', scopeKey: 'employee' }),
      row({ id: 'adm', scope: 'role', scopeKey: 'admin' }),
    ];
    expect(resolveComposition(rows, viewer('a@b.c', ['employee', 'admin']), ROUTE)?.id).toBe('adm');
    // And the answer does not depend on the order the roles are listed in.
    expect(resolveComposition(rows, viewer('a@b.c', ['admin', 'employee']), ROUTE)?.id).toBe('adm');
  });

  it('even the most junior role still beats the firm', () => {
    const rows = [row({ id: 'firm' }), row({ id: 'guest', scope: 'role', scopeKey: 'guest' })];
    expect(resolveComposition(rows, viewer('a@b.c', ['guest']), ROUTE)?.id).toBe('guest');
  });
});

describe('two rows for the same audience', () => {
  it('the newest wins', () => {
    // Seed 618 does not forbid this — a firm can have a draft composition beside a published one.
    const rows = [
      row({ id: 'old', updatedAt: '2026-08-01T00:00:00Z' }),
      row({ id: 'new', updatedAt: '2026-08-20T00:00:00Z' }),
    ];
    expect(resolveComposition(rows, viewer('a@b.c', ['admin']), ROUTE)?.id).toBe('new');
  });

  it('and with no timestamps at all the answer is still the same every time', () => {
    // Two undated rows must not resolve differently on two calls. `id` is the last resort precisely
    // because it is arbitrary AND stable — an arbitrary-and-unstable answer is the bug.
    const rows = [row({ id: 'aaa' }), row({ id: 'zzz' })];
    const first = resolveComposition(rows, viewer('a@b.c', ['admin']), ROUTE)?.id;
    const second = resolveComposition([...rows].reverse(), viewer('a@b.c', ['admin']), ROUTE)?.id;
    expect(first).toBe(second);
  });
});

describe('matching is case-insensitive where the thing it matches is', () => {
  it('an email saved with capitals still finds its owner', () => {
    // A composition saved for `Jacob@…` that does not apply to `jacob@…` looks exactly like a
    // composition that was discarded on save.
    const rows = [row({ id: 'u', scope: 'user', scopeKey: 'Jacob@Starr.com' })];
    expect(resolveComposition(rows, viewer('jacob@starr.com', []), ROUTE)?.id).toBe('u');
  });

  it('and a viewer with no email matches no user composition', () => {
    const rows = [row({ id: 'u', scope: 'user', scopeKey: 'jacob@starr.com' })];
    expect(resolveComposition(rows, viewer(null, ['admin']), ROUTE)).toBeNull();
  });
});

// ── THE ROLE ORDER ITSELF ───────────────────────────────────────────────────────────────────────

describe('the role hierarchy is this app\'s, not an invented one', () => {
  it('covers every role that actually exists', () => {
    // ── THE MISTAKE THIS CAUGHT ────────────────────────────────────────────────────────────────
    //
    // The first draft of the order said `owner`, `manager`, `marketing`. NONE of those roles exists
    // — the vocabulary is `ALL_ROLES` and it has twelve entries, none of them those. So the
    // hierarchy would have been an opinion about an imaginary org chart, every real role would have
    // tied at "unranked", and a viewer with two roles would have got whichever the database
    // returned first. Written in units nobody produces.
    //
    // This assertion is also what makes ADDING a role safe: a thirteenth role fails here until
    // somebody decides where it sits, rather than silently ranking last.
    expect([...ROLE_PRECEDENCE].sort()).toEqual([...ALL_ROLES].sort());
  });

  it('ranks the authoritative roles above the operational ones', () => {
    expect(roleRank('developer')).toBeLessThan(roleRank('admin'));
    expect(roleRank('admin')).toBeLessThan(roleRank('employee'));
    expect(roleRank('finance')).toBeLessThan(roleRank('employee'));
    expect(roleRank('employee')).toBeLessThan(roleRank('guest'));
  });

  it('and a role it has never heard of ranks last instead of throwing', () => {
    // A new role should degrade to "less specific than the ones we know about", not break every
    // portal in the product until this file is edited.
    expect(roleRank('archaeologist')).toBe(ROLE_PRECEDENCE.length);
    expect(roleRank('ADMIN')).toBe(roleRank('admin'));
  });
});

// ── SAYING WHICH SCOPE IS BEING EDITED ──────────────────────────────────────────────────────────

describe('the editor can say who a change is for, in words', () => {
  it('names the audience plainly', () => {
    expect(scopeLabel('firm', '')).toBe('Everyone at this company');
    expect(scopeLabel('role', 'employee')).toBe('Anyone whose role is employee');
    expect(scopeLabel('user', 'a@b.c')).toBe('Only a@b.c');
  });

  it('and warns about the case that actually catches people out', () => {
    // Someone editing a ROLE composition needs to know a colleague with a more senior role will not
    // see it. That is the sentence that prevents "I fixed it and it did not change for anyone".
    expect(scopeMeaning('role', 'employee')).toMatch(/more senior role sees that one instead/);
    expect(scopeMeaning('user', 'a@b.c')).toMatch(/and nobody else/);
    expect(scopeMeaning('firm', '')).toMatch(/every person who does not have a version of their own/);
  });
});

// ── THE SCHEMA ──────────────────────────────────────────────────────────────────────────────────

describe('seed 618', () => {
  const SEED = fs.readFileSync(
    path.join(__dirname, '..', '..', 'seeds/618_design_composition_scope.sql'), 'utf8',
  );

  it('defaults every existing row to a firm-scoped trace', () => {
    // ~470 rows exist and every one of them is a drawing. A default of `composition` would offer
    // all of them to be served.
    expect(SEED).toMatch(/kind TEXT NOT NULL DEFAULT 'trace'/);
    expect(SEED).toMatch(/scope TEXT NOT NULL DEFAULT 'firm'/);
    expect(SEED).toMatch(/scope_key TEXT NOT NULL DEFAULT ''/);
  });

  it('refuses a role or user scope with no key', () => {
    // `scope = 'role'` with an empty key is a composition for a role called nothing. It resolves
    // for nobody and looks precisely like a composition that was never saved.
    expect(SEED).toMatch(/scope = 'firm' AND scope_key = ''\) OR \(scope <> 'firm' AND scope_key <> ''/);
  });

  it('does not widen the one-default-per-state rule to the scope', () => {
    // The load-bearing decision in that seed. `default` means "a trace of what is actually served",
    // and there is one of those per state however many audiences the page has. A per-scope default
    // would let a route hold three rows each claiming to be the record — the same as holding none.
    expect(SEED).toMatch(/one-default-per-state and one-active-per-state indexes from seed 617 stay/);
    expect(SEED).not.toMatch(/CREATE UNIQUE INDEX[\s\S]{0,200}scope/);
  });
});

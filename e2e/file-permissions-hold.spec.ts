// e2e/file-permissions-hold.spec.ts — F7. Do the three sharing scopes actually hold?
//
// Owner: *"Some folders and files and stuff will just be for personal use for each user, and some
// will be company wide, and some will just be for specific roles."*
//
// ── WHY THIS IS AN E2E AND NOT A UNIT TEST ──────────────────────────────────────────────────────
//
// `describeAudience` and `resolveAccess` are already unit-tested, and they are pure — they answer
// correctly about grants handed to them. What they cannot tell you is whether the DATABASE, the API
// and the session all agree: whether a grant written through `PUT /permissions` is the grant
// `listChildren` reads back, and whether a real signed-in account with real roles sees what the
// model says it should.
//
// Permissions are the one part of this system where a bug is **silent and expensive**. Nothing
// throws. Nobody notices. Somebody's private folder is simply readable, and the first sign is the
// day it matters.
//
// ── IT WRITES TO THE REAL DATABASE, AND CLEANS UP ───────────────────────────────────────────────
//
// There is no staging database, so this creates ONE folder under Shared with a unique name and
// deletes it in `finally` — including if an assertion fails. It never touches an existing node, and
// it never uploads a file: a folder is enough to prove the grant logic, and a stray empty folder is
// a far cheaper failure than a stray document.
//
// Run: E2E_BASE_URL=http://localhost:3050 npx playwright test e2e/file-permissions-hold.spec.ts

import { test, expect, type Browser, type BrowserContext } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { encode } from '@auth/core/jwt';

const BASE = process.env.E2E_BASE_URL || 'http://localhost:3050';

/** A real admin. The jwt callback re-resolves roles from `registered_users`, so these must be real
 *  accounts — a made-up address silently lands as `employee`. */
const ADMIN = 'jacobmaddux@starr-surveying.com';
/** Two accounts holding ONLY `employee`. Non-admin is essential: an admin resolves to `manage` on
 *  every node, so it can never demonstrate that something is hidden. */
const EMPLOYEE_A = 'jackcabaniss@starr-surveying.com';
const EMPLOYEE_B = 'jacobmaddux96@gmail.com';

function secret(): string {
  const env = fs.readFileSync(path.join(process.cwd(), '.env.local'), 'utf8');
  return env.match(/^AUTH_SECRET\s*=\s*(.+)$/m)![1].replace(/^["']|["']$/g, '').trim();
}

async function contextFor(browser: Browser, email: string): Promise<BrowserContext> {
  const ctx = await browser.newContext();
  const token = await encode({
    token: { email, name: 'E2E', sub: 'e2e' },
    secret: secret(),
    salt: 'authjs.session-token',
    maxAge: 3600,
  });
  await ctx.addCookies([{
    name: 'authjs.session-token', value: token,
    domain: new URL(BASE).hostname, path: '/', httpOnly: true, sameSite: 'Lax',
  }]);
  return ctx;
}

interface ApiResult {
  status: number;
  // Deliberately loose: these routes return several different shapes and this file only reads a
  // handful of fields from each. Typing them all would be more ceremony than the assertions need.
  body: { nodes?: Array<{ id: string; name: string }>; node?: { id: string }; id?: string; error?: string };
}

/** Fetch inside a page so the session cookie is applied exactly as the browser would. */
async function api(ctx: BrowserContext, url: string, init?: RequestInit): Promise<ApiResult> {
  const page = await ctx.newPage();
  await page.goto(`${BASE}/admin/files`, { waitUntil: 'domcontentloaded' });
  const payload = init
    ? { ...init, headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) } }
    : undefined;
  const out = await page.evaluate(
    async (args: { u: string; i?: RequestInit }) => {
      const r = await fetch(args.u, args.i);
      const text = await r.text();
      try { return { status: r.status, body: JSON.parse(text) }; }
      catch { return { status: r.status, body: { error: text } }; }
    },
    { u: url, i: payload },
  );
  await page.close();
  return out as ApiResult;
}

const canSee = (listing: ApiResult, id: string) =>
  (listing.body.nodes ?? []).some((n) => n.id === id);

test('a folder is visible to exactly the people it is shared with', async ({ browser }) => {
  const adminCtx = await contextFor(browser, ADMIN);
  const aCtx = await contextFor(browser, EMPLOYEE_A);
  const bCtx = await contextFor(browser, EMPLOYEE_B);

  // A unique name so a previous failed run can never be mistaken for this one.
  const name = `__f7-perm-check-${Date.now()}`;
  let folderId: string | null = null;

  try {
    // Find the seeded "Shared" root to create under.
    const roots = await api(adminCtx, '/api/admin/files');
    const shared = (roots.body.nodes ?? []).find((n) => n.name === 'Shared');
    expect(shared, 'the seeded Shared root must exist').toBeTruthy();
    // Narrowed after the assertion so every later use is a plain id rather than an optional chain.
    const sharedId = shared!.id;

    const created = await api(adminCtx, '/api/admin/files', {
      method: 'POST',
      body: JSON.stringify({ name, node_type: 'folder', parent_id: sharedId }),
    });
    expect(created.status, JSON.stringify(created.body)).toBeLessThan(300);
    folderId = created.body.node?.id ?? created.body.id ?? null;
    expect(folderId, 'the API must return the new folder id').toBeTruthy();

    // ── 1. Shared with ONE PERSON ─────────────────────────────────────────────────────────────
    const put1 = await api(adminCtx, `/api/admin/files/${folderId}/permissions`, {
      method: 'PUT',
      body: JSON.stringify({
        permission_mode: 'custom',
        grants: [{ grantee_type: 'user', grantee_value: EMPLOYEE_A, access_level: 'view' }],
      }),
    });
    expect(put1.status, JSON.stringify(put1.body)).toBeLessThan(300);

    const seenByA = await api(aCtx, `/api/admin/files?parent=${sharedId}`);
    const seenByB = await api(bCtx, `/api/admin/files?parent=${sharedId}`);

    expect(canSee(seenByA, folderId!), `${EMPLOYEE_A} was granted view and must see it`).toBe(true);
    // THE ASSERTION THIS FILE EXISTS FOR. A silent permission bug looks exactly like this passing
    // for the wrong reason, so it is stated as its own expectation with its own message.
    expect(canSee(seenByB, folderId!), `${EMPLOYEE_B} was granted nothing and must NOT see it`).toBe(false);

    // ── 2. Shared with EVERYONE ───────────────────────────────────────────────────────────────
    const put2 = await api(adminCtx, `/api/admin/files/${folderId}/permissions`, {
      method: 'PUT',
      body: JSON.stringify({
        permission_mode: 'custom',
        grants: [{ grantee_type: 'everyone', grantee_value: null, access_level: 'view' }],
      }),
    });
    expect(put2.status, JSON.stringify(put2.body)).toBeLessThan(300);

    const nowB = await api(bCtx, `/api/admin/files?parent=${sharedId}`);
    expect(canSee(nowB, folderId!), 'an everyone-grant must reach the account that could not see it a moment ago').toBe(true);

    // ── 3. Shared with NOBODY ─────────────────────────────────────────────────────────────────
    // Removing every grant must take it away again. A model that only ever widens is the one that
    // leaks: it is un-sharing, not sharing, that people rely on.
    const put3 = await api(adminCtx, `/api/admin/files/${folderId}/permissions`, {
      method: 'PUT',
      body: JSON.stringify({ permission_mode: 'custom', grants: [] }),
    });
    expect(put3.status, JSON.stringify(put3.body)).toBeLessThan(300);

    const finalA = await api(aCtx, `/api/admin/files?parent=${sharedId}`);
    const finalB = await api(bCtx, `/api/admin/files?parent=${sharedId}`);
    expect(canSee(finalA, folderId!), 'revoking must actually revoke').toBe(false);
    expect(canSee(finalB, folderId!), 'revoking must actually revoke').toBe(false);

    // And the admin still sees it — admins resolve to `manage` everywhere, which is the documented
    // behaviour and the reason the badge never promises true privacy.
    const finalAdmin = await api(adminCtx, `/api/admin/files?parent=${sharedId}`);
    expect(canSee(finalAdmin, folderId!), 'an admin sees everything, by design').toBe(true);
  } finally {
    // Runs even when an assertion above fails. Writing to a live database without this would leave
    // debris behind on exactly the runs that go wrong.
    if (folderId) {
      await api(adminCtx, `/api/admin/files/${folderId}`, { method: 'DELETE' }).catch(() => null);
    }
    await Promise.all([adminCtx.close(), aCtx.close(), bCtx.close()]);
  }
});

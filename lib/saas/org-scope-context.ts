// lib/saas/org-scope-context.ts — the per-request tenant scope (audit §3c.1 item 8g).
//
// Server-only half of `org-scope.ts`. Holds the AsyncLocalStorage that answers *"which firm is this
// request acting for"*, and installs itself as that module's resolver on import.
//
// ── WHY `enterWith` AND A MUTABLE HOLDER, WHICH LOOKS ODD ───────────────────────────────────────
//
// The obvious shape — `als.run(orgId, () => handler())` — needs something that wraps the whole
// handler. Nothing does: Next.js route handlers are exported functions the framework calls directly,
// and `middleware.ts` runs in a different runtime with a different async context, so a scope opened
// there is gone by the time the handler runs.
//
// The one thing every route DOES do is `await auth()`. But scope cannot simply be set when that
// promise resolves — measured, not assumed:
//
//     function auth() { return getSession().then(s => { als.enterWith(s.org); return s; }) }
//     const s = await auth();  als.getStore()  // → undefined
//
// A continuation after `await` resumes in the context captured when the await *started*, not the one
// the callback ran in. Setting the store inside the `.then` sets it somewhere nothing will look.
//
// So the store is entered SYNCHRONOUSLY, at the moment `auth()` is called — in the handler's own
// execution context, where it does propagate — holding an object that is empty at that instant and
// filled when the session resolves a few microtasks later. The handler awaits the session before it
// queries anything, so by the first `.from()` the holder is populated. Same object, later contents.
//
// ── THE HAZARD THIS HAS, AND WHY IT IS ACCEPTABLE ───────────────────────────────────────────────
//
// `enterWith` mutates the store of the *current* async resource, so a sibling that shares that
// resource can observe it. Measured against the dispatch shape that actually matters — each request
// arriving on its own async resource, which is how an HTTP server invokes a handler — a request that
// never calls `auth()` reads `undefined`, not the previous request's org. Both properties are pinned
// in `__tests__/saas/org-scope.test.ts` against a simulated dispatch, because the day that stops
// being true is the day a webhook writes into the wrong firm's books.

import { AsyncLocalStorage } from 'node:async_hooks';

import { setOrgScopeResolver } from './org-scope';

/** Filled in after the session resolves. One per request. */
interface OrgScopeHolder {
  orgId: string | null;
}

const storage = new AsyncLocalStorage<OrgScopeHolder>();

/** The session shape this needs — structural, so callers do not have to import next-auth types. */
export interface OrgScopeSession {
  user?: {
    isOperator?: boolean;
    activeOrgId?: string | null;
    memberships?: Array<{ orgId: string }>;
  } | null;
}

/** The org a session acts as, or null when it acts as no single firm.
 *
 *  Null for an operator on purpose. The operator console exists to look across firms; giving it a
 *  tenant scope would silently narrow every platform screen to whichever org the operator happens to
 *  also be a member of. */
export function orgIdForSession(session: OrgScopeSession | null | undefined): string | null {
  const user = session?.user;
  if (!user) return null;
  if (user.isOperator) return null;
  if (user.activeOrgId) return user.activeOrgId;
  return user.memberships?.[0]?.orgId ?? null;
}

/** Opens a scope for the current request and returns the holder to fill once the session is known.
 *
 *  Called synchronously by the `auth()` wrapper in `lib/auth.ts` — see the note above for why the
 *  timing is the whole design and not an implementation detail. */
export function beginOrgScope(): OrgScopeHolder {
  const holder: OrgScopeHolder = { orgId: null };
  storage.enterWith(holder);
  return holder;
}

/** Runs `fn` with an explicit tenant scope.
 *
 *  For the code paths that legitimately have no session but do know the firm — a cron acting for one
 *  org, an operator task, a backfill. Without this, such a writer produces rows with a null `org_id`,
 *  which no scoped session can then see. */
export function runWithOrgScope<T>(orgId: string | null, fn: () => T): T {
  return storage.run({ orgId }, fn);
}

/** Runs `fn` with no tenant scope, whatever the ambient one is. The deliberate cross-org escape
 *  hatch for server code that must read across firms. */
export function runUnscoped<T>(fn: () => T): T {
  return storage.run({ orgId: null }, fn);
}

/** The current request's org, or null. */
export function currentRequestOrgId(): string | null {
  return storage.getStore()?.orgId ?? null;
}

setOrgScopeResolver(currentRequestOrgId);

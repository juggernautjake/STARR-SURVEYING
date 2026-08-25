// __tests__/admin/employee-can-reach-their-own-things.test.ts — E1.
//
// Owner, 2026-08-11: *"if a user is registered as an employee role, then they should be able to log
// hours and log receipts and have a lot more functionality control on the backend."*
//
// ── WHY `employee` IS THE ROLE THAT KEEPS GETTING FORGOTTEN ──────────────────────────────────────
//
// It is the DEFAULT — `middleware.ts` falls back to it, and it is the only role most staff hold. But
// it is never the role somebody has in mind while writing a gate: the mental list is "admin,
// developer, field_crew, tech_support", i.e. the named jobs. So `employee` drops out of role arrays
// silently, and the result is that the largest group of users cannot see pages written for them.
//
// This has now happened at least twice, found each time by driving the product rather than by
// review:
//
//   · R1 — `/admin/receipts/new` listed seven roles and omitted `employee`, so the people most
//     likely to be holding a fuel receipt could not file one.
//   · E1 — `WORK_ROLES` is `['admin', 'developer', 'field_crew']`, and **`/admin/my-hours` was
//     gated on it**. The owner's sentence above names logging hours first, and it was hidden from
//     the nav for exactly the accounts he meant.
//
// ── WHAT THIS ASSERTS, AND WHY IT IS TWO ASSERTIONS ─────────────────────────────────────────────
//
// Access is expressed in two places — the registry decides what the nav SHOWS, middleware decides
// what the router ALLOWS — and they disagree silently in both directions:
//
//   · registry stricter than middleware → the page works, nobody can find it (R1, E1);
//   · middleware stricter than registry → the menu offers a page that bounces you (the "W6c" trap
//     the middleware's own comments describe).
//
// So each route below is checked from both sides.

import { describe, it, expect } from 'vitest';

import { ADMIN_ROUTES, accessibleRoutes } from '@/lib/admin/route-registry';

/**
 * Pages that answer "what about ME" — my hours, my schedule, my assignments, my pay, my messages.
 *
 * The test of whether something belongs here is not how sensitive it is, it is **whose data it
 * shows**. Every one of these is backed by an API that scopes a non-admin to their own rows
 * (verified when this list was written: assignments, schedule, time-logs and xp all filter on
 * `session.user.email` unless the caller is an admin), so widening the gate cannot widen the data.
 */
const SELF_SERVICE = [
  // C4 (2026-08-25): was `/admin/my-hours`. That route still exists and forwards, but it is not a
  // REGISTRY row any more — the Hours portal absorbed it as the `my-time` tab, and this test asks
  // whether the nav offers a way in.
  //
  // The invariant is unchanged and was re-checked rather than assumed: `/admin/hours` is ungated,
  // and its per-role default sends an `employee` and a `field_crew` member to `my-time` — asserted
  // in `__tests__/admin/hours-portal.test.ts`. The door has a new name, not a new lock.
  '/admin/hours',
  '/admin/schedule',
  '/admin/assignments',
  // C6: was '/admin/my-pay', now the Pay portal's `my-pay` tab. Re-checked rather than assumed —
  // the portal's roles include `employee`, and its per-role default sends a non-admin to `my-pay`.
  '/admin/pay',
  '/admin/receipts/new',
  // C4 absorbed `/admin/time-off` as the portal's `time-off` tab, and it is the tab that keeps the
  // portal ungated: it was the one of the four with no role list, because every employee may ask for
  // leave. `/admin/hours` above covers it — listing it twice would assert the same row twice.
  '/admin/my-files',
  '/admin/my-notes',
];

/** Read middleware's protected-prefix table without importing it — it pulls the auth stack. */
function middlewareRolesFor(pathname: string): string[] | null {
  const src = require('node:fs').readFileSync('middleware.ts', 'utf8') as string;
  // First match wins in the real matcher, so the FIRST entry whose prefix matches is the one that
  // governs — matching the loop in middleware.ts rather than the longest prefix.
  for (const m of src.matchAll(/\{\s*prefix:\s*'([^']+)',\s*roles:\s*\[([^\]]*)\]\s*\}/g)) {
    const prefix = m[1];
    if (pathname === prefix || pathname.startsWith(prefix + '/')) {
      return [...m[2].matchAll(/'([^']+)'/g)].map((r) => r[1]);
    }
  }
  return null; // no entry → middleware lets any signed-in user through
}

describe('an employee can reach their own things', () => {
  const employee = { roles: ['employee' as const], isCompanyUser: true };

  for (const href of SELF_SERVICE) {
    it(`${href} is visible in the nav to a plain employee`, () => {
      const registered = ADMIN_ROUTES.find((r) => r.href === href);
      expect(registered, `${href} must be registered`).toBeDefined();
      const visible = accessibleRoutes(employee).some((r) => r.href === href);
      expect(
        visible,
        `${href} is hidden from the nav for a plain employee. On a phone the drawer is the ONLY `
          + `navigation, so a hidden route is an unreachable one.`,
      ).toBe(true);
    });

    it(`${href} is not blocked by middleware for a plain employee`, () => {
      const roles = middlewareRolesFor(href);
      if (roles === null) return; // unrestricted
      expect(
        roles,
        `${href} is offered in the nav but middleware bounces a plain employee — a menu item that `
          + `throws you back to /admin/me.`,
      ).toContain('employee');
    });
  }
});

describe('administration stays restricted', () => {
  // The other half of the rule. Widening self-service must not have widened anything that decides
  // money or people — if this ever goes green-by-accident, the slice above went too far.
  const employee = { roles: ['employee' as const], isCompanyUser: true };
  const MUST_STAY_CLOSED = [
    '/admin/payroll',
    '/admin/users',
    '/admin/employees',
    '/admin/org-settings',
    '/admin/receipts',      // the APPROVAL queue, as opposed to /admin/receipts/new
    '/admin/invoicing',
    '/admin/hours-approval',
  ];

  for (const href of MUST_STAY_CLOSED) {
    it(`${href} is still hidden from a plain employee`, () => {
      const visible = accessibleRoutes(employee).some((r) => r.href === href);
      expect(visible, `${href} must not be offered to a plain employee`).toBe(false);
    });
  }
});

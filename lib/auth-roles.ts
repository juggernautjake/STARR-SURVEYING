// lib/auth-roles.ts — the role vocabulary, with nothing server-only attached.
//
// ── WHY THIS FILE EXISTS ────────────────────────────────────────────────────────────────────────
//
// `lib/auth.ts` is the NextAuth configuration. Since audit item 8g it also imports
// `lib/saas/org-scope-context`, which imports `node:async_hooks` — and thirty-two client components
// import a role name, a label or `isAdmin` from it. Webpack follows that chain into the browser
// bundle and fails the production build outright:
//
//     Module build failed: UnhandledSchemeError: Reading from "node:async_hooks" …
//     ./lib/saas/org-scope-context.ts → ./lib/auth.ts → ./app/admin/work-mode/_components/WorkModeTopBar.tsx
//
// `npm run build` had not been run since 8g landed, so every one of those commits was green on tsc
// and on 21,000 tests while the deploy could not compile. The split is the fix and the guard: role
// primitives are pure data and pure functions with no imports at all, so no future server-side
// dependency in the auth config can reach a client component through them.
//
// `lib/auth.ts` re-exports everything here, so a server-side import of `@/lib/auth` keeps working.
// Client components import from THIS file — enforced by a test, because the failure mode is a broken
// deploy rather than a red test.

export const ALL_ROLES = [
  'admin', 'developer', 'teacher', 'student', 'researcher',
  'drawer', 'field_crew', 'employee', 'guest', 'tech_support',
  // Phase F10 (§4.6 + §5.12) — equipment_manager owns the digital inventory ledger: receives,
  // labels, calibrates, retires gear; approves dispatcher loadout assignments; nags crews on
  // unreturned gear at end of day. Often a hat worn by an existing admin at Starr's current size;
  // modelled cleanly so a future dedicated hire is a permission flip, not a refactor.
  'equipment_manager',
  // Owner, 2026-08-12: *"Only people with money handling permissions will be able to see the
  // accounts of the employees."*
  //
  // Until now there was no such thing. Everything financial gated on `admin`, plus one
  // `PAYOUT_ADMIN_EMAILS` env allowlist whose own header calls itself a placeholder for exactly
  // this role. `admin` is the person who can do everything, which makes it useless as the answer to
  // "who may look at what somebody earns" — a bookkeeper who approves receipts and an office
  // manager who resets passwords are the same role today, and only one of them should see wages.
  //
  // Deliberately additive rather than a split of `admin`: every existing admin keeps every
  // capability (see `canHandleMoney`), so this changes nothing until somebody is given the role
  // WITHOUT admin. A permission model that revokes access the day it ships is one that gets
  // reverted the day after.
  'finance',
] as const;

export type UserRole = (typeof ALL_ROLES)[number];

/** Human-readable labels for each role. */
export const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Admin',
  developer: 'Developer',
  teacher: 'Teacher',
  student: 'Student',
  researcher: 'Researcher',
  drawer: 'Drawer',
  field_crew: 'Field Crew',
  employee: 'Employee',
  guest: 'Guest',
  tech_support: 'Tech Support',
  equipment_manager: 'Equipment Manager',
  finance: 'Finance',
};

/** Role descriptions for the admin UI. */
export const ROLE_DESCRIPTIONS: Record<UserRole, string> = {
  admin: 'Full access to everything. Can manage users, roles, payroll, and settings.',
  developer: 'Full access for testing. Cannot update user roles or site settings.',
  teacher: 'Create/edit learning content. Manage student progress.',
  student: 'Access to all learning features: modules, flashcards, exam prep.',
  researcher: 'Access to Property Research and Analysis tools.',
  drawer: 'Access to CAD Editor and Research tools.',
  field_crew: 'Field work tools: jobs, hours, fieldbook, assignments, schedule.',
  employee: 'Base role. Dashboard, profile, learning hub basics.',
  guest: 'External user. Limited to dashboard, profile, and basic learning.',
  tech_support: 'Error logs, view-only access to most pages for troubleshooting.',
  equipment_manager: 'Owns the equipment + supplies inventory: morning checkout, end-of-day reconcile, maintenance schedules, low-stock restock, and damaged/lost triage. Cannot approve receipts or hours.',
  finance: 'Handles money: can see what employees have earned, review withdrawal requests, and move payouts. Give this to a bookkeeper who should see wages without being able to manage users or roles.',
};

/** How often (in seconds) to re-fetch roles from the DB for an active session. */
export const ROLES_REFRESH_INTERVAL_SECONDS = 30;

/** Role priority for determining the "primary" display role (highest first).
 *
 *  equipment_manager sits above researcher/drawer/field_crew — cage-keeper accountability outranks
 *  the generic field roles for display purposes — and below admin / developer / teacher / support. */
export const ROLE_PRIORITY: UserRole[] = [
  'admin', 'developer', 'teacher', 'tech_support',
  // Above equipment_manager: handling wages is the more accountable hat of the two.
  'finance',
  'equipment_manager',
  'researcher', 'drawer', 'field_crew', 'student', 'guest', 'employee',
];

/** The primary (highest-priority) role a person holds. */
export function getPrimaryRole(roles: UserRole[]): UserRole {
  for (const r of ROLE_PRIORITY) {
    if (roles.includes(r)) return r;
  }
  return 'employee';
}

/** True when the roles include `admin`.
 *
 *  Only the ARRAY form lives here. The email form in `lib/auth.ts` reads a hard-coded address list,
 *  which is a server concern and, per audit item 8h, a Starr-specific one — a client component
 *  asking "is this person an admin" always has the roles from its session already. */
export function isAdminRoles(roles: UserRole[] | null | undefined): boolean {
  return !!roles && roles.includes('admin');
}

/** Admin or developer — both have broad access. */
export function isDeveloperRoles(roles: UserRole[] | null | undefined): boolean {
  return !!roles && (roles.includes('admin') || roles.includes('developer'));
}

/**
 * May this person see what employees have earned, and move money?
 *
 * *"Only people with money handling permissions will be able to see the accounts of the
 * employees."*
 *
 * ── WHAT THIS DELIBERATELY DOES NOT DO ───────────────────────────────────────────────────────────
 *
 * It does not take anything away from `admin`. Every admin already handles money today, and a
 * permission model whose first act is to lock the owner out of payroll is one that gets reverted
 * before it is understood. The value arrives the other way round: a bookkeeper can now be given
 * `finance` WITHOUT `admin` and see wages without also being able to manage users, roles, jobs or
 * settings — which is not expressible today at all.
 *
 * `developer` is deliberately absent. It exists so somebody can test the application, and a testing
 * role that can read every employee's earnings is the one role that should not.
 */
export function canHandleMoney(roles: UserRole[] | null | undefined): boolean {
  return !!roles && (roles.includes('admin') || roles.includes('finance'));
}

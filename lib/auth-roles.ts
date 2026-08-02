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
};

/** How often (in seconds) to re-fetch roles from the DB for an active session. */
export const ROLES_REFRESH_INTERVAL_SECONDS = 30;

/** Role priority for determining the "primary" display role (highest first).
 *
 *  equipment_manager sits above researcher/drawer/field_crew — cage-keeper accountability outranks
 *  the generic field roles for display purposes — and below admin / developer / teacher / support. */
export const ROLE_PRIORITY: UserRole[] = [
  'admin', 'developer', 'teacher', 'tech_support',
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

// lib/admin/route-registry.ts
//
// Single source of truth for the admin shell's navigation. Consumed by
// the icon rail, the expanded panel, workspace fly-outs, the Cmd+K
// palette, the AdminPageHeader breadcrumb resolver, and the route-audit
// test. Spec: docs/planning/completed/ADMIN_NAVIGATION_REDESIGN.md §7.
//
// Role gates mirror app/admin/components/AdminSidebar.tsx:62-74 + each
// section's per-link `roles` value. The redesign reorganises discovery
// only — it does not widen permissions. The §6 role-group constants
// are re-exported below so the audit test can assert parity with the
// sidebar's groups in one place.
//
// `iconName` holds a lucide-react component name as a plain string so
// this module stays pure-data (no React imports). Consumers map names
// to components. Phase 5 (§8) does the emoji → lucide audit; this file
// is already the target for that pass.

import type { UserRole } from '@/lib/auth';
import type { BundleId } from '@/lib/saas/bundles';
// T2. Value import, not just a type: `isEnabled` is the one rule for "is this on", and
// `feature-toggles.ts` imports nothing at all — so it cannot pull anything server-only into the
// client bundles that read this registry.
import { isEnabled, type FeatureToggles } from '@/lib/admin/feature-toggles';

// ── Workspaces (§5.3) ───────────────────────────────────────────────

export type Workspace =
  | 'hub'
  | 'work'
  | 'equipment'
  | 'research-cad'
  | 'knowledge'
  | 'money'
  | 'office';

export interface WorkspaceMeta {
  id: Workspace;
  label: string;
  iconName: string;
  href: string;
  shortcut: string;
  order: number;
}

export const WORKSPACES: Record<Workspace, WorkspaceMeta> = {
  hub:            { id: 'hub',            label: 'Hub',             iconName: 'Home',           href: '/admin/me',           shortcut: 'Mod+1', order: 1 },
  work:           { id: 'work',           label: 'Work',            iconName: 'Briefcase',      href: '/admin/work',         shortcut: 'Mod+2', order: 2 },
  equipment:      { id: 'equipment',      label: 'Equipment',       iconName: 'Truck',          href: '/admin/equipment',    shortcut: 'Mod+3', order: 3 },
  'research-cad': { id: 'research-cad',   label: 'Research & CAD',  iconName: 'Compass',        href: '/admin/research-cad', shortcut: 'Mod+4', order: 4 },
  knowledge:      { id: 'knowledge',      label: 'Knowledge',       iconName: 'GraduationCap',  href: '/admin/learn',        shortcut: 'Mod+5', order: 5 },
  // Platform audit §2.2 / Phase 1 item 7 (2026-08-01) — thirty money surfaces, split across the Work
  // and Office workspaces, with no single financial home. Money is a workspace of its own now; the
  // rail, the palette, the mobile drawer and the landings all read this registry, so moving each
  // route's `workspace` moves it everywhere at once and no URL changes.
  money:          { id: 'money',          label: 'Money',           iconName: 'Wallet',         href: '/admin/money',        shortcut: 'Mod+6', order: 6 },
  office:         { id: 'office',         label: 'Office',          iconName: 'Building',       href: '/admin/office',       shortcut: 'Mod+7', order: 7 },
};

export const WORKSPACE_ORDER: Workspace[] = [
  'hub', 'work', 'equipment', 'research-cad', 'knowledge', 'money', 'office',
];

// ── Role groups (mirrors AdminSidebar.tsx:62-74) ────────────────────

export const WORK_ROLES: UserRole[] = ['admin', 'developer', 'field_crew'];
export const RESEARCH_ROLES: UserRole[] = ['admin', 'developer', 'researcher', 'drawer'];
export const CONTENT_MGMT_ROLES: UserRole[] = ['admin', 'developer', 'teacher'];
export const INTERNAL_COMM_ROLES: UserRole[] = ['admin', 'developer', 'teacher', 'researcher', 'drawer', 'field_crew', 'tech_support'];
export const PAY_ROLES: UserRole[] = ['admin', 'developer', 'field_crew'];
export const EQUIPMENT_ROLES: UserRole[] = ['admin', 'developer', 'tech_support', 'equipment_manager'];

// ── Route shape (§7) ────────────────────────────────────────────────

export interface AdminRoute {
  href:          string;
  label:         string;
  workspace:     Workspace;
  iconName:      string;
  description?:  string;
  roles?:        UserRole[];
  internalOnly?: boolean;
  keywords?:     string[];
  /** Optional grouping WITHIN a workspace landing (platform audit §2.2 / item 7).
   *
   *  Most workspaces are small enough that an alphabetical grid of cards is fine. Money is not: it
   *  has 25 routes, and the audit's finding was not "too many pages" but "no shape" — a bookkeeper
   *  could not tell which of them were about money coming IN and which about money going OUT, and
   *  the words on them actively misled ("Billing" is what you pay, "Invoicing" is what they pay).
   *
   *  Sections are declared on the route rather than in a separate table so a new page cannot be
   *  added to a workspace and silently land in an "Other" bucket nobody reads. */
  section?:      string;
  /** Default true. False hides the route from rail surfaces (workspace
   *  landings, fly-outs, expanded panel) while keeping it searchable in
   *  the Cmd+K palette and resolvable for breadcrumbs. */
  showInRail?:   boolean;
  /** Parked: a feature deliberately taken out of circulation, not deleted.
   *
   *  Stronger than `showInRail: false` — a parked route is hidden from the rail AND from search,
   *  so it does not surface anywhere a person browses. The page still exists and still resolves,
   *  so a bookmark works, breadcrumbs read correctly, and nothing 404s.
   *
   *  Used for the pay-progression system, 2026-08-04: *"put the whole pay progression and
   *  seniority thing on hold and hide it from surfacing for now… eventually we might work with
   *  balancing everything for job types, role types, seniority, certifications/education level."*
   *  Deleting it would have thrown away working, tested code that is wanted later; leaving it in
   *  the menus would have offered a pay model the firm does not use. */
  parked?:       boolean;
  /** True for non-route commands ("Clock in", "Run AI engine"). For
   *  Phase 1 the registry only ships routes; actions land in slice 1b
   *  alongside the palette. */
  isAction?:     boolean;
  /** SaaS pivot — the bundle a customer's subscription must include
   *  to access this route. null/undefined = no bundle gate (visible
   *  to every authenticated user regardless of subscription). Phase D-5
   *  middleware redirects users to /admin/billing/upgrade when missing.
   *  Spec: docs/planning/in-progress/CUSTOMER_PORTAL.md §3.6 +
   *  docs/planning/in-progress/MULTI_TENANCY_FOUNDATION.md §3.3. */
  requiredBundle?: BundleId;
}

// ── Registry ────────────────────────────────────────────────────────
//
// Listed in workspace + rail order. Routes with `showInRail: false`
// exist as files but aren't surfaced in the rail/landing; they're
// still palette-searchable and resolvable for breadcrumbs.

export const ADMIN_ROUTES: AdminRoute[] = [
  // Hub workspace ──────────────────────────────────────────────────
  // The /admin/me landing + the consolidated personal-hub tabs.
  // /admin/me itself lands in Phase 2; the legacy `My …` routes stay
  // accessible until then. After Phase 2 they redirect into /admin/me.
  { href: '/admin/me',              label: 'Hub',             workspace: 'hub', iconName: 'Home',           description: 'Your personalized landing — today, pinned, recents.', keywords: ['home', 'me', 'personal', 'landing'] },
  { href: '/admin/search',          label: 'Search Everything', workspace: 'hub', iconName: 'Search',       description: 'One search across documents, jobs, customers, contacts, leads and invoices — spelling need not be exact.', keywords: ['find', 'lookup', 'documents', 'deed', 'plat', 'customer', 'job', 'files', 'fuzzy'] },
  // Restored 2026-08-04. The page lost its route in consolidation Slice 2 and was never registered
  // when it came back, so the owner's "Profile + settings" and "Theme + density" menu entries went
  // to the Hub and the settings themselves were unreachable. Registered so ⌘K and the drawer can
  // find it too, not just the avatar menu — one door, findable from anywhere.
  { href: '/admin/profile',         label: 'Profile & Settings', workspace: 'hub', iconName: 'Settings',    description: 'Your own details, plus how the app looks to you — theme, density and text size. Applies everywhere, not just the Hub.', keywords: ['settings', 'theme', 'dark mode', 'density', 'font', 'appearance', 'account', 'me', 'my profile', 'preferences', 'persona'] },
  // /admin/dashboard was removed in platform audit Phase 1 item 6 (2026-08-01). It was the second
  // page claiming to be the home, and every figure on it already exists as a hub widget.
  // `LEGACY_REDIRECTS` sends the URL to /admin/me; it is deliberately NOT registered here, so it
  // cannot reappear in the rail, the palette or the mobile drawer — all three derive from this list.
  { href: '/admin/assignments',     label: 'Assignments',     workspace: 'hub', iconName: 'ClipboardList',  description: 'The jobs and tasks assigned to you. Reached from the menu as both Assignments and My Jobs.', roles: [...WORK_ROLES, 'employee', 'researcher', 'tech_support'], internalOnly: true, keywords: ['todo', 'tasks', 'my jobs', 'assigned', 'mine'] },
  // ── C4: FOUR ROWS BECAME ONE ────────────────────────────────────────────────────────────────
  //
  // §4, P3: *"the dossiers show /admin/my-hours and /admin/hours-approval already call the same three
  // APIs — time-logs, advances, lock-period. They are one screen with two permission levels, built
  // twice."* Plus time-off and availability, which are the same subject on the same week.
  //
  // ── NO `roles`, AND THAT IS NOT A WIDENING ──────────────────────────────────────────────────
  //
  // §5's first rule is the dangerous one: *"a portal reachable by six roles whose tabs are gated to
  // one is a WIDER door than six separately-gated pages."* The gate did not move — it went DOWN a
  // level. Each tab carries the exact role list its page carried, and this row carries the UNION of
  // the four, which is everybody because `/admin/time-off` was ungated: every employee may ask for
  // leave.
  //
  // Which also satisfies §5's second rule for free — *"never render an empty portal"* — since every
  // viewer has at least the time-off tab. A row gated tighter than the union would have been this
  // slice quietly removing somebody's access while claiming to merge four pages.
  { href: '/admin/hours', label: 'Hours & Time', workspace: 'hub', iconName: 'Clock', description: 'Your timesheet, time off, the approval queue and who is available — all of it.', internalOnly: true, keywords: ['time', 'timesheet', 'fix hours', 'edit hours', 'correct hours', 'add hours', 'missed clock out', 'forgot to clock in', 'approve', 'approval', 'pto', 'vacation', 'holiday', 'leave', 'time off', 'availability', 'dispatch', 'free', 'available', 'who is free', 'crew', 'assign', 'book'] },
  { href: '/admin/schedule',        label: 'My Schedule',     workspace: 'hub', iconName: 'Calendar',       description: 'Calendar of your shifts + appointments.', roles: [...WORK_ROLES, 'employee', 'tech_support'], internalOnly: true, keywords: ['calendar', 'shifts'] },
  // consolidation Slice 2 (2026-05-30) — the legacy `/admin/my-*` +
  // `/admin/profile` page files were deleted; these entries now point
  // at the canonical hub tabs so the nav surface keeps showing the
  // shortcuts. The middleware LEGACY_REDIRECTS table catches external
  // 'My Jobs' pointed at /admin/me?tab=jobs and was folded into Assignments on 2026-08-04 — one
  // page, one entry. Its extra role (researcher) and its wording live on the entry above; two rows
  // for one href is how a menu comes to show the same destination twice under different names.
  // bookmarks at the old URLs.
  { href: '/admin/my-notes',         label: 'My Notes',        workspace: 'hub', iconName: 'NotebookPen',    description: 'Personal notes.' },
  // E2 (2026-08-11) — no `roles` key, so everyone at the firm sees it. That is the point: the
  // people who need to ASK for a role are by definition the ones who do not have it, and gating
  // the request page on roles would be a locked door with the key inside.
  { href: '/admin/my-files',        label: 'My Files',        workspace: 'hub', iconName: 'Folder',         description: 'Your file uploads.' },
  // 'My Profile' pointed at /admin/me?tab=profile and was folded into 'Profile & Settings' on
  // 2026-08-04. One page, one entry; the old label survives as a keyword so searching it still
  // finds the page.
  { href: '/admin/files',           label: 'Files',           workspace: 'office', section: 'Documents & records', iconName: 'FolderOpen',     description: 'Company file explorer — browse, upload, organize, and share files with folder permissions.', roles: ['admin', 'developer', 'field_crew', 'drawer', 'researcher', 'equipment_manager', 'tech_support'], internalOnly: true, keywords: ['files', 'explorer', 'documents', 'folders', 'storage'] },
  // Page Designer (DESIGN_STUDIO_2026-08-23). Admin + developer only: it is a build tool that
  // exposes the whole app's structure, and a half-finished mockup on a foreman's screen would read
  // as a promise about what the page is going to be.
  // ── C12c / P17: FOUR ROWS BECAME ONE, AND §8's REASON FOR IT WAS NOT TRUE ──────────────────
  //
  // §8 said "six sidebar links for one internal tool". Measured before building: the rail showed
  // ONE. Five of the six rows were already `showInRail: false`, so there was never a sidebar to
  // shorten, and every board already carried a back-link, so there was no dead end either. The
  // slice is still worth doing on a smaller and truer reason — the Studio was the only surface in
  // this plan that made you go back to a hub between its boards — and the wrong reason is recorded
  // rather than repeated. See the portal header.
  //
  // `serve` and `conformance` keep their rows AND their routes, for structural reasons: one
  // renders a design at real size with no chrome on purpose, and the other is a server component
  // that reads a generated file with `node:fs` at request time.
  //
  // C10's rule checked: `/admin/design/[id]` is a record, and its parent is the portal, which keeps
  // its row because it IS the page. None of the three absorbed routes has a child.
  { href: '/admin/design',          label: 'Page Designer',   workspace: 'office', section: 'Documents & records', iconName: 'PenTool',        description: 'Mock up any page — desktop and mobile as separate designs — then export the screenshots, HTML and a build spec.', roles: ['admin', 'developer'], internalOnly: true, keywords: ['design', 'designer', 'mockup', 'wireframe', 'layout', 'page', 'canvas', 'prototype', 'ui', 'sketch', 'compare', 'versions', 'variants', 'side by side', 'theme', 'preview', 'alternatives', 'dossier', 'purpose', 'summary', 'elements', 'inventory', 'checklist', 'site version', 'publish', 'release', 'activate', 'designs', 'bulk'] },
  // Reached from the Page Designer rather than from the Office grid, so `showInRail: false` keeps it
  // out of that card list — but it is REGISTERED, which is what makes it searchable in the command
  // palette and what stops the orphan audit calling it an unreachable page.
  // The four surfaces PAGE_VERSIONS_AND_PORTAL_THEMES_2026-08-23 added. All reached from the Page
  // Designer rather than from the Office grid, so `showInRail: false` — but registered, which is
  // what makes them searchable in the command palette and what stops the orphan audit calling
  // them unreachable pages.
  { href: '/admin/design/conformance', label: 'Design conformance', workspace: 'office', section: 'Documents & records', iconName: 'Gauge', description: 'How much of each page’s design is actually on the page, and whether each default is still a 1:1 trace.', roles: ['admin', 'developer'], internalOnly: true, showInRail: false, keywords: ['conformance', 'diff', 'drift', 'measure', 'default', 'trace', 'design'] },
  { href: '/admin/design/serve',      label: 'Design as a page', workspace: 'office', section: 'Documents & records', iconName: 'Monitor', description: 'The design of record for a page, rendered full size with no editor chrome.', roles: ['admin', 'developer'], internalOnly: true, showInRail: false, keywords: ['serve', 'preview', 'full size', 'as a page', 'design', 'active'] },
  { href: '/admin/install',         label: 'Get the App',     workspace: 'hub', iconName: 'Smartphone',     description: 'Install the Starr Field mobile app on your phone.', keywords: ['mobile', 'app', 'download', 'install', 'iphone', 'android', 'testflight', 'apk', 'starr field'] },
  { href: '/admin/learn/fieldbook', label: 'My Fieldbook',    workspace: 'hub', iconName: 'BookMarked',     description: 'Field notes + research bookmarks.', keywords: ['notes', 'research'] },

  // Work workspace ────────────────────────────────────────────────
  { href: '/admin/work',            label: 'Work',            workspace: 'work', iconName: 'Briefcase',     description: 'Active jobs + crew + dispatch.', keywords: ['operations', 'jobs', 'dispatch'] },
  // Slice P6 — surface the org-wide /admin/calendar page (already
  // shipped: month/week/day + fullscreen + phase legend) in the
  // Work rail. Previously it only existed as a file with no nav
  // entry, so users couldn't get to it without typing the URL.
  { href: '/admin/calendar',        label: 'Calendar',        workspace: 'work', iconName: 'CalendarDays',  description: 'Org-wide job schedule — year, month, week, day.', keywords: ['schedule', 'phases', 'events', 'jobs', 'planning'] },
  // ── PROJECTS SIT ABOVE JOBS, BECAUSE THAT IS NOW THE SHAPE OF THE WORK (2026-08-19) ───────────
  //
  // Owner: *"I want us to be able to create new projects, and then within the project we can create
  // a new job."* A project is the engagement — one client, one parcel — and it holds several jobs
  // over months: the boundary survey, the topo, the staking. Every job belongs to one.
  //
  // These are listed BEFORE All Jobs deliberately. The nav is read top to bottom as the order you
  // do things in, and creating a job now begins by choosing its project. `All Jobs` used to carry
  // the keyword 'projects' — that keyword had no page behind it, and now it has its own.
  { href: '/admin/projects/new',    label: 'New Project',     workspace: 'work', iconName: 'FolderPlus',    description: 'Start a project — the client and site its jobs will inherit.', roles: ['admin'], internalOnly: true, showInRail: false, keywords: ['create', 'add', 'project'] },
  // ── C7: SEVEN NAV ROWS BECAME ONE ───────────────────────────────────────────────────────────
  //
  // `projects`, `timeline` and `field-data` are tabs; `jobs/new`, `jobs/import` and `projects/new`
  // are buttons that kept their routes and their gates. Every one still forwards or resolves.
  //
  // The ROLES are unchanged — all three absorbed pages carried this exact list, so there is no union
  // to take and nothing to widen. That is why this portal needed no middleware change, unlike C4 and
  // C6: the four tabs agree about who may see them.
  //
  // `/admin/calendar` is deliberately NOT here — see the portal's header. It is ungated today, and
  // absorbing it would either take it away from everybody who is not on this list, or force widening
  // `/admin/jobs` — which is the middleware prefix of the job RECORDS.
  { href: '/admin/jobs', label: 'Jobs & Projects', workspace: 'work', iconName: 'ListChecks', description: 'Every job and the projects they belong to, what the crews have sent back, and everything that happened.', roles: ['admin', 'developer', 'tech_support'], internalOnly: true, keywords: ['job', 'jobs', 'project', 'projects', 'site', 'client', 'field', 'field data', 'collector', 'upload', 'survey', 'activity', 'timeline', 'history', 'feed', 'new job', 'import'] },
  { href: '/admin/jobs/new',        label: 'New Job',         workspace: 'work', iconName: 'FilePlus',      description: 'Add a job to a project.', roles: ['admin'], internalOnly: true, showInRail: false, keywords: ['create', 'add'] },
  { href: '/admin/jobs/import',     label: 'Import Jobs',     workspace: 'work', iconName: 'Upload',        description: 'Bulk import jobs.', roles: ['admin'], internalOnly: true },
  // ── FOUR ENTRIES BECAME ONE (A1, 2026-08-11) ──────────────────────────────────────────────────
  //
  // Marketing / Ad spend / Ad conversions / Ad upload log were four routes and four nav rows, split
  // by implementation rather than by anything a person thinks about: "did the ads work this month?"
  // needed two of them, "why is Google's number lower than ours?" needed the other two, and the menu
  // gave no clue which pair. They are now tabs on /admin/marketing.
  //
  // The old hrefs still resolve — each is a `redirect()` to its tab — so bookmarks keep working. They
  // are deliberately NOT registered any more: a registry entry is a nav row, and four rows pointing
  // at one page is the clutter this slice removed.
  //
  // Every keyword from the four is merged in. Losing them would mean somebody searching "upload log"
  // or "cpl" in the palette finds nothing, which is how a consolidation quietly makes a feature
  // disappear even though the page is right there.
  // ── C10 / P6: TWO ROWS BECAME ONE, AND THE PAGE OUTGREW ITS LABEL ──────────────────────────
  //
  // It holds the lead queue now, so "Advertising" describes four of its five tabs. §8 calls this
  // portal GROWTH, which is the whole funnel: what the ads did, who they produced, what they cost,
  // and what went back to Google. The keywords carry both words plus every one the leads row had,
  // so the old name still finds it.
  { href: '/admin/marketing',       label: 'Growth',     workspace: 'work', iconName: 'TrendingUp',    description: 'The funnel end to end — ad performance, the lead queue, spend, conversions and the Google upload log.', roles: ['admin'], internalOnly: true, keywords: ['funnel', 'ads', 'google', 'cost per lead', 'cpl', 'roas', 'attribution', 'conversion', 'conversions', 'marketing', 'advertising', 'spend', 'cost', 'budget', 'upload', 'upload log', 'export', 'errors', 'impressions', 'clicks', 'contacts', 'prospects', 'leads', 'lead', 'enquiry', 'inquiry', 'follow up', 'follow-up', 'growth'] },
  // §2.4's fix. Not a fifth calendar: the four that exist each answer "what is happening over a
  // period" for ONE resource type, and the dispatcher's actual question — "for Thursday, what can I
  // send" — spans crew, equipment and vehicles at once. In the rail because it is asked daily.
  // The pay model is two screens: this one sets what each ACTIVITY pays, /admin/payroll sets what
  // each PERSON is on. Registered so it is reachable and searchable — an unlinked settings page is
  // a setting nobody can change.
  { href: '/admin/team',            label: 'Field Team',      workspace: 'work', iconName: 'Users',         description: 'Live status of crew in the field.', roles: ['admin', 'developer', 'tech_support'], internalOnly: true, keywords: ['crew', 'roster'] },
  // ── C8 / P7: FOUR ROWS BECAME ONE ───────────────────────────────────────────────────────────
  //
  // The label had to change with the scope. "Job Profitability" was the whole page and is one tab of
  // four now — leaving it would have been §2.2's defect re-made by a slice that cites §2.2: a name
  // that describes a fraction of what the row opens.
  //
  // The description keeps the "NOT invoicing" clause, which is load-bearing. §2.2 found "Billing",
  // "Invoicing" and "Finances" meaning three different things nobody could guess between, and the
  // fix was each row saying what it is NOT. That sentence is asserted by a test.
  { href: '/admin/finances', label: 'Books & Tax', workspace: 'money', section: 'Profitability', iconName: 'Briefcase', description: 'Money in against money out, what each job earned, the bank queue and payroll tax. NOT invoicing — that is what your customers owe you.', roles: ['admin', 'developer', 'tech_support'], internalOnly: true, keywords: ['profit', 'margin', 'schedule c', 'books', 'tax', 'reconcile', 'bank', 'overview', 'totals', 'payroll tax', 'withholding'] },
  // /admin/vehicles was here. C3 made it the Equipment portal's `vehicles` tab — the plan's own
  // argument: *"it is fleet, and the dossiers show /admin/equipment already calls
  // /api/admin/vehicles"*. Two nav rows were reading the same data.
  //
  // The ROUTE still exists and forwards; it is out of the registry because a nav entry that lands on
  // a redirect is a row that flickers. Its 'fleet' and 'trucks' keywords moved to the portal, so the
  // palette still finds it — dropping them would make somebody typing "trucks" get nothing, which
  // reads as the feature having been deleted.
  // On the rail, not palette-only. §1.4's split says destinations somebody navigates TO get a rail
  // slot, and "what expires soon" is checked on purpose rather than arrived at from somewhere else —
  // a licence nobody thinks to look for is the whole failure mode this page exists to prevent.
  { href: '/admin/compliance',      label: 'Compliance',      workspace: 'work', iconName: 'ShieldCheck',   description: 'Licences, certifications, insurance, vehicle registration and instrument calibration — every date that expires.', roles: ['admin', 'developer', 'tech_support'], internalOnly: true, keywords: ['licence', 'license', 'rpls', 'certification', 'insurance', 'coi', 'expiry', 'expires', 'renewal', 'calibration', 'inspection', 'registration', 'ce hours'] },
  // "Receivables", not "AR". §2.2 measured what happens when this app invents finance vocabulary —
  // three words that all sound like money and mean different things. AR is jargon only an accountant
  // reads; the keywords carry it so ⌘K still finds it.

  // Equipment workspace ───────────────────────────────────────────
  //
  // ── C3: TWELVE ENTRIES BECAME THREE ──────────────────────────────────────────────────────────
  //
  // §4, P5 of docs/planning/in-progress/PAGE_CONSOLIDATION_2026-08-24.md: *"The most mechanical
  // merge in the document — fourteen links about one cage."*
  //
  // `today`, `checked-out`, `timeline`, `maintenance`, `consumables`, `templates`,
  // `templates/cleanup-queue`, `overrides`, `fleet-valuation` and `/admin/vehicles` are tabs of the
  // portal now. Their ROUTES all still exist and forward to their tab, so every bookmark and every
  // link in an old email keeps working — see the redirect stubs for why that is not optional.
  //
  // What is left in the nav is one destination, plus the two editors that were already
  // `showInRail: false` because you arrive at them from the thing you are editing.
  //
  // ── AND WHY THE KEYWORDS MOVED HERE RATHER THAN BEING DELETED ────────────────────────────────
  //
  // The command palette matched "checkout", "lend", "borrow", "gantt", "depreciation" against nine
  // separate rows. Dropping those rows would have made all of it unsearchable — somebody typing
  // "borrow" would get nothing, which reads as the feature having been removed. They are one row's
  // keywords now, and the row they open is the portal.
  { href: '/admin/equipment', label: 'Equipment', workspace: 'equipment', iconName: 'Package', description: 'Check gear in and out, maintenance, supplies, templates and the fleet — all of it.', roles: EQUIPMENT_ROLES, internalOnly: true, keywords: ['gear', 'inventory', 'checkout', 'check out', 'check in', 'lend', 'assign', 'return', 'borrow', 'maintenance', 'consumables', 'supplies', 'templates', 'gantt', 'timeline', 'schedule', 'overrides', 'audit', 'valuation', 'depreciation', 'fleet', 'trucks', 'vehicles', 'cleanup'] },
  // Moved to the Work workspace by C3, and this is the interesting half of the slice. It was filed
  // under Equipment, which §4 flagged as *"evidence that the current grouping is not load-bearing"*:
  // a crew calendar is about PEOPLE, and it sat in the cage because that is where somebody put it.
  // C4 takes it into the Hours portal; until then it is at least in the right workspace.
  { href: '/admin/personnel/crew-calendar',            label: 'Crew Calendar',     workspace: 'work',      iconName: 'Users',         description: 'Crew availability calendar.', roles: EQUIPMENT_ROLES, internalOnly: true, keywords: ['schedule', 'roster'] },
  { href: '/admin/equipment/inventory',                label: 'Inventory Edit',    workspace: 'equipment', iconName: 'PackageOpen',   description: 'Equipment inventory editor.', roles: EQUIPMENT_ROLES, internalOnly: true, showInRail: false },
  { href: '/admin/equipment/import',                   label: 'Import Equipment',  workspace: 'equipment', iconName: 'Upload',        description: 'Bulk import equipment.', roles: ['admin'], internalOnly: true, showInRail: false },

  // Research & CAD workspace ──────────────────────────────────────
  { href: '/admin/research-cad',         label: 'Research & CAD',   workspace: 'research-cad', iconName: 'Compass',     description: 'Research projects + CAD drawings landing.', keywords: ['cad', 'research'] },
  // ── C11b / P13: SEVEN ROWS BECAME ONE ──────────────────────────────────────────────────────
  //
  // Coverage, the library, the data sources, site health, the pipeline dashboard and the billing
  // rollup are tabs of the projects list now, and every one of their routes forwards.
  //
  // NONE of the six needed C10's keep-the-row treatment: not one has a dynamic child. The record
  // in this tree is `/admin/research/[projectId]`, and its parent is the portal — which keeps its
  // row because it IS the page. Checked rather than assumed; that is the whole point of the rule.
  //
  // `/admin/research/testing` keeps its row AND its own middleware entry — three roles, listed
  // before `/admin/research` so it wins the prefix match. Absorbing it would have widened it to
  // six roles, which §5 forbids, and §8 wanted it separate anyway.
  { href: '/admin/research',             label: 'Property Research', workspace: 'research-cad', iconName: 'Microscope',  description: 'Property research end to end — the projects, county coverage, the document library, the data sources, site health, the pipeline and what it all costs.', roles: [...RESEARCH_ROLES, 'field_crew', 'tech_support'], internalOnly: true, keywords: ['property', 'records', 'county', 'portal', 'adapter', 'vendor', 'register', 'source', 'self-heal', 'monitoring', 'sweep', 'adapters', 'health', 'coverage', 'library', 'data sources', 'site health', 'pipeline', 'research billing', 'counties', 'self heal', 'data source'] },
  { href: '/admin/research/testing',     label: 'Testing Lab',      workspace: 'research-cad', iconName: 'FlaskConical', description: 'Test research pipelines + adapters.', roles: ['admin', 'developer', 'tech_support'], internalOnly: true, keywords: ['lab', 'experiments'] },
  // Roadmap §8.1 (Pillar A). Sits beside Site Health deliberately: that page answers "is a county
  // portal still working", this one answers "which county portals do we have at all", and the two
  // read the same registry. Same roles as Site Health — registering a data source decides what the
  // coverage dashboard promises customers, which is not a general-staff action.
  // Palette-only, like Coverage and Pipeline beside it: registering a portal is a rare setup action,
  // and the rail is a place you go daily. It is reached from the coverage page's health panel, which
  // is where the question "why can't we search this county" actually gets asked.
  // Slice W4 (hub-cad-roles-polish-2026-06-18) — user spec: "If
  // a user does not have the drawing role and clicks the cad
  // button … they are still routed to the cad software. We might
  // change this in the future, but for now leave it." `roles:`
  // is intentionally absent so EVERY signed-in user sees the CAD
  // entry; re-add the role gate when the broader permissions
  // story (W7) lands.
  { href: '/admin/cad',                  label: 'CAD Editor',       workspace: 'research-cad', iconName: 'PenTool',     description: 'CAD drawing editor.', internalOnly: true, keywords: ['drawing', 'plat'] },

  // ── C10: FIVE ABSORBED PARENTS COME BACK AS REGISTRATIONS, BECAUSE THEIR RECORDS NEVER LEFT ────
  //
  // Absorbing a page has meant dropping its row. That is right when the route becomes a redirect and
  // nothing lives under it — and WRONG the moment it has a dynamic child, because dropping the row
  // takes the child's bundle gate with it.
  //
  // `bundleForRoute` resolves an unknown path by its deepest registered prefix. With no
  // `/admin/leads` row, `/admin/leads/[id]` — a lead record — matched nothing and answered `null`,
  // which means NO BUNDLE GATE APPLIES. Measured across the whole tree, C6 through C9 had done this
  // five times: employee records, lead records, field-data records, project records and one person's
  // payroll. All five are Office- or Work-bundle pages that a firm which has not paid for the bundle
  // could open.
  //
  // This is the same leak `bundle-gate.ts` already documents from 2026-08-01, arriving by a
  // different road: there the research INDEX was gated and every research project was not. There the
  // fix was to make overrides cover the subtree. Here it is to leave the parent REGISTERED —
  // `showInRail: false` hides it from the rail, the flyout and the workspace landing, which is all
  // the consolidation ever needed — instead of unregistering it.
  //
  // Each row keeps the bundle it had on main via its workspace. Roles are as they were, except
  // `/admin/leads`, narrowed to the `admin` its nine API routes have always enforced (see C10 in
  // the marketing portal's header).
  { href: '/admin/employees',   label: 'Employees',    workspace: 'office', section: 'People', iconName: 'UsersRound',      description: 'Employee records. Absorbed into People; the row remains so /admin/employees/[email] keeps its bundle gate.', roles: ['admin', 'developer', 'tech_support'], internalOnly: true, showInRail: false },
  { href: '/admin/leads',       label: 'Leads',        workspace: 'work',   iconName: 'Inbox',                              description: 'Lead records. Absorbed into Growth; the row remains so /admin/leads/[id] keeps its bundle gate.', roles: ['admin'], internalOnly: true, showInRail: false, keywords: ['contacts', 'prospects'] },
  { href: '/admin/field-data',  label: 'Field Data',   workspace: 'work',   iconName: 'MapPin',                             description: 'Field data records. Absorbed into Jobs; the row remains so /admin/field-data/[id] keeps its bundle gate.', roles: ['admin', 'developer', 'tech_support'], internalOnly: true, showInRail: false, keywords: ['points', 'gnss'] },
  { href: '/admin/projects',    label: 'All Projects', workspace: 'work',   iconName: 'FolderKanban',                       description: 'Project records. Absorbed into Jobs; the row remains so /admin/projects/[id] and its editor keep their bundle gate.', roles: ['admin', 'developer', 'tech_support'], internalOnly: true, showInRail: false, keywords: ['project'] },
  { href: '/admin/payroll',     label: 'Payroll',      workspace: 'money',  section: 'Money out', iconName: 'BadgeDollarSign', description: 'Payroll records. Absorbed into Pay; the row remains so /admin/payroll/[email] keeps its bundle gate.', roles: ['admin'], internalOnly: true, showInRail: false, keywords: ['paychecks', 'wages'] },

  // Knowledge workspace ───────────────────────────────────────────
  // ── C11a / P12: NINE ROWS BECAME ONE, AND THREE OF THEM STAYED REGISTERED ──────────────────
  //
  // Nineteen links in one workspace, nine of them the same activity split by implementation.
  // The nine are tabs of `/admin/learn` now and their routes forward.
  //
  // Three keep a row with `showInRail: false`, which is C10's rule and not a special case:
  // `bundleForRoute` resolves an unknown path by its deepest REGISTERED prefix, so dropping a row
  // takes the bundle gate off everything beneath it. C6–C9 did that to five record pages before
  // anybody measured it. These three have children — a lesson, an article, a deck — so the row
  // outlives the nav entry. The other six have nothing beneath them and are simply gone.
  //
  // Every harvested keyword is here, plus each absorbed row's label, so the words people actually
  // type — "flashcards", "roadmap", "quiz history" — still find the page they now live on.
  { href: '/admin/learn',                label: 'Learning Hub',     workspace: 'knowledge', iconName: 'GraduationCap', description: 'Study, in one place — the roadmap, the courses, the reference library, flashcards, practice and your quiz history.', keywords: ['education', 'training', 'kb', 'articles', 'docs', 'formula', 'table', 'lookup', 'constants', 'my roadmap', 'modules', 'knowledge base', 'flashcards', 'flashcard bank', 'practice', 'quiz history', 'references', 'knowledge search', 'study', 'learning', 'course', 'lesson', 'deck', 'revision'] },
  { href: '/admin/learn/modules',        label: 'Modules',          workspace: 'knowledge', iconName: 'BookOpen',     description: 'Course modules.', showInRail: false },  // records beneath it: modules/[id] and its lessons, quizzes and tests
  { href: '/admin/learn/knowledge-base', label: 'Knowledge Base',   workspace: 'knowledge', iconName: 'BookText',     description: 'Reference articles.', keywords: ['kb', 'articles', 'docs'], showInRail: false },  // records beneath it: knowledge-base/[slug]
  { href: '/admin/learn/flashcards',     label: 'Flashcards',       workspace: 'knowledge', iconName: 'Layers',       description: 'Spaced-repetition decks.', showInRail: false },  // records beneath it: flashcards/[deckId] and flashcards/create
  { href: '/admin/learn/exam-prep',      label: 'Exam Prep',        workspace: 'knowledge', iconName: 'FileCheck',    description: 'Exam preparation suite.', keywords: ['fs', 'rpls', 'license'] },
  { href: '/admin/learn/students',       label: 'Student Progress', workspace: 'knowledge', iconName: 'UsersRound',   description: 'Student progress dashboard.', roles: [...CONTENT_MGMT_ROLES, 'tech_support'] },
  // ── C12d / P19: TWO ROWS BECAME TWO TABS OF THE BAR THAT WAS ALREADY THERE ─────────────────
  //
  // §8 asked for a portal above this page. It already had a ten-tab bar reading `?tab=`, so a
  // portal would have meant two strips and two claims on one parameter — and `?tab=questions`
  // already means the question LIST. Media and the Question Builder are two more entries in the
  // existing bar instead. Both rows were `showInRail: false`, so the rail loses nothing.
  //
  // C10's rule checked: neither absorbed route has a dynamic child. The records in this tree —
  // `manage/lesson-builder/[id]` and `manage/article-editor/[id]` — hang off this row, which stays
  // because it IS the page.
  { href: '/admin/learn/manage',         label: 'Manage Content',   workspace: 'knowledge', iconName: 'Pencil',       description: 'Author + edit learning content.', roles: [...CONTENT_MGMT_ROLES, 'tech_support'], keywords: ['images', 'upload', 'assets', 'quiz', 'exam', 'author', 'media', 'question builder', 'questions', 'authoring', 'course content'] },

  // Office workspace ──────────────────────────────────────────────
  { href: '/admin/office',                label: 'Office',           workspace: 'office', iconName: 'Building',     description: 'HR, comms, files, settings.', keywords: ['back-office', 'hr', 'admin'] },
  // Money workspace landing (platform audit §2.2 / item 7).
  { href: '/admin/money',                 label: 'Money',            workspace: 'money', iconName: 'Wallet',       description: 'Everything financial in one place — what customers owe you, what you pay out, whether jobs made money, and what this software costs.', roles: ['admin', 'developer', 'field_crew', 'tech_support'], keywords: ['finance', 'financial', 'invoice', 'invoicing', 'billing', 'payroll', 'payouts', 'receipts', 'mileage', 'ar', 'cash'] },
  // Platform audit §2.3 / item 7 — the one directory. /admin/employees, /admin/team and
  // /admin/contacts are now filters on it; they keep their own pages (each does something this one
  // does not) but this is the front door, so nobody has to know which of the ten to open.
  // ── C9 / P10: SIX ROWS BECAME ONE ───────────────────────────────────────────────────────────
  //
  // §2.3 found ten routes describing one noun and put a front door on them. This is the rest of it.
  //
  // UNGATED, and that is carried forward rather than chosen: the directory is open to staff by
  // design — middleware's own note says a gate here "would remove a feature rather than protect
  // one" — and `role-requests` is open because ASKING for a role cannot require the role. Every
  // administrative tab keeps its page's exact list, so a field crew member sees two tabs of six.
  //
  // §4's warning is in the labels: Employees and Accounts are DIFFERENT NOUNS — a person who works
  // here versus a login — and the hints say which is which in the first clause.
  { href: '/admin/people', label: 'People', workspace: 'office', section: 'People', iconName: 'Users', description: 'Everyone at the firm — the directory, employee records, logins, invites, roles and access requests.', internalOnly: true, keywords: ['directory', 'employees', 'staff', 'contacts', 'team', 'phone', 'who', 'onboard', 'invite', 'permissions', 'roles', 'custom', 'role', 'access', 'permission', 'request', 'grant', 'cad access', 'promote'] },
  { href: '/admin/employees/manage',      label: 'Manage Employee',  workspace: 'office', section: 'People', iconName: 'UserCog',      description: 'Edit an employee record.', roles: ['admin', 'developer', 'tech_support'], internalOnly: true, showInRail: false },
  // Slice W7 (hub-cad-roles-polish-2026-06-18) — role builder.
  // Admin-only; surfaces alongside Manage Users in the Office
  // workspace.
  // PARKED 2026-08-04. The graduated model — role tiers, seniority brackets, credential bonuses,
  // XP milestones — is on hold at the owner's request in favour of base pay plus a handful of set
  // activity rates. The page and its data are intact; it is simply not offered anywhere. See
  // docs/planning/in-progress/PAY_MODEL_CONSOLIDATION_2026-08-04.md.
  { href: '/admin/pay-progression',       label: 'Pay Progression',  workspace: 'money', section: 'Money out', iconName: 'TrendingUp',   description: 'Pay rate progression model.', roles: [...PAY_ROLES, 'tech_support'], internalOnly: true, parked: true, keywords: ['raises', 'progression'] },
  // MISLABELLED UNTIL 2026-08-05. This read "Payout History" and pointed at `payout_log`, whose
  // columns are old_rate / new_rate / old_role / new_role — a record of pay CHANGES, not of
  // payments. Somebody hunting for the record of a cheque found rate changes and could reasonably
  // conclude the payment was never made. Payments live at /admin/payouts/search.
  // C6: off the rail, and §4 says why better than I can — *"the clearest case in the whole
  // document: a 201-line page whose entire job is to search a table that another page already lists.
  // It is a search box that was given a sidebar link."* It stays a ROUTE and is the "Search payouts"
  // button on the ledger tab; taking away the sidebar row IS the slice.
  { href: '/admin/payouts/search',        label: 'Payout Search',    workspace: 'money', section: 'Money out', iconName: 'Search',       description: 'Every payment recorded, to anyone, however it was made — searchable by person, check number, Venmo reference, method, status, date or amount.', roles: ['admin'], internalOnly: true, showInRail: false, keywords: ['payout', 'payment', 'paid', 'check number', 'venmo', 'cash', 'find payment', 'receipt of payment', 'reconcile'] },
  // ── C5 / P2.1: FOUR ROWS BECAME ONE ────────────────────────────────────────────────────
  //
  // `cards`, `pass-through` and `mileage` are tabs of this portal now. The ROLES here are
  // unchanged — the two admin-only pages carry their own gate on their own tabs, so a developer
  // opening this sees two tabs and not four. §5 rule 1: the portal is not a wider door.
  //
  // `/admin/receipts/new` keeps its OWN row below, and that is the one real judgement in this
  // slice. It is the only surface here anyone at the firm can reach — a crew member holding a fuel
  // receipt is not an admin — so folding it into an admin-gated portal would take it away from the
  // people who file most of them. It is the `+ Capture` button on the portal AND a nav row.
  { href: '/admin/receipts',              label: 'Receipts & Spending', workspace: 'money', section: 'Money out', iconName: 'Receipt',      description: 'The approval queue, the card registry, rebilled costs and mileage — every way money goes out on an expense.', roles: ['admin', 'developer', 'tech_support'], internalOnly: true, keywords: ['expenses', 'approvals', 'card', 'credit', 'debit', 'reimburse', 'tax', 'sanitarian', 'recovery', 'reimbursable', 'pass-through', 'rebilled', 'no net gain', 'mileage', 'trips', 'miles'] },
  // ANYONE AT THE FIRM MAY SUBMIT A RECEIPT (owner, 2026-08-11: *"Anyone that is an employee or
  // field worker or admin or just about anybody needs to be able to upload receipts."*)
  //
  // Two things were stopping that, and only one of them was the role list. `roles` omitted the
  // plain `employee` role, so the largest group of people who actually hold receipts could not see
  // the entry — and `showInRail: false` hid it from the mobile drawer for *everybody*, which is the
  // only navigation a phone has. A field worker standing at a fuel pump had no way to reach this
  // page short of typing the URL.
  //
  // No `roles` key at all is the correct expression of "anyone at the firm": `accessibleRoutes`
  // reads a missing list as unrestricted, and `internalOnly` still keeps it away from customers.
  // Approving receipts stays restricted — that is /admin/receipts, one line above, and it is a
  // different question from submitting one.
  { href: '/admin/receipts/new',          label: 'Capture Receipt',  workspace: 'money', section: 'Money out', iconName: 'Camera',       description: 'Upload a receipt photo for approval. Anyone at the firm can submit one.', internalOnly: true, keywords: ['upload', 'photo', 'expense', 'submit receipt', 'my receipt'] },
  // ── C8 / P8: FIVE ROWS BECAME ONE ───────────────────────────────────────────────────────────
  //
  // "Customer Invoices" was already the right name and stays; what changed is that it now covers
  // collections, incoming payments and the line categories too. The "NOT the subscription" clause is
  // untouched and still asserted — §2.2's whole point was that this word collides with Billing.
  { href: '/admin/invoicing', label: 'Customer Money', workspace: 'money', section: 'Money in', iconName: 'FileText', description: 'What your customers owe you — invoices, collections, payments that arrived, and the categories lines are built from. NOT the subscription this firm pays.', roles: ['admin', 'developer', 'tech_support'], internalOnly: true, keywords: ['invoice', 'invoices', 'bill', 'billing customer', 'receivable', 'receivables', 'ar', 'aging', 'ageing', 'overdue', 'owed', 'unpaid', 'outstanding', 'past due', 'collections', 'chase', 'payment', 'payments', 'inbox', 'unmatched', 'pledge', 'venmo', 'claim', 'confirm', 'category', 'categories', 'line item'] },
  // F1b / F2b, registered 2026-08-04 — the orphan guard caught both the day after they shipped.
  // A page nobody can navigate to is this repo's signature defect, and building the page is the
  // half that feels like finishing.
  // ── C9 / P11: FOUR ROWS BECAME ONE ──────────────────────────────────────────────────────────
  //
  // Conversations, who you can talk to, what the system sends on your behalf, and the email log —
  // one subject that had four rows. `messages/new` and `email/new` are compose BUTTONS now, on the
  // tabs they belong to, and both keep their routes.
  //
  // The email tab carries admin / developer / tech_support, its row's own list. `/admin/email/*` had
  // no middleware entry, so it is narrower at the door than it was — of a path the nav never
  // offered. See the portal's header.
  { href: '/admin/messages', label: 'Messages', workspace: 'office', section: 'Talking to people', iconName: 'MessageSquare', description: 'Chat with a teammate, one-to-one or in a group. NOT email to a customer (Compose Email), and NOT a topic thread that outlives the day (Discussions).', internalOnly: true, keywords: ['chat', 'dm', 'outbox', 'history'] },
  // consolidation Slice 6 (2026-05-30) — clarified description so it
  // reads distinctly from the firm-wide `/admin/contacts` CRM. This
  // surface is for picking a teammate to message; the CRM page is for
  // realtors / clients / students.
  { href: '/admin/messages/new',          label: 'New Message',      workspace: 'office', section: 'Talking to people', iconName: 'MessageSquarePlus', description: 'Start a new conversation.', roles: INTERNAL_COMM_ROLES, internalOnly: true, showInRail: false },
  // contacts plan 2026-05-30 — firm-wide contacts (realtors, repeat
  // clients, students, teachers, employees). Profile per person + a
  // job ↔ contact join. See docs/planning/in-progress/contacts-…
  { href: '/admin/contacts',              label: 'Contacts',         workspace: 'office', section: 'People', iconName: 'Users',        description: 'Saved contacts — realtors, clients, students, teachers, employees.', keywords: ['address book', 'people', 'realtors', 'clients'] },
  { href: '/admin/discussions',           label: 'Discussions',      workspace: 'office', section: 'Talking to people', iconName: 'MessagesSquare', description: 'A topic thread that outlives a chat — decisions, standards, how-we-do-it. NOT a direct message, and not announcements.', roles: INTERNAL_COMM_ROLES, internalOnly: true, keywords: ['threads', 'forum'] },
  { href: '/admin/notes',                 label: 'Company Notes',    workspace: 'office', section: 'Documents & records', iconName: 'StickyNote',   description: 'Shared notes every admin can read and edit. Your own private notes live in the Hub; a document with a filename belongs in Files.', roles: ['admin', 'developer', 'tech_support'], internalOnly: true },
  // ── C12b / P14: TWO OF §8's FIVE, AND THE OTHER THREE DELIBERATELY LEFT ────────────────────
  //
  // `org-settings` and `orgs` are the COMPANY's settings, both already admin-gated, both tabs now.
  //
  // `announcements`, `notifications` and `me/privacy` are NOT here and must not be: all three are
  // ungated and personal — the current user's alerts, the current user's privacy, and the release
  // archive the Hub banner sends every employee to. This route is middleware-gated to ['admin'],
  // so absorbing any of them would delete it for everyone who is not one. §8 grouped by what
  // sounds like settings rather than by whose settings. They belong with /admin/me — C13's call.
  //
  // C10's rule checked: neither absorbed route has a dynamic child.
  { href: '/admin/settings',              label: 'Settings',         workspace: 'office', section: 'Setup & account', iconName: 'Settings',     description: 'Firm-wide settings.', roles: ['admin'], keywords: ['org', 'tenant', 'company', 'tenants', 'switch', 'org settings', 'organisation', 'organization', 'orgs', 'firm', 'subscription'] },
  // The queue an employee's request goes into. The API could approve, decline and send a withdrawal
  // long before any page listed one, so a person asking for their own earned money was asking into
  // a void — the same defect an unwatched hours queue has, about money already worked for.
  { href: '/admin/announcements',         label: 'Announcements',    workspace: 'office', section: 'Talking to people', iconName: 'Megaphone',    description: 'One-way broadcast to everyone at the firm — release notes and news. Nobody replies to these; use Messages or Discussions for that.', keywords: ['release', 'changelog', 'news'] },
  { href: '/admin/billing',               label: 'Software Subscription',          workspace: 'money', section: 'Company account', iconName: 'CreditCard',   description: 'What THIS FIRM pays for this software — plan, card, invoices and plan history. One page, three tabs. Nothing to do with what customers pay you.', roles: ['admin', 'tech_support'], keywords: ['subscription', 'invoice', 'invoices', 'plan', 'plan history', 'saas', 'bundle', 'upgrade', 'downgrade', 'seats', 'card', 'billing'] },
  { href: '/admin/reports',               label: 'Reports',          workspace: 'office', section: 'Documents & records', iconName: 'FileBarChart', description: 'Owner reports + KPI dashboards.', roles: ['admin', 'developer', 'tech_support'], internalOnly: true, keywords: ['kpi', 'metrics', 'analytics'] },
  // ── C12a / P15: THREE ROWS BECAME ONE ──────────────────────────────────────────────────────
  //
  // Tickets, the error log and the audit log are one subject: the software itself.
  // `/admin/support/new` keeps its route and is a button on the tickets tab — it was already
  // `showInRail: false`, so the rail never offered it and nothing there changes.
  //
  // C10's rule checked: neither absorbed route has a dynamic child. The record in this tree is
  // `/admin/support/tickets/[id]`, whose parent is the portal, which keeps its row because it IS
  // the page.
  //
  // The error log's own middleware entry stays on `/admin/error-log` and now guards a redirect.
  // Harmless, and left deliberately: the stub is still a real URL people paste into threads, and a
  // gate in front of a forward costs nothing.
  { href: '/admin/support',               label: 'Support',          workspace: 'office', section: 'Talking to people', iconName: 'LifeBuoy',     description: 'The software itself — raise a ticket about it with the people who build it, see what has gone wrong, and read who did what. NOT for talking to a customer of yours, and not the Messages page.', keywords: ['tickets', 'help', 'issues', 'compliance', 'history', 'log', 'error log', 'errors', 'audit', 'audit log', 'who did what', 'system', 'diagnostics'] },

  // ── §1.4 · the pages that existed and could not be reached (2026-08-01) ──────────────────────
  //
  // PLATFORM_AUDIT_AND_LAUNCH_QUESTIONS_2026-07-29 §1.4: *"36 built pages are unreachable from
  // navigation — not on the rail, not in ⌘K, no breadcrumb, no help."* Measured again before fixing:
  // 35 of 127 admin pages. **Three of them were built specifically to close go-live gaps G2/G3/G5**,
  // which is the sharpest possible version of this repo's signature defect — work that shipped, works,
  // and cannot be found.
  //
  // THE `showInRail` DECISION IS THE WHOLE DESIGN HERE. Registering all 35 on the rail would trade one
  // problem for a worse one: a rail with 127 items is a rail nobody scans, and the go-live dashboards
  // would be just as lost in it as they were outside it. So:
  //
  //   · `showInRail: true`  — destinations somebody navigates TO. The go-live money dashboards, the
  //                           work-mode door, notifications, weather.
  //   · `showInRail: false` — pages reached FROM something else: "new X" forms, sub-tabs, the
  //                           per-role work-mode shells. Still ⌘K-searchable, still breadcrumbed,
  //                           still help-drawer addressable — which is three of the four things
  //                           §1.4 says they were missing.
  //
  // `/admin/login` is deliberately NOT registered: it is the door, not a room, and a menu item that
  // signs you out of the app you are using is a bug rather than a feature.

  // Money — the three built for G2/G3/G5, on the rail because being unfindable was the entire finding.
  // Keywords carry 'ad spend' / 'advertising' since 2026-08-07: advertising became a fourth money
  // stream here, and somebody hunting for what the ads cost should reach the P&L from ⌘K, not only
  // the marketing page. Two screens now answer that question and both should be findable.
  // Labelled "Bank Reconciliation", not "Reconcile", for two reasons that point the same way. The
  // Cmd+K acceptance criterion is that typing "rec" surfaces RECEIPTS — the far more common
  // destination — and a bare "Reconcile" beat it, which the ranker test caught immediately. And §2.2 of
  // the audit is specifically about colliding money vocabulary: "reconcile" alone could mean the bank,
  // the subscription, or a payout run.
  // ── C6: TEN ROWS BECAME ONE ─────────────────────────────────────────────────────────────────
  //
  // §4, P1 — the owner's headline example: *"Eleven links, one question: what is somebody owed and
  // how do they get it."*
  //
  // ── THE ROLES ARE THE BROADEST OF THE TEN, AND EVERY TAB KEEPS ITS OWN ──────────────────────
  //
  // §5's first rule, and this is the portal it was written about: *"a portal reachable by six roles
  // whose tabs are gated to one is a WIDER door than six separately-gated pages, and it is the
  // single most dangerous thing in this plan."* This one decides money.
  //
  // The list here is `/admin/my-pay`'s — the broadest of the ten, because everybody may see their
  // own pay. Every other tab carries the exact list its page carried, so a `field_crew` member
  // opening this sees four tabs and an `admin` sees ten. The row cannot be narrower than the union
  // without removing somebody's access to their own payslip.
  { href: '/admin/pay', label: 'Pay & Payouts', workspace: 'money', section: 'Money out', iconName: 'Wallet', description: 'What everyone is owed and how they get it — your pay, payroll runs, payouts, withdrawals, rates and rewards.', roles: [...PAY_ROLES, 'employee', 'tech_support', 'finance'], internalOnly: true, keywords: ['pay', 'paycheck', 'salary', 'wage', 'payroll', 'payout', 'payouts', 'withdrawal', 'withdraw', 'balance', 'owed', 'rate', 'rates', 'raise', 'reward', 'rewards', 'xp', 'store', 'redeem', 'my pay', 'ledger', 'run', 'runs'] },

  // Money — reached from their parent list, so searchable rather than on the rail.
  // ── C6 PUT THIS BACK, OFF THE RAIL ────────────────────────────────────────────────────
  //
  // Dropped with the other nine, and that was wrong for one reason nothing about the sidebar would
  // have shown: `/admin/payouts/runs/[id]` and `.../[id]/dispatch` are RECORDS, which §4 says are not
  // touched — and the cron that prepares a batch links straight at one. With no ancestor in the
  // registry, that record has no breadcrumb and the notification audit cannot resolve the link.
  //
  // `showInRail: false`, so it is not a nav row: the LIST is the portal's `payout-runs` tab, and this
  // page forwards there. What it exists for is being the parent of a record.
  { href: '/admin/payouts/runs', label: 'Payout Runs', workspace: 'money', section: 'Money out', iconName: 'ListChecks', description: 'A payout batch and what came back from the bank.', roles: ['admin'], internalOnly: true, showInRail: false, keywords: ['batch', 'run'] },
  { href: '/admin/payouts/ad-hoc',        label: 'Ad-hoc Payout',    workspace: 'money', section: 'Money out', iconName: 'HandCoins',    description: 'Pay someone outside a run.', roles: ['admin'], internalOnly: true, showInRail: false, keywords: ['one off', 'manual'] },
  { href: '/admin/invoices/new',          label: 'New Customer Invoice',      workspace: 'money', section: 'Money in', iconName: 'FilePlus',     description: 'Draft a customer invoice.', roles: ['admin', 'developer', 'tech_support'], internalOnly: true, showInRail: false, keywords: ['create', 'bill', 'customer'] },
  // ── C1: three billing links became one ──────────────────────────────────────────────────────
  //
  // `/admin/billing/invoices` and `/admin/billing/plan-history` are tabs of `/admin/billing` and
  // have been since `billing-real-tabs-2026-06-21` — the routes remain as redirects so no bookmark
  // breaks, but a tab does not need its own sidebar entry. Their keywords moved up to the parent so
  // searching "plan history" still finds it.
  //
  // `/admin/billing/upgrade` is REMOVED FROM THE NAV BUT KEPT AS A ROUTE, and the distinction
  // matters. It is not a view of your subscription; it is the interstitial the bundle gate sends
  // you to when you open something the firm has not paid for — from anywhere in the app, carrying
  // `?requiredBundle=` and `?returnTo=`. Nobody navigates to it deliberately, so it was only ever
  // a sidebar link by accident. Making it a TAB would have been worse than leaving it alone:
  // somebody blocked from /admin/research would land on a billing portal with a tab bar instead of
  // on a sentence explaining what happened.

  // Communication.
  { href: '/admin/notifications',         label: 'Notifications',    workspace: 'office', section: 'Talking to people', iconName: 'Bell',         description: 'Everything the app has told YOU — alerts raised by the system, not messages a person sent.', keywords: ['alerts', 'bell', 'inbox'] },
  { href: '/admin/email/new',             label: 'Compose Email',    workspace: 'office', section: 'Talking to people', iconName: 'MailPlus',     description: 'Send an email to a customer or lead.', roles: ['admin', 'developer', 'tech_support'], internalOnly: true, showInRail: false, keywords: ['send', 'customer', 'reply'] },
  { href: '/admin/support/new',           label: 'New Support Ticket', workspace: 'office', section: 'Talking to people', iconName: 'MessageSquarePlus', description: 'Raise a support ticket.', showInRail: false, keywords: ['help', 'issue', 'report'] },
  { href: '/admin/me/privacy',            label: 'Privacy Settings', workspace: 'hub', iconName: 'EyeOff',          description: 'What colleagues can see about you.', showInRail: false, keywords: ['visibility', 'hidden', 'personal'] },

  // Field. `/admin/weather` was called "orphaned" by the audit — for a field business, weather is a
  // scheduling input, so it goes on the rail rather than staying a page nobody can find.
  { href: '/admin/weather',               label: 'Weather',          workspace: 'work', iconName: 'CloudSun',      description: 'Forecast for the crew’s working area.', roles: [...WORK_ROLES, 'tech_support'], internalOnly: true, keywords: ['rain', 'forecast', 'conditions'] },

  // Work Mode. The DOOR is on the rail; the per-role shells are entered through it, never chosen from
  // a menu — which is also the honest answer to the audit’s "is it a mode or a view?" until the
  // owner decides (Q44): it is a mode, and a mode has one entrance.

  // Equipment.
  { href: '/admin/equipment/templates/new', label: 'New Equipment Template', workspace: 'equipment', iconName: 'FilePlus', description: 'Define a new equipment template.', roles: EQUIPMENT_ROLES, internalOnly: true, showInRail: false, keywords: ['create', 'template'] },

  // Knowledge. The exam-prep tracks are destinations a student picks; the authoring tools are reached
  // from Manage Content.
  { href: '/admin/learn/exam-prep/sit',   label: 'SIT Exam Prep',    workspace: 'knowledge', iconName: 'FileCheck',  description: 'Surveyor-in-Training exam preparation.', keywords: ['fs', 'sit', 'fundamentals', 'license'] },
  { href: '/admin/learn/exam-prep/sit/mock-exam', label: 'SIT Mock Exam', workspace: 'knowledge', iconName: 'Timer',  description: 'Full-length timed SIT practice exam.', showInRail: false, keywords: ['practice', 'timed', 'simulator'] },
  { href: '/admin/learn/exam-prep/rpls',  label: 'RPLS Exam Prep',   workspace: 'knowledge', iconName: 'FileCheck',  description: 'Registered Professional Land Surveyor exam preparation.', keywords: ['rpls', 'license', 'professional'] },
  { href: '/admin/learn/flashcards/create', label: 'New Flashcard Deck', workspace: 'knowledge', iconName: 'Plus',   description: 'Build a flashcard deck.', showInRail: false, keywords: ['create', 'deck'] },

];

// ── Lookup helpers ──────────────────────────────────────────────────

const ROUTE_BY_HREF: Map<string, AdminRoute> = new Map(
  ADMIN_ROUTES.map((r) => [r.href, r]),
);

/** Returns the registry entry whose href exactly matches `href`. */
export function findRoute(href: string): AdminRoute | undefined {
  return ROUTE_BY_HREF.get(href);
}

/** Returns the workspace that owns the deepest-prefix route registered.
 *  Used by the breadcrumb resolver: a path like `/admin/jobs/abc/edit`
 *  resolves to the workspace of `/admin/jobs`. */
export function workspaceOf(pathname: string): Workspace | null {
  let best: AdminRoute | null = null;
  for (const route of ADMIN_ROUTES) {
    if (pathname === route.href || pathname.startsWith(route.href + '/')) {
      if (!best || route.href.length > best.href.length) best = route;
    }
  }
  return best ? best.workspace : null;
}

/** Filters routes by access. Admins see everything. Internal-only routes
 *  require a Starr Surveying email. Mirrors AdminSidebar.canAccess(). */
export function accessibleRoutes(opts: {
  roles: UserRole[];
  isCompanyUser: boolean;
  /**
   * ── T2: WHAT THIS FIRM ACTUALLY USES ─────────────────────────────────────────────────────────
   *
   * §11 of PAGE_CONSOLIDATION_2026-08-24.md. A FOURTH question, deliberately not folded into any of
   * the three above: `roles` asks *may you*, `requiredBundle` asks *did the firm pay*, `internalOnly`
   * asks *is this for staff* — and none of them can say *"this firm has simply decided not to run
   * this page yet"*.
   *
   * Applied HERE because the comment at the top of `AdminSidebar` already states the rule this
   * system runs on: *"gating happens once, in `accessibleRoutes`"*. Four nav surfaces call this —
   * sidebar, rail, command palette, workspace flyout — and filtering in each of them is four places
   * for a page to stay visible in one of them after being switched off.
   *
   * Optional, and absent means everything is on, so every existing caller keeps working unchanged
   * and a failed settings read cannot empty somebody's sidebar.
   */
  toggles?: FeatureToggles | null;
}): AdminRoute[] {
  const { roles, isCompanyUser, toggles } = opts;
  const isAdmin = roles.includes('admin');
  return ADMIN_ROUTES.filter((r) => {
    // Parked first, before any role logic: it hides the route from everybody including admins,
    // which is the point. `findRoute` still resolves it, so breadcrumbs and direct links work.
    if (r.parked) return false;
    // Switched off by this firm. Hidden from ADMINS TOO, which is the whole point of the setting —
    // an easier sidebar. Reaching a disabled page is by direct URL (§11.4), where an admin gets the
    // working page behind a banner; it is not something the nav keeps offering them.
    if (!isEnabled(toggles, r.href)) return false;
    if (r.internalOnly && !isCompanyUser) return false;
    if (!r.roles) return true;
    if (isAdmin) return true;
    return r.roles.some((needed) => roles.includes(needed));
  });
}

/** Returns routes in the same order as `ADMIN_ROUTES` filtered to a
 *  single workspace. Convenience for workspace landings + fly-outs. */
export function routesForWorkspace(workspace: Workspace): AdminRoute[] {
  return ADMIN_ROUTES.filter((r) => r.workspace === workspace);
}

// ── Breadcrumb trail (F1 — universal up-navigation) ─────────────────
//
// Every admin page gets a deterministic, clickable trail ending in the
// current page, so the shared header chrome can render one consistent
// "back / up" affordance instead of each page hand-rolling its own
// "Back to X" link. Spec: docs/planning/in-progress/
// SITEWIDE_UI_CONSISTENCY_AUDIT_2026-06-20.md §3 F1.

export interface Crumb {
  href: string;
  label: string;
  isCurrent: boolean;
}

/** Title-case a raw path segment: 'plan-history' → 'Plan History'. */
function titleCaseSegment(seg: string): string {
  return seg
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

/** Naive English singulariser for detail-page labels: 'templates' →
 *  'template', 'discussions' → 'discussion', 'employees' → 'employee'. */
function singularise(seg: string): string {
  const s = seg.toLowerCase();
  if (s.endsWith('ies')) return s.slice(0, -3) + 'y';
  if (s.endsWith('ses') || s.endsWith('xes') || s.endsWith('ches') || s.endsWith('shes')) {
    return s.slice(0, -2);
  }
  if (s.endsWith('s') && !s.endsWith('ss')) return s.slice(0, -1);
  return s;
}

/** Does this path segment look like an opaque identifier (uuid, numeric
 *  id, long hash, or an email used as a key) rather than a real page
 *  name? Such segments get a derived "<Parent> Detail" label. */
function looksLikeId(seg: string): boolean {
  return (
    /^[0-9a-f]{8,}$/i.test(seg) ||
    /^[0-9a-f-]{16,}$/i.test(seg) ||
    /^\d+$/.test(seg) ||
    seg.includes('@') ||
    seg.includes('%40') ||
    seg.length > 24
  );
}

/** Best label for any pathname: the registry label when registered,
 *  otherwise derived from the URL. Unregistered leaves that look like
 *  ids become "<Singular parent> Detail" (e.g. /admin/jobs/abc123 →
 *  "Job Detail"); everything else is title-cased from its segment. */
export function routeLabel(pathname: string): string {
  const clean = pathname.split('?')[0].split('#')[0];
  const registered = findRoute(clean);
  if (registered) return registered.label;
  const segs = clean.split('/').filter(Boolean);
  const last = segs[segs.length - 1] ?? 'admin';
  if (looksLikeId(last)) {
    const parent = segs[segs.length - 2];
    if (parent) return `${titleCaseSegment(singularise(parent))} Detail`;
    return 'Detail';
  }
  return titleCaseSegment(last);
}

/** Ordered breadcrumb trail for any admin pathname:
 *    workspace landing → registered ancestors (prefix chain) → current page.
 *  Always returns at least one crumb for an /admin path; returns [] for
 *  non-admin paths so non-admin surfaces don't accidentally render a
 *  trail. The last crumb is always `isCurrent`. */
export function breadcrumbTrail(pathname: string): Crumb[] {
  const path = pathname.split('?')[0].split('#')[0];
  if (!path.startsWith('/admin')) return [];

  const ws = workspaceOf(path) ?? 'hub';
  const wsHref = WORKSPACES[ws].href;
  const crumbs: Crumb[] = [
    { href: wsHref, label: WORKSPACES[ws].label, isCurrent: path === wsHref },
  ];

  // Registered ancestors: every route whose href is `path` or a strict
  // prefix of it, except the workspace landing (already the root crumb).
  // Sorted shallow → deep so the chain reads left-to-right.
  const ancestors = ADMIN_ROUTES.filter(
    (r) =>
      r.href !== wsHref &&
      (path === r.href || path.startsWith(r.href + '/')),
  ).sort((a, b) => a.href.length - b.href.length);

  for (const r of ancestors) {
    crumbs.push({ href: r.href, label: r.label, isCurrent: path === r.href });
  }

  // Unregistered leaf (detail / [id] page): append a derived crumb.
  const last = crumbs[crumbs.length - 1];
  if (last.href !== path) {
    crumbs.push({ href: path, label: routeLabel(path), isCurrent: true });
  }

  // Collapse any accidental consecutive duplicates by href, then force the
  // final crumb to be the current one.
  const deduped = crumbs.filter(
    (c, i) => i === 0 || c.href !== crumbs[i - 1].href,
  );
  return deduped.map((c, i) => ({ ...c, isCurrent: i === deduped.length - 1 }));
}

/** The immediate parent crumb (the one before the current page), or null
 *  when the current page is already the workspace root. Drives the shared
 *  "‹ back" affordance. */
export function parentCrumb(pathname: string): Crumb | null {
  const trail = breadcrumbTrail(pathname);
  if (trail.length < 2) return null;
  return trail[trail.length - 2];
}

// ── Fuzzy ranker (Cmd+K) ────────────────────────────────────────────

/** Scores how well a route matches the user's query. Higher is better.
 *  Returns 0 when the route doesn't match. The §12 acceptance test is:
 *  typing "rec" surfaces Receipts as the top result — so an exact-prefix
 *  label match beats a substring match elsewhere. */
export function scoreRoute(route: AdminRoute, query: string): number {
  const q = query.trim().toLowerCase();
  if (!q) return 0;
  const label = route.label.toLowerCase();
  const description = (route.description ?? '').toLowerCase();
  const keywords = (route.keywords ?? []).map((k) => k.toLowerCase());
  let score = 0;
  if (label === q) score += 200;
  else if (label.startsWith(q)) score += 100;
  else if (label.includes(q)) score += 40;
  for (const kw of keywords) {
    if (kw === q) score += 60;
    else if (kw.startsWith(q)) score += 30;
    else if (kw.includes(q)) score += 15;
  }
  if (description.includes(q)) score += 5;
  // Tie-breaker: prefer shorter labels so "rec" → "Receipts" (8 chars)
  // beats "Research & CAD" (14 chars) when both partially match.
  if (score > 0) score += Math.max(0, 30 - label.length);
  return score;
}

/** Ranks a route list by `scoreRoute`. Non-matching routes are dropped.
 *  Stable for equal scores (sort uses original index as tie-breaker).
 *
 *  When `recentRoutes` is provided, recent visits boost the score: a
 *  route at index 0 (most-recent) earns a +25 boost; index 1 → +22;
 *  each subsequent slot loses 3 points, floored at +0. This nudges
 *  the palette to surface what the user actually used recently while
 *  preserving exact-match ranking on the typed query. */
export function rankRoutes(
  routes: AdminRoute[],
  query: string,
  opts?: { recentRoutes?: string[] },
): AdminRoute[] {
  const q = query.trim();
  if (!q) return routes.slice();
  const recencyBoost = (href: string): number => {
    if (!opts?.recentRoutes) return 0;
    const idx = opts.recentRoutes.indexOf(href);
    if (idx < 0) return 0;
    return Math.max(0, 25 - idx * 3);
  };
  const scored = routes.map((route, index) => {
    const base = scoreRoute(route, q);
    // Only boost when the route actually matches the query — recency
    // should reorder hits, not surface unrelated recents.
    const boost = base > 0 ? recencyBoost(route.href) : 0;
    return { route, index, score: base + boost };
  });
  return scored
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((x) => x.route);
}

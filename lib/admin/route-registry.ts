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
  { href: '/admin/assignments',     label: 'Assignments',     workspace: 'hub', iconName: 'ClipboardList',  description: 'The jobs and tasks assigned to you. Reached from the menu as both Assignments and My Jobs.', roles: [...WORK_ROLES, 'researcher', 'tech_support'], internalOnly: true, keywords: ['todo', 'tasks', 'my jobs', 'assigned', 'mine'] },
  { href: '/admin/schedule',        label: 'My Schedule',     workspace: 'hub', iconName: 'Calendar',       description: 'Calendar of your shifts + appointments.', roles: [...WORK_ROLES, 'tech_support'], internalOnly: true, keywords: ['calendar', 'shifts'] },
  // consolidation Slice 2 (2026-05-30) — the legacy `/admin/my-*` +
  // `/admin/profile` page files were deleted; these entries now point
  // at the canonical hub tabs so the nav surface keeps showing the
  // shortcuts. The middleware LEGACY_REDIRECTS table catches external
  // 'My Jobs' pointed at /admin/me?tab=jobs and was folded into Assignments on 2026-08-04 — one
  // page, one entry. Its extra role (researcher) and its wording live on the entry above; two rows
  // for one href is how a menu comes to show the same destination twice under different names.
  // bookmarks at the old URLs.
  { href: '/admin/my-hours',         label: 'My Hours',        workspace: 'hub', iconName: 'Clock',          description: 'Log, fix, or add your hours — clock-in/out log + timesheet.', roles: [...WORK_ROLES, 'tech_support'], internalOnly: true, keywords: ['time', 'timesheet', 'fix hours', 'edit hours', 'correct hours', 'add hours', 'missed clock out', 'forgot to clock in'] },
  { href: '/admin/time-off',        label: 'Time Off',        workspace: 'hub', iconName: 'Palmtree',       description: 'Request time off + view your PTO balance. Managers see the approval queue here too.', internalOnly: true, keywords: ['pto', 'vacation', 'holiday', 'leave'] },
  { href: '/admin/my-pay',           label: 'My Pay',          workspace: 'hub', iconName: 'Wallet',         description: 'Your paycheck history + progression.', roles: [...PAY_ROLES, 'tech_support'], internalOnly: true, keywords: ['paycheck', 'salary', 'wage'] },
  { href: '/admin/my-notes',         label: 'My Notes',        workspace: 'hub', iconName: 'NotebookPen',    description: 'Personal notes.' },
  { href: '/admin/my-files',        label: 'My Files',        workspace: 'hub', iconName: 'Folder',         description: 'Your file uploads.' },
  // 'My Profile' pointed at /admin/me?tab=profile and was folded into 'Profile & Settings' on
  // 2026-08-04. One page, one entry; the old label survives as a keyword so searching it still
  // finds the page.
  { href: '/admin/files',           label: 'Files',           workspace: 'office', section: 'Documents & records', iconName: 'FolderOpen',     description: 'Company file explorer — browse, upload, organize, and share files with folder permissions.', roles: ['admin', 'developer', 'field_crew', 'drawer', 'researcher', 'equipment_manager', 'tech_support'], internalOnly: true, keywords: ['files', 'explorer', 'documents', 'folders', 'storage'] },
  { href: '/admin/install',         label: 'Get the App',     workspace: 'hub', iconName: 'Smartphone',     description: 'Install the Starr Field mobile app on your phone.', keywords: ['mobile', 'app', 'download', 'install', 'iphone', 'android', 'testflight', 'apk', 'starr field'] },
  { href: '/admin/learn/fieldbook', label: 'My Fieldbook',    workspace: 'hub', iconName: 'BookMarked',     description: 'Field notes + research bookmarks.', keywords: ['notes', 'research'] },

  // Work workspace ────────────────────────────────────────────────
  { href: '/admin/work',            label: 'Work',            workspace: 'work', iconName: 'Briefcase',     description: 'Active jobs + crew + dispatch.', keywords: ['operations', 'jobs', 'dispatch'] },
  // Slice P6 — surface the org-wide /admin/calendar page (already
  // shipped: month/week/day + fullscreen + phase legend) in the
  // Work rail. Previously it only existed as a file with no nav
  // entry, so users couldn't get to it without typing the URL.
  { href: '/admin/calendar',        label: 'Calendar',        workspace: 'work', iconName: 'CalendarDays',  description: 'Org-wide job schedule — year, month, week, day.', keywords: ['schedule', 'phases', 'events', 'jobs', 'planning'] },
  { href: '/admin/jobs',            label: 'All Jobs',        workspace: 'work', iconName: 'ListChecks',    description: 'Every active + archived job.', roles: ['admin', 'developer', 'tech_support'], internalOnly: true, keywords: ['projects'] },
  { href: '/admin/jobs/new',        label: 'New Job',         workspace: 'work', iconName: 'FilePlus',      description: 'Create a job.', roles: ['admin'], internalOnly: true, keywords: ['create', 'add'] },
  { href: '/admin/jobs/import',     label: 'Import Jobs',     workspace: 'work', iconName: 'Upload',        description: 'Bulk import jobs.', roles: ['admin'], internalOnly: true },
  { href: '/admin/leads',           label: 'Leads',           workspace: 'work', iconName: 'Inbox',         description: 'Inbound contact + lead queue.', roles: ['admin', 'developer', 'tech_support'], internalOnly: true, keywords: ['contacts', 'prospects'] },
  // A12 — the page the other three exist to make honest. Listed first of the four so the dashboard is
  // what someone lands on, not the export tool.
  { href: '/admin/marketing',       label: 'Marketing',       workspace: 'work', iconName: 'TrendingUp',    description: 'Funnel, cost per stage, repeat customers, attribution coverage.', roles: ['admin'], internalOnly: true, keywords: ['funnel', 'ads', 'google', 'cost per lead', 'roas', 'attribution', 'conversion'] },
  // A7 — registered here rather than left as a URL only I know about. This repo's most common defect is
  // finishing something nobody can click, and an export page nobody can find is an export nobody runs.
  { href: '/admin/marketing/exports', label: 'Ad conversions',  workspace: 'work', iconName: 'TrendingUp',    description: 'Download offline conversions for Google Ads.', roles: ['admin'], internalOnly: true, keywords: ['google', 'ads', 'conversions', 'marketing', 'export', 'attribution'] },
  // A8 — the only place a partial_failure rejection is visible. Google returns HTTP 200 while rejecting
  // rows, so an unfindable log is the same as no log.
  { href: '/admin/marketing/uploads', label: 'Ad upload log',   workspace: 'work', iconName: 'UploadCloud',   description: 'What the nightly Google Ads upload sent, and what Google rejected.', roles: ['admin'], internalOnly: true, keywords: ['google', 'ads', 'upload', 'conversions', 'errors', 'marketing'] },
  // A11 — the denominator. Cost per lead is meaningless without it, and the manual-entry form lives here.
  { href: '/admin/marketing/spend',   label: 'Ad spend',        workspace: 'work', iconName: 'DollarSign',    description: 'What the ads cost — imported nightly, or typed in from the invoice.', roles: ['admin'], internalOnly: true, keywords: ['google', 'ads', 'spend', 'cost', 'budget', 'marketing', 'cpl'] },
  // §2.4's fix. Not a fifth calendar: the four that exist each answer "what is happening over a
  // period" for ONE resource type, and the dispatcher's actual question — "for Thursday, what can I
  // send" — spans crew, equipment and vehicles at once. In the rail because it is asked daily.
  { href: '/admin/availability',    label: 'Availability',    workspace: 'work', iconName: 'CalendarClock', description: 'Who and what can go out on one day — crew, equipment and vehicles together, with the reason for anything that cannot.', roles: ['admin', 'developer', 'tech_support', 'equipment_manager'], internalOnly: true, keywords: ['dispatch', 'free', 'available', 'thursday', 'who is free', 'schedule', 'crew', 'assign', 'book'] },
  // The pay model is two screens: this one sets what each ACTIVITY pays, /admin/payroll sets what
  // each PERSON is on. Registered so it is reachable and searchable — an unlinked settings page is
  // a setting nobody can change.
  { href: '/admin/pay-rates',       label: 'Pay Rates',       workspace: 'work', iconName: 'DollarSign',    description: 'What each activity pays — the person’s base pay, or a set rate everyone gets.', roles: ['admin', 'developer'], internalOnly: true, keywords: ['rate', 'rates', 'pay', 'hourly', 'driving', 'activity', 'work type', 'base pay', 'money'] },
  { href: '/admin/hours-approval',  label: 'Hours Approval',  workspace: 'work', iconName: 'CheckSquare',   description: 'Approve submitted timesheets.', roles: ['admin', 'developer', 'tech_support'], internalOnly: true, keywords: ['timesheet', 'approve'] },
  { href: '/admin/team',            label: 'Field Team',      workspace: 'work', iconName: 'Users',         description: 'Live status of crew in the field.', roles: ['admin', 'developer', 'tech_support'], internalOnly: true, keywords: ['crew', 'roster'] },
  { href: '/admin/field-data',      label: 'Field Data',      workspace: 'work', iconName: 'MapPin',        description: 'Field data review + approval.', roles: ['admin', 'developer', 'tech_support'], internalOnly: true, keywords: ['points', 'gnss'] },
  { href: '/admin/timeline',        label: 'Activity Timeline', workspace: 'work', iconName: 'Activity',    description: 'What the firm did today — clock-ins, job stage changes, uploads. A working feed, not a compliance record: the Audit Log is that.', roles: ['admin', 'developer', 'tech_support'], internalOnly: true, keywords: ['daily', 'feed'] },
  { href: '/admin/mileage',         label: 'Mileage',         workspace: 'money', section: 'Money out', iconName: 'Car',           description: 'Mileage logs + reimbursement.', roles: ['admin', 'developer', 'tech_support'], internalOnly: true },
  { href: '/admin/finances',        label: 'Job Profitability',        workspace: 'money', section: 'Profitability', iconName: 'Briefcase',     description: 'What each job cost against what it earned. NOT invoicing — this is the answer to "are we pricing right?".', roles: ['admin', 'developer', 'tech_support'], internalOnly: true, keywords: ['invoice', 'money'] },
  { href: '/admin/vehicles',        label: 'Vehicles',        workspace: 'work', iconName: 'Truck',         description: 'Vehicle fleet roster.', roles: ['admin', 'developer', 'tech_support'], internalOnly: true, keywords: ['fleet', 'trucks'] },
  // On the rail, not palette-only. §1.4's split says destinations somebody navigates TO get a rail
  // slot, and "what expires soon" is checked on purpose rather than arrived at from somewhere else —
  // a licence nobody thinks to look for is the whole failure mode this page exists to prevent.
  { href: '/admin/compliance',      label: 'Compliance',      workspace: 'work', iconName: 'ShieldCheck',   description: 'Licences, certifications, insurance, vehicle registration and instrument calibration — every date that expires.', roles: ['admin', 'developer', 'tech_support'], internalOnly: true, keywords: ['licence', 'license', 'rpls', 'certification', 'insurance', 'coi', 'expiry', 'expires', 'renewal', 'calibration', 'inspection', 'registration', 'ce hours'] },
  // "Receivables", not "AR". §2.2 measured what happens when this app invents finance vocabulary —
  // three words that all sound like money and mean different things. AR is jargon only an accountant
  // reads; the keywords carry it so ⌘K still finds it.
  { href: '/admin/receivables',     label: 'Receivables',     workspace: 'money', section: 'Money in', iconName: 'Banknote',     description: 'Who owes money and how late — unpaid invoices aged from their due date.', roles: ['admin', 'developer'], internalOnly: true, keywords: ['ar', 'aging', 'ageing', 'collections', 'overdue', 'owed', 'unpaid', 'outstanding', 'past due', 'chase'] },

  // Equipment workspace ───────────────────────────────────────────
  { href: '/admin/equipment',                          label: 'Catalogue',         workspace: 'equipment', iconName: 'Package',       description: 'All firm equipment.', roles: EQUIPMENT_ROLES, internalOnly: true, keywords: ['gear', 'inventory'] },
  { href: '/admin/equipment/today',                    label: 'Equipment Today',   workspace: 'equipment', iconName: 'CalendarClock', description: 'Today\'s checkouts + returns.', roles: EQUIPMENT_ROLES, internalOnly: true },
  { href: '/admin/equipment/checked-out',              label: 'Check In / Out',    workspace: 'equipment', iconName: 'ArrowLeftRight', description: 'Check equipment out to crews / vehicles / maintenance and back in.', roles: EQUIPMENT_ROLES, internalOnly: true, keywords: ['checkout', 'check out', 'check in', 'lend', 'assign', 'return', 'borrow'] },
  { href: '/admin/equipment/timeline',                 label: 'Equipment Timeline', workspace: 'equipment', iconName: 'GanttChart',   description: 'Gantt view of equipment over time.', roles: EQUIPMENT_ROLES, internalOnly: true },
  { href: '/admin/equipment/maintenance',              label: 'Maintenance',       workspace: 'equipment', iconName: 'Wrench',        description: 'Maintenance schedule + history.', roles: EQUIPMENT_ROLES, internalOnly: true },
  { href: '/admin/equipment/consumables',              label: 'Consumables',       workspace: 'equipment', iconName: 'Boxes',         description: 'Consumable inventory.', roles: EQUIPMENT_ROLES, internalOnly: true },
  { href: '/admin/equipment/templates',                label: 'Templates',         workspace: 'equipment', iconName: 'Files',         description: 'Equipment templates.', roles: EQUIPMENT_ROLES, internalOnly: true },
  { href: '/admin/equipment/templates/cleanup-queue',  label: 'Cleanup Queue',     workspace: 'equipment', iconName: 'Sparkles',      description: 'Templates pending cleanup.', roles: EQUIPMENT_ROLES, internalOnly: true },
  { href: '/admin/equipment/overrides',                label: 'Overrides Audit',   workspace: 'equipment', iconName: 'AlertTriangle', description: 'Equipment override audit log.', roles: EQUIPMENT_ROLES, internalOnly: true },
  { href: '/admin/equipment/fleet-valuation',          label: 'Fleet Valuation',   workspace: 'equipment', iconName: 'TrendingUp',    description: 'Fleet asset valuation.', roles: EQUIPMENT_ROLES, internalOnly: true },
  { href: '/admin/personnel/crew-calendar',            label: 'Crew Calendar',     workspace: 'equipment', iconName: 'Users',         description: 'Crew availability calendar.', roles: EQUIPMENT_ROLES, internalOnly: true, keywords: ['schedule', 'roster'] },
  { href: '/admin/equipment/inventory',                label: 'Inventory Edit',    workspace: 'equipment', iconName: 'PackageOpen',   description: 'Equipment inventory editor.', roles: EQUIPMENT_ROLES, internalOnly: true, showInRail: false },
  { href: '/admin/equipment/import',                   label: 'Import Equipment',  workspace: 'equipment', iconName: 'Upload',        description: 'Bulk import equipment.', roles: ['admin'], internalOnly: true, showInRail: false },

  // Research & CAD workspace ──────────────────────────────────────
  { href: '/admin/research-cad',         label: 'Research & CAD',   workspace: 'research-cad', iconName: 'Compass',     description: 'Research projects + CAD drawings landing.', keywords: ['cad', 'research'] },
  { href: '/admin/research',             label: 'Property Research', workspace: 'research-cad', iconName: 'Microscope',  description: 'Property research projects.', roles: [...RESEARCH_ROLES, 'field_crew', 'tech_support'], internalOnly: true, keywords: ['property', 'records'] },
  { href: '/admin/research/testing',     label: 'Testing Lab',      workspace: 'research-cad', iconName: 'FlaskConical', description: 'Test research pipelines + adapters.', roles: ['admin', 'developer', 'tech_support'], internalOnly: true, keywords: ['lab', 'experiments'] },
  { href: '/admin/research/self-heal',   label: 'Site Health',      workspace: 'research-cad', iconName: 'ShieldCheck',  description: 'Run a one-time check across every county portal and toggle automatic self-healing.', roles: ['admin', 'developer', 'tech_support'], internalOnly: true, keywords: ['self-heal', 'monitoring', 'sweep', 'adapters', 'health'] },
  // Roadmap §8.1 (Pillar A). Sits beside Site Health deliberately: that page answers "is a county
  // portal still working", this one answers "which county portals do we have at all", and the two
  // read the same registry. Same roles as Site Health — registering a data source decides what the
  // coverage dashboard promises customers, which is not a general-staff action.
  // Palette-only, like Coverage and Pipeline beside it: registering a portal is a rare setup action,
  // and the rail is a place you go daily. It is reached from the coverage page's health panel, which
  // is where the question "why can't we search this county" actually gets asked.
  { href: '/admin/research/sites',       label: 'Data Sources',     workspace: 'research-cad', iconName: 'Globe',       description: 'Register a county portal — CAD, clerk, plat or GIS — and see which ones this firm can read.', roles: ['admin', 'developer', 'tech_support'], internalOnly: true, showInRail: false, keywords: ['county', 'portal', 'adapter', 'vendor', 'register', 'source'] },
  // Slice W4 (hub-cad-roles-polish-2026-06-18) — user spec: "If
  // a user does not have the drawing role and clicks the cad
  // button … they are still routed to the cad software. We might
  // change this in the future, but for now leave it." `roles:`
  // is intentionally absent so EVERY signed-in user sees the CAD
  // entry; re-add the role gate when the broader permissions
  // story (W7) lands.
  { href: '/admin/cad',                  label: 'CAD Editor',       workspace: 'research-cad', iconName: 'PenTool',     description: 'CAD drawing editor.', internalOnly: true, keywords: ['drawing', 'plat'] },
  { href: '/admin/research/billing',     label: 'Research Billing', workspace: 'research-cad', iconName: 'Receipt',     description: 'Research cost + billing rollup.', roles: ['admin', 'developer', 'tech_support'], internalOnly: true, showInRail: false },
  { href: '/admin/research/coverage',    label: 'Coverage',         workspace: 'research-cad', iconName: 'Map',         description: 'County coverage map.', roles: [...RESEARCH_ROLES, 'tech_support'], internalOnly: true, showInRail: false },
  { href: '/admin/research/library',     label: 'Library',          workspace: 'research-cad', iconName: 'Library',     description: 'Research document library.', roles: [...RESEARCH_ROLES, 'tech_support'], internalOnly: true, showInRail: false },
  { href: '/admin/research/pipeline',    label: 'Pipeline',         workspace: 'research-cad', iconName: 'Workflow',    description: 'Pipeline run dashboard.', roles: ['admin', 'developer', 'tech_support'], internalOnly: true, showInRail: false },

  // Knowledge workspace ───────────────────────────────────────────
  { href: '/admin/learn',                label: 'Learning Hub',     workspace: 'knowledge', iconName: 'GraduationCap', description: 'Learning portal home.', keywords: ['education', 'training'] },
  { href: '/admin/learn/roadmap',        label: 'My Roadmap',       workspace: 'knowledge', iconName: 'Route',        description: 'Personal learning roadmap.' },
  { href: '/admin/learn/modules',        label: 'Modules',          workspace: 'knowledge', iconName: 'BookOpen',     description: 'Course modules.' },
  { href: '/admin/learn/knowledge-base', label: 'Knowledge Base',   workspace: 'knowledge', iconName: 'BookText',     description: 'Reference articles.', keywords: ['kb', 'articles', 'docs'] },
  { href: '/admin/learn/flashcards',     label: 'Flashcards',       workspace: 'knowledge', iconName: 'Layers',       description: 'Spaced-repetition decks.' },
  { href: '/admin/learn/exam-prep',      label: 'Exam Prep',        workspace: 'knowledge', iconName: 'FileCheck',    description: 'Exam preparation suite.', keywords: ['fs', 'rpls', 'license'] },
  { href: '/admin/learn/quiz-history',   label: 'Quiz History',     workspace: 'knowledge', iconName: 'History',      description: 'Past quiz attempts.' },
  { href: '/admin/learn/search',         label: 'Knowledge Search', workspace: 'knowledge', iconName: 'Search',       description: 'Search across learning content.' },
  { href: '/admin/learn/students',       label: 'Student Progress', workspace: 'knowledge', iconName: 'UsersRound',   description: 'Student progress dashboard.', roles: [...CONTENT_MGMT_ROLES, 'tech_support'] },
  { href: '/admin/learn/manage',         label: 'Manage Content',   workspace: 'knowledge', iconName: 'Pencil',       description: 'Author + edit learning content.', roles: [...CONTENT_MGMT_ROLES, 'tech_support'] },
  { href: '/admin/learn/flashcard-bank', label: 'Flashcard Bank',   workspace: 'knowledge', iconName: 'Layers',       description: 'Master flashcard bank.', showInRail: false },
  { href: '/admin/learn/practice',       label: 'Practice',         workspace: 'knowledge', iconName: 'Play',         description: 'Quick-practice session.', showInRail: false },

  // Office workspace ──────────────────────────────────────────────
  { href: '/admin/office',                label: 'Office',           workspace: 'office', iconName: 'Building',     description: 'HR, comms, files, settings.', keywords: ['back-office', 'hr', 'admin'] },
  // Money workspace landing (platform audit §2.2 / item 7).
  { href: '/admin/money',                 label: 'Money',            workspace: 'money', iconName: 'Wallet',       description: 'Everything financial in one place — what customers owe you, what you pay out, whether jobs made money, and what this software costs.', roles: ['admin', 'developer', 'field_crew', 'tech_support'], keywords: ['finance', 'financial', 'invoice', 'invoicing', 'billing', 'payroll', 'payouts', 'receipts', 'mileage', 'ar', 'cash'] },
  // Platform audit §2.3 / item 7 — the one directory. /admin/employees, /admin/team and
  // /admin/contacts are now filters on it; they keep their own pages (each does something this one
  // does not) but this is the front door, so nobody has to know which of the ten to open.
  { href: '/admin/people',                label: 'People',           workspace: 'office', section: 'People', iconName: 'Users',        description: 'Everyone the firm deals with — staff and contacts — in one list.', keywords: ['directory', 'employees', 'staff', 'contacts', 'team', 'phone', 'who'] },
  { href: '/admin/employees',             label: 'Employees',        workspace: 'office', section: 'People', iconName: 'UsersRound',   description: 'Employee directory.', roles: ['admin', 'developer', 'tech_support'], internalOnly: true },
  { href: '/admin/employees/manage',      label: 'Manage Employee',  workspace: 'office', section: 'People', iconName: 'UserCog',      description: 'Edit an employee record.', roles: ['admin', 'developer', 'tech_support'], internalOnly: true, showInRail: false },
  { href: '/admin/users',                 label: 'Manage Users',     workspace: 'office', section: 'People', iconName: 'KeyRound',     description: 'User accounts + roles.', roles: ['admin', 'tech_support'] },
  // Slice W7 (hub-cad-roles-polish-2026-06-18) — role builder.
  // Admin-only; surfaces alongside Manage Users in the Office
  // workspace.
  { href: '/admin/roles/custom',          label: 'Role Builder',     workspace: 'office', section: 'People', iconName: 'ShieldPlus',   description: 'Define new roles on top of the built-in role list.', roles: ['admin'], internalOnly: true, keywords: ['permissions', 'roles', 'custom'] },
  { href: '/admin/payroll',               label: 'Payroll',          workspace: 'money', section: 'Money out', iconName: 'BadgeDollarSign', description: 'Payroll runs.', roles: ['admin'], internalOnly: true, keywords: ['paychecks', 'wages'] },
  // PARKED 2026-08-04. The graduated model — role tiers, seniority brackets, credential bonuses,
  // XP milestones — is on hold at the owner's request in favour of base pay plus a handful of set
  // activity rates. The page and its data are intact; it is simply not offered anywhere. See
  // docs/planning/in-progress/PAY_MODEL_CONSOLIDATION_2026-08-04.md.
  { href: '/admin/pay-progression',       label: 'Pay Progression',  workspace: 'money', section: 'Money out', iconName: 'TrendingUp',   description: 'Pay rate progression model.', roles: [...PAY_ROLES, 'tech_support'], internalOnly: true, parked: true, keywords: ['raises', 'progression'] },
  { href: '/admin/payout-log',            label: 'Payout History',   workspace: 'money', section: 'Money out', iconName: 'ScrollText',   description: 'Historical payout log.', roles: [...PAY_ROLES, 'tech_support'], internalOnly: true },
  { href: '/admin/receipts',              label: 'Receipts',         workspace: 'money', section: 'Money out', iconName: 'Receipt',      description: 'Receipt approval queue.', roles: ['admin', 'developer', 'tech_support'], internalOnly: true, keywords: ['expenses', 'approvals'] },
  { href: '/admin/receipts/new',          label: 'Capture Receipt',  workspace: 'money', section: 'Money out', iconName: 'Camera',       description: 'Upload a receipt photo for approval.', roles: ['admin', 'developer', 'field_crew', 'drawer', 'researcher', 'equipment_manager', 'tech_support'], internalOnly: true, showInRail: false, keywords: ['upload', 'photo', 'expense'] },
  { href: '/admin/invoicing',             label: 'Customer Invoices',        workspace: 'money', section: 'Money in', iconName: 'FileText',     description: 'Bill your customers and track what they have paid. NOT the subscription you pay for this software — that is Software Subscription.', roles: ['admin', 'developer', 'tech_support'], internalOnly: true, keywords: ['invoice', 'pay', 'billing', 'customer', 'deposit'] },
  // F1b / F2b, registered 2026-08-04 — the orphan guard caught both the day after they shipped.
  // A page nobody can navigate to is this repo's signature defect, and building the page is the
  // half that feels like finishing.
  { href: '/admin/cards',                 label: 'Payment Cards',    workspace: 'money', section: 'Money out', iconName: 'CreditCard',   description: 'Every card the firm has seen on a receipt, whose it is, and what a charge on it means for the books — a company card is an expense, a personal card is money owed back to a person, a client\'s card is not our transaction.', roles: ['admin'], internalOnly: true, showInRail: false, keywords: ['card', 'credit', 'debit', 'tax', 'reimburse'] },
  { href: '/admin/pass-through',          label: 'Pass-Through Costs', workspace: 'money', section: 'Money out', iconName: 'ArrowLeftRight', description: 'Money paid on a customer\'s behalf — a sanitarian, a filing fee — and what was billed back. Only a wash when the two match to the cent.', roles: ['admin'], internalOnly: true, showInRail: false, keywords: ['sanitarian', 'recovery', 'reimbursable', 'no net gain'] },
  { href: '/admin/rewards',               label: 'Rewards & Store',  workspace: 'money', section: 'Money out', iconName: 'Trophy',       description: 'Rewards portal + company store.', roles: [...PAY_ROLES, 'tech_support'], internalOnly: true, keywords: ['points', 'store'] },
  { href: '/admin/rewards/admin',         label: 'Manage Rewards',   workspace: 'money', section: 'Money out', iconName: 'Settings2',    description: 'Configure rewards + store catalog.', roles: ['admin', 'developer', 'tech_support'], internalOnly: true },
  { href: '/admin/rewards/how-it-works',  label: 'How Rewards Work', workspace: 'money', section: 'Money out', iconName: 'HelpCircle',   description: 'Rewards program explainer.', roles: [...PAY_ROLES, 'tech_support'], internalOnly: true },
  { href: '/admin/messages',              label: 'Messages',         workspace: 'office', section: 'Talking to people', iconName: 'MessageSquare', description: 'Chat with a teammate, one-to-one or in a group. NOT email to a customer (Compose Email), and NOT a topic thread that outlives the day (Discussions).', roles: INTERNAL_COMM_ROLES, internalOnly: true, keywords: ['chat', 'dm'] },
  // consolidation Slice 6 (2026-05-30) — clarified description so it
  // reads distinctly from the firm-wide `/admin/contacts` CRM. This
  // surface is for picking a teammate to message; the CRM page is for
  // realtors / clients / students.
  { href: '/admin/messages/contacts',     label: 'Team Directory',   workspace: 'office', section: 'Talking to people', iconName: 'Contact',      description: 'Internal teammate directory — pick someone to message.', roles: INTERNAL_COMM_ROLES, internalOnly: true },
  { href: '/admin/messages/new',          label: 'New Message',      workspace: 'office', section: 'Talking to people', iconName: 'MessageSquarePlus', description: 'Start a new conversation.', roles: INTERNAL_COMM_ROLES, internalOnly: true, showInRail: false },
  { href: '/admin/messages/settings',     label: 'Message Settings', workspace: 'office', section: 'Talking to people', iconName: 'Settings',     description: 'Messaging preferences.', roles: INTERNAL_COMM_ROLES, internalOnly: true, showInRail: false },
  // contacts plan 2026-05-30 — firm-wide contacts (realtors, repeat
  // clients, students, teachers, employees). Profile per person + a
  // job ↔ contact join. See docs/planning/in-progress/contacts-…
  { href: '/admin/contacts',              label: 'Contacts',         workspace: 'office', section: 'People', iconName: 'Users',        description: 'Saved contacts — realtors, clients, students, teachers, employees.', keywords: ['address book', 'people', 'realtors', 'clients'] },
  { href: '/admin/discussions',           label: 'Discussions',      workspace: 'office', section: 'Talking to people', iconName: 'MessagesSquare', description: 'A topic thread that outlives a chat — decisions, standards, how-we-do-it. NOT a direct message, and not announcements.', roles: INTERNAL_COMM_ROLES, internalOnly: true, keywords: ['threads', 'forum'] },
  { href: '/admin/notes',                 label: 'Company Notes',    workspace: 'office', section: 'Documents & records', iconName: 'StickyNote',   description: 'Shared notes every admin can read and edit. Your own private notes live in the Hub; a document with a filename belongs in Files.', roles: ['admin', 'developer', 'tech_support'], internalOnly: true },
  { href: '/admin/settings',              label: 'Settings',         workspace: 'office', section: 'Setup & account', iconName: 'Settings',     description: 'Firm-wide settings.', roles: ['admin'] },
  { href: '/admin/error-log',             label: 'Error Log',        workspace: 'office', section: 'What happened', iconName: 'Bug',          description: 'Errors the software itself hit — stack traces and failed requests. For who-did-what, see the Audit Log; for what the crew did, the Activity Timeline.', roles: ['admin', 'developer', 'tech_support'] },
  { href: '/admin/audit',                 label: 'Audit Log',        workspace: 'office', section: 'What happened', iconName: 'ShieldCheck',  description: 'Who did what, and when — permission changes, record edits, operator access. The one to open for a compliance question.', roles: ['admin', 'developer', 'tech_support'], keywords: ['compliance', 'history', 'log'] },
  { href: '/admin/invites',               label: 'Invites',          workspace: 'office', section: 'People', iconName: 'UserPlus',     description: 'Pending + historical org user invites.', roles: ['admin', 'tech_support'], keywords: ['onboard', 'invite'] },
  { href: '/admin/payouts',               label: 'Payouts',          workspace: 'money', section: 'Money out', iconName: 'Banknote',     description: 'Record employee payouts (Venmo / Stripe / check / cash).', roles: ['admin'], internalOnly: true, keywords: ['pay', 'venmo', 'stripe'] },
  { href: '/admin/announcements',         label: 'Announcements',    workspace: 'office', section: 'Talking to people', iconName: 'Megaphone',    description: 'One-way broadcast to everyone at the firm — release notes and news. Nobody replies to these; use Messages or Discussions for that.', keywords: ['release', 'changelog', 'news'] },
  { href: '/admin/billing',               label: 'Software Subscription',          workspace: 'money', section: 'Company account', iconName: 'CreditCard',   description: 'What THIS FIRM pays for this software — plan, card, invoices. Nothing to do with what customers pay you.', roles: ['admin', 'tech_support'], keywords: ['subscription', 'invoice', 'plan'] },
  { href: '/admin/org-settings',          label: 'Org Settings',     workspace: 'office', section: 'Setup & account', iconName: 'Building',     description: 'Per-organization configuration.', roles: ['admin'], keywords: ['org', 'tenant', 'company'] },
  { href: '/admin/orgs',                  label: 'Organizations',    workspace: 'office', section: 'Setup & account', iconName: 'Building2',    description: 'Cross-org switcher + multi-tenant overview.', roles: ['admin', 'tech_support'], internalOnly: true, keywords: ['tenants', 'switch'] },
  { href: '/admin/reports',               label: 'Reports',          workspace: 'office', section: 'Documents & records', iconName: 'FileBarChart', description: 'Owner reports + KPI dashboards.', roles: ['admin', 'developer', 'tech_support'], internalOnly: true, keywords: ['kpi', 'metrics', 'analytics'] },
  { href: '/admin/support',               label: 'Support',          workspace: 'office', section: 'Talking to people', iconName: 'LifeBuoy',     description: 'Raise a ticket about this software with the people who build it. NOT for talking to a customer of yours.', keywords: ['tickets', 'help', 'issues'] },

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
  { href: '/admin/finances/overview',     label: 'Money Overview',   workspace: 'money', section: 'Profitability', iconName: 'PieChart',     description: 'Money in and out at a glance (G2).', roles: ['admin', 'developer', 'tech_support'], internalOnly: true, keywords: ['cash', 'income', 'expenses', 'overview', 'g2'] },
  // Labelled "Bank Reconciliation", not "Reconcile", for two reasons that point the same way. The
  // Cmd+K acceptance criterion is that typing "rec" surfaces RECEIPTS — the far more common
  // destination — and a bare "Reconcile" beat it, which the ranker test caught immediately. And §2.2 of
  // the audit is specifically about colliding money vocabulary: "reconcile" alone could mean the bank,
  // the subscription, or a payout run.
  { href: '/admin/finances/reconcile',    label: 'Bank Reconciliation', workspace: 'money', section: 'Profitability', iconName: 'Scale',     description: 'Match recorded payments against the bank statement (G3).', roles: ['admin', 'developer', 'tech_support'], internalOnly: true, keywords: ['bank', 'reconcile', 'reconciliation', 'statement', 'g3'] },
  { href: '/admin/payouts/tax-report',    label: 'Payout Tax Report', workspace: 'money', section: 'Money out', iconName: 'FileSpreadsheet', description: 'Year-end payout totals per person (G5).', roles: ['admin'], internalOnly: true, keywords: ['1099', 'tax', 'year end', 'g5'] },

  // Money — reached from their parent list, so searchable rather than on the rail.
  { href: '/admin/payments/inbox',        label: 'Payments Inbox',   workspace: 'money', section: 'Money in', iconName: 'Inbox',        description: 'Customer pledges and "I sent it" claims waiting on the office.', roles: ['admin', 'developer', 'tech_support'], internalOnly: true, keywords: ['pledge', 'venmo', 'claim', 'confirm'] },
  { href: '/admin/payouts/runs',          label: 'Payout Runs',      workspace: 'money', section: 'Money out', iconName: 'ListChecks',   description: 'Batched payout runs.', roles: ['admin'], internalOnly: true, keywords: ['batch', 'run'] },
  { href: '/admin/payouts/ad-hoc',        label: 'Ad-hoc Payout',    workspace: 'money', section: 'Money out', iconName: 'HandCoins',    description: 'Pay someone outside a run.', roles: ['admin'], internalOnly: true, showInRail: false, keywords: ['one off', 'manual'] },
  { href: '/admin/invoices/new',          label: 'New Customer Invoice',      workspace: 'money', section: 'Money in', iconName: 'FilePlus',     description: 'Draft a customer invoice.', roles: ['admin', 'developer', 'tech_support'], internalOnly: true, keywords: ['create', 'bill', 'customer'] },
  { href: '/admin/invoicing/categories',  label: 'Invoice Line Categories', workspace: 'money', section: 'Money in', iconName: 'Tags',       description: 'Line-item categories for invoices.', roles: ['admin', 'developer', 'tech_support'], internalOnly: true, showInRail: false, keywords: ['line items', 'tags'] },
  { href: '/admin/billing/invoices',      label: 'Subscription Invoices', workspace: 'money', section: 'Company account', iconName: 'ReceiptText', description: 'Invoices for THIS app’s subscription — not customer invoices.', roles: ['admin', 'tech_support'], showInRail: false, keywords: ['subscription', 'saas', 'plan'] },
  { href: '/admin/billing/plan-history',  label: 'Plan History',     workspace: 'money', section: 'Company account', iconName: 'History',      description: 'Subscription plan changes over time.', roles: ['admin', 'tech_support'], showInRail: false, keywords: ['subscription', 'upgrade', 'downgrade'] },
  { href: '/admin/billing/upgrade',       label: 'Upgrade Plan',     workspace: 'money', section: 'Company account', iconName: 'ArrowUpCircle', description: 'Change the subscription bundle.', roles: ['admin', 'tech_support'], showInRail: false, keywords: ['subscription', 'bundle', 'plan'] },

  // Communication.
  { href: '/admin/notifications',         label: 'Notifications',    workspace: 'office', section: 'Talking to people', iconName: 'Bell',         description: 'Everything the app has told YOU — alerts raised by the system, not messages a person sent.', keywords: ['alerts', 'bell', 'inbox'] },
  { href: '/admin/email/new',             label: 'Compose Email',    workspace: 'office', section: 'Talking to people', iconName: 'MailPlus',     description: 'Send an email to a customer or lead.', roles: ['admin', 'developer', 'tech_support'], internalOnly: true, showInRail: false, keywords: ['send', 'customer', 'reply'] },
  { href: '/admin/email/sent',            label: 'Sent Email',       workspace: 'office', section: 'Talking to people', iconName: 'MailCheck',    description: 'Outbound email history.', roles: ['admin', 'developer', 'tech_support'], internalOnly: true, showInRail: false, keywords: ['outbox', 'history'] },
  { href: '/admin/support/new',           label: 'New Support Ticket', workspace: 'office', section: 'Talking to people', iconName: 'MessageSquarePlus', description: 'Raise a support ticket.', showInRail: false, keywords: ['help', 'issue', 'report'] },
  { href: '/admin/me/privacy',            label: 'Privacy Settings', workspace: 'hub', iconName: 'EyeOff',          description: 'What colleagues can see about you.', showInRail: false, keywords: ['visibility', 'hidden', 'personal'] },

  // Field. `/admin/weather` was called "orphaned" by the audit — for a field business, weather is a
  // scheduling input, so it goes on the rail rather than staying a page nobody can find.
  { href: '/admin/weather',               label: 'Weather',          workspace: 'work', iconName: 'CloudSun',      description: 'Forecast for the crew’s working area.', roles: [...WORK_ROLES, 'tech_support'], internalOnly: true, keywords: ['rain', 'forecast', 'conditions'] },

  // Work Mode. The DOOR is on the rail; the per-role shells are entered through it, never chosen from
  // a menu — which is also the honest answer to the audit’s "is it a mode or a view?" until the
  // owner decides (Q44): it is a mode, and a mode has one entrance.
  { href: '/admin/work-mode/start',       label: 'Work Mode',        workspace: 'work', iconName: 'HardHat',       description: 'Enter the focused field shell for your role.', roles: [...WORK_ROLES, 'drawer', 'researcher', 'equipment_manager', 'tech_support'], internalOnly: true, keywords: ['field', 'crew', 'mobile', 'focus'] },
  { href: '/admin/work-mode',             label: 'Work Mode Home',   workspace: 'work', iconName: 'HardHat',       description: 'Work Mode landing.', roles: [...WORK_ROLES, 'drawer', 'researcher', 'equipment_manager', 'tech_support'], internalOnly: true, showInRail: false },
  { href: '/admin/work-mode/field_crew',  label: 'Work Mode — Field Crew',   workspace: 'work', iconName: 'HardHat', description: 'Field crew shell.', roles: ['admin', 'developer', 'field_crew'], internalOnly: true, showInRail: false },
  { href: '/admin/work-mode/drawer',      label: 'Work Mode — Drafting',     workspace: 'work', iconName: 'PenTool', description: 'Drafting shell.', roles: ['admin', 'developer', 'drawer'], internalOnly: true, showInRail: false },
  { href: '/admin/work-mode/researcher',  label: 'Work Mode — Research',     workspace: 'work', iconName: 'Search',  description: 'Research shell.', roles: ['admin', 'developer', 'researcher'], internalOnly: true, showInRail: false },
  { href: '/admin/work-mode/equipment_manager', label: 'Work Mode — Equipment', workspace: 'work', iconName: 'Truck', description: 'Equipment manager shell.', roles: ['admin', 'developer', 'equipment_manager'], internalOnly: true, showInRail: false },
  { href: '/admin/work-mode/tech_support', label: 'Work Mode — Support',     workspace: 'work', iconName: 'LifeBuoy', description: 'Tech support shell.', roles: ['admin', 'developer', 'tech_support'], internalOnly: true, showInRail: false },
  { href: '/admin/work-mode/admin',       label: 'Work Mode — Admin',       workspace: 'work', iconName: 'ShieldCheck', description: 'Admin shell.', roles: ['admin'], internalOnly: true, showInRail: false },
  { href: '/admin/work-mode/developer',   label: 'Work Mode — Developer',   workspace: 'work', iconName: 'Code',    description: 'Developer shell.', roles: ['admin', 'developer'], internalOnly: true, showInRail: false },

  // Equipment.
  { href: '/admin/equipment/templates/new', label: 'New Equipment Template', workspace: 'equipment', iconName: 'FilePlus', description: 'Define a new equipment template.', roles: EQUIPMENT_ROLES, internalOnly: true, showInRail: false, keywords: ['create', 'template'] },

  // Knowledge. The exam-prep tracks are destinations a student picks; the authoring tools are reached
  // from Manage Content.
  { href: '/admin/learn/exam-prep/sit',   label: 'SIT Exam Prep',    workspace: 'knowledge', iconName: 'FileCheck',  description: 'Surveyor-in-Training exam preparation.', keywords: ['fs', 'sit', 'fundamentals', 'license'] },
  { href: '/admin/learn/exam-prep/sit/mock-exam', label: 'SIT Mock Exam', workspace: 'knowledge', iconName: 'Timer',  description: 'Full-length timed SIT practice exam.', showInRail: false, keywords: ['practice', 'timed', 'simulator'] },
  { href: '/admin/learn/exam-prep/rpls',  label: 'RPLS Exam Prep',   workspace: 'knowledge', iconName: 'FileCheck',  description: 'Registered Professional Land Surveyor exam preparation.', keywords: ['rpls', 'license', 'professional'] },
  { href: '/admin/learn/references',      label: 'References',       workspace: 'knowledge', iconName: 'Library',    description: 'Reference tables, formulas and constants.', keywords: ['formula', 'table', 'lookup', 'constants'] },
  { href: '/admin/learn/flashcards/create', label: 'New Flashcard Deck', workspace: 'knowledge', iconName: 'Plus',   description: 'Build a flashcard deck.', showInRail: false, keywords: ['create', 'deck'] },
  { href: '/admin/learn/manage/media',    label: 'Learning Media',   workspace: 'knowledge', iconName: 'Image',      description: 'Images and files used in lessons.', roles: [...CONTENT_MGMT_ROLES, 'tech_support'], showInRail: false, keywords: ['images', 'upload', 'assets'] },
  { href: '/admin/learn/manage/question-builder', label: 'Question Builder', workspace: 'knowledge', iconName: 'HelpCircle', description: 'Author quiz and exam questions.', roles: [...CONTENT_MGMT_ROLES, 'tech_support'], showInRail: false, keywords: ['quiz', 'exam', 'author'] },

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
}): AdminRoute[] {
  const { roles, isCompanyUser } = opts;
  const isAdmin = roles.includes('admin');
  return ADMIN_ROUTES.filter((r) => {
    // Parked first, before any role logic: it hides the route from everybody including admins,
    // which is the point. `findRoute` still resolves it, so breadcrumbs and direct links work.
    if (r.parked) return false;
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

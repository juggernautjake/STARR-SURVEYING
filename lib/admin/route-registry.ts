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
  office:         { id: 'office',         label: 'Office',          iconName: 'Building',       href: '/admin/office',       shortcut: 'Mod+6', order: 6 },
};

export const WORKSPACE_ORDER: Workspace[] = [
  'hub', 'work', 'equipment', 'research-cad', 'knowledge', 'office',
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
  /** Default true. False hides the route from rail surfaces (workspace
   *  landings, fly-outs, expanded panel) while keeping it searchable in
   *  the Cmd+K palette and resolvable for breadcrumbs. */
  showInRail?:   boolean;
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
  { href: '/admin/dashboard',       label: 'Dashboard',       workspace: 'hub', iconName: 'LayoutDashboard', description: 'Overview metrics + activity.', keywords: ['overview', 'home', 'stats'] },
  { href: '/admin/assignments',     label: 'Assignments',     workspace: 'hub', iconName: 'ClipboardList',  description: 'Your assigned jobs + tasks.', roles: [...WORK_ROLES, 'tech_support'], internalOnly: true, keywords: ['todo', 'tasks'] },
  { href: '/admin/schedule',        label: 'My Schedule',     workspace: 'hub', iconName: 'Calendar',       description: 'Calendar of your shifts + appointments.', roles: [...WORK_ROLES, 'tech_support'], internalOnly: true, keywords: ['calendar', 'shifts'] },
  // consolidation Slice 2 (2026-05-30) — the legacy `/admin/my-*` +
  // `/admin/profile` page files were deleted; these entries now point
  // at the canonical hub tabs so the nav surface keeps showing the
  // shortcuts. The middleware LEGACY_REDIRECTS table catches external
  // bookmarks at the old URLs.
  { href: '/admin/me?tab=jobs',     label: 'My Jobs',         workspace: 'hub', iconName: 'FolderOpen',     description: 'Jobs assigned to you.', roles: [...WORK_ROLES, 'researcher', 'tech_support'], internalOnly: true },
  { href: '/admin/me?tab=hours',    label: 'My Hours',        workspace: 'hub', iconName: 'Clock',          description: 'Your clock-in/out log + timesheet.', roles: [...WORK_ROLES, 'tech_support'], internalOnly: true, keywords: ['time', 'timesheet'] },
  { href: '/admin/time-off',        label: 'Time Off',        workspace: 'hub', iconName: 'Palmtree',       description: 'Request time off + view your PTO balance. Managers see the approval queue here too.', internalOnly: true, keywords: ['pto', 'vacation', 'holiday', 'leave'] },
  { href: '/admin/me?tab=pay',      label: 'My Pay',          workspace: 'hub', iconName: 'Wallet',         description: 'Your paycheck history + progression.', roles: [...PAY_ROLES, 'tech_support'], internalOnly: true, keywords: ['paycheck', 'salary', 'wage'] },
  { href: '/admin/me?tab=notes',    label: 'My Notes',        workspace: 'hub', iconName: 'NotebookPen',    description: 'Personal notes.' },
  { href: '/admin/my-files',        label: 'My Files',        workspace: 'hub', iconName: 'Folder',         description: 'Your file uploads.' },
  { href: '/admin/me?tab=profile',  label: 'My Profile',      workspace: 'hub', iconName: 'User',           description: 'Account, preferences, persona override.' },
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
  { href: '/admin/hours-approval',  label: 'Hours Approval',  workspace: 'work', iconName: 'CheckSquare',   description: 'Approve submitted timesheets.', roles: ['admin', 'developer', 'tech_support'], internalOnly: true, keywords: ['timesheet', 'approve'] },
  { href: '/admin/team',            label: 'Field Team',      workspace: 'work', iconName: 'Users',         description: 'Live status of crew in the field.', roles: ['admin', 'developer', 'tech_support'], internalOnly: true, keywords: ['crew', 'roster'] },
  { href: '/admin/field-data',      label: 'Field Data',      workspace: 'work', iconName: 'MapPin',        description: 'Field data review + approval.', roles: ['admin', 'developer', 'tech_support'], internalOnly: true, keywords: ['points', 'gnss'] },
  { href: '/admin/timeline',        label: 'Activity Timeline', workspace: 'work', iconName: 'Activity',    description: 'Daily activity stream across the firm.', roles: ['admin', 'developer', 'tech_support'], internalOnly: true, keywords: ['daily', 'feed'] },
  { href: '/admin/mileage',         label: 'Mileage',         workspace: 'work', iconName: 'Car',           description: 'Mileage logs + reimbursement.', roles: ['admin', 'developer', 'tech_support'], internalOnly: true },
  { href: '/admin/finances',        label: 'Finances',        workspace: 'work', iconName: 'Briefcase',     description: 'Job finances + invoicing.', roles: ['admin', 'developer', 'tech_support'], internalOnly: true, keywords: ['invoice', 'money'] },
  { href: '/admin/vehicles',        label: 'Vehicles',        workspace: 'work', iconName: 'Truck',         description: 'Vehicle fleet roster.', roles: ['admin', 'developer', 'tech_support'], internalOnly: true, keywords: ['fleet', 'trucks'] },

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
  { href: '/admin/office',                label: 'Office',           workspace: 'office', iconName: 'Building',     description: 'HR, payroll, comms, settings.', keywords: ['back-office', 'hr', 'admin'] },
  { href: '/admin/employees',             label: 'Employees',        workspace: 'office', iconName: 'UsersRound',   description: 'Employee directory.', roles: ['admin', 'developer', 'tech_support'], internalOnly: true },
  { href: '/admin/employees/manage',      label: 'Manage Employee',  workspace: 'office', iconName: 'UserCog',      description: 'Edit an employee record.', roles: ['admin', 'developer', 'tech_support'], internalOnly: true, showInRail: false },
  { href: '/admin/users',                 label: 'Manage Users',     workspace: 'office', iconName: 'KeyRound',     description: 'User accounts + roles.', roles: ['admin', 'tech_support'] },
  // Slice W7 (hub-cad-roles-polish-2026-06-18) — role builder.
  // Admin-only; surfaces alongside Manage Users in the Office
  // workspace.
  { href: '/admin/roles/custom',          label: 'Role Builder',     workspace: 'office', iconName: 'ShieldPlus',   description: 'Define new roles on top of the built-in role list.', roles: ['admin'], internalOnly: true, keywords: ['permissions', 'roles', 'custom'] },
  { href: '/admin/payroll',               label: 'Payroll',          workspace: 'office', iconName: 'BadgeDollarSign', description: 'Payroll runs.', roles: ['admin'], internalOnly: true, keywords: ['paychecks', 'wages'] },
  { href: '/admin/pay-progression',       label: 'Pay Progression',  workspace: 'office', iconName: 'TrendingUp',   description: 'Pay rate progression model.', roles: [...PAY_ROLES, 'tech_support'], internalOnly: true, keywords: ['raises', 'progression'] },
  { href: '/admin/payout-log',            label: 'Payout History',   workspace: 'office', iconName: 'ScrollText',   description: 'Historical payout log.', roles: [...PAY_ROLES, 'tech_support'], internalOnly: true },
  { href: '/admin/receipts',              label: 'Receipts',         workspace: 'office', iconName: 'Receipt',      description: 'Receipt approval queue.', roles: ['admin', 'developer', 'tech_support'], internalOnly: true, keywords: ['expenses', 'approvals'] },
  { href: '/admin/receipts/new',          label: 'Capture Receipt',  workspace: 'office', iconName: 'Camera',       description: 'Upload a receipt photo for approval.', roles: ['admin', 'developer', 'field_crew', 'drawer', 'researcher', 'equipment_manager', 'tech_support'], internalOnly: true, showInRail: false, keywords: ['upload', 'photo', 'expense'] },
  { href: '/admin/invoicing',             label: 'Invoicing',        workspace: 'office', iconName: 'FileText',     description: 'Create + send customer invoices and track payments.', roles: ['admin', 'developer', 'tech_support'], internalOnly: true, keywords: ['invoice', 'pay', 'billing', 'customer', 'deposit'] },
  { href: '/admin/rewards',               label: 'Rewards & Store',  workspace: 'office', iconName: 'Trophy',       description: 'Rewards portal + company store.', roles: [...PAY_ROLES, 'tech_support'], internalOnly: true, keywords: ['points', 'store'] },
  { href: '/admin/rewards/admin',         label: 'Manage Rewards',   workspace: 'office', iconName: 'Settings2',    description: 'Configure rewards + store catalog.', roles: ['admin', 'developer', 'tech_support'], internalOnly: true, showInRail: false },
  { href: '/admin/rewards/how-it-works',  label: 'How Rewards Work', workspace: 'office', iconName: 'HelpCircle',   description: 'Rewards program explainer.', roles: [...PAY_ROLES, 'tech_support'], internalOnly: true, showInRail: false },
  { href: '/admin/messages',              label: 'Messages',         workspace: 'office', iconName: 'MessageSquare', description: 'Direct + group messaging.', roles: INTERNAL_COMM_ROLES, internalOnly: true, keywords: ['chat', 'dm'] },
  // consolidation Slice 6 (2026-05-30) — clarified description so it
  // reads distinctly from the firm-wide `/admin/contacts` CRM. This
  // surface is for picking a teammate to message; the CRM page is for
  // realtors / clients / students.
  { href: '/admin/messages/contacts',     label: 'Team Directory',   workspace: 'office', iconName: 'Contact',      description: 'Internal teammate directory — pick someone to message.', roles: INTERNAL_COMM_ROLES, internalOnly: true },
  { href: '/admin/messages/new',          label: 'New Message',      workspace: 'office', iconName: 'MessageSquarePlus', description: 'Start a new conversation.', roles: INTERNAL_COMM_ROLES, internalOnly: true, showInRail: false },
  { href: '/admin/messages/settings',     label: 'Message Settings', workspace: 'office', iconName: 'Settings',     description: 'Messaging preferences.', roles: INTERNAL_COMM_ROLES, internalOnly: true, showInRail: false },
  // contacts plan 2026-05-30 — firm-wide contacts (realtors, repeat
  // clients, students, teachers, employees). Profile per person + a
  // job ↔ contact join. See docs/planning/in-progress/contacts-…
  { href: '/admin/contacts',              label: 'Contacts',         workspace: 'office', iconName: 'Users',        description: 'Saved contacts — realtors, clients, students, teachers, employees.', keywords: ['address book', 'people', 'realtors', 'clients'] },
  { href: '/admin/discussions',           label: 'Discussions',      workspace: 'office', iconName: 'MessagesSquare', description: 'Long-form discussion threads.', roles: INTERNAL_COMM_ROLES, internalOnly: true, keywords: ['threads', 'forum'] },
  { href: '/admin/notes',                 label: 'Company Notes',    workspace: 'office', iconName: 'StickyNote',   description: 'Firm-wide shared notes.', roles: ['admin', 'developer', 'tech_support'], internalOnly: true },
  { href: '/admin/settings',              label: 'Settings',         workspace: 'office', iconName: 'Settings',     description: 'Firm-wide settings.', roles: ['admin'] },
  { href: '/admin/error-log',             label: 'Error Log',        workspace: 'office', iconName: 'Bug',          description: 'Application error log.', roles: ['admin', 'developer', 'tech_support'] },
  { href: '/admin/audit',                 label: 'Audit Log',        workspace: 'office', iconName: 'ShieldCheck',  description: 'Customer-org audit trail (user + operator actions).', roles: ['admin', 'developer', 'tech_support'], keywords: ['compliance', 'history', 'log'] },
  { href: '/admin/invites',               label: 'Invites',          workspace: 'office', iconName: 'UserPlus',     description: 'Pending + historical org user invites.', roles: ['admin', 'tech_support'], keywords: ['onboard', 'invite'] },
  { href: '/admin/payouts',               label: 'Payouts',          workspace: 'office', iconName: 'Banknote',     description: 'Record employee payouts (Venmo / Stripe / check / cash).', roles: ['admin'], internalOnly: true, keywords: ['pay', 'venmo', 'stripe'] },
  { href: '/admin/announcements',         label: 'Announcements',    workspace: 'office', iconName: 'Megaphone',    description: 'Published release notes + product announcements.', keywords: ['release', 'changelog', 'news'] },
  { href: '/admin/billing',               label: 'Billing',          workspace: 'office', iconName: 'CreditCard',   description: 'Subscription, invoices, plan history.', roles: ['admin', 'tech_support'], keywords: ['subscription', 'invoice', 'plan'] },
  { href: '/admin/org-settings',          label: 'Org Settings',     workspace: 'office', iconName: 'Building',     description: 'Per-organization configuration.', roles: ['admin'], keywords: ['org', 'tenant', 'company'] },
  { href: '/admin/orgs',                  label: 'Organizations',    workspace: 'office', iconName: 'Building2',    description: 'Cross-org switcher + multi-tenant overview.', roles: ['admin', 'tech_support'], internalOnly: true, keywords: ['tenants', 'switch'] },
  { href: '/admin/reports',               label: 'Reports',          workspace: 'office', iconName: 'FileBarChart', description: 'Owner reports + KPI dashboards.', roles: ['admin', 'developer', 'tech_support'], internalOnly: true, keywords: ['kpi', 'metrics', 'analytics'] },
  { href: '/admin/support',               label: 'Support',          workspace: 'office', iconName: 'LifeBuoy',     description: 'Open support tickets + manage existing ones.', keywords: ['tickets', 'help', 'issues'] },
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

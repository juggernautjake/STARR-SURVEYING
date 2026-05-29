// lib/admin/help-catalog.ts
//
// Curated per-page help content surfaced by the `?` help drawer
// (ADMIN_NAVIGATION_REDESIGN.md §13.7). Keyed by exact pathname; the
// drawer falls back to the workspace-level entry if a specific
// pathname has no curated content. If neither exists the drawer
// renders a generic "no help curated yet" notice.
//
// Each entry is intentionally short (3-5 bullets) — this is a
// pointer-to-the-docs UI, not the docs themselves. Operator can extend
// this catalog as content authoring catches up; the file is a plain
// constant so changes ship with the next deploy.

export interface HelpResource {
  label: string;
  href: string;
  /** True when the link points outside the admin shell. */
  external?: boolean;
}

export interface HelpEntry {
  title: string;
  /** Short paragraph framing what this surface is for. */
  blurb: string;
  /** Concrete tips / common actions. */
  tips: string[];
  /** Related docs or pages. */
  resources?: HelpResource[];
}

export type HelpCatalog = Record<string, HelpEntry>;

export const HELP_CATALOG: HelpCatalog = {
  // ── Workspace landings ─────────────────────────────────────────────
  '/admin/me': {
    title: 'Your Hub',
    blurb: 'The Hub is your personalized landing — today\'s schedule, pinned shortcuts, and a recents feed of pages you visit often. Use the IconRail on the left to switch between workspaces.',
    tips: [
      'Press ⌘K (Ctrl+K on Windows) anywhere in the admin shell to jump to any page.',
      'Star any page (top-left of the page header) to add it to your pinned list — pinned pages always show on the rail.',
      'Open your profile to override your "persona" if the role-aware defaults aren\'t hiding/showing the right links for the work you\'re doing.',
    ],
    resources: [
      { label: 'Pay progression', href: '/admin/pay-progression' },
      { label: 'My profile', href: '/admin/profile' },
    ],
  },
  '/admin/work': {
    title: 'Work workspace',
    blurb: 'Active jobs, dispatch, field-team status, and hours approval. Everything related to the day-to-day operations of a survey crew lives here.',
    tips: [
      '"All Jobs" is the master list — paginated, searchable, includes archived. Use it when you need an old project.',
      '"Field Team" shows the live status of crew currently clocked in.',
      'Hours Approval funnels every submitted timesheet through a single queue — approve in bulk by selecting rows.',
    ],
    resources: [
      { label: 'All jobs', href: '/admin/jobs' },
      { label: 'Field team', href: '/admin/team' },
      { label: 'Hours approval', href: '/admin/hours-approval' },
    ],
  },
  '/admin/equipment': {
    title: 'Equipment workspace',
    blurb: 'Inventory, consumables, fleet valuation, maintenance scheduling, and the timeline of every state-change event on a unit.',
    tips: [
      'Every check-out / check-in / damage / cal event lands in the equipment_events log — chain-of-custody is one join away.',
      'Maintenance events accept attachments (cert PDFs, before/after photos) via the per-event detail page.',
      'Fleet valuation tracks book value + IRS-grade depreciation; the year-end export feeds the bookkeeper directly.',
    ],
    resources: [
      { label: 'Inventory', href: '/admin/equipment/inventory' },
      { label: 'Maintenance', href: '/admin/equipment/maintenance' },
      { label: 'Fleet valuation', href: '/admin/equipment/fleet-valuation' },
    ],
  },
  '/admin/research-cad': {
    title: 'Research & CAD',
    blurb: 'AI-assisted property research pipeline plus the CAD shell for plat drawings.',
    tips: [
      'Research projects flow through Discovery → Harvest → Extraction → Reconciliation → Confidence → Export.',
      'CAD drawings can be exported PNG / PDF / DXF or persisted to the research-exports Storage bucket — toggle via `persist: true` on the export action.',
      'Templates govern feature-style consistency across drawings; the system templates Standard B&W and Professional Color cover the common cases.',
    ],
    resources: [
      { label: 'Research projects', href: '/admin/research' },
      { label: 'CAD shell', href: '/admin/cad' },
    ],
  },
  '/admin/learn': {
    title: 'Knowledge workspace',
    blurb: 'Curriculum: modules, lessons, flashcards, quizzes, exam-prep tracks (SIT / RPLS / drone), and the knowledge base.',
    tips: [
      'Each module can be linked to a credential — completing it earns the credential which carries a per-hour pay bump (visible on the module detail page).',
      'The lesson builder supports rich content (text, images, formula blocks, interactive code).',
      'Flashcards live in the flashcard bank and can be linked to modules or topics for spaced-repetition study.',
    ],
    resources: [
      { label: 'Modules', href: '/admin/learn/modules' },
      { label: 'Exam prep', href: '/admin/learn/exam-prep' },
      { label: 'Pay progression', href: '/admin/pay-progression' },
    ],
  },
  '/admin/office': {
    title: 'Office workspace',
    blurb: 'Back-office: receipts, payroll, billing, settings, audit log, announcements, and org-wide configuration.',
    tips: [
      'Receipts: bookkeeper approval queue; AI extracts vendor + total + category from photo uploads.',
      'Audit log shows every privileged action across the admin shell with the actor, timestamp, and free-form note.',
      'Org settings + billing live here; subscription state controls which bundles unlock which routes.',
    ],
    resources: [
      { label: 'Receipts', href: '/admin/receipts' },
      { label: 'Payroll', href: '/admin/payroll' },
      { label: 'Audit log', href: '/admin/audit' },
    ],
  },

  // ── A few high-value page-level entries ────────────────────────────
  '/admin/dashboard': {
    title: 'Dashboard',
    blurb: 'Snapshot view of your day: education progress, active jobs, finances, schedule, and the activity feed.',
    tips: [
      'Cards adapt to your visible role — admins see jobs + research, field crew see jobs + finances + schedule.',
      'The PTO balance card pulls from pto_balances; the auto-deduction on time-off approval keeps it honest.',
    ],
    resources: [
      { label: 'My finances', href: '/admin/my-pay' },
      { label: 'My schedule', href: '/admin/schedule' },
    ],
  },
  '/admin/pay-progression': {
    title: 'Pay progression',
    blurb: 'Your current effective rate, tier, seniority, credential bonuses, and the next tier you can reach.',
    tips: [
      'Effective rate = base × work-type multiplier + role bonus + seniority bracket + credential bonuses + XP milestones + per-user override.',
      'Earn credentials by completing curriculum modules — admins verify, then the bonus applies.',
      'The "What-If" calculator lets you preview the rate change before requesting a promotion.',
    ],
  },
};

export function lookupHelp(pathname: string, workspaceHref: string | null): HelpEntry | null {
  if (!pathname) return null;
  if (HELP_CATALOG[pathname]) return HELP_CATALOG[pathname];
  if (workspaceHref && HELP_CATALOG[workspaceHref]) return HELP_CATALOG[workspaceHref];
  return null;
}

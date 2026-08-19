// lib/hub/quick-actions-catalog.ts
//
// Catalog of actions the Quick Actions widget can surface. Each entry
// is either a plain navigation (href, opens via next/link) or a
// command action (kind: 'action') whose handler is wired by the widget
// (e.g. "Clock in" opens the clock-in modal in slice 159).
//
// The widget reads the catalog, filters by `allowedRoles`, then picks
// the first N entries based on the bucket cap. Users override the
// selection + ordering via the Content tab in the settings panel.
//
// Slice 95 of customizable-hub-and-work-mode-2026-05-28.md.

import type { UserRole } from '@/lib/auth';

export type QuickActionKind = 'link' | 'action';

export interface QuickActionDef {
  id: string;
  label: string;
  /** Short helper string, surfaced in tooltips + large/xlarge buckets. */
  description: string;
  /** Lucide icon name — resolved by the widget renderer. */
  iconName: string;
  /** A glyph to render verbatim instead of looking `iconName` up in the renderer's table.
   *  Set only by user-authored actions (see `custom-quick-actions.ts`), whose icon is typed in by
   *  the person rather than chosen from our lucide set. */
  glyph?: string;
  kind: QuickActionKind;
  /** Required for `link` kind. Where next/link sends the user. */
  href?: string;
  /** Required for `action` kind. The command id the widget dispatches.
   *  Concrete handlers wire up in later slices (clock-in modal lands in
   *  slice 159, capture-receipt modal in slice 156). Until then,
   *  unknown action ids render with a disabled "Soon" pill. */
  actionId?: string;
  /** Empty array = everyone. Filtered before render. */
  allowedRoles: UserRole[];
  /** Tailwind-y semantic color hint. The widget maps these into
   *  `--theme-accent / --theme-success / --theme-warning / --theme-info`
   *  CSS vars so each tile matches the active theme automatically. */
  tint?: 'accent' | 'success' | 'warning' | 'info' | 'danger';
}

/** The eight default actions every new hub starts with, per
 *  the planning doc Slice 95 scope. Order is intentional: the most
 *  common daily action first (clock in/out), then create/approve flows,
 *  then secondary navigations. */
export const QUICK_ACTIONS_CATALOG: ReadonlyArray<QuickActionDef> = [
  {
    // quick-actions-wiring-2026-06-22 — flipped from a stub link to a
    // real action. The widget now opens the same ClockInModal /
    // ClockOutModal the top-bar ClockInPill uses, so the tile actually
    // toggles the clock session instead of routing to a Hours tab that
    // was archived in `_archive/components/HubTabs.tsx`.
    id: 'clock-in-out',
    label: 'Clock In/Out',
    description: 'Clock in or out without leaving the hub.',
    iconName: 'Clock',
    kind: 'action',
    actionId: 'clock-in-out',
    allowedRoles: ['admin', 'developer', 'field_crew', 'drawer', 'researcher', 'equipment_manager', 'tech_support'],
    tint: 'success',
  },
  // ── NEW PROJECT REPLACED NEW JOB IN THE DEFAULT SET (2026-08-19) ─────────────────────────────
  //
  // Owner: *"make sure that the quick actions widget on the hub has new project instead of new job
  // as the option."* Which follows from the hierarchy: a job cannot be created without a project, so
  // "New Job" as the one-click action was a shortcut to a form whose first question is "which
  // project?" — and if the answer is "a new one", it was the wrong starting point.
  //
  // The id stays `new-job` for the tile that still points at the job form; the DEFAULT list swaps to
  // `new-project`. Renaming the id would silently drop the tile from every hub that has already
  // saved a layout containing it, because saved layouts store ids.
  {
    id: 'new-project',
    label: 'New Project',
    description: 'Start a project — the client and site its jobs will inherit.',
    iconName: 'FolderPlus',
    kind: 'link',
    href: '/admin/projects/new',
    allowedRoles: ['admin'],
    tint: 'accent',
  },
  {
    id: 'new-job',
    label: 'New Job',
    description: 'Add a job to an existing project.',
    iconName: 'FilePlus',
    kind: 'link',
    href: '/admin/jobs/new',
    allowedRoles: ['admin'],
    tint: 'accent',
  },
  // consolidation Slice 9 (2026-05-30) — intentional widget-equivalent
  // shortcut. The `approvals` / `pending-receipts` widgets already
  // summarize the queue on the hub canvas; this tile gives 1-click
  // navigation for power users. Keep — do not delete as redundant.
  {
    id: 'approve-receipts',
    label: 'Approve Receipts',
    description: 'Jump to the pending receipts approval queue.',
    iconName: 'BadgeCheck',
    kind: 'link',
    href: '/admin/receipts',
    allowedRoles: ['admin', 'developer', 'tech_support'],
    tint: 'info',
  },
  {
    id: 'view-reports',
    label: 'View Reports',
    description: 'Owner reports + KPI dashboards.',
    iconName: 'FileBarChart',
    kind: 'link',
    href: '/admin/reports',
    allowedRoles: ['admin', 'developer', 'tech_support'],
    tint: 'info',
  },
  {
    id: 'open-cad',
    label: 'Open CAD',
    description: 'Jump to the CAD drawing editor.',
    iconName: 'PenTool',
    kind: 'link',
    href: '/admin/cad',
    // Slice W4 — universal bypass. Every UserRole listed so
    // `quickActionsForRoles` returns this tile for every
    // signed-in user. Replace with a narrower set once the W7
    // permissions story carries fine-grained gating.
    allowedRoles: ['admin', 'developer', 'drawer', 'researcher', 'field_crew', 'tech_support', 'equipment_manager', 'employee', 'teacher', 'student', 'guest'],
    tint: 'accent',
  },
  // consolidation Slice 9 (2026-05-30) — intentional widget-equivalent
  // shortcut. The `messages` / `mentions-inbox` widgets already preview
  // unread conversations on the hub canvas; this tile gives 1-click
  // navigation for power users. Keep — do not delete as redundant.
  {
    id: 'send-message',
    label: 'Send Message',
    description: 'Open messages — pick a conversation or start a new one.',
    iconName: 'MessageSquarePlus',
    kind: 'link',
    href: '/admin/messages',
    allowedRoles: ['admin', 'developer', 'field_crew', 'drawer', 'researcher', 'equipment_manager', 'tech_support'],
    tint: 'accent',
  },
  {
    // quick-actions-wiring-2026-06-22 — flipped from a stub action to a
    // real link. Web upload page lives at /admin/receipts/new (file
    // picker + optional job + optional notes). Native capture happens
    // from the mobile app, which has a dedicated camera flow.
    id: 'capture-receipt',
    label: 'Capture Receipt',
    description: 'Upload a receipt photo for approval.',
    iconName: 'Camera',
    kind: 'link',
    href: '/admin/receipts/new',
    allowedRoles: ['admin', 'developer', 'field_crew', 'drawer', 'researcher', 'equipment_manager', 'tech_support'],
    tint: 'info',
  },
  // consolidation Slice 9 (2026-05-30) — intentional widget-equivalent
  // shortcut. The `today-schedule` / `crew-calendar` widgets already
  // show today's events on the hub canvas; this tile gives 1-click
  // navigation to the full calendar for power users. Keep — do not
  // delete as redundant.
  {
    id: 'schedule',
    label: 'Schedule',
    description: 'View your shifts and appointments.',
    iconName: 'Calendar',
    kind: 'link',
    href: '/admin/schedule',
    allowedRoles: ['admin', 'developer', 'field_crew', 'drawer', 'researcher', 'equipment_manager', 'tech_support'],
    tint: 'accent',
  },
];

/** Look up an action by id. Returns undefined for unknown ids — the
 *  widget skips those entries (a user's saved selection may include
 *  retired ids). */
export function findQuickAction(id: string): QuickActionDef | undefined {
  return QUICK_ACTIONS_CATALOG.find((a) => a.id === id);
}

/** Filter the catalog to the actions the given roles can access.
 *  Mirrors `widgetsForRoles` semantics: an action's `allowedRoles`
 *  array empty = visible to everyone. */
export function quickActionsForRoles(roles: UserRole[]): QuickActionDef[] {
  return QUICK_ACTIONS_CATALOG.filter((a) => {
    if (a.allowedRoles.length === 0) return true;
    return a.allowedRoles.some((r) => roles.includes(r));
  });
}

/**
 * The default eight, named rather than sliced.
 *
 * This was `QUICK_ACTIONS_CATALOG.slice(0, 8)`, which meant the default set was whatever happened to
 * be declared first — so inserting one entry anywhere near the top silently pushed the last default
 * out of every new hub. Adding `new-project` on 2026-08-19 would have quietly dropped `schedule`,
 * and nothing would have said so.
 *
 * **`new-project`, not `new-job`** (owner, 2026-08-19). A job cannot be created without a project, so
 * a one-click "New Job" led to a form whose first question is "which project?" — and when the answer
 * was "a new one", it was the wrong starting point. `new-job` stays in the catalogue for anyone who
 * wants to add it back, and for hubs whose saved layout already names it.
 */
export const DEFAULT_QUICK_ACTION_IDS: ReadonlyArray<string> = [
  'clock-in-out',
  'new-project',
  'approve-receipts',
  'view-reports',
  'open-cad',
  'send-message',
  'capture-receipt',
  'schedule',
];

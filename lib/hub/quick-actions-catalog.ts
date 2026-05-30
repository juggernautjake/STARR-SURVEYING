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
    id: 'clock-in-out',
    label: 'Clock In/Out',
    description: 'Open the clock-in modal or stop your active session.',
    iconName: 'Clock',
    kind: 'action',
    actionId: 'clock-in-out',
    allowedRoles: ['admin', 'developer', 'field_crew', 'drawer', 'researcher', 'equipment_manager', 'tech_support'],
    tint: 'success',
  },
  {
    id: 'new-job',
    label: 'New Job',
    description: 'Create a new job from the work workspace.',
    iconName: 'FilePlus',
    kind: 'link',
    href: '/admin/jobs/new',
    allowedRoles: ['admin'],
    tint: 'accent',
  },
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
    allowedRoles: ['admin', 'developer', 'drawer', 'researcher', 'field_crew', 'tech_support'],
    tint: 'accent',
  },
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
    id: 'capture-receipt',
    label: 'Capture Receipt',
    description: 'Upload a receipt photo for approval.',
    iconName: 'Camera',
    kind: 'action',
    actionId: 'capture-receipt',
    allowedRoles: ['admin', 'developer', 'field_crew', 'drawer', 'researcher', 'equipment_manager', 'tech_support'],
    tint: 'info',
  },
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

/** Returns the id list of the default selection — first 8 entries.
 *  Used by the widget's `defaultContent`. */
export const DEFAULT_QUICK_ACTION_IDS: ReadonlyArray<string> =
  QUICK_ACTIONS_CATALOG.slice(0, 8).map((a) => a.id);

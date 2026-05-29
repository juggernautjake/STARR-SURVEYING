// lib/hub/bundle-gating.ts
//
// Subscription bundle gating for widgets. Wired into:
//   - the Add-Widget modal (Slice 100) — hides locked widgets
//   - the WidgetGrid runtime (Slice 92) — renders a "Locked" upgrade
//     prompt when a saved widget's bundle is no longer active
//   - the Work Mode role picker (Slice 157) — hides Work Modes whose
//     bundle isn't active
//
// Slices 182-184 of customizable-hub-and-work-mode-2026-05-28.md.

import type { BundleId } from '@/lib/saas/bundles';
import { expandBundles } from '@/lib/saas/bundles';
import type { WidgetDefinition } from '@/lib/hub/widget-registry';
import type { UserRole } from '@/lib/auth';

/** Cache of expanded bundle sets per active-bundle key. */
function expandedBundleSet(active: BundleId[] | null): Set<BundleId> | null {
  if (active === null) return null;
  return new Set(expandBundles(active));
}

/** True when the widget is bundle-locked given the active subscription.
 *  `active = null` means subscription gating is skipped entirely. */
export function isWidgetBundleLocked(widget: WidgetDefinition, active: BundleId[] | null): boolean {
  if (!widget.requiresBundle) return false;
  if (active === null) return false;
  const granted = expandedBundleSet(active)!;
  return !granted.has(widget.requiresBundle);
}

/** Per-role → required bundle map for Work Mode shells. */
const WORK_MODE_BUNDLE_GATES: Partial<Record<UserRole, BundleId>> = {
  drawer:            'draft',
  field_crew:        'field',
  researcher:        'recon',
  equipment_manager: 'office',
  tech_support:      'office',
  admin:             'firm_suite',
  developer:         'firm_suite',
};

/** Hides Work Mode roles whose required bundle is missing. */
export function eligibleWorkModesAfterBundleGate(
  eligibleRoles: UserRole[],
  active: BundleId[] | null,
): UserRole[] {
  if (active === null) return eligibleRoles;
  const granted = expandedBundleSet(active)!;
  return eligibleRoles.filter((r) => {
    const required = WORK_MODE_BUNDLE_GATES[r];
    if (!required) return true;
    return granted.has(required);
  });
}

export { WORK_MODE_BUNDLE_GATES };

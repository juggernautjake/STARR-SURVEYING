// lib/equipment/assignment.ts
//
// E2 of EQUIPMENT_MANAGER_BUILDOUT_2026-06-22.md — pure state-machine logic for
// the direct equipment check-out / check-in flow. Kept dependency-free so it
// unit-tests cleanly and both API routes + the UI share one source of truth.

export type AssignedKind = 'crew' | 'vehicle' | 'maintenance' | 'other';
export type EquipStatus =
  | 'available' | 'in_use' | 'maintenance' | 'loaned_out' | 'lost' | 'retired';
export type CheckoutCondition = 'good' | 'fair' | 'damaged';
export type ReturnCondition = 'good' | 'fair' | 'damaged' | 'lost';

export const ASSIGNED_KINDS: AssignedKind[] = ['crew', 'vehicle', 'maintenance', 'other'];
export const CHECKOUT_CONDITIONS: CheckoutCondition[] = ['good', 'fair', 'damaged'];
export const RETURN_CONDITIONS: ReturnCondition[] = ['good', 'fair', 'damaged', 'lost'];

/** Can an item in `status` be checked out right now? A null status (older rows
 *  that predate the status column) is treated as available. */
export function canCheckOut(status: string | null | undefined): { ok: boolean; reason?: string } {
  const s = status ?? 'available';
  if (s === 'available') return { ok: true };
  const messages: Record<string, string> = {
    in_use: 'This item is already checked out.',
    loaned_out: 'This item is already loaned out.',
    maintenance: 'This item is in maintenance — check it in from there first.',
    lost: 'This item is marked lost.',
    retired: 'This item is retired.',
  };
  return { ok: false, reason: messages[s] ?? `This item is ${s} and can't be checked out.` };
}

/** The inventory status an item takes while checked out, by destination. */
export function statusForCheckout(kind: AssignedKind): EquipStatus {
  switch (kind) {
    case 'maintenance': return 'maintenance';
    case 'other':       return 'loaned_out';
    case 'crew':
    case 'vehicle':
    default:            return 'in_use';
  }
}

/** The inventory status an item returns to, by the condition it came back in.
 *  Damaged → maintenance (needs triage); lost → lost; otherwise available. */
export function statusAfterReturn(condition: ReturnCondition): EquipStatus {
  if (condition === 'lost') return 'lost';
  if (condition === 'damaged') return 'maintenance';
  return 'available';
}

/** Does returning in this condition warrant an auto-created maintenance triage
 *  event? */
export function needsMaintenanceTriage(condition: ReturnCondition): boolean {
  return condition === 'damaged' || condition === 'lost';
}

/** equipment_events.event_type for a check-out, given destination. */
export function checkoutEventType(kind: AssignedKind): string {
  if (kind === 'maintenance') return 'maintenance_scheduled';
  if (kind === 'other')       return 'loaned_out';
  return 'checked_out';
}

/** equipment_events.event_type for a check-in, given return condition. */
export function checkinEventType(condition: ReturnCondition): string {
  if (condition === 'damaged') return 'damaged_returned';
  if (condition === 'lost')    return 'lost_returned';
  return 'checked_in';
}

/** A human label for who/what an item is checked out to. */
export function assignmentTargetLabel(a: {
  assigned_kind: AssignedKind | string;
  assigned_label?: string | null;
  assigned_user_name?: string | null;
  assigned_vehicle_name?: string | null;
}): string {
  if (a.assigned_kind === 'crew') return a.assigned_user_name || a.assigned_label || 'a crew member';
  if (a.assigned_kind === 'vehicle') return a.assigned_vehicle_name || a.assigned_label || 'a vehicle';
  if (a.assigned_kind === 'maintenance') return a.assigned_label ? `maintenance (${a.assigned_label})` : 'maintenance';
  return a.assigned_label || 'other';
}

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
export function isUuid(v: unknown): v is string {
  return typeof v === 'string' && UUID_RE.test(v);
}

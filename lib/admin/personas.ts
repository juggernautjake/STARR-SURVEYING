// lib/admin/personas.ts
//
// Persona inference + rail-order defaults (admin-nav redesign Phase 4
// §5.4). A persona never *hides* a workspace the user can access — it
// only reorders the rail so the most-used workspace for their role
// sits closer to the top. Users can override via the picker in the
// HubGreeting (slice 4b).

import type { UserRole } from '@/lib/auth';
import { WORKSPACE_ORDER, type Workspace } from './route-registry';

export type Persona =
  | 'field-surveyor'
  | 'equipment-manager'
  | 'dispatcher'
  | 'bookkeeper'
  | 'researcher'
  | 'admin'
  | 'student';

export interface PersonaMeta {
  id: Persona;
  label: string;
  /** Rail order for this persona. Always contains every workspace
   *  from `WORKSPACE_ORDER` — the persona only changes order, never
   *  membership. */
  railOrder: Workspace[];
}

// §5.4 rail-order table — every persona's preferred workspace order.
// Each list is exhaustive (all 6 workspaces) so we can swap personas
// without losing icons.
export const PERSONAS: Record<Persona, PersonaMeta> = {
  'field-surveyor':    { id: 'field-surveyor',    label: 'Field Surveyor',    railOrder: ['hub', 'work', 'research-cad', 'knowledge', 'equipment', 'office'] },
  'equipment-manager': { id: 'equipment-manager', label: 'Equipment Manager', railOrder: ['hub', 'equipment', 'work', 'office', 'research-cad', 'knowledge'] },
  'dispatcher':        { id: 'dispatcher',        label: 'Dispatcher',        railOrder: ['hub', 'work', 'equipment', 'office', 'research-cad', 'knowledge'] },
  'bookkeeper':        { id: 'bookkeeper',        label: 'Bookkeeper',        railOrder: ['hub', 'office', 'work', 'knowledge', 'equipment', 'research-cad'] },
  'researcher':        { id: 'researcher',        label: 'Researcher',        railOrder: ['hub', 'research-cad', 'work', 'knowledge', 'office', 'equipment'] },
  'admin':             { id: 'admin',             label: 'Admin',             railOrder: ['hub', 'work', 'equipment', 'office', 'research-cad', 'knowledge'] },
  'student':           { id: 'student',           label: 'Student / Learner', railOrder: ['hub', 'knowledge', 'office', 'work', 'research-cad', 'equipment'] },
};

export const PERSONA_ORDER: Persona[] = [
  'field-surveyor', 'equipment-manager', 'dispatcher', 'bookkeeper',
  'researcher', 'admin', 'student',
];

/**
 * Maps the user's roles to the best-fit persona. Resolution priority
 * is "most specific first" — dedicated single-hat roles win over the
 * generic admin role. When multiple specific roles match (e.g. a user
 * holds both equipment_manager and researcher), the order in this
 * function decides which persona surfaces by default; the user can
 * override via the persona picker.
 */
export function inferPersona(roles: UserRole[]): Persona {
  const has = (r: UserRole) => roles.includes(r);
  // Specific single-purpose roles first.
  if (has('equipment_manager')) return 'equipment-manager';
  if (has('researcher') || has('drawer')) return 'researcher';
  // Field crew before generic admin so a dispatcher who also has the
  // field_crew hat still gets the dispatcher persona.
  if (has('admin') && has('tech_support')) return 'dispatcher';
  if (has('admin')) return 'admin';
  if (has('field_crew')) return 'field-surveyor';
  if (has('teacher')) return 'admin'; // teacher uses the admin rail order
  if (has('tech_support')) return 'dispatcher';
  if (has('student')) return 'student';
  // Fallback: surveyor order is the most-broadly-applicable.
  return 'field-surveyor';
}

/**
 * Returns the active rail order. Override beats inference; both are
 * always exhaustive over `WORKSPACE_ORDER` so the caller can render
 * them as the rail's icon list without losing entries.
 */
export function railOrderFor(opts: {
  roles: UserRole[];
  override: Persona | null;
}): Workspace[] {
  const persona = opts.override ?? inferPersona(opts.roles);
  const order = PERSONAS[persona].railOrder;
  // Defense against drift between the persona table and
  // WORKSPACE_ORDER. If the table is short, append the missing ones in
  // canonical order. (Tests assert exhaustiveness; this is a runtime
  // backstop.)
  if (order.length === WORKSPACE_ORDER.length) return order;
  const seen = new Set(order);
  const tail = WORKSPACE_ORDER.filter((w) => !seen.has(w));
  return [...order, ...tail];
}

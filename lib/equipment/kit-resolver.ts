// lib/equipment/kit-resolver.ts
//
// Phase F10.5-e-i — kit composition resolver. Given a parent
// equipment_inventory id (typically resolved from a QR scan),
// returns the kit's children + the matching active reservations
// across the whole bundle so the F10.5-e-ii batch can extend
// /check-out and /check-in to fan out atomically per §5.12.1.C.
//
// "Kit" semantics:
//   * `equipment_kits` is a thin wrapper keyed by an
//     equipment_inventory id (the parent — Total Station Kit
//     #3, GPS Rover Kit #1, etc.).
//   * `equipment_kit_items` is the join table: one row per
//     child (the tripod, the data collector, the battery).
//   * The parent has its own QR sticker + its own reservation
//     row. Each child also has its own reservation row when
//     the §5.12.3 apply flow pulled them onto the same job.
//
// A kit-batch scan flips every involved row in lockstep:
// scan the parent → resolver expands to (parent + N children)
// → caller flips them all to the target state in one batch.
//
// This lib is read-only — it returns the resolved roster plus
// the matching reservation rows. The state-flip itself stays
// in the F10.5-e-ii caller so the route handlers own the
// audit-trail writes.

import type { SupabaseClient } from '@supabase/supabase-js';

import { supabaseAdmin } from '@/lib/supabase';

// ────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────

export interface KitChildRef {
  /** equipment_kit_items.id (the join row). */
  kit_item_id: string;
  /** equipment_inventory.id of the child. */
  child_equipment_id: string;
  /** Display name from equipment_inventory. */
  child_name: string | null;
  child_item_kind: string | null;
  child_qr_code_id: string | null;
  /** Quantity per the kit join row (1 for durables, N for consumables). */
  quantity: number;
  is_required: boolean;
  sort_order: number;
}

export interface KitBundleReservations {
  /**
   * Reservation row for the parent inventory id (when one
   * exists for the supplied filter). Null when the parent
   * itself isn't reserved on the matching job/window.
   */
  parent_reservation_id: string | null;
  /**
   * One entry per child that has a matching reservation. Children
   * without a matching reservation are not present here — the
   * caller decides whether that's an error (e.g., a kit-mode
   * check-in expects every required child's reservation to be
   * checked-out) or acceptable (e.g., a kit was applied without
   * one of its optional children).
   */
  child_reservations: Array<{
    child_equipment_id: string;
    reservation_id: string;
    state: string;
    reserved_from: string;
    reserved_to: string;
  }>;
}

export interface ResolvedKit {
  /**
   * Parent inventory row (the kit's wrapper). Always populated
   * for a successful resolve.
   */
  parent_equipment_id: string;
  parent_name: string | null;
  parent_qr_code_id: string | null;
  /** equipment_kits.id when the parent is registered as a kit. */
  kit_id: string;
  /** Children, sorted by sort_order ASC (display order). */
  children: KitChildRef[];
}

export type KitResolverError =
  | { error: 'parent_not_found'; equipment_id: string }
  | { error: 'parent_is_not_a_kit'; equipment_id: string };

// ────────────────────────────────────────────────────────────
// Public API
// ────────────────────────────────────────────────────────────

/**
 * Resolve a parent inventory id to its kit composition.
 * Returns the parent + an ordered child list.
 *
 * Pass `client` to participate in an open transaction.
 */
export async function resolveKit(
  parentEquipmentId: string,
  client: SupabaseClient = supabaseAdmin
): Promise<{ resolved: ResolvedKit } | KitResolverError> {
  // 1. Parent inventory row (we need name + qr for the response
  //    + a sanity check that the row actually exists).
  const parentRes = await client
    .from('equipment_inventory')
    .select('id, name, qr_code_id')
    .eq('id', parentEquipmentId)
    .maybeSingle();
  if (parentRes.error) {
    throw new Error(
      `resolveKit: parent read failed: ${parentRes.error.message}`
    );
  }
  if (!parentRes.data) {
    return { error: 'parent_not_found', equipment_id: parentEquipmentId };
  }

  // 2. Look up the equipment_kits wrapper row.
  const kitRes = await client
    .from('equipment_kits')
    .select('id')
    .eq('inventory_id', parentEquipmentId)
    .maybeSingle();
  if (kitRes.error) {
    throw new Error(
      `resolveKit: kit-wrapper read failed: ${kitRes.error.message}`
    );
  }
  if (!kitRes.data) {
    return { error: 'parent_is_not_a_kit', equipment_id: parentEquipmentId };
  }

  const kitId = (kitRes.data as { id: string }).id;

  // 3. Children — joined with their own inventory rows so the
  //    caller has display fields without a second roundtrip.
  const childRes = await client
    .from('equipment_kit_items')
    .select(
      'id, child_equipment_id, quantity, is_required, sort_order, ' +
        'equipment_inventory:child_equipment_id (id, name, item_kind, qr_code_id)'
    )
    .eq('kit_id', kitId)
    .order('sort_order', { ascending: true });
  if (childRes.error) {
    throw new Error(
      `resolveKit: kit-children read failed: ${childRes.error.message}`
    );
  }

  const children: KitChildRef[] = ((childRes.data ?? []) as Array<{
    id: string;
    child_equipment_id: string;
    quantity: number;
    is_required: boolean;
    sort_order: number;
    equipment_inventory: {
      id: string;
      name: string | null;
      item_kind: string | null;
      qr_code_id: string | null;
    } | null;
  }>).map((row) => ({
    kit_item_id: row.id,
    child_equipment_id: row.child_equipment_id,
    child_name: row.equipment_inventory?.name ?? null,
    child_item_kind: row.equipment_inventory?.item_kind ?? null,
    child_qr_code_id: row.equipment_inventory?.qr_code_id ?? null,
    quantity: row.quantity,
    is_required: row.is_required,
    sort_order: row.sort_order,
  }));

  const parent = parentRes.data as {
    id: string;
    name: string | null;
    qr_code_id: string | null;
  };

  return {
    resolved: {
      parent_equipment_id: parent.id,
      parent_name: parent.name,
      parent_qr_code_id: parent.qr_code_id,
      kit_id: kitId,
      children,
    },
  };
}

/**
 * Given a resolved kit + a target state ('held' or
 * 'checked_out') + an optional job_id filter, return every
 * reservation across the parent + children that's currently in
 * that state. Used by the F10.5-e-ii callers to fan out a
 * single QR scan into a batch state-flip.
 *
 * For state='held' (check-out path) callers should pass `now()`
 * filters via `windowFrom`/`windowTo` so they only pull
 * reservations whose window covers the moment of the scan.
 *
 * For state='checked_out' (check-in path) the window filter is
 * intentionally omitted by callers — a checked-out reservation
 * is the unique active row for the instrument regardless of
 * window (the seeds/239 EXCLUDE guarantees one). Callers
 * provide an optional `jobIdFilter` when they want to
 * disambiguate (rare).
 */
export async function loadActiveReservationsForKit(
  resolved: ResolvedKit,
  args: {
    state: 'held' | 'checked_out';
    jobIdFilter?: string | null;
    windowFrom?: string;
    windowTo?: string;
    client?: SupabaseClient;
  }
): Promise<KitBundleReservations> {
  const client = args.client ?? supabaseAdmin;

  const inventoryIds = [
    resolved.parent_equipment_id,
    ...resolved.children.map((c) => c.child_equipment_id),
  ];

  let q = client
    .from('equipment_reservations')
    .select(
      'id, equipment_inventory_id, job_id, reserved_from, reserved_to, state'
    )
    .in('equipment_inventory_id', inventoryIds)
    .eq('state', args.state);
  if (args.jobIdFilter) q = q.eq('job_id', args.jobIdFilter);
  if (args.windowFrom) q = q.lte('reserved_from', args.windowFrom);
  if (args.windowTo) q = q.gte('reserved_to', args.windowTo);

  const { data, error } = await q;
  if (error) {
    throw new Error(
      `loadActiveReservationsForKit: ${error.message}`
    );
  }

  const rows =
    (data ?? []) as Array<{
      id: string;
      equipment_inventory_id: string;
      job_id: string;
      reserved_from: string;
      reserved_to: string;
      state: string;
    }>;

  let parentReservationId: string | null = null;
  const childReservations: KitBundleReservations['child_reservations'] = [];
  for (const row of rows) {
    if (row.equipment_inventory_id === resolved.parent_equipment_id) {
      parentReservationId = row.id;
    } else {
      childReservations.push({
        child_equipment_id: row.equipment_inventory_id,
        reservation_id: row.id,
        state: row.state,
        reserved_from: row.reserved_from,
        reserved_to: row.reserved_to,
      });
    }
  }

  return {
    parent_reservation_id: parentReservationId,
    child_reservations: childReservations,
  };
}

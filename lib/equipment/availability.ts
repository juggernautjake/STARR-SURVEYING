// lib/equipment/availability.ts
//
// Phase F10.3-b — availability engine. Runs the four §5.12.5
// checks and returns typed reasons. Pure library; the F10.3-c
// POST /reserve handler calls it inside a SELECT…FOR UPDATE
// transaction, the F10.3-b GET endpoint calls it at read-time.
//
// The four checks (any hard-block fails the unit; soft-warns
// proceed but stay attached to the assessment so the UI can
// surface them):
//
//   1. Status check    — equipment_inventory.current_status ∈
//                        {maintenance, loaned_out, lost,
//                        retired} → hard block. retired_at IS
//                        NOT NULL → hard block.
//
//   2. Reservation     — any held|checked_out row for this unit
//      overlap          whose [reserved_from, reserved_to)
//                        overlaps the requested window → hard
//                        block. Returns the conflicting job +
//                        reserved_to so the UI can suggest
//                        "available after Friday 5pm."
//
//   3. Calibration     — next_calibration_due_at < window_to
//                        → soft-warn ('calibration_overdue'),
//                        UNLESS the unit is more than
//                        `calibrationHardBlockDays` (default 30)
//                        past due → hard block. A day-one-past-
//                        due tripod is still functional; the
//                        Equipment Manager just needs to schedule
//                        cal.
//
//   4. Stock           — only when item_kind='consumable'.
//      (consumables)    quantity_on_hand < quantity_needed →
//                        hard block ('low_stock' severity 'block').
//                        At-or-below low_stock_threshold but
//                        still ≥ quantity_needed → soft-warn
//                        (the threshold is a reorder trigger,
//                        not a hard floor — so the engine lets
//                        the reservation through but flags it
//                        for the Equipment Manager's reconcile
//                        dashboard).
//
// Reservation overlap uses the same tstzrange '[)' semantics
// as the seeds/239 GiST EXCLUDE so the engine and the database
// agree on the boundary case (back-to-back reservations are
// allowed when one ends exactly when the next begins).

import type { SupabaseClient } from '@supabase/supabase-js';

import { supabaseAdmin } from '@/lib/supabase';

// ────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────

export type AvailabilityCode =
  | 'unavailable_status'
  | 'reserved_for_other_job'
  | 'calibration_overdue'
  | 'low_stock';

export type AvailabilitySeverity = 'warn' | 'block';

export type AvailabilityReason =
  | {
      code: 'unavailable_status';
      severity: 'block';
      status: string;
      retired: boolean;
      message: string;
    }
  | {
      code: 'reserved_for_other_job';
      severity: 'block';
      reservation_id: string;
      conflicting_job_id: string;
      reserved_from: string;
      reserved_to: string;
      message: string;
    }
  | {
      code: 'calibration_overdue';
      severity: AvailabilitySeverity;
      next_calibration_due_at: string;
      days_overdue: number;
      hard_block_threshold_days: number;
      message: string;
    }
  | {
      code: 'low_stock';
      severity: AvailabilitySeverity;
      on_hand: number;
      needed: number;
      low_stock_threshold: number | null;
      message: string;
    };

export interface AssessOptions {
  /** ISO timestamp — inclusive lower bound. */
  windowFrom: string;
  /** ISO timestamp — exclusive upper bound. */
  windowTo: string;
  /** Required for consumables; ignored for durables/kits. */
  quantityNeeded?: number;
  /**
   * Days past `next_calibration_due_at` after which calibration
   * becomes a hard block instead of a soft warn. Default 30.
   */
  calibrationHardBlockDays?: number;
  /**
   * Pass an existing client to participate in an open transaction
   * (the F10.3-c reserve handler does this so the assessment
   * sees the same locked snapshot). Defaults to supabaseAdmin.
   */
  client?: SupabaseClient;
}

export interface UnitAssessment {
  equipment_inventory_id: string;
  name: string | null;
  category: string | null;
  item_kind: string | null;
  current_status: string | null;
  next_available_at: string | null;
  home_location: string | null;
  vehicle_id: string | null;
  /** Reasons that prevent assignment (severity='block'). Empty = clear. */
  hard_blocks: AvailabilityReason[];
  /** Reasons attached but not blocking (severity='warn'). */
  soft_warns: AvailabilityReason[];
  /** Convenience: hard_blocks.length === 0 */
  assignable: boolean;
}

/**
 * F10.3-d substitution suggestion. Surfaced both in the GET
 * /availability response (when a unit-mode request is blocked)
 * and in POST /reserve's 409 conflict shape (when an item
 * fails). Ranked by proximity to the requested anchor — same
 * home_location wins, then same vehicle_id, then earliest
 * next_available_at — so the dispatcher sees the closest viable
 * swap first.
 */
export interface SubstitutionSuggestion {
  unit: UnitAssessment;
  rank_score: number;
  rank_reason:
    | 'same_home_location'
    | 'same_vehicle'
    | 'category_only'
    | 'blocked_alternate';
}

// Internal — the inventory + reservation columns the engine needs.
const UNIT_COLUMNS =
  'id, name, category, item_kind, current_status, retired_at, ' +
  'next_calibration_due_at, quantity_on_hand, low_stock_threshold, ' +
  'next_available_at, home_location, vehicle_id';

const RESERVATION_COLUMNS =
  'id, equipment_inventory_id, job_id, reserved_from, reserved_to, state';

const HARD_BLOCK_STATUSES = new Set([
  'maintenance',
  'loaned_out',
  'lost',
  'retired',
]);

const DEFAULT_CALIBRATION_HARD_BLOCK_DAYS = 30;

// ────────────────────────────────────────────────────────────
// Public API
// ────────────────────────────────────────────────────────────

/**
 * Assess a single inventory unit against the requested window.
 * Returns 404-style empty result (assignable=false, hard_blocks
 * carries an unavailable_status reason) when the unit is missing —
 * callers route the resulting reason to the UI same as any other
 * block.
 */
export async function assessUnit(
  unitId: string,
  opts: AssessOptions
): Promise<UnitAssessment | null> {
  const client = opts.client ?? supabaseAdmin;

  const { data, error } = await client
    .from('equipment_inventory')
    .select(UNIT_COLUMNS)
    .eq('id', unitId)
    .maybeSingle();
  if (error) {
    console.error('[equipment/availability] inventory read failed', {
      unitId,
      error: error.message,
    });
    throw new Error(`assessUnit: ${error.message}`);
  }
  if (!data) return null;

  return assessRow(data as InventoryRow, opts);
}

/**
 * Assess every non-retired unit in a category. Returns one
 * UnitAssessment per row. Caller is responsible for picking
 * the winner — typical pattern is "first row with assignable=true,
 * sorted by home_location proximity then earliest
 * next_available_at."
 */
export async function assessCategory(
  category: string,
  opts: AssessOptions
): Promise<UnitAssessment[]> {
  const client = opts.client ?? supabaseAdmin;

  const { data, error } = await client
    .from('equipment_inventory')
    .select(UNIT_COLUMNS)
    .eq('category', category)
    .is('retired_at', null)
    .order('name', { ascending: true });
  if (error) {
    console.error('[equipment/availability] category read failed', {
      category,
      error: error.message,
    });
    throw new Error(`assessCategory: ${error.message}`);
  }

  const rows = (data ?? []) as InventoryRow[];
  if (rows.length === 0) return [];

  // Batch the reservation lookup for the whole category — one
  // round-trip instead of N — then dispatch each row through the
  // pure assessRow with its own conflicts pre-filtered.
  const ids = rows.map((r) => r.id);
  const conflicts = await loadOverlappingReservations(client, ids, opts);

  const byUnit = new Map<string, ReservationRow[]>();
  for (const r of conflicts) {
    const list = byUnit.get(r.equipment_inventory_id) ?? [];
    list.push(r);
    byUnit.set(r.equipment_inventory_id, list);
  }

  return rows.map((row) =>
    assessRowSync(row, byUnit.get(row.id) ?? [], opts)
  );
}

// ────────────────────────────────────────────────────────────
// Internals
// ────────────────────────────────────────────────────────────

interface InventoryRow {
  id: string;
  name: string | null;
  category: string | null;
  item_kind: string | null;
  current_status: string | null;
  retired_at: string | null;
  next_calibration_due_at: string | null;
  quantity_on_hand: number | null;
  low_stock_threshold: number | null;
  next_available_at: string | null;
  home_location: string | null;
  vehicle_id: string | null;
}

interface ReservationRow {
  id: string;
  equipment_inventory_id: string;
  job_id: string;
  reserved_from: string;
  reserved_to: string;
  state: string;
}

async function assessRow(
  row: InventoryRow,
  opts: AssessOptions
): Promise<UnitAssessment> {
  const client = opts.client ?? supabaseAdmin;
  const overlaps = await loadOverlappingReservations(client, [row.id], opts);
  return assessRowSync(row, overlaps, opts);
}

function assessRowSync(
  row: InventoryRow,
  overlaps: ReservationRow[],
  opts: AssessOptions
): UnitAssessment {
  const hardBlocks: AvailabilityReason[] = [];
  const softWarns: AvailabilityReason[] = [];

  // 1. Status
  const statusReason = checkStatus(row);
  if (statusReason) hardBlocks.push(statusReason);

  // 2. Reservation overlap — already loaded by caller
  for (const r of overlaps) {
    hardBlocks.push({
      code: 'reserved_for_other_job',
      severity: 'block',
      reservation_id: r.id,
      conflicting_job_id: r.job_id,
      reserved_from: r.reserved_from,
      reserved_to: r.reserved_to,
      message:
        `Reserved for job ${r.job_id} until ${r.reserved_to}. ` +
        `Available after that window closes.`,
    });
  }

  // 3. Calibration
  const calibrationReason = checkCalibration(row, opts);
  if (calibrationReason) {
    if (calibrationReason.severity === 'block') {
      hardBlocks.push(calibrationReason);
    } else {
      softWarns.push(calibrationReason);
    }
  }

  // 4. Stock — consumables only
  const stockReason = checkStock(row, opts);
  if (stockReason) {
    if (stockReason.severity === 'block') {
      hardBlocks.push(stockReason);
    } else {
      softWarns.push(stockReason);
    }
  }

  return {
    equipment_inventory_id: row.id,
    name: row.name,
    category: row.category,
    item_kind: row.item_kind,
    current_status: row.current_status,
    next_available_at: row.next_available_at,
    home_location: row.home_location,
    vehicle_id: row.vehicle_id,
    hard_blocks: hardBlocks,
    soft_warns: softWarns,
    assignable: hardBlocks.length === 0,
  };
}

function checkStatus(row: InventoryRow): AvailabilityReason | null {
  if (row.retired_at) {
    return {
      code: 'unavailable_status',
      severity: 'block',
      status: row.current_status ?? 'retired',
      retired: true,
      message: `Unit was retired on ${row.retired_at}.`,
    };
  }
  if (row.current_status && HARD_BLOCK_STATUSES.has(row.current_status)) {
    return {
      code: 'unavailable_status',
      severity: 'block',
      status: row.current_status,
      retired: false,
      message: `Unit current_status='${row.current_status}'.`,
    };
  }
  return null;
}

function checkCalibration(
  row: InventoryRow,
  opts: AssessOptions
): AvailabilityReason | null {
  if (!row.next_calibration_due_at) return null;
  const dueAt = new Date(row.next_calibration_due_at).getTime();
  const windowEnd = new Date(opts.windowTo).getTime();
  if (Number.isNaN(dueAt) || Number.isNaN(windowEnd)) return null;
  if (dueAt >= windowEnd) return null;

  const overdueMs = windowEnd - dueAt;
  const daysOverdue = Math.floor(overdueMs / 86_400_000);
  const hardBlockDays =
    opts.calibrationHardBlockDays ?? DEFAULT_CALIBRATION_HARD_BLOCK_DAYS;
  const severity: AvailabilitySeverity =
    daysOverdue >= hardBlockDays ? 'block' : 'warn';

  return {
    code: 'calibration_overdue',
    severity,
    next_calibration_due_at: row.next_calibration_due_at,
    days_overdue: daysOverdue,
    hard_block_threshold_days: hardBlockDays,
    message:
      severity === 'block'
        ? `Calibration is ${daysOverdue} days overdue (threshold ${hardBlockDays}).`
        : `Calibration due ${row.next_calibration_due_at} — schedule before use.`,
  };
}

function checkStock(
  row: InventoryRow,
  opts: AssessOptions
): AvailabilityReason | null {
  if (row.item_kind !== 'consumable') return null;
  const needed = opts.quantityNeeded ?? 1;
  const onHand = row.quantity_on_hand ?? 0;

  if (onHand < needed) {
    return {
      code: 'low_stock',
      severity: 'block',
      on_hand: onHand,
      needed,
      low_stock_threshold: row.low_stock_threshold,
      message: `Only ${onHand} on hand; ${needed} requested.`,
    };
  }

  if (
    row.low_stock_threshold !== null &&
    row.low_stock_threshold !== undefined &&
    onHand - needed <= row.low_stock_threshold
  ) {
    return {
      code: 'low_stock',
      severity: 'warn',
      on_hand: onHand,
      needed,
      low_stock_threshold: row.low_stock_threshold,
      message:
        `Reservation honoured but stock will drop to ${onHand - needed} ` +
        `(at/below reorder threshold ${row.low_stock_threshold}).`,
    };
  }

  return null;
}

/**
 * Loads every active reservation that overlaps the requested
 * window for any of the given unit ids. The seeds/239 GiST
 * EXCLUDE guarantees there's at most one per unit per overlapping
 * window in practice, but the engine returns the full list in case
 * the caller wants to surface every conflict (e.g. the soft-
 * override path attaching a second active row to the same unit).
 */
async function loadOverlappingReservations(
  client: SupabaseClient,
  unitIds: string[],
  opts: AssessOptions
): Promise<ReservationRow[]> {
  if (unitIds.length === 0) return [];

  // Half-open '[)' semantics: A overlaps B iff A.from < B.to AND
  // A.to > B.from. Matches seeds/239's tstzrange(...,'[)').
  const { data, error } = await client
    .from('equipment_reservations')
    .select(RESERVATION_COLUMNS)
    .in('equipment_inventory_id', unitIds)
    .in('state', ['held', 'checked_out'])
    .lt('reserved_from', opts.windowTo)
    .gt('reserved_to', opts.windowFrom);

  if (error) {
    console.error(
      '[equipment/availability] reservations read failed',
      { unitIds, error: error.message }
    );
    throw new Error(`loadOverlappingReservations: ${error.message}`);
  }

  return (data ?? []) as ReservationRow[];
}

// ────────────────────────────────────────────────────────────
// F10.3-d — substitution suggestions
// ────────────────────────────────────────────────────────────

/**
 * Given a blocked anchor unit + the same window, return ranked
 * substitution candidates from the same category. The plan:
 *
 *   1. Anchor by the blocked unit's home_location + vehicle_id.
 *   2. Walk every other non-retired unit in the same category.
 *   3. For each, run the engine to see if it's assignable.
 *   4. Rank: assignable + same home_location → top. Then
 *      assignable + same vehicle_id. Then any other assignable
 *      ranked by name. Then non-assignable rows ranked by
 *      next_available_at ASC so the dispatcher can choose
 *      "wait" over "substitute" when nothing nearby is free.
 *
 * Capped at `limit` (default 5) so the UI doesn't have to
 * paginate. Caller can request a higher cap for the GET
 * /availability raw response.
 */
export async function proposeSubstitutionsForUnit(
  anchor: UnitAssessment,
  opts: AssessOptions & { limit?: number }
): Promise<SubstitutionSuggestion[]> {
  if (!anchor.category) return [];
  const limit = opts.limit ?? 5;

  const candidates = await assessCategory(anchor.category, opts);
  // Drop the anchor itself.
  const others = candidates.filter(
    (c) => c.equipment_inventory_id !== anchor.equipment_inventory_id
  );

  return rankSubstitutions(others, anchor, limit);
}

/**
 * Category-mode substitutions for the case where every unit in
 * the requested category was blocked. Returns the same shape so
 * the UI renders uniformly; rank_reason='blocked_alternate'
 * dominates here (no anchor unit to compare home_location/
 * vehicle to). Caller can read each candidate's
 * `next_available_at` to surface the "next S9 available Friday
 * 3pm" hint per §5.12.5.
 */
export async function proposeSubstitutionsForCategory(
  category: string,
  opts: AssessOptions & { limit?: number }
): Promise<SubstitutionSuggestion[]> {
  const limit = opts.limit ?? 5;
  const candidates = await assessCategory(category, opts);
  return rankSubstitutions(candidates, null, limit);
}

function rankSubstitutions(
  candidates: UnitAssessment[],
  anchor: UnitAssessment | null,
  limit: number
): SubstitutionSuggestion[] {
  // Score: lower is better.
  //   assignable + same home_location  → 0
  //   assignable + same vehicle_id     → 1
  //   assignable + category_only       → 2
  //   blocked + earliest_next_at       → 100 + epoch_ms / 1e10
  // Stable sort: tied scores broken by name ASC.
  const scored = candidates.map<SubstitutionSuggestion>((c) => {
    let score: number;
    let reason: SubstitutionSuggestion['rank_reason'];
    if (c.assignable) {
      if (
        anchor &&
        anchor.home_location &&
        c.home_location === anchor.home_location
      ) {
        score = 0;
        reason = 'same_home_location';
      } else if (
        anchor &&
        anchor.vehicle_id &&
        c.vehicle_id === anchor.vehicle_id
      ) {
        score = 1;
        reason = 'same_vehicle';
      } else {
        score = 2;
        reason = 'category_only';
      }
    } else {
      const nextAt = c.next_available_at
        ? Date.parse(c.next_available_at)
        : Number.POSITIVE_INFINITY;
      const epochScore = Number.isFinite(nextAt) ? nextAt / 1e10 : 1e10;
      score = 100 + epochScore;
      reason = 'blocked_alternate';
    }
    return { unit: c, rank_score: score, rank_reason: reason };
  });

  scored.sort((a, b) => {
    if (a.rank_score !== b.rank_score) return a.rank_score - b.rank_score;
    const an = a.unit.name ?? '';
    const bn = b.unit.name ?? '';
    return an.localeCompare(bn);
  });

  return scored.slice(0, limit);
}

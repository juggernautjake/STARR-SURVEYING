// app/api/admin/equipment/[id]/route.ts
//
// PATCH /api/admin/equipment/{id}
//
// Inline-edit endpoint — Phase F10.1d-i. The Equipment Manager
// edits any writable column on an existing inventory row. The
// F10.1d-ii edit-modal on the catalogue page is the primary
// caller; this endpoint stays generic so future surfaces (mobile
// drilldown, bulk-edit tooling) reuse it.
//
// Body: any subset of the F10.1c POST allow-list. Same enum +
// integer validators run; same 23505 → 409 translation on
// qr_code_id collisions. The endpoint REFUSES to set retired_at
// or retired_reason — those flow through the dedicated retire
// endpoint (F10.1e) so the audit trail can record the
// transition reason consistently.
//
// Auth: admin / developer / equipment_manager. tech_support is
// read-only; same posture as the POST.
//
// On success: returns the updated row in full. On not-found
// (no row matched the id): 404. On enum / integer validation
// failures: 400 with a typed `error` string.
//
// IMPORTANT — concurrency: this endpoint is last-write-wins.
// The §5.12.1 audit log (`equipment_events` from seeds/236)
// captures every change downstream so two admins editing the
// same row leave a paper trail; v1 doesn't add an `If-Match`
// ETag check (overkill for the cage manager use case).

import { NextRequest, NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { notifyMany } from '@/lib/notifications';

const ALLOWED_STATUSES = new Set([
  'available',
  'in_use',
  'maintenance',
  'loaned_out',
  'lost',
  'retired',
]);

const ALLOWED_ITEM_KINDS = new Set(['durable', 'consumable', 'kit']);

/** Subset of writable columns. Mirrors the POST allow-list MINUS
 *  retired_at / retired_reason (forced through F10.1e) and minus
 *  any audit / FK columns that should never be hand-edited via
 *  this surface (`created_at`, `updated_at` is set by the trigger
 *  / row-default; `id` obviously not). */
const ALLOWED_CONDITIONS = new Set([
  'new',
  'good',
  'fair',
  'poor',
  'damaged',
  'needs_repair',
]);

const ALLOWED_PATCH_KEYS = new Set([
  'name',
  'item_kind',
  'category',
  'brand',
  'model',
  'serial_number',
  'notes',
  'qr_code_id',
  'current_status',
  // seeds/238 — physical condition + image (Phase F10 polish).
  // condition_updated_at is stamped server-side when condition
  // changes; never accepted from the client directly.
  'photo_url',
  'condition',
  'acquired_at',
  'acquired_cost_cents',
  'useful_life_months',
  'placed_in_service_at',
  'last_calibrated_at',
  'next_calibration_due_at',
  'warranty_expires_at',
  'service_contract_vendor',
  'last_serviced_at',
  'unit',
  'quantity_on_hand',
  'low_stock_threshold',
  'last_restocked_at',
  'vendor',
  'cost_per_unit_cents',
  'home_location',
  'vehicle_id',
  'is_personal',
  'owner_user_id',
  'serial_suspect',
]);

const SELECT_COLUMNS =
  'id, name, category, item_kind, current_status, qr_code_id, ' +
  'brand, model, serial_number, notes, ' +
  'photo_url, condition, condition_updated_at, ' +
  'acquired_at, acquired_cost_cents, useful_life_months, ' +
  'placed_in_service_at, ' +
  'last_calibrated_at, next_calibration_due_at, warranty_expires_at, ' +
  'service_contract_vendor, last_serviced_at, ' +
  'unit, quantity_on_hand, low_stock_threshold, last_restocked_at, ' +
  'vendor, cost_per_unit_cents, ' +
  'home_location, vehicle_id, ' +
  'is_personal, owner_user_id, ' +
  'retired_at, retired_reason, serial_suspect, ' +
  'created_at, updated_at';

interface PatchBody {
  [key: string]: unknown;
}

// ── GET /api/admin/equipment/{id} — drilldown read endpoint ────────────────
//
// Returns the full row + a 1h signed photo URL + recent
// assignment history (last 50 rows from job_equipment joined w/
// jobs by id). Powers the upcoming /admin/equipment/[id]
// drilldown page that surfaces "what team has been assigned to"
// per the user's follow-up directive.
//
// Auth: admin / developer / tech_support / equipment_manager —
// every internal role can read inventory drilldown.
//
// Future extensions (queued):
//   * kit memberships when seeds/235 has rows
//   * template line-item back-references
//   * maintenance event history when seeds/241 lands
//   * reservations open/recent when seeds/239 lands
export const GET = withErrorHandler(
  async (req: NextRequest) => {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userRoles = (session.user as { roles?: string[] } | undefined)
      ?.roles ?? [];
    if (
      !isAdmin(session.user.roles) &&
      !userRoles.includes('tech_support') &&
      !userRoles.includes('equipment_manager')
    ) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const url = new URL(req.url);
    const pathSegments = url.pathname.split('/').filter(Boolean);
    const id = pathSegments[pathSegments.length - 1];
    if (
      !id ||
      !/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(
        id
      )
    ) {
      return NextResponse.json(
        { error: 'id must be a UUID' },
        { status: 400 }
      );
    }

    // Three parallel queries: the row + the assignment history +
    // F10.7 maintenance history. Photo signed URL kicks off after
    // the row read so we don't hit storage for a row that doesn't
    // exist.
    const [rowRes, historyRes, maintenanceRes] = await Promise.all([
      supabaseAdmin
        .from('equipment_inventory')
        .select(SELECT_COLUMNS)
        .eq('id', id)
        .maybeSingle(),
      supabaseAdmin
        .from('job_equipment')
        .select(
          'id, job_id, checked_out_by, checked_out_at, returned_at, ' +
            'equipment_name, serial_number, notes, ' +
            'jobs(id, name, job_number)'
        )
        .eq('equipment_inventory_id', id)
        .order('checked_out_at', {
          ascending: false,
          nullsFirst: false,
        })
        .limit(50),
      supabaseAdmin
        .from('maintenance_events')
        .select(
          'id, kind, origin, state, scheduled_for, started_at, ' +
            'completed_at, vendor_name, cost_cents, qa_passed, ' +
            'next_due_at, summary'
        )
        .eq('equipment_inventory_id', id)
        .order('scheduled_for', {
          ascending: false,
          nullsFirst: false,
        })
        .limit(50),
    ]);

    if (rowRes.error) {
      console.error('[admin/equipment/:id] row read failed', {
        id,
        error: rowRes.error.message,
      });
      return NextResponse.json(
        { error: rowRes.error.message },
        { status: 500 }
      );
    }
    if (!rowRes.data) {
      return NextResponse.json(
        { error: 'Equipment row not found' },
        { status: 404 }
      );
    }

    const row = rowRes.data as { photo_url: string | null };
    let photoSignedUrl: string | null = null;
    if (row.photo_url) {
      const { data: signed } = await supabaseAdmin.storage
        .from('starr-field-equipment-photos')
        .createSignedUrl(row.photo_url, 60 * 60);
      photoSignedUrl = signed?.signedUrl ?? null;
    }

    // Surface history-fetch errors as a non-fatal warning — the
    // drilldown page renders the row even when history is broken.
    const history = historyRes.error ? [] : historyRes.data ?? [];
    if (historyRes.error) {
      console.warn(
        '[admin/equipment/:id] assignment history read failed',
        { id, error: historyRes.error.message }
      );
    }
    const maintenance = maintenanceRes.error
      ? []
      : maintenanceRes.data ?? [];
    if (maintenanceRes.error) {
      console.warn(
        '[admin/equipment/:id] maintenance history read failed',
        { id, error: maintenanceRes.error.message }
      );
    }

    return NextResponse.json({
      item: rowRes.data,
      photo_signed_url: photoSignedUrl,
      assignment_history: history,
      assignment_history_error:
        historyRes.error?.message ?? null,
      maintenance_history: maintenance,
      maintenance_history_error:
        maintenanceRes.error?.message ?? null,
    });
  },
  { routeName: 'admin/equipment/:id#get' }
);

export const PATCH = withErrorHandler(
  async (req: NextRequest) => {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userRoles = (session.user as { roles?: string[] } | undefined)
      ?.roles ?? [];
    if (
      !isAdmin(session.user.roles) &&
      !userRoles.includes('equipment_manager')
    ) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Extract `[id]` from the URL pathname — Next.js route handler
    // params object varies between page-router and app-router so
    // pathname parsing is the most portable shape.
    const url = new URL(req.url);
    const pathSegments = url.pathname.split('/').filter(Boolean);
    const id = pathSegments[pathSegments.length - 1];
    if (!id || id === 'route.ts') {
      return NextResponse.json({ error: 'Missing id' }, { status: 400 });
    }
    // UUID sanity-check — defends against accidental `/api/admin/equipment/inventory`
    // or similar typos getting fed as ids.
    if (!/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(id)) {
      return NextResponse.json(
        { error: 'id must be a UUID' },
        { status: 400 }
      );
    }

    let body: PatchBody;
    try {
      body = (await req.json()) as PatchBody;
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON body' },
        { status: 400 }
      );
    }

    const update: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(body)) {
      if (ALLOWED_PATCH_KEYS.has(k) && v !== undefined) {
        update[k] = v;
      }
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json(
        { error: 'No writable fields supplied' },
        { status: 400 }
      );
    }

    // Validate enums + integers — same checks as the POST so the
    // error messages match.
    if (update.item_kind !== undefined) {
      if (
        typeof update.item_kind !== 'string' ||
        !ALLOWED_ITEM_KINDS.has(update.item_kind)
      ) {
        return NextResponse.json(
          {
            error: 'item_kind must be one of: durable | consumable | kit',
          },
          { status: 400 }
        );
      }
    }
    if (update.current_status !== undefined) {
      if (
        typeof update.current_status !== 'string' ||
        !ALLOWED_STATUSES.has(update.current_status)
      ) {
        return NextResponse.json(
          {
            error:
              'current_status must be one of: ' +
              Array.from(ALLOWED_STATUSES).join(', '),
          },
          { status: 400 }
        );
      }
    }
    // seeds/238 condition (physical condition, distinct from
    // current_status lifecycle). Stamp condition_updated_at
    // server-side every time the value lands; never accept a
    // client value for that timestamp.
    if (update.condition !== undefined) {
      if (update.condition === null) {
        update.condition_updated_at = null;
      } else if (
        typeof update.condition !== 'string' ||
        !ALLOWED_CONDITIONS.has(update.condition)
      ) {
        return NextResponse.json(
          {
            error:
              'condition must be one of: ' +
              Array.from(ALLOWED_CONDITIONS).join(', '),
          },
          { status: 400 }
        );
      } else {
        update.condition_updated_at = new Date().toISOString();
      }
    }
    if (typeof update.photo_url === 'string') {
      const trimmedPhoto = update.photo_url.trim();
      update.photo_url = trimmedPhoto || null;
    }
    if (typeof update.name === 'string') {
      const trimmed = update.name.trim();
      if (!trimmed) {
        return NextResponse.json(
          { error: 'name cannot be empty' },
          { status: 400 }
        );
      }
      if (trimmed.length > 200) {
        return NextResponse.json(
          { error: 'name must be ≤200 characters' },
          { status: 400 }
        );
      }
      update.name = trimmed;
    }
    if (typeof update.qr_code_id === 'string') {
      const normalized = update.qr_code_id.trim().toUpperCase().slice(0, 64);
      if (!normalized) {
        return NextResponse.json(
          {
            error: 'qr_code_id cannot be cleared via PATCH; set a new value',
          },
          { status: 400 }
        );
      }
      update.qr_code_id = normalized;
    }
    for (const key of [
      'acquired_cost_cents',
      'cost_per_unit_cents',
      'quantity_on_hand',
      'low_stock_threshold',
      'useful_life_months',
    ] as const) {
      const v = update[key];
      if (v !== undefined && v !== null) {
        if (typeof v !== 'number' || !Number.isInteger(v) || v < 0) {
          return NextResponse.json(
            { error: `${key} must be a non-negative integer` },
            { status: 400 }
          );
        }
      }
    }

    // Always stamp updated_at — the seeds/233 default fires only on
    // INSERT; UPDATEs need the application to refresh it.
    update.updated_at = new Date().toISOString();

    // F10.8 — pre-read the current_status when the PATCH is
    // touching it so we can fire equipment_status_change
    // notifications to affected reservation holders. The read is
    // SKIPPED when current_status isn't in the body so common
    // edits (renaming, condition, photo) don't pay the cost.
    let oldStatus: string | null = null;
    if (typeof update.current_status === 'string') {
      const { data: existing } = await supabaseAdmin
        .from('equipment_inventory')
        .select('current_status')
        .eq('id', id)
        .maybeSingle();
      oldStatus =
        (existing as { current_status?: string | null } | null)
          ?.current_status ?? null;
    }

    const { data, error } = await supabaseAdmin
      .from('equipment_inventory')
      .update(update)
      .eq('id', id)
      .select(SELECT_COLUMNS)
      .maybeSingle();

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json(
          {
            error: `qr_code_id "${update.qr_code_id ?? '(unknown)'}" is already taken`,
          },
          { status: 409 }
        );
      }
      console.error('[admin/equipment/:id] update failed', {
        id,
        error: error.message,
        admin_email: session.user.email,
      });
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json(
        { error: 'Equipment row not found' },
        { status: 404 }
      );
    }

    console.log('[admin/equipment/:id] updated', {
      id,
      keys: Object.keys(update).filter((k) => k !== 'updated_at'),
      admin_email: session.user.email,
    });

    // F10.8 — equipment_status_change notification fan-out.
    // Fires when current_status flipped to a state that blocks
    // (or restores) reservations. Affected users = anyone with an
    // active reservation (held / checked_out, reserved_to in the
    // future) for this unit. Best-effort; failures don't roll
    // back the PATCH (the row is already audit-recoverable via
    // equipment_events).
    if (
      typeof update.current_status === 'string' &&
      oldStatus &&
      oldStatus !== update.current_status
    ) {
      const newStatus = update.current_status as string;
      await emitStatusChangeNotification({
        equipmentInventoryId: id,
        equipmentName:
          (data as { name?: string | null } | null)?.name ?? null,
        oldStatus,
        newStatus,
        actorEmail: session.user.email ?? null,
      });
    }

    return NextResponse.json({ item: data });
  },
  { routeName: 'admin/equipment/:id#patch' }
);

// ────────────────────────────────────────────────────────────
// F10.8 — equipment_status_change notification fan-out
// ────────────────────────────────────────────────────────────
//
// "Disrupting" status flips (available → maintenance / lost /
// retired) push a notification to every user holding an active
// reservation. "Restoring" flips (maintenance → available)
// notify the same set so the reservation hold is back on the
// calendar without the EM having to chase people down. No-op
// for cosmetic flips (in_use → loaned_out) where the surveyor
// already knows the gear is out.

const STATUS_DISRUPTING = new Set(['maintenance', 'lost', 'retired']);
const STATUS_RESTORING = new Set(['available', 'in_use']);

async function emitStatusChangeNotification(args: {
  equipmentInventoryId: string;
  equipmentName: string | null;
  oldStatus: string;
  newStatus: string;
  actorEmail: string | null;
}): Promise<void> {
  const becameDisrupted =
    !STATUS_DISRUPTING.has(args.oldStatus) &&
    STATUS_DISRUPTING.has(args.newStatus);
  const becameRestored =
    STATUS_DISRUPTING.has(args.oldStatus) &&
    STATUS_RESTORING.has(args.newStatus);
  if (!becameDisrupted && !becameRestored) return;

  try {
    const nowIso = new Date().toISOString();
    const { data: reservations, error: resErr } = await supabaseAdmin
      .from('equipment_reservations')
      .select(
        'id, job_id, reserved_from, reserved_to, state, ' +
          'checked_out_to_user, created_by'
      )
      .eq('equipment_inventory_id', args.equipmentInventoryId)
      .in('state', ['held', 'checked_out'])
      .gte('reserved_to', nowIso);
    if (resErr) {
      console.warn(
        '[admin/equipment/:id] status_change reservation lookup failed',
        { error: resErr.message }
      );
      return;
    }
    const rows = (reservations ?? []) as Array<{
      id: string;
      job_id: string;
      reserved_from: string;
      reserved_to: string;
      state: string;
      checked_out_to_user: string | null;
      created_by: string | null;
    }>;
    if (rows.length === 0) return;

    // Resolve the union of (assignee + reservation creator) UUIDs
    // to emails in one batched read.
    const userIds = Array.from(
      new Set(
        rows
          .flatMap((r) => [r.checked_out_to_user, r.created_by])
          .filter((v): v is string => !!v)
      )
    );
    const emailById = new Map<string, string>();
    if (userIds.length > 0) {
      const { data: users } = await supabaseAdmin
        .from('registered_users')
        .select('id, email')
        .in('id', userIds);
      for (const u of (users ?? []) as Array<{
        id: string;
        email: string | null;
      }>) {
        if (u.email) emailById.set(u.id, u.email);
      }
    }

    const recipients = Array.from(
      new Set(
        rows
          .flatMap((r) => [
            r.checked_out_to_user
              ? emailById.get(r.checked_out_to_user)
              : undefined,
            r.created_by ? emailById.get(r.created_by) : undefined,
          ])
          .filter((v): v is string => !!v)
      )
    );
    if (recipients.length === 0) return;

    const eqName = args.equipmentName ?? 'equipment';
    const flipLabel = `${args.oldStatus.replace(/_/g, ' ')} → ${args.newStatus.replace(/_/g, ' ')}`;
    await notifyMany(recipients, {
      type: 'equipment_status_change',
      title: becameDisrupted
        ? `Status change: ${eqName} now ${args.newStatus.replace(/_/g, ' ')}`
        : `Restored: ${eqName} is ${args.newStatus.replace(/_/g, ' ')} again`,
      body:
        `${eqName} flipped ${flipLabel}` +
        (args.actorEmail ? ` (by ${args.actorEmail})` : '') +
        '. ' +
        (becameDisrupted
          ? `${rows.length} active reservation(s) may need to be rebooked.`
          : `${rows.length} active reservation(s) can proceed as planned.`),
      icon: becameDisrupted ? '⚠️' : '✓',
      escalation_level: becameDisrupted ? 'high' : 'normal',
      source_type: 'equipment_status_change',
      source_id: args.equipmentInventoryId,
      link: `/admin/equipment/${args.equipmentInventoryId}`,
    });
  } catch (err) {
    console.warn(
      '[admin/equipment/:id] equipment_status_change notify failed',
      {
        equipment_inventory_id: args.equipmentInventoryId,
        error: err instanceof Error ? err.message : String(err),
      }
    );
  }
}

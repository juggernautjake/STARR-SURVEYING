// app/api/admin/equipment/check-out/route.ts
//
// POST /api/admin/equipment/check-out
//
// Phase F10.5-b — the morning-scan endpoint that physically
// consumes a §5.12.5 held reservation. Flips a single
// reservation `state='held' → 'checked_out'` and stamps the
// audit-trail columns from seeds/242 (actor, recipient,
// vehicle, condition, photo).
//
// Two entry points:
//
//   * `qr_code_id` — the mobile scanner / office walk-up case.
//     Resolves QR → equipment_inventory_id → unique held
//     reservation overlapping `now()`. Multiple held
//     reservations on the same instrument are extremely rare
//     (the seeds/239 GiST EXCLUDE forbids overlapping ACTIVE
//     rows), but if a future window is held alongside a
//     current one, the caller can pass `job_id` or
//     `reservation_id` to disambiguate.
//
//   * `reservation_id` — the admin-web walk-up case where the
//     dispatcher already picked the row from the catalogue.
//     Skips QR resolution.
//
// Exactly one of the two is required.
//
// Damage / lost triage on check-out condition='damaged' is NOT
// wired in this batch — that lands in F10.5-g. For v1 the
// column is simply persisted; the maintenance event creation +
// status flip + Equipment Manager notification all happen in
// F10.5-g once the maintenance schema (seeds/243+) lands.
//
// Kit batch flow (parent scan pulls all children) — opt in via
// `kit_mode: true` when the QR-resolved instrument is a kit
// parent per §5.12.1.C. The handler walks every child held
// reservation matching the same window + job_id and flips them
// alongside the parent in one batch UPDATE. Per the spec,
// kit-level audit fields apply uniformly to parent + children
// (single condition photo at the case-exterior level); per-
// child exception flagging is a v1+ polish. Kit-mode requires
// `qr_code_id` (not `reservation_id`) and requires the
// resolved instrument to actually be a registered kit. v1
// refuses kit_mode for kits whose children include consumables
// — kits in practice hold durables (total station + tripod +
// data collector), so this gate keeps the consumables decrement
// flow on the single-row path until a durable+consumable
// hybrid kit shows up.
//
// Auth: admin / developer / equipment_manager. Crew-lead
// self-service via `equipment_self_checkout` flag is F10.5-h.

import { NextRequest, NextResponse } from 'next/server';

import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { notify } from '@/lib/notifications';
import {
  loadActiveReservationsForKit,
  resolveKit,
} from '@/lib/equipment/kit-resolver';

const UUID_RE =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

const ALLOWED_CONDITIONS = new Set(['good', 'fair', 'damaged']);

interface ReservationRow {
  id: string;
  equipment_inventory_id: string;
  job_id: string;
  reserved_from: string;
  reserved_to: string;
  state: string;
  is_override: boolean;
  notes: string | null;
}

export const POST = withErrorHandler(
  async (req: NextRequest) => {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userRoles = (session.user as { roles?: string[] } | undefined)
      ?.roles ?? [];
    const isPrivileged =
      isAdmin(session.user.roles) ||
      userRoles.includes('equipment_manager');

    // F10.5-h-ii: self-service after-hours flag. Non-privileged
    // users with `registered_users.equipment_self_checkout=true`
    // can scan gear out without admin/EM roles. Hank toggles the
    // flag per-user for trusted crew leads (§5.12.6 self-service
    // protocol). The audit-log line below distinguishes
    // privileged walk-ups from self-service so the EM can
    // reconcile after-hours activity on the §5.12.7 dashboard.
    let selfServiceBypass = false;
    if (!isPrivileged) {
      const { data: ruRow, error: ruErr } = await supabaseAdmin
        .from('registered_users')
        .select('equipment_self_checkout')
        .eq('email', session.user.email.toLowerCase())
        .maybeSingle();
      if (ruErr) {
        console.warn(
          '[admin/equipment/check-out] self-service flag lookup failed',
          { email: session.user.email, error: ruErr.message }
        );
      } else if (
        ruRow &&
        (ruRow as { equipment_self_checkout?: boolean })
          .equipment_self_checkout === true
      ) {
        selfServiceBypass = true;
      }
      if (!selfServiceBypass) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    }
    const actorUserId =
      (session.user as { id?: string } | undefined)?.id ?? null;
    if (!actorUserId) {
      return NextResponse.json(
        { error: 'Session is missing user id; cannot author check-out.' },
        { status: 500 }
      );
    }

    const body = (await req.json().catch(() => null)) as
      | {
          qr_code_id?: unknown;
          reservation_id?: unknown;
          job_id?: unknown;
          condition?: unknown;
          photo_url?: unknown;
          to_user?: unknown;
          to_vehicle?: unknown;
          kit_mode?: unknown;
        }
      | null;
    if (!body || typeof body !== 'object') {
      return NextResponse.json(
        { error: 'Body must be a JSON object.' },
        { status: 400 }
      );
    }

    const qrCodeRaw =
      typeof body.qr_code_id === 'string' ? body.qr_code_id.trim() : '';
    const reservationIdRaw =
      typeof body.reservation_id === 'string'
        ? body.reservation_id.trim()
        : '';
    const hasQr = qrCodeRaw.length > 0;
    const hasReservationId = reservationIdRaw.length > 0;
    if (hasQr === hasReservationId) {
      return NextResponse.json(
        {
          error:
            'Provide exactly one of `qr_code_id` (scanner path) or ' +
            '`reservation_id` (dispatcher walk-up path).',
        },
        { status: 400 }
      );
    }
    if (hasReservationId && !UUID_RE.test(reservationIdRaw)) {
      return NextResponse.json(
        { error: '`reservation_id` must be a valid UUID.' },
        { status: 400 }
      );
    }

    const condition =
      typeof body.condition === 'string' ? body.condition.trim() : '';
    if (!ALLOWED_CONDITIONS.has(condition)) {
      return NextResponse.json(
        {
          error:
            '`condition` must be one of: ' +
            Array.from(ALLOWED_CONDITIONS).join(', '),
        },
        { status: 400 }
      );
    }

    const toUser =
      typeof body.to_user === 'string' ? body.to_user.trim() : '';
    if (!UUID_RE.test(toUser)) {
      return NextResponse.json(
        { error: '`to_user` must be a valid UUID.' },
        { status: 400 }
      );
    }

    let toVehicle: string | null = null;
    if (body.to_vehicle !== undefined && body.to_vehicle !== null) {
      if (
        typeof body.to_vehicle !== 'string' ||
        !UUID_RE.test(body.to_vehicle)
      ) {
        return NextResponse.json(
          { error: '`to_vehicle` must be a valid UUID when present.' },
          { status: 400 }
        );
      }
      toVehicle = body.to_vehicle;
    }

    let photoUrl: string | null = null;
    if (body.photo_url !== undefined && body.photo_url !== null) {
      if (typeof body.photo_url !== 'string') {
        return NextResponse.json(
          { error: '`photo_url` must be a string.' },
          { status: 400 }
        );
      }
      const trimmed = body.photo_url.trim();
      if (trimmed.length > 0) photoUrl = trimmed;
    }
    // Damaged returns are the audit-anchor case — require a
    // photo so the maintenance triage in F10.5-g has visual
    // evidence. (Spec: "A condition photo isn't required for
    // 'good' returns, but it IS required for 'damaged', 'fair',
    // or 'lost'." Same rule on check-out — a check-out that
    // notes damaged condition is an "in-shop verified before
    // sending" annotation that should carry photo proof.)
    if (
      (condition === 'damaged' || condition === 'fair') &&
      !photoUrl
    ) {
      return NextResponse.json(
        {
          error:
            `condition='${condition}' requires a photo_url for the ` +
            'audit trail.',
        },
        { status: 400 }
      );
    }

    let jobIdFilter: string | null = null;
    if (body.job_id !== undefined && body.job_id !== null) {
      if (typeof body.job_id !== 'string' || !UUID_RE.test(body.job_id)) {
        return NextResponse.json(
          { error: '`job_id` must be a valid UUID when present.' },
          { status: 400 }
        );
      }
      jobIdFilter = body.job_id;
    }

    const kitMode = body.kit_mode === true;
    if (kitMode && !hasQr) {
      return NextResponse.json(
        {
          error:
            'kit_mode=true requires qr_code_id — fan-out runs from a ' +
            'kit-parent QR scan, not a direct reservation pick.',
        },
        { status: 400 }
      );
    }

    // ── Kit-batch fan-out path ──────────────────────────────────
    if (kitMode) {
      const kitResult = await applyKitCheckout({
        qrCodeId: qrCodeRaw,
        jobIdFilter,
        condition,
        photoUrl,
        toUser,
        toVehicle,
        actorUserId,
        actorEmail: session.user.email,
        selfServiceBypass,
      });
      return kitResult;
    }

    // ── Resolve to a single held reservation ────────────────────
    const reservation = await resolveReservation({
      hasQr,
      qrCodeId: qrCodeRaw,
      reservationId: reservationIdRaw,
      jobIdFilter,
    });
    if ('error' in reservation) return reservation.error;
    const row = reservation.row;

    if (row.state !== 'held') {
      return NextResponse.json(
        {
          error:
            row.state === 'checked_out'
              ? 'Reservation is already checked out — nothing to do.'
              : `Reservation is in state '${row.state}' and not ` +
                'check-out-able.',
          current_state: row.state,
        },
        { status: 409 }
      );
    }

    // ── Update with TOCTOU guard ────────────────────────────────
    const nowIso = new Date().toISOString();
    const { data: updated, error: updateErr } = await supabaseAdmin
      .from('equipment_reservations')
      .update({
        state: 'checked_out',
        actual_checked_out_at: nowIso,
        checked_out_by: actorUserId,
        checked_out_to_user: toUser,
        checked_out_to_vehicle: toVehicle,
        checked_out_condition: condition,
        checked_out_photo_url: photoUrl,
      })
      .eq('id', row.id)
      .eq('state', 'held') // race guard
      .select(
        'id, equipment_inventory_id, job_id, reserved_from, reserved_to, ' +
          'state, actual_checked_out_at, checked_out_by, ' +
          'checked_out_to_user, checked_out_to_vehicle, ' +
          'checked_out_condition, checked_out_photo_url, is_override, ' +
          'override_reason, notes, updated_at'
      )
      .maybeSingle();
    if (updateErr) {
      console.error(
        '[admin/equipment/check-out POST] update failed',
        { reservationId: row.id, error: updateErr.message }
      );
      return NextResponse.json(
        { error: updateErr.message },
        { status: 500 }
      );
    }
    if (!updated) {
      // Lost a race — somebody else flipped it between our read
      // and write. Re-read so the caller sees the actual state.
      const { data: latest } = await supabaseAdmin
        .from('equipment_reservations')
        .select('state')
        .eq('id', row.id)
        .maybeSingle();
      const latestState =
        (latest as { state?: string } | null)?.state ?? 'unknown';
      return NextResponse.json(
        {
          error:
            'Reservation state changed between read and write. ' +
            'Refetch and retry.',
          current_state: latestState,
        },
        { status: 409 }
      );
    }

    // F10.5-g will hook the damage-triage flow off the checked_
    // out_condition='damaged' branch here. For v1 we simply
    // persist + log so the audit trail anchors regardless.
    console.log('[admin/equipment/check-out POST] ok', {
      reservation_id: row.id,
      equipment_inventory_id: row.equipment_inventory_id,
      job_id: row.job_id,
      to_user: toUser,
      to_vehicle: toVehicle,
      condition,
      had_photo: !!photoUrl,
      actor_email: session.user.email,
      self_service_bypass: selfServiceBypass,
    });

    // F10.8 — equipment_assignment notification. Fires AFTER the
    // check-out commits so the surveyor sees an inbox entry with
    // the equipment + job + reserved window the next time the
    // mobile app syncs. Best-effort: notify failure does NOT roll
    // back the check-out (the row is audit-recoverable via
    // equipment_events). Kit-level checkouts emit a single
    // notification at the parent — child rows stay quiet to avoid
    // an inbox flood.
    await emitAssignmentNotification({
      reservationId: (updated as { id: string }).id,
      equipmentInventoryId: (
        updated as { equipment_inventory_id: string }
      ).equipment_inventory_id,
      jobId: (updated as { job_id: string }).job_id,
      reservedTo: (updated as { reserved_to: string }).reserved_to,
      toUserId: toUser,
    });

    return NextResponse.json({
      reservation: updated,
      previous_state: 'held',
    });
  },
  { routeName: 'admin/equipment/check-out#post' }
);

// ────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────

async function applyKitCheckout(args: {
  qrCodeId: string;
  jobIdFilter: string | null;
  condition: string;
  photoUrl: string | null;
  toUser: string;
  toVehicle: string | null;
  actorUserId: string;
  actorEmail: string | null | undefined;
  selfServiceBypass: boolean;
}): Promise<NextResponse> {
  // 1. QR → parent equipment_inventory id (refuse retired).
  const inv = await supabaseAdmin
    .from('equipment_inventory')
    .select('id, retired_at')
    .eq('qr_code_id', args.qrCodeId)
    .maybeSingle();
  if (inv.error) {
    return NextResponse.json({ error: inv.error.message }, { status: 500 });
  }
  if (!inv.data) {
    return NextResponse.json(
      { error: 'No equipment matches that QR code.', code: 'qr_unknown' },
      { status: 404 }
    );
  }
  const parentRow = inv.data as { id: string; retired_at: string | null };
  if (parentRow.retired_at) {
    return NextResponse.json(
      {
        error:
          `Equipment was retired on ${parentRow.retired_at}; refusing ` +
          'kit-mode check-out.',
        code: 'retired',
      },
      { status: 409 }
    );
  }

  // 2. Resolve kit composition.
  const kit = await resolveKit(parentRow.id);
  if ('error' in kit) {
    if (kit.error === 'parent_is_not_a_kit') {
      return NextResponse.json(
        {
          error:
            'kit_mode=true but the scanned instrument is not registered ' +
            'as a kit parent. Drop kit_mode or scan the kit case QR.',
          code: 'parent_is_not_a_kit',
        },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: 'Kit parent not found.', code: 'parent_not_found' },
      { status: 404 }
    );
  }
  const resolved = kit.resolved;

  // v1 gate: refuse kit-mode when any child is a consumable.
  // The single-row /check-out path handles consumables cleanly;
  // kits in practice hold durables. This gate prevents silent
  // bugs when a future hybrid kit lands.
  const consumableChild = resolved.children.find(
    (c) => c.child_item_kind === 'consumable'
  );
  if (consumableChild) {
    return NextResponse.json(
      {
        error:
          `Kit '${resolved.parent_name ?? resolved.parent_equipment_id}' ` +
          `contains a consumable child (` +
          `${consumableChild.child_name ?? consumableChild.child_equipment_id}` +
          `); use single-row check-out for these until kit consumables ` +
          'support lands.',
        code: 'kit_has_consumable_child',
      },
      { status: 400 }
    );
  }

  // 3. Find every held reservation across parent + children
  // overlapping now() (and matching job_id when supplied).
  const nowIso = new Date().toISOString();
  const bundle = await loadActiveReservationsForKit(resolved, {
    state: 'held',
    jobIdFilter: args.jobIdFilter,
    windowFrom: nowIso,
    windowTo: nowIso,
  });

  if (!bundle.parent_reservation_id) {
    return NextResponse.json(
      {
        error:
          'No held reservation matches the kit parent for the current ' +
          'window. Apply / reserve the kit first, or pass job_id to ' +
          'disambiguate.',
        code: 'no_matching_kit_reservation',
      },
      { status: 404 }
    );
  }

  // Required-child gate: every required child must have a
  // matching reservation, otherwise the kit is incomplete.
  // Optional children without reservations are fine.
  const reservedChildIds = new Set(
    bundle.child_reservations.map((r) => r.child_equipment_id)
  );
  const missingRequired = resolved.children.filter(
    (c) => c.is_required && !reservedChildIds.has(c.child_equipment_id)
  );
  if (missingRequired.length > 0) {
    return NextResponse.json(
      {
        error:
          'Kit has required children with no held reservation in the ' +
          'current window. Re-apply the template or split into single-' +
          'row check-outs.',
        code: 'missing_required_children',
        missing: missingRequired.map((c) => ({
          child_equipment_id: c.child_equipment_id,
          child_name: c.child_name,
        })),
      },
      { status: 409 }
    );
  }

  // 4. Batch UPDATE every reservation in the bundle.
  const ids = [
    bundle.parent_reservation_id,
    ...bundle.child_reservations.map((r) => r.reservation_id),
  ];
  const { data: updated, error: updateErr } = await supabaseAdmin
    .from('equipment_reservations')
    .update({
      state: 'checked_out',
      actual_checked_out_at: nowIso,
      checked_out_by: args.actorUserId,
      checked_out_to_user: args.toUser,
      checked_out_to_vehicle: args.toVehicle,
      checked_out_condition: args.condition,
      checked_out_photo_url: args.photoUrl,
    })
    .in('id', ids)
    .eq('state', 'held') // race guard for the whole batch
    .select(
      'id, equipment_inventory_id, job_id, reserved_from, reserved_to, ' +
        'state, actual_checked_out_at, checked_out_by, ' +
        'checked_out_to_user, checked_out_to_vehicle, ' +
        'checked_out_condition, checked_out_photo_url, is_override, ' +
        'override_reason, notes, updated_at'
    );

  if (updateErr) {
    console.error(
      '[admin/equipment/check-out POST kit] update failed',
      { kit_id: resolved.kit_id, error: updateErr.message }
    );
    return NextResponse.json(
      { error: updateErr.message },
      { status: 500 }
    );
  }

  const flippedRows = updated ?? [];
  if (flippedRows.length !== ids.length) {
    // Partial flip — at least one row's state moved between
    // our read and write. Surface so the dispatcher refetches.
    return NextResponse.json(
      {
        error:
          `Kit batch was partially blocked — ${flippedRows.length}/${ids.length} ` +
          'rows flipped to checked_out. Refetch the kit and retry.',
        code: 'partial_kit_flip',
        flipped_count: flippedRows.length,
        expected_count: ids.length,
      },
      { status: 409 }
    );
  }

  console.log('[admin/equipment/check-out POST kit] ok', {
    kit_id: resolved.kit_id,
    parent_equipment_id: resolved.parent_equipment_id,
    child_count: bundle.child_reservations.length,
    flipped_count: flippedRows.length,
    actor_email: args.actorEmail,
    self_service_bypass: args.selfServiceBypass,
  });

  return NextResponse.json({
    mode: 'kit',
    kit: {
      kit_id: resolved.kit_id,
      parent_equipment_id: resolved.parent_equipment_id,
      parent_name: resolved.parent_name,
    },
    reservations: flippedRows,
    previous_state: 'held',
  });
}

async function resolveReservation(args: {
  hasQr: boolean;
  qrCodeId: string;
  reservationId: string;
  jobIdFilter: string | null;
}): Promise<{ row: ReservationRow } | { error: NextResponse }> {
  const { hasQr, qrCodeId, reservationId, jobIdFilter } = args;

  if (!hasQr) {
    const { data, error } = await supabaseAdmin
      .from('equipment_reservations')
      .select(
        'id, equipment_inventory_id, job_id, reserved_from, reserved_to, ' +
          'state, is_override, notes'
      )
      .eq('id', reservationId)
      .maybeSingle();
    if (error) {
      return {
        error: NextResponse.json({ error: error.message }, { status: 500 }),
      };
    }
    if (!data) {
      return {
        error: NextResponse.json(
          { error: 'Reservation not found.' },
          { status: 404 }
        ),
      };
    }
    return { row: data as ReservationRow };
  }

  // QR path: lookup instrument, then find a unique held
  // reservation overlapping now() (and matching job_id if
  // provided).
  const inv = await supabaseAdmin
    .from('equipment_inventory')
    .select('id, retired_at')
    .eq('qr_code_id', qrCodeId)
    .maybeSingle();
  if (inv.error) {
    return {
      error: NextResponse.json(
        { error: inv.error.message },
        { status: 500 }
      ),
    };
  }
  if (!inv.data) {
    return {
      error: NextResponse.json(
        {
          error: 'No equipment matches that QR code.',
          code: 'qr_unknown',
        },
        { status: 404 }
      ),
    };
  }
  const equipmentId = (inv.data as { id: string; retired_at: string | null })
    .id;
  const retiredAt = (inv.data as {
    id: string;
    retired_at: string | null;
  }).retired_at;
  if (retiredAt) {
    return {
      error: NextResponse.json(
        {
          error: `Equipment was retired on ${retiredAt}; refusing check-out.`,
          code: 'retired',
        },
        { status: 409 }
      ),
    };
  }

  const nowIso = new Date().toISOString();
  let q = supabaseAdmin
    .from('equipment_reservations')
    .select(
      'id, equipment_inventory_id, job_id, reserved_from, reserved_to, ' +
        'state, is_override, notes'
    )
    .eq('equipment_inventory_id', equipmentId)
    .eq('state', 'held')
    .lte('reserved_from', nowIso)
    .gte('reserved_to', nowIso);
  if (jobIdFilter) q = q.eq('job_id', jobIdFilter);

  const { data, error } = await q;
  if (error) {
    return {
      error: NextResponse.json({ error: error.message }, { status: 500 }),
    };
  }
  const matches = (data ?? []) as ReservationRow[];
  if (matches.length === 0) {
    return {
      error: NextResponse.json(
        {
          error:
            'No held reservation matches that QR for the current ' +
            'window.',
          code: 'no_matching_held_reservation',
        },
        { status: 404 }
      ),
    };
  }
  if (matches.length > 1) {
    return {
      error: NextResponse.json(
        {
          error:
            `Multiple held reservations match (${matches.length}). ` +
            'Pass `job_id` to disambiguate, or use `reservation_id` ' +
            'to pick the row directly.',
          code: 'ambiguous_match',
          candidates: matches.map((m) => ({
            reservation_id: m.id,
            job_id: m.job_id,
            reserved_from: m.reserved_from,
            reserved_to: m.reserved_to,
          })),
        },
        { status: 409 }
      ),
    };
  }
  return { row: matches[0] };
}

// ────────────────────────────────────────────────────────────
// F10.8 — equipment_assignment notification fan-out
// ────────────────────────────────────────────────────────────
//
// Resolves the receiving surveyor's email + the equipment name +
// the job display fields in three parallel reads, then fires a
// single notify() row with source_type='equipment_assignment' so
// the §5.12.9 mobile inbox can render a "you got X for tomorrow's
// job" card with the right inline actions. Best-effort by design:
// the check-out itself is committed before this runs; failures
// here log a warning and continue.

async function emitAssignmentNotification(args: {
  reservationId: string;
  equipmentInventoryId: string;
  jobId: string;
  reservedTo: string;
  toUserId: string;
}): Promise<void> {
  try {
    const [eqRes, jobRes, userRes] = await Promise.all([
      supabaseAdmin
        .from('equipment_inventory')
        .select('name, qr_code_id')
        .eq('id', args.equipmentInventoryId)
        .maybeSingle(),
      supabaseAdmin
        .from('jobs')
        .select('name, job_number')
        .eq('id', args.jobId)
        .maybeSingle(),
      supabaseAdmin
        .from('registered_users')
        .select('email')
        .eq('id', args.toUserId)
        .maybeSingle(),
    ]);
    const recipient = (userRes.data as { email?: string | null } | null)
      ?.email;
    if (!recipient) {
      console.warn(
        '[admin/equipment/check-out] assignment notify skipped — no email',
        { reservation_id: args.reservationId, to_user_id: args.toUserId }
      );
      return;
    }
    const eqName =
      (eqRes.data as { name?: string | null } | null)?.name ?? 'equipment';
    const job = jobRes.data as {
      name?: string | null;
      job_number?: string | null;
    } | null;
    const jobLabel = job?.job_number
      ? `${job.job_number}${job.name ? ` ${job.name}` : ''}`
      : job?.name ?? 'a job';
    await notify({
      user_email: recipient,
      type: 'equipment_assignment',
      title: `Checked out: ${eqName}`,
      body:
        `${eqName} is yours for ${jobLabel}, due back ` +
        `${args.reservedTo}. Tap to see the loadout.`,
      icon: '📦',
      escalation_level: 'normal',
      source_type: 'equipment_assignment',
      source_id: args.reservationId,
      link: `/admin/jobs/${args.jobId}`,
    });
  } catch (err) {
    console.warn(
      '[admin/equipment/check-out] equipment_assignment notify failed',
      {
        reservation_id: args.reservationId,
        error: err instanceof Error ? err.message : String(err),
      }
    );
  }
}

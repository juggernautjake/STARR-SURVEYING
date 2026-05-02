// app/api/admin/maintenance/events/[id]/route.ts
//
// PATCH /api/admin/maintenance/events/[id]
//
// Phase F10.7-c-ii — state machine + field updates for the
// §5.12.8 maintenance_events table. Mirrors the F10.7-c-i POST
// validator style. Refuses illegal state transitions with typed
// errors so the F10.7-g detail page can surface "this state
// can't move to X — try Y" inline.
//
// State transitions (binding):
//
//   scheduled       → in_progress | awaiting_parts |
//                     awaiting_vendor | complete | cancelled
//   in_progress     → awaiting_parts | awaiting_vendor |
//                     complete | failed_qa | cancelled
//   awaiting_parts  → in_progress | awaiting_vendor |
//                     complete | cancelled
//   awaiting_vendor → in_progress | awaiting_parts |
//                     complete | failed_qa | cancelled
//   failed_qa       → in_progress | cancelled
//   complete        → (terminal; only re-openable via explicit
//                     `reopen=true` body flag, which routes back
//                     to in_progress)
//   cancelled       → (terminal; refuses all changes)
//
// Auto-stamps:
//   * Transition into `in_progress` stamps `started_at = now()`
//     IF the column is null.
//   * Transition into `complete` stamps `completed_at = now()`
//     IF the column is null.
//   * `qa_passed = false` posted alongside `state = complete`
//     auto-routes to `state = failed_qa` per §5.12.8 ("post-cal
//     accuracy check; false routes the event to failed_qa").
//
// Calibration third-party gate:
//   Per §5.12.8 — a NIST cert requires a third-party. So when
//   transitioning into `complete` AND `kind = 'calibration'`:
//     vendor_name MUST be non-null
//     performed_by_user_id MUST be null
//   Otherwise typed `calibration_requires_vendor` 400.
//
// Auth: admin / developer / equipment_manager (mutating).
//
// GET on the same route is the F10.7-g-i detail endpoint.
// Read-only for the F10.7-g-ii page UI; pulls the full event +
// joined display fields + linked maintenance_event_documents in
// one roundtrip so the detail page renders without a second
// fetch.

import { NextRequest, NextResponse } from 'next/server';

import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';

const UUID_RE =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

const ALLOWED_STATES = new Set([
  'scheduled',
  'in_progress',
  'awaiting_parts',
  'awaiting_vendor',
  'complete',
  'cancelled',
  'failed_qa',
]);

const TRANSITIONS: Record<string, Set<string>> = {
  scheduled: new Set([
    'in_progress',
    'awaiting_parts',
    'awaiting_vendor',
    'complete',
    'cancelled',
  ]),
  in_progress: new Set([
    'awaiting_parts',
    'awaiting_vendor',
    'complete',
    'failed_qa',
    'cancelled',
  ]),
  awaiting_parts: new Set([
    'in_progress',
    'awaiting_vendor',
    'complete',
    'cancelled',
  ]),
  awaiting_vendor: new Set([
    'in_progress',
    'awaiting_parts',
    'complete',
    'failed_qa',
    'cancelled',
  ]),
  failed_qa: new Set(['in_progress', 'cancelled']),
  complete: new Set([]), // terminal; reopen via flag
  cancelled: new Set([]), // terminal; refuses all
};

interface ExistingRow {
  id: string;
  state: string;
  kind: string;
  started_at: string | null;
  completed_at: string | null;
  vendor_name: string | null;
  performed_by_user_id: string | null;
}

export const PATCH = withErrorHandler(async (req: NextRequest) => {
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

  const url = new URL(req.url);
  const segments = url.pathname.split('/').filter(Boolean);
  const id = segments[segments.length - 1];
  if (!id || !UUID_RE.test(id)) {
    return NextResponse.json(
      { error: '`id` must be a valid UUID.' },
      { status: 400 }
    );
  }

  const body = (await req.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  if (!body || typeof body !== 'object') {
    return NextResponse.json(
      { error: 'Body must be a JSON object.' },
      { status: 400 }
    );
  }

  // ── Read existing row (state machine + cal gate need it) ──
  const { data: existing, error: readErr } = await supabaseAdmin
    .from('maintenance_events')
    .select(
      'id, state, kind, started_at, completed_at, vendor_name, ' +
        'performed_by_user_id'
    )
    .eq('id', id)
    .maybeSingle();
  if (readErr) {
    return NextResponse.json(
      { error: readErr.message },
      { status: 500 }
    );
  }
  if (!existing) {
    return NextResponse.json(
      { error: 'Maintenance event not found.' },
      { status: 404 }
    );
  }
  const row = existing as ExistingRow;

  // ── Build the update body field-by-field ─────────────────
  const update: Record<string, unknown> = {};
  const reopen = body.reopen === true;

  // State transition gate.
  let newState: string | null = null;
  if (body.state !== undefined && body.state !== null) {
    if (typeof body.state !== 'string' || !ALLOWED_STATES.has(body.state)) {
      return NextResponse.json(
        {
          error: `\`state\` must be one of: ${Array.from(ALLOWED_STATES).join(', ')}.`,
        },
        { status: 400 }
      );
    }
    const requested = body.state;
    if (requested !== row.state) {
      const allowed = TRANSITIONS[row.state] ?? new Set<string>();
      const isReopenPath =
        row.state === 'complete' &&
        requested === 'in_progress' &&
        reopen;
      if (!allowed.has(requested) && !isReopenPath) {
        return NextResponse.json(
          {
            error:
              `Illegal state transition: ${row.state} → ${requested}. ` +
              `Allowed: ${Array.from(allowed).join(', ') || '(none — terminal)'}.` +
              (row.state === 'complete'
                ? ' Pass `reopen: true` to re-open a complete event.'
                : ''),
            current_state: row.state,
            requested_state: requested,
            allowed_transitions: Array.from(allowed),
          },
          { status: 409 }
        );
      }
      newState = requested;
    }
  }

  // ── Optional field updates ────────────────────────────────
  const scheduledFor = parseOptionalIso(body.scheduled_for, 'scheduled_for');
  if ('error' in scheduledFor) return scheduledFor.error;
  if (scheduledFor.set) update.scheduled_for = scheduledFor.value;

  const expectedBackAt = parseOptionalIso(
    body.expected_back_at,
    'expected_back_at'
  );
  if ('error' in expectedBackAt) return expectedBackAt.error;
  if (expectedBackAt.set) update.expected_back_at = expectedBackAt.value;

  const startedAt = parseOptionalIso(body.started_at, 'started_at');
  if ('error' in startedAt) return startedAt.error;
  if (startedAt.set) update.started_at = startedAt.value;

  const completedAt = parseOptionalIso(body.completed_at, 'completed_at');
  if ('error' in completedAt) return completedAt.error;
  if (completedAt.set) update.completed_at = completedAt.value;

  const nextDueAt = parseOptionalIso(body.next_due_at, 'next_due_at');
  if ('error' in nextDueAt) return nextDueAt.error;
  if (nextDueAt.set) update.next_due_at = nextDueAt.value;

  const performedBy = parseOptionalUuid(
    body.performed_by_user_id,
    'performed_by_user_id'
  );
  if ('error' in performedBy) return performedBy.error;
  if (performedBy.set) update.performed_by_user_id = performedBy.value;

  const linkedReceipt = parseOptionalUuid(
    body.linked_receipt_id,
    'linked_receipt_id'
  );
  if ('error' in linkedReceipt) return linkedReceipt.error;
  if (linkedReceipt.set) update.linked_receipt_id = linkedReceipt.value;

  const costCents = parseOptionalInt(body.cost_cents, 'cost_cents', 0);
  if ('error' in costCents) return costCents.error;
  if (costCents.set) update.cost_cents = costCents.value;

  const vendorName = parseOptionalString(body.vendor_name, 'vendor_name');
  if ('error' in vendorName) return vendorName.error;
  if (vendorName.set) update.vendor_name = vendorName.value;

  const vendorContact = parseOptionalString(
    body.vendor_contact,
    'vendor_contact'
  );
  if ('error' in vendorContact) return vendorContact.error;
  if (vendorContact.set) update.vendor_contact = vendorContact.value;

  const vendorWorkOrder = parseOptionalString(
    body.vendor_work_order,
    'vendor_work_order'
  );
  if ('error' in vendorWorkOrder) return vendorWorkOrder.error;
  if (vendorWorkOrder.set) update.vendor_work_order = vendorWorkOrder.value;

  const summary = parseOptionalString(body.summary, 'summary');
  if ('error' in summary) return summary.error;
  if (summary.set) {
    if (!summary.value || summary.value.length === 0) {
      return NextResponse.json(
        { error: '`summary` cannot be cleared.' },
        { status: 400 }
      );
    }
    if (summary.value.length > 200) {
      return NextResponse.json(
        { error: '`summary` must be ≤ 200 characters.' },
        { status: 400 }
      );
    }
    update.summary = summary.value;
  }

  const notes = parseOptionalString(body.notes, 'notes');
  if ('error' in notes) return notes.error;
  if (notes.set) update.notes = notes.value;

  // qa_passed boolean (the only true bool field on the row).
  let qaPassedSet = false;
  let qaPassedValue: boolean | null = null;
  if (body.qa_passed !== undefined && body.qa_passed !== null) {
    if (typeof body.qa_passed !== 'boolean') {
      return NextResponse.json(
        { error: '`qa_passed` must be a boolean when present.' },
        { status: 400 }
      );
    }
    qaPassedSet = true;
    qaPassedValue = body.qa_passed;
    update.qa_passed = qaPassedValue;
  }

  // ── State-driven side effects ─────────────────────────────
  // Auto-flip qa_passed=false on a complete-state PATCH → failed_qa.
  let effectiveState = newState ?? row.state;
  if (qaPassedSet && qaPassedValue === false && effectiveState === 'complete') {
    newState = 'failed_qa';
    effectiveState = 'failed_qa';
  }

  if (newState) {
    update.state = newState;
    // Auto-stamp started_at on entry to in_progress.
    if (newState === 'in_progress' && !row.started_at && !startedAt.set) {
      update.started_at = new Date().toISOString();
    }
    // Auto-stamp completed_at on entry to complete.
    if (newState === 'complete' && !row.completed_at && !completedAt.set) {
      update.completed_at = new Date().toISOString();
    }
    // Reopen path clears completed_at + qa_passed for a fresh
    // service-history entry on re-completion.
    if (
      reopen &&
      row.state === 'complete' &&
      newState === 'in_progress'
    ) {
      update.completed_at = null;
      if (!qaPassedSet) update.qa_passed = null;
    }
  }

  // ── Calibration third-party gate ──────────────────────────
  // Fires when the resulting state == 'complete' AND the row's
  // kind is calibration. Cross-checks merged state (existing +
  // patch) so a multi-field PATCH that sets vendor_name and
  // moves to complete in one shot lands cleanly.
  if (effectiveState === 'complete' && row.kind === 'calibration') {
    const finalVendorName = vendorName.set
      ? vendorName.value
      : row.vendor_name;
    const finalPerformedBy = performedBy.set
      ? performedBy.value
      : row.performed_by_user_id;
    if (!finalVendorName) {
      return NextResponse.json(
        {
          error:
            'Calibration events require vendor_name on completion (NIST ' +
            'traceability). Set vendor_name in the same PATCH.',
          code: 'calibration_requires_vendor',
        },
        { status: 400 }
      );
    }
    if (finalPerformedBy) {
      return NextResponse.json(
        {
          error:
            'Calibration events cannot have performed_by_user_id set on ' +
            'completion (NIST cert requires a third-party). Clear ' +
            'performed_by_user_id in the same PATCH.',
          code: 'calibration_excludes_performed_by',
        },
        { status: 400 }
      );
    }
  }

  // No-op short-circuit.
  if (Object.keys(update).length === 0) {
    return NextResponse.json({
      event: row,
      no_op: true,
    });
  }

  // ── Write with state-row guard ────────────────────────────
  // The TOCTOU guard locks on the previous state we read so a
  // concurrent transition doesn't slide our update through into
  // an unexpected base state.
  let q = supabaseAdmin
    .from('maintenance_events')
    .update(update)
    .eq('id', id);
  if (newState) q = q.eq('state', row.state);
  const { data: updated, error: updateErr } = await q
    .select(
      'id, equipment_inventory_id, vehicle_id, kind, origin, state, ' +
        'scheduled_for, started_at, completed_at, expected_back_at, ' +
        'vendor_name, vendor_contact, vendor_work_order, ' +
        'performed_by_user_id, cost_cents, linked_receipt_id, ' +
        'summary, notes, qa_passed, next_due_at, created_at, ' +
        'created_by, updated_at'
    )
    .maybeSingle();
  if (updateErr) {
    console.error('[admin/maintenance/events PATCH] update failed', {
      id,
      error: updateErr.message,
    });
    return NextResponse.json(
      { error: updateErr.message },
      { status: 500 }
    );
  }
  if (!updated && newState) {
    // Lost the TOCTOU guard — re-read so the caller sees the latest.
    const { data: latest } = await supabaseAdmin
      .from('maintenance_events')
      .select('state')
      .eq('id', id)
      .maybeSingle();
    return NextResponse.json(
      {
        error:
          'State changed between read and write. Refetch and retry.',
        current_state:
          (latest as { state?: string } | null)?.state ?? 'unknown',
      },
      { status: 409 }
    );
  }

  console.log('[admin/maintenance/events PATCH] ok', {
    id,
    fields: Object.keys(update),
    new_state: newState,
    actor_email: session.user.email,
  });

  return NextResponse.json({ event: updated, previous_state: row.state });
}, { routeName: 'admin/maintenance/events/:id#patch' });

// ──────────────────────────────────────────────────────────────
// Body-validation helpers — Maybe<T> shape with `set` flag so we
// distinguish "user passed null" from "field omitted." Mirrors
// the F10.7-c-i POST helpers but extends with the explicit
// `set` discriminator that PATCH needs (POST defaults to "if
// omitted, drop"; PATCH defaults to "if omitted, leave the
// existing column untouched").
// ──────────────────────────────────────────────────────────────

type Maybe<T> =
  | { set: true; value: T | null }
  | { set: false; value: null }
  | { error: NextResponse };

function parseOptionalIso(raw: unknown, name: string): Maybe<string> {
  if (raw === undefined) return { set: false, value: null };
  if (raw === null) return { set: true, value: null };
  if (typeof raw !== 'string') {
    return {
      error: NextResponse.json(
        { error: `\`${name}\` must be a string when present.` },
        { status: 400 }
      ),
    };
  }
  const t = Date.parse(raw);
  if (!Number.isFinite(t)) {
    return {
      error: NextResponse.json(
        { error: `\`${name}\` must be a parseable ISO timestamp.` },
        { status: 400 }
      ),
    };
  }
  return { set: true, value: new Date(t).toISOString() };
}

function parseOptionalUuid(raw: unknown, name: string): Maybe<string> {
  if (raw === undefined) return { set: false, value: null };
  if (raw === null) return { set: true, value: null };
  if (typeof raw !== 'string' || !UUID_RE.test(raw)) {
    return {
      error: NextResponse.json(
        { error: `\`${name}\` must be a valid UUID when present.` },
        { status: 400 }
      ),
    };
  }
  return { set: true, value: raw };
}

function parseOptionalInt(
  raw: unknown,
  name: string,
  min: number
): Maybe<number> {
  if (raw === undefined) return { set: false, value: null };
  if (raw === null) return { set: true, value: null };
  if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < min) {
    return {
      error: NextResponse.json(
        {
          error: `\`${name}\` must be an integer ≥ ${min} when present.`,
        },
        { status: 400 }
      ),
    };
  }
  return { set: true, value: raw };
}

function parseOptionalString(raw: unknown, name: string): Maybe<string> {
  if (raw === undefined) return { set: false, value: null };
  if (raw === null) return { set: true, value: null };
  if (typeof raw !== 'string') {
    return {
      error: NextResponse.json(
        { error: `\`${name}\` must be a string when present.` },
        { status: 400 }
      ),
    };
  }
  const trimmed = raw.trim();
  return { set: true, value: trimmed.length > 0 ? trimmed : null };
}

// ──────────────────────────────────────────────────────────────
// GET — F10.7-g-i: single-event detail
// ──────────────────────────────────────────────────────────────
//
// Returns the full event row + joined display fields +
// maintenance_event_documents in one shot. The F10.7-g-ii page
// UI reads from here once on mount + re-reads after any
// state-transition PATCH lands.
//
// Auth: EQUIPMENT_ROLES (read).

export const GET = withErrorHandler(async (req: NextRequest) => {
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
  const segments = url.pathname.split('/').filter(Boolean);
  const id = segments[segments.length - 1];
  if (!id || !UUID_RE.test(id)) {
    return NextResponse.json(
      { error: '`id` must be a valid UUID.' },
      { status: 400 }
    );
  }

  const { data, error } = await supabaseAdmin
    .from('maintenance_events')
    .select(
      'id, equipment_inventory_id, vehicle_id, kind, origin, state, ' +
        'scheduled_for, started_at, completed_at, expected_back_at, ' +
        'vendor_name, vendor_contact, vendor_work_order, ' +
        'performed_by_user_id, cost_cents, linked_receipt_id, ' +
        'summary, notes, qa_passed, next_due_at, created_at, ' +
        'created_by, updated_at'
    )
    .eq('id', id)
    .maybeSingle();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json(
      { error: 'Maintenance event not found.' },
      { status: 404 }
    );
  }
  const row = data as {
    id: string;
    equipment_inventory_id: string | null;
    vehicle_id: string | null;
    created_by: string | null;
    performed_by_user_id: string | null;
    [k: string]: unknown;
  };

  // ── Resolve display fields in parallel ─────────────────────
  const [equipmentRes, vehicleRes, actorsRes, docsRes] =
    await Promise.all([
      row.equipment_inventory_id
        ? supabaseAdmin
            .from('equipment_inventory')
            .select('id, name, category, item_kind, qr_code_id')
            .eq('id', row.equipment_inventory_id)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      row.vehicle_id
        ? supabaseAdmin
            .from('vehicles')
            .select('id, name')
            .eq('id', row.vehicle_id)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      (async () => {
        const ids = Array.from(
          new Set(
            [row.created_by, row.performed_by_user_id].filter(
              (v): v is string => !!v
            )
          )
        );
        if (ids.length === 0) {
          return { data: [] as Array<{ id: string; email: string | null; name: string | null }>, error: null };
        }
        return supabaseAdmin
          .from('registered_users')
          .select('id, email, name')
          .in('id', ids);
      })(),
      supabaseAdmin
        .from('maintenance_event_documents')
        .select(
          'id, kind, storage_url, filename, size_bytes, ' +
            'description, uploaded_by, uploaded_at'
        )
        .eq('event_id', id)
        .order('uploaded_at', { ascending: false }),
    ]);

  if (equipmentRes.error) {
    return NextResponse.json(
      { error: equipmentRes.error.message },
      { status: 500 }
    );
  }
  if (vehicleRes.error) {
    console.warn(
      '[admin/maintenance/events/:id GET] vehicle lookup failed',
      { error: vehicleRes.error.message }
    );
  }
  if (actorsRes.error) {
    return NextResponse.json(
      { error: actorsRes.error.message },
      { status: 500 }
    );
  }
  if (docsRes.error) {
    return NextResponse.json(
      { error: docsRes.error.message },
      { status: 500 }
    );
  }

  const actorById = new Map<string, string>();
  for (const a of (actorsRes.data ?? []) as Array<{
    id: string;
    email: string | null;
    name: string | null;
  }>) {
    actorById.set(a.id, a.name ?? a.email ?? a.id);
  }

  // Resolve uploader display fields for the documents.
  const uploaderIds = Array.from(
    new Set(
      ((docsRes.data ?? []) as Array<{ uploaded_by: string | null }>)
        .map((d) => d.uploaded_by)
        .filter((v): v is string => !!v)
    )
  );
  const uploaderById = new Map<string, string>();
  if (uploaderIds.length > 0) {
    const { data: uploaders } = await supabaseAdmin
      .from('registered_users')
      .select('id, email, name')
      .in('id', uploaderIds);
    for (const u of (uploaders ?? []) as Array<{
      id: string;
      email: string | null;
      name: string | null;
    }>) {
      uploaderById.set(u.id, u.name ?? u.email ?? u.id);
    }
  }

  const documents = ((docsRes.data ?? []) as Array<{
    id: string;
    kind: string;
    storage_url: string;
    filename: string | null;
    size_bytes: number | null;
    description: string | null;
    uploaded_by: string | null;
    uploaded_at: string;
  }>).map((d) => ({
    ...d,
    uploaded_by_label: d.uploaded_by
      ? uploaderById.get(d.uploaded_by) ?? null
      : null,
  }));

  return NextResponse.json({
    event: {
      ...row,
      equipment: equipmentRes.data ?? null,
      vehicle: vehicleRes.data ?? null,
      created_by_label: row.created_by
        ? actorById.get(row.created_by) ?? null
        : null,
      performed_by_label: row.performed_by_user_id
        ? actorById.get(row.performed_by_user_id) ?? null
        : null,
    },
    documents,
  });
}, { routeName: 'admin/maintenance/events/:id#get' });

// app/api/admin/equipment/dispose/route.ts
//
// POST /api/admin/equipment/dispose
//   body: {
//     equipment_id:           UUID,
//     disposal_kind:          'sold' | 'traded' | 'scrapped' |
//                             'lost' | 'stolen' | 'donated',
//     disposal_proceeds_cents?: integer (optional; required for
//                                        'sold' / 'traded'),
//     disposed_at?:           ISO date (optional; defaults today),
//     notes?:                 string (optional, free-form),
//   }
//
// Phase F10.9 — closes the books on a capital asset. Sets the
// `disposed_at`, `disposal_proceeds_cents`, `disposal_kind`
// columns + flips `retired_at` so the depreciation worker stops
// projecting future-year amounts. Writes an `equipment_events`
// audit row with event_type='retired' + payload.disposal_kind
// so the chain-of-custody preserves the reason.
//
// §179 / MACRS recapture rules (sold/traded within useful life
// triggers recapture) are NOT computed here. The bookkeeper
// reviews the Asset Detail Schedule manually for v1; the
// recapture worker is post-F10.9 polish.
//
// Auth: admin / developer / equipment_manager.

import { NextRequest, NextResponse } from 'next/server';

import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';

const UUID_RE =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

const ALLOWED_DISPOSAL_KINDS = new Set([
  'sold',
  'traded',
  'scrapped',
  'lost',
  'stolen',
  'donated',
]);

interface DisposeBody {
  equipment_id?: unknown;
  disposal_kind?: unknown;
  disposal_proceeds_cents?: unknown;
  disposed_at?: unknown;
  notes?: unknown;
}

export const POST = withErrorHandler(async (req: NextRequest) => {
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

  const body = (await req.json().catch(() => null)) as DisposeBody | null;
  if (!body || typeof body !== 'object') {
    return NextResponse.json(
      { error: 'Body must be a JSON object.' },
      { status: 400 }
    );
  }

  // ── Required: equipment_id ───────────────────────────────────
  if (
    typeof body.equipment_id !== 'string' ||
    !UUID_RE.test(body.equipment_id)
  ) {
    return NextResponse.json(
      { error: '`equipment_id` must be a valid UUID.' },
      { status: 400 }
    );
  }
  const equipmentId = body.equipment_id;

  // ── Required: disposal_kind ──────────────────────────────────
  if (
    typeof body.disposal_kind !== 'string' ||
    !ALLOWED_DISPOSAL_KINDS.has(body.disposal_kind)
  ) {
    return NextResponse.json(
      {
        error:
          '`disposal_kind` must be one of: ' +
          Array.from(ALLOWED_DISPOSAL_KINDS).join(', '),
      },
      { status: 400 }
    );
  }
  const disposalKind = body.disposal_kind;

  // ── Optional: proceeds. Required when sold/traded since the
  //    Schedule C reporting needs the dollar figure to compute
  //    gain/loss. Stays NULL for scrapped/lost/stolen/donated. ─
  let proceedsCents: number | null = null;
  if (
    body.disposal_proceeds_cents !== undefined &&
    body.disposal_proceeds_cents !== null
  ) {
    if (
      typeof body.disposal_proceeds_cents !== 'number' ||
      !Number.isInteger(body.disposal_proceeds_cents) ||
      body.disposal_proceeds_cents < 0
    ) {
      return NextResponse.json(
        {
          error:
            '`disposal_proceeds_cents` must be a non-negative integer when present.',
        },
        { status: 400 }
      );
    }
    proceedsCents = body.disposal_proceeds_cents;
  }
  if (
    (disposalKind === 'sold' || disposalKind === 'traded') &&
    proceedsCents === null
  ) {
    return NextResponse.json(
      {
        error: `\`disposal_proceeds_cents\` is required for disposal_kind='${disposalKind}'.`,
        code: 'proceeds_required',
      },
      { status: 400 }
    );
  }

  // ── Optional: disposed_at. Defaults today. ───────────────────
  let disposedAt: string;
  if (body.disposed_at !== undefined && body.disposed_at !== null) {
    if (typeof body.disposed_at !== 'string') {
      return NextResponse.json(
        { error: '`disposed_at` must be an ISO date string.' },
        { status: 400 }
      );
    }
    const ms = Date.parse(body.disposed_at);
    if (!Number.isFinite(ms)) {
      return NextResponse.json(
        { error: '`disposed_at` must parse to a valid date.' },
        { status: 400 }
      );
    }
    disposedAt = new Date(ms).toISOString().slice(0, 10);
  } else {
    disposedAt = new Date().toISOString().slice(0, 10);
  }

  // ── Optional: notes ─────────────────────────────────────────
  let notes: string | null = null;
  if (body.notes !== undefined && body.notes !== null) {
    if (typeof body.notes !== 'string') {
      return NextResponse.json(
        { error: '`notes` must be a string when present.' },
        { status: 400 }
      );
    }
    const trimmed = body.notes.trim();
    notes = trimmed.length > 0 ? trimmed : null;
  }

  // ── Read existing row to gate already-disposed / not-found ──
  const { data: existing, error: readErr } = await supabaseAdmin
    .from('equipment_inventory')
    .select(
      'id, name, disposed_at, retired_at, current_status, ' +
        'acquired_cost_cents'
    )
    .eq('id', equipmentId)
    .maybeSingle();
  if (readErr) {
    return NextResponse.json({ error: readErr.message }, { status: 500 });
  }
  if (!existing) {
    return NextResponse.json(
      { error: 'Equipment not found.' },
      { status: 404 }
    );
  }
  const row = existing as {
    id: string;
    name: string | null;
    disposed_at: string | null;
    retired_at: string | null;
    current_status: string | null;
    acquired_cost_cents: number | null;
  };
  if (row.disposed_at) {
    return NextResponse.json(
      {
        error: `Equipment is already disposed (${row.disposed_at}).`,
        code: 'already_disposed',
        disposed_at: row.disposed_at,
      },
      { status: 409 }
    );
  }

  // ── Apply the disposal ──────────────────────────────────────
  // Updates disposed_at + disposal_kind + (optional) proceeds
  // and also flips retired_at + current_status='retired' so the
  // depreciation worker + EM dashboards skip the row going
  // forward.
  const nowIso = new Date().toISOString();
  const { data: updated, error: updateErr } = await supabaseAdmin
    .from('equipment_inventory')
    .update({
      disposed_at: disposedAt,
      disposal_kind: disposalKind,
      disposal_proceeds_cents: proceedsCents,
      retired_at: row.retired_at ?? nowIso,
      retired_reason:
        notes ??
        `Disposed (${disposalKind})${
          proceedsCents !== null
            ? ` for $${(proceedsCents / 100).toFixed(2)}`
            : ''
        }`,
      current_status: 'retired',
    })
    .eq('id', equipmentId)
    .is('disposed_at', null) // race guard
    .select(
      'id, name, disposed_at, disposal_kind, disposal_proceeds_cents, ' +
        'retired_at, current_status, acquired_cost_cents'
    )
    .maybeSingle();
  if (updateErr) {
    console.error(
      '[admin/equipment/dispose] update failed',
      { equipment_id: equipmentId, error: updateErr.message }
    );
    return NextResponse.json(
      { error: updateErr.message },
      { status: 500 }
    );
  }
  if (!updated) {
    return NextResponse.json(
      {
        error:
          'Disposal lost a race — the row was disposed between read and write. Refetch and retry.',
      },
      { status: 409 }
    );
  }

  // ── Audit-log row. Best-effort; the canonical state lives on
  //    the equipment_inventory columns we just wrote. ──────────
  try {
    await supabaseAdmin.from('equipment_events').insert({
      equipment_id: equipmentId,
      event_type: 'retired',
      notes:
        `Disposed (${disposalKind})` +
        (proceedsCents !== null
          ? ` for $${(proceedsCents / 100).toFixed(2)}`
          : '') +
        (notes ? ` — ${notes}` : ''),
      payload: {
        disposal_kind: disposalKind,
        disposal_proceeds_cents: proceedsCents,
        disposed_at: disposedAt,
        actor_email: session.user.email,
      },
    });
  } catch (auditErr) {
    console.warn(
      '[admin/equipment/dispose] audit insert failed (non-fatal)',
      {
        equipment_id: equipmentId,
        error:
          auditErr instanceof Error
            ? auditErr.message
            : String(auditErr),
      }
    );
  }

  console.log('[admin/equipment/dispose] ok', {
    equipment_id: equipmentId,
    disposal_kind: disposalKind,
    disposed_at: disposedAt,
    proceeds_cents: proceedsCents,
    actor_email: session.user.email,
  });

  return NextResponse.json({
    asset: updated,
    notes_recorded: !!notes,
  });
}, { routeName: 'admin/equipment/dispose#post' });

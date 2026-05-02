// app/api/admin/personnel/unavailability/route.ts
//
// POST /api/admin/personnel/unavailability
//   body: {
//     user_email: string,
//     unavailable_from: ISO,
//     unavailable_to: ISO,
//     kind: 'pto' | 'sick' | 'training' | 'doctor' | 'other',
//     reason?: string,
//     is_paid?: boolean,
//   }
//
// Phase F10.6-e-iv-α — write path for the personnel_unavailability
// table from seeds/241. Creates a single row for the requested
// person + window. The crew calendar's drag-create modal
// (F10.6-e-iv-β) is the primary caller; future surfaces (mobile
// PTO request flow, bulk-import) reuse this endpoint.
//
// Validation:
//   * user_email — non-empty string. (No FK on auth.users from
//     seeds/241 since unavailability rows can land before the
//     surveyor finishes registration; the calendar handles missing
//     users gracefully.)
//   * unavailable_from / unavailable_to — both required ISO
//     timestamps, _to must be > _from (mirrors the seeds/241
//     CHECK constraint so we 400 cleanly instead of 23514).
//   * kind — restricted to the seeds/241 enum.
//   * reason — optional free-text, trimmed.
//   * is_paid — optional boolean, defaults to false (matches the
//     column default).
//
// Auth: admin / developer / equipment_manager. (Future polish:
// allow surveyors to POST their own PTO via /api/personnel/me/
// unavailability with `kind in ['pto', 'doctor']` only.)
//
// On success returns the inserted row. On enum / timestamp
// failures: 400 with a typed `error` string. The trigger from
// seeds/241 stamps updated_at on writes; we don't need to set it.

import { NextRequest, NextResponse } from 'next/server';

import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';

const ALLOWED_KINDS = new Set(['pto', 'sick', 'training', 'doctor', 'other']);

interface CreateBody {
  user_email?: unknown;
  unavailable_from?: unknown;
  unavailable_to?: unknown;
  kind?: unknown;
  reason?: unknown;
  is_paid?: unknown;
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

  const body = (await req.json().catch(() => null)) as CreateBody | null;
  if (!body || typeof body !== 'object') {
    return NextResponse.json(
      { error: 'Body must be a JSON object.' },
      { status: 400 }
    );
  }

  // ── user_email ───────────────────────────────────────────────
  if (typeof body.user_email !== 'string' || body.user_email.trim().length === 0) {
    return NextResponse.json(
      { error: '`user_email` is required.' },
      { status: 400 }
    );
  }
  const userEmail = body.user_email.trim();

  // ── timestamps ───────────────────────────────────────────────
  if (typeof body.unavailable_from !== 'string') {
    return NextResponse.json(
      { error: '`unavailable_from` must be an ISO timestamp.' },
      { status: 400 }
    );
  }
  if (typeof body.unavailable_to !== 'string') {
    return NextResponse.json(
      { error: '`unavailable_to` must be an ISO timestamp.' },
      { status: 400 }
    );
  }
  const fromMs = Date.parse(body.unavailable_from);
  const toMs = Date.parse(body.unavailable_to);
  if (!Number.isFinite(fromMs)) {
    return NextResponse.json(
      { error: '`unavailable_from` must parse to a valid date.' },
      { status: 400 }
    );
  }
  if (!Number.isFinite(toMs)) {
    return NextResponse.json(
      { error: '`unavailable_to` must parse to a valid date.' },
      { status: 400 }
    );
  }
  if (toMs <= fromMs) {
    return NextResponse.json(
      { error: '`unavailable_to` must be strictly after `unavailable_from`.' },
      { status: 400 }
    );
  }

  // ── kind ─────────────────────────────────────────────────────
  if (typeof body.kind !== 'string' || !ALLOWED_KINDS.has(body.kind)) {
    return NextResponse.json(
      {
        error:
          '`kind` is required and must be one of: ' +
          Array.from(ALLOWED_KINDS).join(', '),
      },
      { status: 400 }
    );
  }
  const kind = body.kind;

  // ── reason / is_paid (optional) ──────────────────────────────
  let reason: string | null = null;
  if (body.reason !== undefined && body.reason !== null) {
    if (typeof body.reason !== 'string') {
      return NextResponse.json(
        { error: '`reason` must be a string when present.' },
        { status: 400 }
      );
    }
    const trimmed = body.reason.trim();
    reason = trimmed.length > 0 ? trimmed : null;
  }
  let isPaid = false;
  if (body.is_paid !== undefined && body.is_paid !== null) {
    if (typeof body.is_paid !== 'boolean') {
      return NextResponse.json(
        { error: '`is_paid` must be a boolean when present.' },
        { status: 400 }
      );
    }
    isPaid = body.is_paid;
  }

  // ── Insert ───────────────────────────────────────────────────
  // Approved-by stamp uses the actor's email — every row written
  // through this endpoint is by an admin / equipment_manager so
  // we record the approval inline. (A future surveyor self-serve
  // POST will leave approved_by null until the EM confirms.)
  const { data: inserted, error: insertErr } = await supabaseAdmin
    .from('personnel_unavailability')
    .insert({
      user_email: userEmail,
      unavailable_from: new Date(fromMs).toISOString(),
      unavailable_to: new Date(toMs).toISOString(),
      kind,
      reason,
      is_paid: isPaid,
      approved_by: session.user.email,
      approved_at: new Date().toISOString(),
    })
    .select(
      'id, user_email, unavailable_from, unavailable_to, kind, ' +
        'reason, is_paid, approved_by, approved_at, ' +
        'created_at, updated_at'
    )
    .maybeSingle();
  if (insertErr) {
    console.error(
      '[admin/personnel/unavailability POST] insert failed',
      { user_email: userEmail, error: insertErr.message }
    );
    return NextResponse.json(
      { error: insertErr.message ?? 'Insert failed.' },
      { status: 500 }
    );
  }
  if (!inserted) {
    return NextResponse.json(
      { error: 'Insert returned no row.' },
      { status: 500 }
    );
  }

  console.log('[admin/personnel/unavailability POST] ok', {
    id: (inserted as { id: string }).id,
    user_email: userEmail,
    kind,
    is_paid: isPaid,
    actor_email: session.user.email,
  });

  return NextResponse.json({ unavailability: inserted });
}, { routeName: 'admin/personnel/unavailability#post' });

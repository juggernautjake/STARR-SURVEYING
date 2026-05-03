// app/api/admin/equipment/borrow-from-other-crew/route.ts
//
// POST /api/admin/equipment/borrow-from-other-crew
//   body: {
//     equipment_id:           UUID,
//     current_job_id:         UUID,
//     borrowed_from_user_id?: UUID,
//     borrowed_from_job_id?:  UUID,
//     notes?:                 string,
//   }
//
// Phase F10.8 — surveyor self-service borrow log per §5.12.9.4.
// Records ONE `equipment_events` row with
// `event_type='borrowed_during_field_work'` so the chain-of-
// custody is preserved when a surveyor scans gear that isn't on
// their reservation list. The reservation row itself stays
// untouched — the EM reconciles manually using this audit trail.
//
// Built in slices for review:
//   (a) ✅ write path — validate + insert audit row.
//   (b) ✅ retired-equipment guard — refuse 409 on retired units
//       so the audit log stays clean of "borrow against retired"
//       rows that the EM would have to chase later.
//   (c) ◐ notification fan-out — pending follow-up batch.
//
// Auth: any signed-in user. The whole point of self-service is
// that the EM doesn't need to be in the loop in real time.
//
// Failure modes:
//   * 400 — missing / malformed required UUIDs, bad notes type.
//   * 401 — no session.
//   * 404 — equipment_id doesn't resolve.
//   * 409 — equipment is retired (refuse to log against retired).
//   * 500 — audit insert failed (FK / RLS).

import { NextRequest, NextResponse } from 'next/server';

import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';

const UUID_RE =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

interface BorrowBody {
  equipment_id?: unknown;
  current_job_id?: unknown;
  borrowed_from_user_id?: unknown;
  borrowed_from_job_id?: unknown;
  notes?: unknown;
}

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const actorEmail = session.user.email;

  const body = (await req.json().catch(() => null)) as BorrowBody | null;
  if (!body || typeof body !== 'object') {
    return NextResponse.json(
      { error: 'Body must be a JSON object.' },
      { status: 400 }
    );
  }

  // ── Required UUIDs ───────────────────────────────────────────
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

  if (
    typeof body.current_job_id !== 'string' ||
    !UUID_RE.test(body.current_job_id)
  ) {
    return NextResponse.json(
      { error: '`current_job_id` must be a valid UUID.' },
      { status: 400 }
    );
  }
  const currentJobId = body.current_job_id;

  // ── Optional UUIDs ───────────────────────────────────────────
  let borrowedFromUserId: string | null = null;
  if (
    body.borrowed_from_user_id !== undefined &&
    body.borrowed_from_user_id !== null
  ) {
    if (
      typeof body.borrowed_from_user_id !== 'string' ||
      !UUID_RE.test(body.borrowed_from_user_id)
    ) {
      return NextResponse.json(
        { error: '`borrowed_from_user_id` must be a UUID when present.' },
        { status: 400 }
      );
    }
    borrowedFromUserId = body.borrowed_from_user_id;
  }

  let borrowedFromJobId: string | null = null;
  if (
    body.borrowed_from_job_id !== undefined &&
    body.borrowed_from_job_id !== null
  ) {
    if (
      typeof body.borrowed_from_job_id !== 'string' ||
      !UUID_RE.test(body.borrowed_from_job_id)
    ) {
      return NextResponse.json(
        { error: '`borrowed_from_job_id` must be a UUID when present.' },
        { status: 400 }
      );
    }
    borrowedFromJobId = body.borrowed_from_job_id;
  }

  // ── Optional notes ───────────────────────────────────────────
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

  // ── Retired-equipment guard (F10.8 slice b) ──────────────────
  // Refuse 409 when the scanned unit is retired so the audit log
  // doesn't accumulate "borrow against retired" rows the EM
  // would have to chase later. The lookup is a single
  // maybeSingle() — we don't need the full row, just the
  // retired_at column.
  const { data: equipmentGuardRow, error: guardErr } = await supabaseAdmin
    .from('equipment_inventory')
    .select('id, retired_at')
    .eq('id', equipmentId)
    .maybeSingle();
  if (guardErr) {
    return NextResponse.json(
      { error: guardErr.message },
      { status: 500 }
    );
  }
  if (!equipmentGuardRow) {
    return NextResponse.json(
      { error: 'Equipment not found.' },
      { status: 404 }
    );
  }
  if ((equipmentGuardRow as { retired_at: string | null }).retired_at) {
    return NextResponse.json(
      {
        error:
          'Equipment is retired; refusing to log a borrow event ' +
          'against a retired unit. Ask the EM to restore it first.',
        code: 'retired',
      },
      { status: 409 }
    );
  }

  // ── INSERT the audit-log row ─────────────────────────────────
  // event_type='borrowed_during_field_work' per the seeds/236
  // canonical enum. payload captures the borrow context so the
  // EM's manual reconciliation has full information without
  // chasing other tables.
  const { data: inserted, error: insertErr } = await supabaseAdmin
    .from('equipment_events')
    .insert({
      equipment_id: equipmentId,
      event_type: 'borrowed_during_field_work',
      job_id: currentJobId,
      notes,
      payload: {
        borrowed_from_user_id: borrowedFromUserId,
        borrowed_from_job_id: borrowedFromJobId,
        actor_email: actorEmail,
      },
    })
    .select(
      'id, equipment_id, event_type, job_id, notes, payload, created_at'
    )
    .maybeSingle();
  if (insertErr) {
    console.error(
      '[admin/equipment/borrow-from-other-crew] audit insert failed',
      { equipment_id: equipmentId, error: insertErr.message }
    );
    return NextResponse.json(
      { error: insertErr.message ?? 'Audit write failed.' },
      { status: 500 }
    );
  }

  console.log('[admin/equipment/borrow-from-other-crew] ok', {
    event_id: (inserted as { id: string } | null)?.id,
    equipment_id: equipmentId,
    current_job_id: currentJobId,
    borrowed_from_user_id: borrowedFromUserId,
    borrowed_from_job_id: borrowedFromJobId,
    actor_email: actorEmail,
  });

  return NextResponse.json({ event: inserted });
}, { routeName: 'admin/equipment/borrow-from-other-crew#post' });

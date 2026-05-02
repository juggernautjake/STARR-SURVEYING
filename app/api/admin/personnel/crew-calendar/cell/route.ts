// app/api/admin/personnel/crew-calendar/cell/route.ts
//
// GET /api/admin/personnel/crew-calendar/cell
//   ?user_email=…&day=YYYY-MM-DD
//
// Phase F10.6-e-iii — per-cell drilldown for the §5.12.7.6
// crew calendar. Returns the full job_team rows + the full
// personnel_unavailability rows that overlap the requested
// (user, day) pair, so the drawer renders rich context (job
// link, slot_role, window, reason, etc.) without forcing the
// page to fetch each one separately.
//
// Auth: EQUIPMENT_ROLES.

import { NextRequest, NextResponse } from 'next/server';

import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

  const { searchParams } = new URL(req.url);
  const userEmail = (searchParams.get('user_email') ?? '').trim().toLowerCase();
  const day = (searchParams.get('day') ?? '').trim();
  if (!EMAIL_RE.test(userEmail)) {
    return NextResponse.json(
      { error: '`user_email` must be a valid email.' },
      { status: 400 }
    );
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    return NextResponse.json(
      { error: '`day` must be YYYY-MM-DD.' },
      { status: 400 }
    );
  }

  const dayStart = `${day}T00:00:00.000Z`;
  const dayEnd = `${day}T23:59:59.999Z`;

  const [userRes, asgRes, unavRes] = await Promise.all([
    supabaseAdmin
      .from('registered_users')
      .select('email, name')
      .eq('email', userEmail)
      .maybeSingle(),
    supabaseAdmin
      .from('job_team')
      .select(
        'id, job_id, user_email, user_name, slot_role, role, ' +
          'assigned_from, assigned_to, state, is_crew_lead, ' +
          'is_override, override_reason, decline_reason, ' +
          'confirmed_at, declined_at, created_at, notes'
      )
      .eq('user_email', userEmail)
      .in('state', ['proposed', 'confirmed', 'declined', 'cancelled'])
      .not('assigned_from', 'is', null)
      .not('assigned_to', 'is', null)
      .lt('assigned_from', dayEnd)
      .gt('assigned_to', dayStart)
      .order('assigned_from', { ascending: true }),
    supabaseAdmin
      .from('personnel_unavailability')
      .select(
        'id, user_email, unavailable_from, unavailable_to, kind, ' +
          'reason, is_paid, approved_by, approved_at'
      )
      .eq('user_email', userEmail)
      .lt('unavailable_from', dayEnd)
      .gt('unavailable_to', dayStart)
      .order('unavailable_from', { ascending: true }),
  ]);
  if (userRes.error) {
    return NextResponse.json(
      { error: userRes.error.message },
      { status: 500 }
    );
  }
  if (asgRes.error) {
    return NextResponse.json(
      { error: asgRes.error.message },
      { status: 500 }
    );
  }
  if (unavRes.error) {
    return NextResponse.json(
      { error: unavRes.error.message },
      { status: 500 }
    );
  }

  const userRow = userRes.data as { email: string; name: string | null } | null;

  return NextResponse.json({
    user: userRow ?? { email: userEmail, name: null },
    day,
    assignments: asgRes.data ?? [],
    unavailability: unavRes.data ?? [],
  });
}, { routeName: 'admin/personnel/crew-calendar/cell#get' });

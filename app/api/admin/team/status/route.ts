// app/api/admin/team/status/route.ts
//
// Team Status widget endpoint (Slice 118). hub-widget-excellence-14 —
// this was a `{ members: [] }` stub. The server has no live-clock table,
// but today's `daily_time_logs` are a real "who's working today" signal,
// so we surface team members who logged time today (mapped via the pure
// lib/team/status.buildTeamStatus).
//
// GET /api/admin/team/status → { members: TeamMember[] }

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { buildTeamStatus, type TimeLogRow, type RosterEntry } from '@/lib/team/status';

export const GET = withErrorHandler(async () => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const today = new Date().toISOString().slice(0, 10);

  // Who logged time today.
  const { data: logs } = await supabaseAdmin
    .from('daily_time_logs')
    .select('user_email')
    .eq('log_date', today);

  const emails = [...new Set(
    ((logs ?? []) as TimeLogRow[]).map((l) => l.user_email?.trim()).filter((v): v is string => !!v),
  )];
  if (emails.length === 0) return NextResponse.json({ members: [] });

  // Roster for name + role.
  const { data: roster } = await supabaseAdmin
    .from('registered_users')
    .select('email, name, roles')
    .in('email', emails);

  const rosterEntries: RosterEntry[] = ((roster ?? []) as Array<{ email: string; name: string | null; roles: string[] | null }>)
    .map((r) => ({ user_email: r.email, user_name: r.name, roles: r.roles }));

  return NextResponse.json({ members: buildTeamStatus((logs ?? []) as TimeLogRow[], rosterEntries) });
}, { routeName: 'admin/team/status' });

// app/api/admin/timeline/route.ts — Daily-timeline read + derive
//
// GET  /api/admin/timeline?user_email=&date=YYYY-MM-DD
//   Returns the derived stops + segments for one (user, date)
//   bucket. Reads from `location_stops` + `location_segments` —
//   does NOT trigger a derivation, just surfaces what's already
//   been materialized by seeds/224's derive_location_timeline()
//   function. Caller can POST first to refresh.
//
// POST /api/admin/timeline
//   Body: { user_email, date }   — runs derive_location_timeline()
//   server-side and returns the count of stops + segments written.
//   Idempotent — DELETEs prior derivations (except user_overridden
//   stops) and rewrites them.
//
// Auth: admin / developer / tech_support.
import { NextRequest, NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';

interface StopRow {
  id: string;
  user_id: string;
  job_time_entry_id: string | null;
  job_id: string | null;
  category: string | null;
  category_source: string | null;
  ai_confidence: number | null;
  lat: number;
  lon: number;
  place_name: string | null;
  place_address: string | null;
  arrived_at: string;
  departed_at: string;
  duration_minutes: number;
  user_overridden: boolean;
  created_at: string;
  updated_at: string;
}

interface SegmentRow {
  id: string;
  user_id: string;
  job_time_entry_id: string | null;
  vehicle_id: string | null;
  start_stop_id: string | null;
  end_stop_id: string | null;
  started_at: string;
  ended_at: string;
  distance_meters: number;
  is_business: boolean;
  business_purpose: string | null;
}

async function authorize(): Promise<{
  ok: true;
  email: string;
} | { ok: false; res: NextResponse }> {
  const session = await auth();
  if (!session?.user?.email) {
    return {
      ok: false,
      res: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    };
  }
  const userRoles = (session.user as { roles?: string[] } | undefined)
    ?.roles ?? [];
  if (!isAdmin(session.user.roles) && !userRoles.includes('tech_support')) {
    return {
      ok: false,
      res: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    };
  }
  return { ok: true, email: session.user.email };
}

/** Resolve user_email → auth.users.id via registered_users. Returns
 *  null when the email isn't found so the caller can short-circuit
 *  with an empty-result response instead of erroring. */
async function resolveUserId(email: string): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from('registered_users')
    .select('id')
    .eq('email', email.toLowerCase().trim())
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as { id?: string } | null)?.id ?? null;
}

/** YYYY-MM-DD validator. Returns true for ISO calendar dates. */
function isValidDate(s: string | null | undefined): s is string {
  return !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

// ── GET ─────────────────────────────────────────────────────────────────────

export const GET = withErrorHandler(async (req: NextRequest) => {
  const guard = await authorize();
  if (!guard.ok) return guard.res;

  const { searchParams } = new URL(req.url);
  const userEmail = searchParams.get('user_email');
  const date = searchParams.get('date');

  if (!userEmail || !isValidDate(date)) {
    return NextResponse.json(
      { error: 'user_email and date (YYYY-MM-DD) are required' },
      { status: 400 }
    );
  }

  const userId = await resolveUserId(userEmail);
  if (!userId) {
    return NextResponse.json({
      stops: [],
      segments: [],
      total_distance_miles: 0,
      total_dwell_minutes: 0,
      derived_at: null,
    });
  }

  const dayStart = `${date}T00:00:00Z`;
  const dayEnd = `${date}T23:59:59Z`;

  const [stopsRes, segsRes] = await Promise.all([
    supabaseAdmin
      .from('location_stops')
      .select('*')
      .eq('user_id', userId)
      .gte('arrived_at', dayStart)
      .lte('arrived_at', dayEnd)
      .order('arrived_at', { ascending: true }),
    supabaseAdmin
      .from('location_segments')
      .select('*')
      .eq('user_id', userId)
      .gte('started_at', dayStart)
      .lte('started_at', dayEnd)
      .order('started_at', { ascending: true }),
  ]);

  if (stopsRes.error) {
    return NextResponse.json(
      { error: stopsRes.error.message },
      { status: 500 }
    );
  }
  if (segsRes.error) {
    return NextResponse.json(
      { error: segsRes.error.message },
      { status: 500 }
    );
  }

  const stops = (stopsRes.data ?? []) as StopRow[];
  const segments = (segsRes.data ?? []) as SegmentRow[];

  const totalMeters = segments.reduce(
    (s, seg) => s + (seg.distance_meters ?? 0),
    0
  );
  const totalDwell = stops.reduce((s, st) => s + st.duration_minutes, 0);
  const derivedAt =
    stops.length > 0
      ? stops
          .map((s) => s.updated_at)
          .sort()
          .pop() ?? null
      : null;

  return NextResponse.json({
    stops,
    segments,
    total_distance_miles:
      Math.round((totalMeters / 1609.344) * 100) / 100,
    total_dwell_minutes: totalDwell,
    derived_at: derivedAt,
    user_email: userEmail,
    date,
  });
}, { routeName: 'admin/timeline.get' });

// ── POST ────────────────────────────────────────────────────────────────────

export const POST = withErrorHandler(async (req: NextRequest) => {
  const guard = await authorize();
  if (!guard.ok) return guard.res;

  let body: { user_email?: unknown; date?: unknown };
  try {
    body = (await req.json()) as { user_email?: unknown; date?: unknown };
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body' },
      { status: 400 }
    );
  }

  const userEmail =
    typeof body.user_email === 'string' ? body.user_email : null;
  const date = typeof body.date === 'string' ? body.date : null;

  if (!userEmail || !isValidDate(date)) {
    return NextResponse.json(
      { error: 'user_email and date (YYYY-MM-DD) are required' },
      { status: 400 }
    );
  }

  const userId = await resolveUserId(userEmail);
  if (!userId) {
    return NextResponse.json(
      { error: 'Target user not found' },
      { status: 404 }
    );
  }

  // Call the SQL function via supabaseAdmin.rpc. The function is
  // SECURITY DEFINER so it runs as the function owner regardless
  // of the caller; service_role has been granted EXECUTE in
  // seeds/224.
  const { data, error } = await supabaseAdmin.rpc(
    'derive_location_timeline',
    { p_user_id: userId, p_log_date: date }
  );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Postgres returns the OUT params as a single row.
  const row = Array.isArray(data) ? data[0] : data;
  return NextResponse.json({
    success: true,
    user_email: userEmail,
    date,
    stops_written:
      (row as { stops_written?: number } | null)?.stops_written ?? 0,
    segments_written:
      (row as { segments_written?: number } | null)?.segments_written ?? 0,
  });
}, { routeName: 'admin/timeline.post' });

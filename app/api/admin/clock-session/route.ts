// app/api/admin/clock-session/route.ts
//
// Server-side hub work-mode clock (slice C1 of the clock-in/work-mode plan).
//   GET    → the caller's open clock session, or null
//   POST   { started_at?, job_id?, tag_ids?, source? } → open/refresh it (upsert)
//   DELETE → close it
//
// One row per user (active_clock_sessions.user_email is the PK). Writing here
// is what lets the team page + the 6pm reminder cron see who's on the clock.
// All operations are best-effort from the client's perspective — the localStorage
// session stays the fast path; this is the durable mirror.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';

export const GET = withErrorHandler(async () => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data, error } = await supabaseAdmin
    .from('active_clock_sessions')
    .select('*')
    .eq('user_email', session.user.email)
    .maybeSingle();
  // Missing table (pre-migration) or any error → no session, don't 500 the pill.
  if (error) return NextResponse.json({ session: null });
  return NextResponse.json({ session: data ?? null });
}, { routeName: 'admin/clock-session/GET' });

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { started_at, job_id, tag_ids, source } = body as {
    started_at?: string;
    job_id?: string | null;
    tag_ids?: string[];
    source?: string;
  };

  const now = new Date().toISOString();
  const { data, error } = await supabaseAdmin
    .from('active_clock_sessions')
    .upsert(
      {
        user_email: session.user.email,
        started_at: started_at || now,
        job_id: job_id ?? null,
        tag_ids: Array.isArray(tag_ids) ? tag_ids : [],
        source: source ?? 'hub',
        updated_at: now,
      },
      { onConflict: 'user_email' },
    )
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ session: data });
}, { routeName: 'admin/clock-session/POST' });

export const DELETE = withErrorHandler(async () => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { error } = await supabaseAdmin
    .from('active_clock_sessions')
    .delete()
    .eq('user_email', session.user.email);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}, { routeName: 'admin/clock-session/DELETE' });

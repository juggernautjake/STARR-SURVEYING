// app/api/admin/pto/route.ts
//
// PTO balance + transactions API. Closes the Slice 4 deferred PTO Balance
// dashboard tile.
//
// GET    /api/admin/pto                — { balance, accrual_rate_hours,
//                                          accrual_period, last_accrued_at,
//                                          recent_transactions[] }
// GET    /api/admin/pto?email=…        — admin: another user's balance
// GET    /api/admin/pto?everyone=1     — admin: list every balance
// POST   /api/admin/pto                — admin: manual adjustment
//                                        { email, delta_hours, reason }
// POST   /api/admin/pto?action=accrue  — admin: run pto_accrue_user for
//                                        every employee (cron entry point)

import { NextRequest, NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';

const SELECT_COLS = 'user_email, accrual_rate_hours, accrual_period, balance_hours, carryover_cap_hours, last_accrued_at';

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const everyone = searchParams.get('everyone') === '1';
  const askedEmail = searchParams.get('email');

  if (everyone) {
    if (!isAdmin(session.user.roles)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    const { data, error } = await supabaseAdmin.from('pto_balances').select(SELECT_COLS).order('user_email');
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ balances: data ?? [] });
  }

  let email = session.user.email;
  if (askedEmail && askedEmail !== email) {
    if (!isAdmin(session.user.roles)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    email = askedEmail;
  }

  // Auto-create a default balance row on first read so new hires don't see
  // a 500 / "no row".
  const existing = await supabaseAdmin.from('pto_balances').select(SELECT_COLS).eq('user_email', email).maybeSingle();
  if (!existing.data) {
    await supabaseAdmin.from('pto_balances').insert({ user_email: email });
  }
  const { data: balance } = await supabaseAdmin.from('pto_balances').select(SELECT_COLS).eq('user_email', email).maybeSingle();

  const { data: txns } = await supabaseAdmin
    .from('pto_transactions')
    .select('id, delta_hours, kind, reason, created_at, schedule_event_id')
    .eq('user_email', email)
    .order('created_at', { ascending: false })
    .limit(20);

  return NextResponse.json({
    balance: balance ?? null,
    recent_transactions: txns ?? [],
  });
}, { routeName: 'admin/pto' });

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isAdmin(session.user.roles)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const action = searchParams.get('action');

  // Cron entry point: run the SQL accrual function for every balance row.
  if (action === 'accrue') {
    const { data: rows } = await supabaseAdmin.from('pto_balances').select('user_email');
    let credited = 0;
    for (const r of rows ?? []) {
      const { data } = await supabaseAdmin.rpc('pto_accrue_user', { p_email: r.user_email });
      const hours = Number(data ?? 0);
      if (hours > 0) credited++;
    }
    return NextResponse.json({ accrued_for: credited });
  }

  // Manual adjustment.
  const body = await req.json() as { email?: string; delta_hours?: number; reason?: string };
  if (!body.email || typeof body.delta_hours !== 'number' || !Number.isFinite(body.delta_hours)) {
    return NextResponse.json({ error: 'email and numeric delta_hours required' }, { status: 400 });
  }

  // Ensure a row exists then add delta.
  const { data: existing } = await supabaseAdmin
    .from('pto_balances')
    .select('balance_hours')
    .eq('user_email', body.email)
    .maybeSingle();
  if (!existing) {
    await supabaseAdmin.from('pto_balances').insert({ user_email: body.email, balance_hours: 0 });
  }
  const { data: row } = await supabaseAdmin
    .from('pto_balances')
    .select('balance_hours')
    .eq('user_email', body.email)
    .maybeSingle();
  const next = Number(row?.balance_hours ?? 0) + body.delta_hours;
  await supabaseAdmin
    .from('pto_balances')
    .update({ balance_hours: next, updated_at: new Date().toISOString() })
    .eq('user_email', body.email);
  await supabaseAdmin.from('pto_transactions').insert({
    user_email: body.email,
    delta_hours: body.delta_hours,
    kind: 'manual',
    reason: body.reason ?? null,
    created_by: session.user.email,
  });
  return NextResponse.json({ balance_hours: next });
}, { routeName: 'admin/pto' });

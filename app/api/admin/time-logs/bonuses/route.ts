// app/api/admin/time-logs/bonuses/route.ts — Scheduled bonuses (admin only)
import { NextRequest, NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';

// GET: List bonuses (admin all, employee own)
export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const email = searchParams.get('email');
  const status = searchParams.get('status');
  const admin = isAdmin(session.user.email);

  let query = supabaseAdmin
    .from('scheduled_bonuses')
    .select('*')
    .order('scheduled_date', { ascending: false });

  if (!admin) query = query.eq('user_email', session.user.email);
  else if (email) query = query.eq('user_email', email);
  if (status) query = query.eq('status', status);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ bonuses: data || [] });
}, { routeName: 'time-logs/bonuses' });

// POST: Create a scheduled bonus (admin only)
export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isAdmin(session.user.email)) return NextResponse.json({ error: 'Admin only' }, { status: 403 });

  const body = await req.json();
  const { user_email, amount, bonus_type, reason, scheduled_date, scheduled_time, notes } = body as {
    user_email: string;
    amount: number;
    bonus_type?: string;
    reason: string;
    scheduled_date: string;
    scheduled_time?: string;
    notes?: string;
  };

  if (!user_email || !amount || !reason || !scheduled_date) {
    return NextResponse.json({ error: 'user_email, amount, reason, and scheduled_date required' }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from('scheduled_bonuses')
    .insert({
      user_email,
      amount,
      bonus_type: bonus_type || 'performance',
      reason,
      scheduled_date,
      scheduled_time: scheduled_time || '09:00:00',
      status: 'scheduled',
      created_by: session.user.email,
      notes: notes || null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  try {
    await supabaseAdmin.from('activity_log').insert({
      user_email: session.user.email,
      action_type: 'bonus_scheduled',
      entity_type: 'scheduled_bonuses',
      entity_id: data.id,
      metadata: { target: user_email, amount, type: bonus_type },
    });
  } catch { /* ignore */ }

  return NextResponse.json({ bonus: data }, { status: 201 });
}, { routeName: 'time-logs/bonuses' });

// PUT: Update bonus (cancel or mark paid)
export const PUT = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isAdmin(session.user.email)) return NextResponse.json({ error: 'Admin only' }, { status: 403 });

  const body = await req.json();
  const { id, action } = body as { id: string; action: 'cancel' | 'pay' };
  if (!id || !action) return NextResponse.json({ error: 'id and action required' }, { status: 400 });

  const updateData: Record<string, unknown> = {};
  if (action === 'cancel') {
    updateData.status = 'cancelled';
  } else if (action === 'pay') {
    updateData.status = 'paid';
    updateData.paid_at = new Date().toISOString();
  }

  const { data, error } = await supabaseAdmin
    .from('scheduled_bonuses')
    .update(updateData)
    .eq('id', id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ bonus: data });
}, { routeName: 'time-logs/bonuses' });

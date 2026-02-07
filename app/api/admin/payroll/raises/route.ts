// app/api/admin/payroll/raises/route.ts — Pay raises management
import { NextRequest, NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';

// GET: Get raise history for an employee
export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const email = searchParams.get('email');
  const targetEmail = email || session.user.email;

  // Non-admins only see their own
  if (!isAdmin(session.user.email) && targetEmail !== session.user.email) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { data, error } = await supabaseAdmin
    .from('pay_raises')
    .select('*')
    .eq('user_email', targetEmail)
    .order('effective_date', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Get next review date from latest raise
  const nextReview = data && data.length > 0 ? data[0].next_review_date : null;

  return NextResponse.json({ raises: data || [], next_review_date: nextReview });
}, { routeName: 'payroll/raises' });

// POST: Record a pay raise (admin only)
export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isAdmin(session.user.email)) return NextResponse.json({ error: 'Admin only' }, { status: 403 });

  const body = await req.json();
  const { user_email, new_rate, reason, effective_date, next_review_date, notes } = body;

  if (!user_email || !new_rate || !effective_date) {
    return NextResponse.json({ error: 'user_email, new_rate, and effective_date required' }, { status: 400 });
  }

  // Get current rate
  const { data: profile } = await supabaseAdmin
    .from('employee_profiles')
    .select('hourly_rate')
    .eq('user_email', user_email)
    .single();

  const previousRate = profile?.hourly_rate || 0;
  const raiseAmount = new_rate - previousRate;
  const raisePercentage = previousRate > 0 ? ((raiseAmount / previousRate) * 100) : 0;

  // Insert raise record
  const { data: raise, error } = await supabaseAdmin
    .from('pay_raises')
    .insert({
      user_email,
      previous_rate: previousRate,
      new_rate,
      raise_amount: raiseAmount,
      raise_percentage: Math.round(raisePercentage * 100) / 100,
      reason,
      effective_date,
      approved_by: session.user.email,
      next_review_date,
      notes,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Update employee profile with new rate
  await supabaseAdmin
    .from('employee_profiles')
    .update({ hourly_rate: new_rate })
    .eq('user_email', user_email);

  // Log activity
  try {
    await supabaseAdmin.from('activity_log').insert({
      user_email: session.user.email,
      action_type: 'pay_raise_recorded',
      entity_type: 'pay_raise',
      entity_id: raise.id,
      metadata: { target_email: user_email, previous_rate: previousRate, new_rate, raise_amount: raiseAmount },
    });
  } catch { /* ignore */ }

  return NextResponse.json({ raise, updated_rate: new_rate }, { status: 201 });
}, { routeName: 'payroll/raises' });

// app/api/admin/time-logs/route.ts — Daily time log CRUD + pay calculation
import { NextRequest, NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';

interface WorkTypeRate { work_type: string; label: string; base_rate: number; icon: string }
interface RoleTier { role_key: string; label: string; base_bonus: number }
interface SeniorityBracket { min_years: number; max_years: number | null; bonus_per_hour: number }
interface CredentialBonus { credential_key: string; bonus_per_hour: number }

async function calculateEffectiveRate(
  userEmail: string,
  workType: string
): Promise<{
  base_rate: number;
  role_bonus: number;
  seniority_bonus: number;
  credential_bonus: number;
  effective_rate: number;
}> {
  // 1. Get work type base rate
  const { data: wtr } = await supabaseAdmin
    .from('work_type_rates')
    .select('base_rate')
    .eq('work_type', workType)
    .eq('is_active', true)
    .single();
  const baseRate = (wtr as WorkTypeRate | null)?.base_rate ?? 15;

  // 2. Get employee profile for role and hire date
  const { data: profile } = await supabaseAdmin
    .from('employee_profiles')
    .select('job_title, hire_date')
    .eq('user_email', userEmail)
    .single();

  // 3. Get role tier bonus
  let roleBonus = 0;
  if (profile?.job_title) {
    const { data: tier } = await supabaseAdmin
      .from('role_tiers')
      .select('base_bonus')
      .eq('role_key', profile.job_title)
      .single();
    roleBonus = (tier as RoleTier | null)?.base_bonus ?? 0;
  }

  // 4. Calculate seniority bonus
  let seniorityBonus = 0;
  if (profile?.hire_date) {
    const hireDate = new Date(profile.hire_date);
    const years = Math.floor((Date.now() - hireDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
    const { data: brackets } = await supabaseAdmin
      .from('seniority_brackets')
      .select('min_years, max_years, bonus_per_hour')
      .order('min_years', { ascending: true });
    if (brackets) {
      for (const b of brackets as SeniorityBracket[]) {
        if (years >= b.min_years && (b.max_years === null || years <= b.max_years)) {
          seniorityBonus = b.bonus_per_hour;
          break;
        }
      }
    }
  }

  // 5. Sum credential bonuses (verified only)
  let credentialBonus = 0;
  const { data: earnedCreds } = await supabaseAdmin
    .from('employee_earned_credentials')
    .select('credential_key')
    .eq('user_email', userEmail)
    .eq('verified', true);
  if (earnedCreds && earnedCreds.length > 0) {
    const keys = (earnedCreds as { credential_key: string }[]).map((c) => c.credential_key);
    const { data: credBonuses } = await supabaseAdmin
      .from('credential_bonuses')
      .select('credential_key, bonus_per_hour')
      .in('credential_key', keys);
    if (credBonuses) {
      credentialBonus = (credBonuses as CredentialBonus[]).reduce((sum, c) => sum + c.bonus_per_hour, 0);
    }
  }

  return {
    base_rate: baseRate,
    role_bonus: roleBonus,
    seniority_bonus: seniorityBonus,
    credential_bonus: credentialBonus,
    effective_rate: baseRate + roleBonus + seniorityBonus + credentialBonus,
  };
}

// GET: List time logs — employees see own, admins see all (with filters)
export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const email = searchParams.get('email');
  const dateFrom = searchParams.get('date_from');
  const dateTo = searchParams.get('date_to');
  const status = searchParams.get('status');
  const weekStart = searchParams.get('week_start');

  const admin = isAdmin(session.user.email);

  // Non-admins can only view their own
  if (!admin && email && email !== session.user.email) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let query = supabaseAdmin
    .from('daily_time_logs')
    .select('*')
    .order('log_date', { ascending: false })
    .order('created_at', { ascending: false });

  const targetEmail = admin ? email : session.user.email;
  if (targetEmail) query = query.eq('user_email', targetEmail);
  if (!admin) query = query.eq('user_email', session.user.email);

  if (dateFrom) query = query.gte('log_date', dateFrom);
  if (dateTo) query = query.lte('log_date', dateTo);
  if (status) query = query.eq('status', status);
  if (weekStart) {
    const ws = new Date(weekStart);
    const we = new Date(ws);
    we.setDate(we.getDate() + 6);
    query = query.gte('log_date', ws.toISOString().split('T')[0]).lte('log_date', we.toISOString().split('T')[0]);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Also fetch work type rates for display
  const { data: workTypes } = await supabaseAdmin
    .from('work_type_rates')
    .select('*')
    .eq('is_active', true)
    .order('sort_order');

  return NextResponse.json({ logs: data || [], work_types: workTypes || [] });
}, { routeName: 'time-logs' });

// POST: Submit daily time log entries
export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { entries } = body as {
    entries: Array<{
      log_date: string;
      work_type: string;
      hours: number;
      job_id?: string;
      job_name?: string;
      description: string;
      notes?: string;
    }>;
  };

  if (!entries || !entries.length) {
    return NextResponse.json({ error: 'No entries provided' }, { status: 400 });
  }

  // Validate total hours per date don't exceed 24
  const hoursByDate = new Map<string, number>();
  for (const e of entries) {
    if (!e.log_date || !e.work_type || !e.hours || !e.description) {
      return NextResponse.json({ error: 'Each entry needs log_date, work_type, hours, and description' }, { status: 400 });
    }
    if (e.hours <= 0 || e.hours > 24) {
      return NextResponse.json({ error: 'Hours must be between 0 and 24' }, { status: 400 });
    }
    hoursByDate.set(e.log_date, (hoursByDate.get(e.log_date) || 0) + e.hours);
  }
  for (const [date, total] of hoursByDate) {
    if (total > 24) {
      return NextResponse.json({ error: `Total hours for ${date} exceed 24 (${total})` }, { status: 400 });
    }
  }

  const results = [];
  for (const entry of entries) {
    // Calculate pay rate for this entry
    const rates = await calculateEffectiveRate(session.user.email, entry.work_type);

    const { data, error } = await supabaseAdmin
      .from('daily_time_logs')
      .insert({
        user_email: session.user.email,
        log_date: entry.log_date,
        work_type: entry.work_type,
        hours: entry.hours,
        job_id: entry.job_id || null,
        job_name: entry.job_name || null,
        description: entry.description,
        notes: entry.notes || null,
        status: 'pending',
        base_rate: rates.base_rate,
        role_bonus: rates.role_bonus,
        seniority_bonus: rates.seniority_bonus,
        credential_bonus: rates.credential_bonus,
        effective_rate: rates.effective_rate,
        total_pay: rates.effective_rate * entry.hours,
      })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    results.push(data);
  }

  // Log activity
  try {
    await supabaseAdmin.from('activity_log').insert({
      user_email: session.user.email,
      action_type: 'time_logs_submitted',
      entity_type: 'daily_time_logs',
      entity_id: results[0]?.id,
      metadata: { count: results.length, dates: [...hoursByDate.keys()] },
    });
  } catch { /* ignore */ }

  return NextResponse.json({ logs: results }, { status: 201 });
}, { routeName: 'time-logs' });

// PUT: Update a time log (employee can edit pending, admin can approve/reject/adjust)
export const PUT = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { id, action, ...updates } = body as {
    id: string;
    action?: 'approve' | 'reject' | 'adjust' | 'dispute';
    hours?: number;
    description?: string;
    notes?: string;
    rejection_reason?: string;
    adjustment_note?: string;
    adjusted_hours?: number;
  };

  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  // Fetch existing log
  const { data: existing, error: fetchErr } = await supabaseAdmin
    .from('daily_time_logs')
    .select('*')
    .eq('id', id)
    .single();
  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  if (!existing) return NextResponse.json({ error: 'Log not found' }, { status: 404 });

  const admin = isAdmin(session.user.email);

  // Admin approval actions
  if (action && admin) {
    const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };

    if (action === 'approve') {
      updateData.status = 'approved';
      updateData.approved_by = session.user.email;
      updateData.approved_at = new Date().toISOString();
    } else if (action === 'reject') {
      updateData.status = 'rejected';
      updateData.approved_by = session.user.email;
      updateData.approved_at = new Date().toISOString();
      updateData.rejection_reason = updates.rejection_reason || 'Rejected by admin';
    } else if (action === 'adjust') {
      updateData.status = 'adjusted';
      updateData.approved_by = session.user.email;
      updateData.approved_at = new Date().toISOString();
      updateData.adjustment_note = updates.adjustment_note || '';
      updateData.adjusted_hours = updates.adjusted_hours;
      // Recalculate pay with adjusted hours
      if (updates.adjusted_hours) {
        updateData.total_pay = (existing.effective_rate || 0) * updates.adjusted_hours;
      }
    }

    const { data, error } = await supabaseAdmin
      .from('daily_time_logs')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    try {
      await supabaseAdmin.from('activity_log').insert({
        user_email: session.user.email,
        action_type: `time_log_${action}`,
        entity_type: 'daily_time_logs',
        entity_id: id,
        metadata: { employee: existing.user_email, action },
      });
    } catch { /* ignore */ }

    return NextResponse.json({ log: data });
  }

  // Employee dispute
  if (action === 'dispute' && existing.user_email === session.user.email) {
    const { data, error } = await supabaseAdmin
      .from('daily_time_logs')
      .update({
        status: 'disputed',
        notes: updates.notes || existing.notes,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ log: data });
  }

  // Employee editing their own pending entry
  if (existing.user_email !== session.user.email && !admin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  if (existing.status !== 'pending' && existing.status !== 'rejected' && !admin) {
    return NextResponse.json({ error: 'Can only edit pending or rejected entries' }, { status: 400 });
  }

  const editUpdates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (updates.hours !== undefined) editUpdates.hours = updates.hours;
  if (updates.description !== undefined) editUpdates.description = updates.description;
  if (updates.notes !== undefined) editUpdates.notes = updates.notes;

  // If hours changed, recalculate
  if (updates.hours !== undefined) {
    editUpdates.total_pay = (existing.effective_rate || 0) * updates.hours;
    editUpdates.status = 'pending'; // re-submit for approval
  }

  const { data, error } = await supabaseAdmin
    .from('daily_time_logs')
    .update(editUpdates)
    .eq('id', id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ log: data });
}, { routeName: 'time-logs' });

// DELETE: Remove a pending time log (employee own, or admin any)
export const DELETE = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const { data: existing } = await supabaseAdmin
    .from('daily_time_logs')
    .select('user_email, status')
    .eq('id', id)
    .single();

  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const admin = isAdmin(session.user.email);
  if (!admin && existing.user_email !== session.user.email) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  if (!admin && existing.status !== 'pending') {
    return NextResponse.json({ error: 'Can only delete pending entries' }, { status: 400 });
  }

  const { error } = await supabaseAdmin.from('daily_time_logs').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}, { routeName: 'time-logs' });

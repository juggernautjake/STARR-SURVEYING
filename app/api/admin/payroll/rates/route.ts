// app/api/admin/payroll/rates/route.ts — Pay rate standards & role adjustments
import { NextRequest, NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';

// GET: Get pay rate standards and role adjustments
export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const type = searchParams.get('type') || 'standards'; // standards, adjustments, both

  const result: Record<string, unknown> = {};

  if (type === 'standards' || type === 'both') {
    const { data, error } = await supabaseAdmin
      .from('pay_rate_standards')
      .select('*')
      .eq('is_current', true)
      .order('job_title');

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    result.standards = data || [];
  }

  if (type === 'adjustments' || type === 'both') {
    const { data, error } = await supabaseAdmin
      .from('role_pay_adjustments')
      .select('*')
      .eq('is_active', true)
      .order('base_title');

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    result.adjustments = data || [];
  }

  return NextResponse.json(result);
}, { routeName: 'payroll/rates' });

// POST: Create/update pay rate standard (admin only)
export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isAdmin(session.user.email)) return NextResponse.json({ error: 'Admin only' }, { status: 403 });

  const body = await req.json();
  const { type = 'standard', ...data } = body;

  if (type === 'standard') {
    const { job_title, min_rate, max_rate, default_rate, description } = data;
    if (!job_title) return NextResponse.json({ error: 'job_title required' }, { status: 400 });

    // Mark old as not current
    await supabaseAdmin
      .from('pay_rate_standards')
      .update({ is_current: false })
      .eq('job_title', job_title)
      .eq('is_current', true);

    const { data: rate, error } = await supabaseAdmin
      .from('pay_rate_standards')
      .insert({
        job_title, min_rate, max_rate, default_rate,
        description, effective_date: new Date().toISOString().split('T')[0],
      })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ rate }, { status: 201 });
  }

  if (type === 'adjustment') {
    const { base_title, role_on_job, adjustment_type, adjustment_amount, description: desc } = data;
    if (!base_title || !role_on_job) {
      return NextResponse.json({ error: 'base_title and role_on_job required' }, { status: 400 });
    }

    const { data: adjustment, error } = await supabaseAdmin
      .from('role_pay_adjustments')
      .insert({ base_title, role_on_job, adjustment_type, adjustment_amount, description: desc })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ adjustment }, { status: 201 });
  }

  return NextResponse.json({ error: 'Invalid type' }, { status: 400 });
}, { routeName: 'payroll/rates' });

// PUT: Update rate or adjustment (admin only)
export const PUT = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isAdmin(session.user.email)) return NextResponse.json({ error: 'Admin only' }, { status: 403 });

  const body = await req.json();
  const { id, table = 'pay_rate_standards', ...updates } = body;
  if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 });

  const tableName = table === 'role_pay_adjustments' ? 'role_pay_adjustments' : 'pay_rate_standards';

  const { data, error } = await supabaseAdmin
    .from(tableName)
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ updated: data });
}, { routeName: 'payroll/rates' });

// DELETE: Deactivate rate or adjustment (admin only)
export const DELETE = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isAdmin(session.user.email)) return NextResponse.json({ error: 'Admin only' }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  const table = searchParams.get('table') || 'pay_rate_standards';
  if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 });

  const tableName = table === 'role_pay_adjustments' ? 'role_pay_adjustments' : 'pay_rate_standards';
  const field = tableName === 'role_pay_adjustments' ? 'is_active' : 'is_current';

  const { error } = await supabaseAdmin
    .from(tableName)
    .update({ [field]: false })
    .eq('id', id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}, { routeName: 'payroll/rates' });

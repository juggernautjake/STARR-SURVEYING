// app/api/admin/payroll/runs/route.ts — Payroll runs & pay stubs
import { NextRequest, NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';

// GET: List payroll runs or get specific run with stubs
export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const runId = searchParams.get('id');
  const limit = parseInt(searchParams.get('limit') || '20', 10);

  if (runId) {
    // Get specific run with pay stubs
    if (!isAdmin(session.user.email)) {
      // Non-admin: only their own stub
      const { data: stub } = await supabaseAdmin
        .from('pay_stubs')
        .select('*')
        .eq('payroll_run_id', runId)
        .eq('user_email', session.user.email)
        .single();

      return NextResponse.json({ stub });
    }

    const { data: run } = await supabaseAdmin
      .from('payroll_runs')
      .select('*')
      .eq('id', runId)
      .single();

    const { data: stubs } = await supabaseAdmin
      .from('pay_stubs')
      .select('*')
      .eq('payroll_run_id', runId)
      .order('user_name');

    return NextResponse.json({ run, stubs: stubs || [] });
  }

  // List runs
  if (!isAdmin(session.user.email)) {
    // Non-admin: list their pay stubs
    const { data: stubs, error } = await supabaseAdmin
      .from('pay_stubs')
      .select('*')
      .eq('user_email', session.user.email)
      .order('pay_period_end', { ascending: false })
      .limit(limit);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ stubs: stubs || [] });
  }

  const { data, error } = await supabaseAdmin
    .from('payroll_runs')
    .select('*')
    .order('pay_period_end', { ascending: false })
    .limit(limit);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ runs: data || [] });
}, { routeName: 'payroll/runs' });

// POST: Create a new payroll run (admin only)
export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isAdmin(session.user.email)) return NextResponse.json({ error: 'Admin only' }, { status: 403 });

  const body = await req.json();
  const { pay_period_start, pay_period_end, notes } = body;

  if (!pay_period_start || !pay_period_end) {
    return NextResponse.json({ error: 'pay_period_start and pay_period_end required' }, { status: 400 });
  }

  // Get all active employees
  const { data: employees } = await supabaseAdmin
    .from('employee_profiles')
    .select('*')
    .eq('is_active', true);

  if (!employees || employees.length === 0) {
    return NextResponse.json({ error: 'No active employees found' }, { status: 400 });
  }

  // Get time entries for this period from job_time_entries
  const { data: timeEntries } = await supabaseAdmin
    .from('job_time_entries')
    .select('*')
    .gte('start_time', pay_period_start)
    .lte('start_time', pay_period_end + 'T23:59:59');

  // Get role adjustments
  const { data: adjustments } = await supabaseAdmin
    .from('role_pay_adjustments')
    .select('*')
    .eq('is_active', true);

  // Get certifications for pay bumps
  const { data: allCerts } = await supabaseAdmin
    .from('employee_certifications')
    .select('*')
    .eq('verified', true);

  // Create payroll run
  const { data: run, error: runError } = await supabaseAdmin
    .from('payroll_runs')
    .insert({
      pay_period_start,
      pay_period_end,
      status: 'draft',
      processed_by: session.user.email,
      notes,
      employee_count: employees.length,
    })
    .select()
    .single();

  if (runError) return NextResponse.json({ error: runError.message }, { status: 500 });

  // Generate pay stubs for each employee
  const stubs = [];
  let totalGross = 0;
  let totalNet = 0;

  for (const emp of employees) {
    // Calculate hours from time entries
    const empEntries = (timeEntries || []).filter(
      (e: { user_email: string }) => e.user_email === emp.user_email
    );
    const totalMinutes = empEntries.reduce(
      (sum: number, e: { duration_minutes: number | null }) => sum + (e.duration_minutes || 0), 0
    );
    const totalHours = Math.round((totalMinutes / 60) * 100) / 100;
    const regularHours = Math.min(totalHours, 80); // 80 hrs for biweekly
    const overtimeHours = Math.max(0, totalHours - 80);

    // Calculate cert bumps
    const empCerts = (allCerts || []).filter(
      (c: { user_email: string }) => c.user_email === emp.user_email
    );
    const certBump = empCerts.reduce(
      (sum: number, c: { pay_bump_amount: number | null }) => sum + (c.pay_bump_amount || 0), 0
    );

    // Calculate role adjustment (average if worked multiple roles)
    let roleAdj = 0;
    const jobRoles = new Set(
      empEntries.map((e: { work_type: string }) => e.work_type).filter(Boolean)
    );
    if (adjustments && jobRoles.size > 0) {
      for (const role of jobRoles) {
        const adj = adjustments.find(
          (a: { base_title: string; role_on_job: string }) =>
            a.base_title === emp.job_title && a.role_on_job === role
        );
        if (adj) roleAdj = Math.max(roleAdj, (adj as { adjustment_amount: number }).adjustment_amount);
      }
    }

    const effectiveRate = emp.hourly_rate + certBump + roleAdj;
    const overtimeRate = effectiveRate * 1.5;
    const grossPay = Math.round(((regularHours * effectiveRate) + (overtimeHours * overtimeRate)) * 100) / 100;

    // Estimate deductions (simplified — real payroll uses a provider like Gusto/ADP)
    const federalTax = Math.round(grossPay * 0.12 * 100) / 100;
    const stateTax = Math.round(grossPay * 0.0 * 100) / 100; // Texas has no state income tax
    const socialSecurity = Math.round(grossPay * 0.062 * 100) / 100;
    const medicare = Math.round(grossPay * 0.0145 * 100) / 100;
    const totalDeductions = federalTax + stateTax + socialSecurity + medicare;
    const netPay = Math.round((grossPay - totalDeductions) * 100) / 100;

    // Job hours breakdown
    const jobHoursMap: Record<string, { job_id: string; hours: number; role: string }> = {};
    for (const entry of empEntries) {
      const e = entry as { job_id: string; duration_minutes: number; work_type: string };
      if (!jobHoursMap[e.job_id]) {
        jobHoursMap[e.job_id] = { job_id: e.job_id, hours: 0, role: e.work_type || 'general' };
      }
      jobHoursMap[e.job_id].hours += (e.duration_minutes || 0) / 60;
    }

    stubs.push({
      payroll_run_id: run.id,
      user_email: emp.user_email,
      user_name: emp.user_name,
      pay_period_start,
      pay_period_end,
      regular_hours: regularHours,
      overtime_hours: overtimeHours,
      base_rate: emp.hourly_rate,
      overtime_rate: overtimeRate,
      role_adjustment: roleAdj,
      cert_adjustment: certBump,
      effective_rate: effectiveRate,
      gross_pay: grossPay,
      federal_tax: federalTax,
      state_tax: stateTax,
      social_security: socialSecurity,
      medicare,
      total_deductions: totalDeductions,
      net_pay: netPay,
      job_hours: Object.values(jobHoursMap),
    });

    totalGross += grossPay;
    totalNet += netPay;
  }

  // Insert all stubs
  if (stubs.length > 0) {
    const { error: stubError } = await supabaseAdmin
      .from('pay_stubs')
      .insert(stubs);

    if (stubError) return NextResponse.json({ error: stubError.message }, { status: 500 });
  }

  // Update run totals
  await supabaseAdmin
    .from('payroll_runs')
    .update({
      total_gross: Math.round(totalGross * 100) / 100,
      total_net: Math.round(totalNet * 100) / 100,
      total_deductions: Math.round((totalGross - totalNet) * 100) / 100,
    })
    .eq('id', run.id);

  // Log activity
  try {
    await supabaseAdmin.from('activity_log').insert({
      user_email: session.user.email,
      action_type: 'payroll_run_created',
      entity_type: 'payroll_run',
      entity_id: run.id,
      metadata: { pay_period_start, pay_period_end, employee_count: employees.length, total_gross: totalGross },
    });
  } catch { /* ignore */ }

  return NextResponse.json({ run: { ...run, total_gross: totalGross, total_net: totalNet }, stub_count: stubs.length }, { status: 201 });
}, { routeName: 'payroll/runs' });

// PUT: Update payroll run status (process/complete/cancel)
export const PUT = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isAdmin(session.user.email)) return NextResponse.json({ error: 'Admin only' }, { status: 403 });

  const body = await req.json();
  const { id, status, notes } = body;
  if (!id || !status) return NextResponse.json({ error: 'id and status required' }, { status: 400 });

  const validStatuses = ['draft', 'processing', 'completed', 'cancelled'];
  if (!validStatuses.includes(status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
  }

  const updates: Record<string, unknown> = { status };
  if (notes) updates.notes = notes;

  // If completing: credit employee balances
  if (status === 'completed') {
    const { data: stubs } = await supabaseAdmin
      .from('pay_stubs')
      .select('*')
      .eq('payroll_run_id', id)
      .eq('disbursement_status', 'pending');

    if (stubs && stubs.length > 0) {
      for (const stub of stubs) {
        const s = stub as { id: string; user_email: string; net_pay: number };
        // Get current balance
        const { data: profile } = await supabaseAdmin
          .from('employee_profiles')
          .select('available_balance, total_earned')
          .eq('user_email', s.user_email)
          .single();

        const balanceBefore = profile?.available_balance || 0;
        const balanceAfter = balanceBefore + s.net_pay;

        // Create balance transaction
        await supabaseAdmin.from('balance_transactions').insert({
          user_email: s.user_email,
          transaction_type: 'credit_payroll',
          amount: s.net_pay,
          balance_before: balanceBefore,
          balance_after: balanceAfter,
          description: `Payroll credit for period`,
          reference_type: 'pay_stub',
          reference_id: s.id,
          status: 'completed',
          processed_at: new Date().toISOString(),
        });

        // Update employee balance
        await supabaseAdmin
          .from('employee_profiles')
          .update({
            available_balance: balanceAfter,
            total_earned: (profile?.total_earned || 0) + s.net_pay,
          })
          .eq('user_email', s.user_email);

        // Mark stub as credited
        await supabaseAdmin
          .from('pay_stubs')
          .update({ disbursement_status: 'credited', credited_at: new Date().toISOString() })
          .eq('id', s.id);
      }
    }
  }

  const { data, error } = await supabaseAdmin
    .from('payroll_runs')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ run: data });
}, { routeName: 'payroll/runs' });

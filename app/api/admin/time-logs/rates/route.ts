// app/api/admin/time-logs/rates/route.ts — Work type rates, role tiers, seniority, credentials
import { NextRequest, NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { loadPayConfig, loadPersonPayFacts, rateMenuFor } from '@/lib/payroll/pay-context';

// GET: Fetch all rate configuration tables
export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const table = searchParams.get('table'); // optional: filter to one table

  const results: Record<string, unknown> = {};

  if (!table || table === 'work_types') {
    const { data } = await supabaseAdmin
      .from('work_type_rates')
      .select('*')
      .order('sort_order');
    results.work_types = data || [];
  }

  if (!table || table === 'role_tiers') {
    const { data } = await supabaseAdmin
      .from('role_tiers')
      .select('*')
      .order('sort_order');
    results.role_tiers = data || [];
  }

  if (!table || table === 'seniority') {
    const { data } = await supabaseAdmin
      .from('seniority_brackets')
      .select('*')
      .order('min_years');
    results.seniority_brackets = data || [];
  }

  if (!table || table === 'credentials') {
    const { data } = await supabaseAdmin
      .from('credential_bonuses')
      .select('*')
      .order('sort_order');
    results.credential_bonuses = data || [];
  }

  // If user-specific, also get their earned credentials
  const email = searchParams.get('email');
  if (email) {
    const { data } = await supabaseAdmin
      .from('employee_earned_credentials')
      .select('*')
      .eq('user_email', email);
    results.earned_credentials = data || [];
  }

  // ── THE RATE THIS PERSON ACTUALLY EARNS (owner report, 2026-08-04) ──────────────────────────
  //
  // *"On my payment page it shows my base pay is $25 an hour, but when I go to My Hours to log
  // hours, it shows a bunch of different roles at different pay rates and it doesn't show the $25.
  // This is inconsistent."*
  //
  // It was inconsistent because three models answered that one question off three sets of tables —
  // the full account is in the header of `lib/payroll/resolve-rate.ts`. The picker was not showing a
  // *wrong* number; it was showing a *different* one from the number the person had been told they
  // earn, with nothing on screen to say either was partial.
  //
  // `menu` now comes from the consolidated model, so this endpoint, the approval screen and the
  // payroll run cannot drift apart again. Each entry carries the rate, which rule produced it, and a
  // sentence explaining it, so the picker can show
  // "$30.50/hr — $20.00 field work + $10.00 party chief + $0.50 seniority" rather than a bare figure
  // the reader has to take on trust.
  //
  // `menu.base` is the no-activity option: the agreed base pay. That is the row for *"we should also
  // be able to apply the base pay too"* and for *"submit the hours without any payment option"*.
  //
  // Permission note: `effective_for` is already covered by the self-or-admin gate at the top of this
  // handler via the `email` param, but that gate keys off `email`, not this one. Checking it
  // explicitly here means adding a parameter cannot quietly widen who can read whose pay.
  const forEmail = searchParams.get('effective_for') ?? session.user.email;
  if (!isAdmin(session.user.roles) && forEmail !== session.user.email) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  if (forEmail && !table) {
    const config = await loadPayConfig();
    const person = await loadPersonPayFacts(forEmail, config);
    const menu = rateMenuFor(person, config, searchParams.get('role_on_job'));

    results.menu = menu;
    results.effective_for = forEmail;
    // Stated rather than assumed. Without a profile there is no grade and no tenure, so every rate
    // is the activity's list price — saying so stops "why is mine the same as the intern's" from
    // being a mystery the reader has to solve.
    results.effective_basis = {
      job_title: person.tierKey,
      tier_label: person.tierLabel,
      years_employed: person.yearsEmployed,
      base_pay: person.basePay,
      band: person.band,
      note: person.hasProfile
        ? null
        : 'No employee profile — showing list rates only, with no grade, seniority or agreed base pay.',
    };

    // Kept under its original key so existing callers keep working while they move over. It is the
    // same numbers, flattened.
    results.effective = menu.activities.map((entry) => ({
      work_type: entry.work_type,
      label: entry.label,
      effectiveRate: entry.resolved.rate,
      source: entry.resolved.source,
      explanation: entry.resolved.explanation,
      ...(entry.resolved.breakdown ?? {}),
    }));
  }

  return NextResponse.json(results);
}, { routeName: 'time-logs/rates' });

// PUT: Update a rate (admin only)
export const PUT = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isAdmin(session.user.roles)) return NextResponse.json({ error: 'Admin only' }, { status: 403 });

  const body = await req.json();
  const { table, id, ...updates } = body as { table: string; id: string; [key: string]: unknown };

  if (!table || !id) return NextResponse.json({ error: 'table and id required' }, { status: 400 });

  const allowedTables = ['work_type_rates', 'role_tiers', 'seniority_brackets', 'credential_bonuses'];
  if (!allowedTables.includes(table)) {
    return NextResponse.json({ error: 'Invalid table' }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from(table)
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}, { routeName: 'time-logs/rates' });

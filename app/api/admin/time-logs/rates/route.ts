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

  // ── WHAT THIS PERSON IS PAID (owner decision, 2026-08-04) ───────────────────────────────────
  //
  // `menu` is the whole of it: every activity, priced. Under the simple model that means either
  // the person's own base pay (ordinary work) or the activity's set rate — "if people are riding
  // in a vehicle for an hour to a job, then they all get $15". `menu.base` is the no-activity
  // option.
  //
  // This endpoint, the approval screen and the hours submission all read the same call, so they
  // cannot drift apart the way four hand-rolled copies of a formula did.
  //
  // Permission note: `effective_for` is NOT covered by the self-or-admin gate at the top of this
  // handler — that one keys off `email`. Checking it explicitly means adding a parameter cannot
  // quietly widen who can read whose pay.
  const forEmail = searchParams.get('effective_for') ?? session.user.email;
  if (!isAdmin(session.user.roles) && forEmail !== session.user.email) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  if (forEmail && !table) {
    const config = await loadPayConfig();
    const person = await loadPersonPayFacts(forEmail, config);
    const menu = rateMenuFor(person, config);

    results.menu = menu;
    results.effective_for = forEmail;
    // Stated rather than assumed. Somebody with no profile has no base pay, so every ordinary
    // activity resolves to nothing at all — saying so stops an empty rate being a puzzle.
    results.effective_basis = {
      job_title: person.tierKey,
      tier_label: person.tierLabel,
      base_pay: person.basePay,
      note: person.hasProfile
        ? null
        : 'No base pay is set for this person, so only the fixed-rate activities have a rate.',
    };

    // Kept under its original key so existing callers keep working while they move over.
    results.effective = menu.activities.map((entry) => ({
      work_type: entry.work_type,
      label: entry.label,
      rate_mode: entry.rate_mode,
      effectiveRate: entry.resolved.rate,
      source: entry.resolved.source,
      explanation: entry.resolved.explanation,
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

// app/api/admin/time-logs/rates/route.ts — Work type rates, role tiers, seniority, credentials
import { NextRequest, NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { computeEffectiveRate } from '@/lib/payroll/effective-rate';

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
  // Three numbers answer one question, and nothing reconciled them:
  //
  //   1. `employee_profiles.hourly_rate` — $25. What My Pay shows.
  //   2. `work_type_rates.base_rate` — $20 field work, $23 drafting, $16 driving. What the hours
  //      picker showed, **identically for everybody**, so a party chief and an intern saw the same
  //      list.
  //   3. `computeEffectiveRate()` — the designed model: activity rate + role tier bonus + seniority
  //      + credentials + XP, capped. **It existed and was used by the pay-progression pages only.**
  //
  // So the hours picker was not showing a wrong number; it was showing a *different* number from the
  // one the person had been told they earn, with no indication that either was partial. That reads
  // as the system disagreeing with itself, which is exactly what it was doing.
  //
  // `effective` now returns, per work type, what THIS person earns for that work — with the
  // breakdown, so the picker can show "$30.00/hr — $20 field work + $10 party chief" rather than a
  // bare figure the reader has to trust.
  const forEmail = searchParams.get('effective_for') ?? session.user.email;
  if (forEmail && !table) {
    const [{ data: profile }, { data: earned }] = await Promise.all([
      supabaseAdmin.from('employee_profiles').select('job_title, hire_date').eq('user_email', forEmail).maybeSingle(),
      supabaseAdmin.from('employee_earned_credentials').select('credential_key').eq('user_email', forEmail),
    ]);

    const p = profile as { job_title: string | null; hire_date: string | null } | null;
    const tiers = (results.role_tiers ?? []) as { role_key: string }[];
    const tier = tiers.find((t) => t.role_key === p?.job_title) ?? null;

    // Years employed, floored. A hire date that has not been set yields 0 — the new-hire bracket —
    // rather than a guess, because inventing tenure inflates somebody's pay.
    const years = p?.hire_date
      ? Math.max(0, Math.floor((Date.now() - new Date(p.hire_date).getTime()) / 31_557_600_000))
      : 0;

    // `work_types`, which is the key set above — NOT `work_type_rates`, the table name. Reading the
    // wrong key would have produced an empty list and an `effective` array of zero entries, which on
    // screen is indistinguishable from "this person earns nothing for any work".
    const workTypes = (results.work_types ?? []) as Record<string, unknown>[];
    results.effective = workTypes.map((wt) => {
      const breakdown = computeEffectiveRate({
        workType: wt as never,
        tier: tier as never,
        yearsEmployed: years,
        seniority: (results.seniority_brackets ?? []) as never,
        earnedCredentialKeys: ((earned ?? []) as { credential_key: string }[]).map((c) => c.credential_key),
        credentials: (results.credential_bonuses ?? []) as never,
        totalXp: 0,
        xpMilestones: [],
      });
      return { work_type: wt.work_type, label: wt.label, ...breakdown };
    });

    results.effective_for = forEmail;
    // Stated rather than assumed: without a profile there is no role and no tenure, so every
    // effective rate is just the activity's base. Saying so stops "why is mine the same as the
    // intern's" being a mystery.
    results.effective_basis = p
      ? { job_title: p.job_title, years_employed: years }
      : { job_title: null, years_employed: 0, note: 'No employee profile — showing base activity rates only.' };
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

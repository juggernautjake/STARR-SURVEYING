// app/api/admin/profile/compensation/route.ts
//
// Slice EP6 — surface salary history + bonuses + recent payouts
// for the profile UI. Role-gated per the user spec: "For some
// users, they will be able to see all of their information.
// Salary, bonuses, and other pertinent info." Self always sees
// their own; admins (or payroll roles) see anyone.
//
// GET ?email=<email>   — list rows (self OR admin / payroll)
//
// Read paths:
//   - employee_salary_history sorted effective_from desc; the
//     current row is the one with effective_to IS NULL (or the
//     most recent if every row has been closed).
//   - employee_bonuses sorted awarded_at desc, capped at 50 so
//     a long-tenured surveyor's tab still loads quickly.
//   - employee_payouts sorted paid_at desc, capped at 12 to
//     match the year-at-a-glance the UI surfaces.

import { NextRequest, NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { canSeeOthersPay } from '@/lib/employee-profile/pay-visibility';

// Re-export so the existing source-lock test keeps the same
// import path and so other routes don't need to find the lib
// module if they're already reaching for this one.
export { canSeeOthersPay };

interface SalaryRow {
  id: string;
  base_hourly_rate_cents: number | null;
  base_annual_salary_cents: number | null;
  effective_from: string;
  effective_to: string | null;
  changed_by: string | null;
  change_reason: string | null;
  notes: string | null;
}

interface BonusRow {
  id: string;
  amount_cents: number;
  reason: string;
  awarded_by: string | null;
  awarded_at: string;
  related_job_id: string | null;
  notes: string | null;
}

interface PayoutRow {
  id: string;
  period_start: string;
  period_end: string;
  gross_cents: number;
  net_cents: number;
  paid_at: string;
  method: string;
  reference: string | null;
}

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const email = searchParams.get('email') || session.user.email;

  const isSelf = email === session.user.email;
  const allowed = isSelf || canSeeOthersPay(session.user.roles) || isAdmin(session.user.roles);
  if (!allowed) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const [salaryRes, bonusRes, payoutRes] = await Promise.all([
    supabaseAdmin
      .from('employee_salary_history')
      .select('id, base_hourly_rate_cents, base_annual_salary_cents, effective_from, effective_to, changed_by, change_reason, notes')
      .eq('user_email', email)
      .order('effective_from', { ascending: false })
      .returns<SalaryRow[]>(),
    supabaseAdmin
      .from('employee_bonuses')
      .select('id, amount_cents, reason, awarded_by, awarded_at, related_job_id, notes')
      .eq('user_email', email)
      .order('awarded_at', { ascending: false })
      .limit(50)
      .returns<BonusRow[]>(),
    supabaseAdmin
      .from('employee_payouts')
      .select('id, period_start, period_end, gross_cents, net_cents, paid_at, method, reference')
      .eq('user_email', email)
      .order('paid_at', { ascending: false })
      .limit(12)
      .returns<PayoutRow[]>(),
  ]);

  for (const res of [salaryRes, bonusRes, payoutRes]) {
    if (res.error) return NextResponse.json({ error: res.error.message }, { status: 500 });
  }

  return NextResponse.json({
    salary_history: salaryRes.data ?? [],
    bonuses: bonusRes.data ?? [],
    payouts: payoutRes.data ?? [],
  });
}, { routeName: 'admin/profile/compensation' });

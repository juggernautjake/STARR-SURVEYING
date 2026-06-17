// app/api/admin/employees/[email]/history/route.ts
//
// employee-pond Slice E14 — activity history feed for one employee.
// Returns bonuses + salary history + payouts, gated through the
// E12 visibility contract:
//   - Self / admin-visibility roles see everything.
//   - Non-admin viewers see bonuses ONLY if the target user has
//     `show_bonuses_to_employees = true`.
//   - Salary + payout history are ALWAYS admin-only (regardless
//     of any user toggle) — `ALWAYS_ADMIN_ONLY_FIELDS` enforcement.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import {
  hydrateEmployeePrivacy,
  viewerSeesEverything,
  type EmployeePrivacy,
} from '@/lib/employee-pond/visibility';

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // The dynamic route param lives at the END of the path; pull it
  // off the URL pathname so we don't depend on Next's ctx shape
  // (withErrorHandler wraps a single-arg handler).
  const pathname = new URL(req.url).pathname;
  const segments = pathname.split('/').filter(Boolean);
  // .../api/admin/employees/<email>/history
  const targetEmail = decodeURIComponent(segments[segments.length - 2] ?? '');
  if (!targetEmail) {
    return NextResponse.json({ error: 'Missing employee email' }, { status: 400 });
  }
  const targetEmailLower = targetEmail.toLowerCase();

  const viewer = {
    email: session.user.email,
    roles: session.user.roles ?? [],
  };
  const seesEverything = viewerSeesEverything(viewer, targetEmail);

  // Always fetch the target's privacy row up-front so we can use
  // it to decide which collections to surface to a general
  // viewer. Missing row → defaults.
  const { data: privacyRow } = await supabaseAdmin
    .from('employee_privacy')
    .select('*')
    .eq('user_email', targetEmailLower)
    .maybeSingle();
  const privacy: EmployeePrivacy = hydrateEmployeePrivacy(
    privacyRow as Partial<EmployeePrivacy> | null,
  );

  // Bonuses — surface to self / admin always; otherwise only when
  // the privacy toggle is on.
  let bonuses: unknown[] = [];
  if (seesEverything || privacy.show_bonuses_to_employees) {
    const { data, error } = await supabaseAdmin
      .from('employee_bonuses')
      .select('id, user_email, amount_cents, reason, awarded_by, awarded_at, related_job_id, notes, created_at, updated_at')
      .eq('user_email', targetEmailLower)
      .order('awarded_at', { ascending: false });
    if (error) {
      console.error('[history GET] bonuses error:', error);
    } else {
      bonuses = data ?? [];
    }
  }

  // Salary history + payouts — ALWAYS admin-only for non-self
  // viewers, regardless of any toggle.
  let salaryHistory: unknown[] = [];
  let payouts: unknown[] = [];
  if (seesEverything) {
    const { data: sd, error: se } = await supabaseAdmin
      .from('employee_salary_history')
      .select('*')
      .eq('user_email', targetEmailLower)
      .order('effective_from', { ascending: false });
    if (se) console.error('[history GET] salary error:', se);
    else salaryHistory = sd ?? [];

    const { data: pd, error: pe } = await supabaseAdmin
      .from('employee_payouts')
      .select('*')
      .eq('user_email', targetEmailLower)
      .order('paid_at', { ascending: false });
    if (pe) console.error('[history GET] payouts error:', pe);
    else payouts = pd ?? [];
  }

  return NextResponse.json({
    target_email: targetEmailLower,
    viewer_sees_everything: seesEverything,
    bonuses,
    salary_history: salaryHistory,
    payouts,
  });
}, { routeName: 'admin/employees/history' });

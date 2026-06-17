// app/api/admin/employees/privacy/route.ts
//
// employee-pond Slice E12b — privacy settings GET + PUT for the
// signed-in user. Each user can only read + write their own row;
// no privilege required (every approved user can flip their own
// toggles). Admins viewing other employees DON'T come through
// here — they read the table directly via the visibility helper.
//
// Body shape: any subset of EmployeePrivacy. Unknown keys are
// rejected; legal keys are upserted into the row.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import {
  DEFAULT_EMPLOYEE_PRIVACY,
  hydrateEmployeePrivacy,
  type EmployeePrivacy,
} from '@/lib/employee-pond/visibility';

const EDITABLE_KEYS = [
  'show_full_name_to_employees',
  'show_email_to_employees',
  'show_phone_to_employees',
  'show_dob_to_employees',
  'show_gender_to_employees',
  'show_address_to_employees',
  'show_hire_date_to_employees',
  'show_job_title_to_employees',
  'show_employment_type_to_employees',
  'show_photos_to_employees',
  'show_jobs_history_to_employees',
  'show_hours_to_employees',
  'show_bonuses_to_employees',
] as const satisfies readonly (keyof EmployeePrivacy)[];

export const GET = withErrorHandler(async () => {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const email = session.user.email.toLowerCase();
  const { data, error } = await supabaseAdmin
    .from('employee_privacy')
    .select(EDITABLE_KEYS.join(', '))
    .eq('user_email', email)
    .maybeSingle();
  if (error) {
    console.error('[admin/employees/privacy GET] supabase error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const privacy = hydrateEmployeePrivacy(
    (data as Partial<EmployeePrivacy> | null) ?? null,
  );
  return NextResponse.json({ privacy, defaults: DEFAULT_EMPLOYEE_PRIVACY });
}, { routeName: 'admin/employees/privacy' });

export const PUT = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const email = session.user.email.toLowerCase();

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Body must be an object' }, { status: 400 });
  }

  // Pull only the legal boolean fields out — reject any extras so
  // a future schema add isn't accidentally bypassed via a hostile
  // POST.
  const patch: Partial<EmployeePrivacy> = {};
  const allowed = new Set<string>(EDITABLE_KEYS);
  for (const [k, v] of Object.entries(body)) {
    if (!allowed.has(k)) {
      return NextResponse.json(
        { error: `Unknown privacy field: ${k}` },
        { status: 400 },
      );
    }
    if (typeof v !== 'boolean') {
      return NextResponse.json(
        { error: `Field ${k} must be a boolean` },
        { status: 400 },
      );
    }
    (patch as Record<string, boolean>)[k] = v;
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'No editable fields in body' }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from('employee_privacy')
    .upsert(
      { user_email: email, ...patch, updated_at: new Date().toISOString() },
      { onConflict: 'user_email' },
    )
    .select(EDITABLE_KEYS.join(', '))
    .single();
  if (error) {
    console.error('[admin/employees/privacy PUT] supabase error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({
    privacy: hydrateEmployeePrivacy(data as Partial<EmployeePrivacy>),
  });
}, { routeName: 'admin/employees/privacy' });

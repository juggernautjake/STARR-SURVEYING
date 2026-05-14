// app/api/admin/reports/employees/route.ts
//
// Roster lookup for the reports page employee filter dropdown.
// Returns every active employee in the caller's org.
//
// Phase R-11 of OWNER_REPORTS.md.

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';

export const runtime = 'nodejs';

export async function GET(): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: user } = await supabaseAdmin
    .from('registered_users')
    .select('default_org_id')
    .eq('email', session.user.email)
    .maybeSingle();
  if (!user?.default_org_id) return NextResponse.json({ employees: [] });

  const { data: membership } = await supabaseAdmin
    .from('organization_members')
    .select('role')
    .eq('org_id', user.default_org_id)
    .eq('user_email', session.user.email)
    .maybeSingle();
  if (!membership || membership.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden — admins only' }, { status: 403 });
  }

  const { data, error } = await supabaseAdmin
    .from('employee_profiles')
    .select('user_email, user_name, is_active')
    .eq('org_id', user.default_org_id)
    .order('user_name', { ascending: true });

  if (error) {
    return NextResponse.json({ error: 'Failed to load employees' }, { status: 500 });
  }

  return NextResponse.json({
    employees: (data ?? []).map((r: Record<string, unknown>) => ({
      email: r.user_email as string,
      name: (r.user_name as string | null) ?? (r.user_email as string),
      isActive: (r.is_active as boolean | null) ?? true,
    })),
  });
}

// app/api/admin/employees/options/route.ts
//
// GET /api/admin/employees/options — a lightweight employee picker list
// (id + name + email only, NO salary/profile data) for dropdowns like the
// equipment check-out "team lead" selector. Separate from /employees/list
// (which joins pay data and is admin/dev/tech_support only) so the equipment
// manager can populate a picker without seeing compensation.
//
// Auth: admin / developer / equipment_manager / tech_support.

import { NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';

export const GET = withErrorHandler(async () => {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const roles = (session.user as { roles?: string[] } | undefined)?.roles ?? [];
  if (!isAdmin(session.user.roles) && !roles.includes('equipment_manager') && !roles.includes('tech_support')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { data, error } = await supabaseAdmin
    .from('registered_users')
    .select('id, name, email')
    .ilike('email', '%@starr-surveying.com')
    .eq('is_banned', false)
    .order('name', { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = (data ?? []) as Array<{ id: string; name: string | null; email: string }>;
  return NextResponse.json({
    employees: rows.map((u) => ({ id: u.id, name: u.name, email: u.email })),
  });
}, { routeName: 'admin/employees/options' });

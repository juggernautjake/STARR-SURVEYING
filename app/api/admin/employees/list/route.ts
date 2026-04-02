// app/api/admin/employees/list/route.ts
// Returns all company-domain users from registered_users, joined with
// employee_profiles for payroll data. Shows the real employee roster.
import { NextResponse } from 'next/server';
import { auth, isAdmin, isDeveloper } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET() {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userRoles = (session.user as any).roles || [];
  // Admin, developer, or tech_support can view employees
  if (!isAdmin(userRoles) && !isDeveloper(userRoles) && !userRoles.includes('tech_support')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Fetch all company-domain users from registered_users
  const { data: users, error: usersErr } = await supabaseAdmin
    .from('registered_users')
    .select('id, email, name, roles, is_approved, is_banned, avatar_url, last_sign_in, created_at')
    .ilike('email', '%@starr-surveying.com')
    .order('name', { ascending: true });

  if (usersErr) {
    console.error('Error fetching company users:', usersErr);
    return NextResponse.json({ error: 'Failed to fetch employees' }, { status: 500 });
  }

  // Fetch all employee_profiles for payroll data
  const { data: profiles } = await supabaseAdmin
    .from('employee_profiles')
    .select('user_email, job_title, hire_date, hourly_rate, is_active, salary_type');

  // Build a map of profiles by email for quick lookup
  const profileMap = new Map<string, any>();
  if (profiles) {
    for (const p of profiles) {
      profileMap.set(p.user_email?.toLowerCase(), p);
    }
  }

  // Merge users with their profiles
  const employees = (users || []).map((u: { id: string; email: string; name: string; roles: string[]; is_approved: boolean; is_banned: boolean; avatar_url: string | null; last_sign_in: string | null; created_at: string }) => {
    const profile = profileMap.get(u.email.toLowerCase());
    return {
      id: u.id,
      email: u.email,
      name: u.name,
      roles: u.roles || ['employee'],
      is_approved: u.is_approved,
      is_banned: u.is_banned,
      avatar_url: u.avatar_url,
      last_sign_in: u.last_sign_in,
      created_at: u.created_at,
      job_title: profile?.job_title || null,
      hire_date: profile?.hire_date || null,
      hourly_rate: profile?.hourly_rate ?? null,
      is_active: profile?.is_active ?? null,
      salary_type: profile?.salary_type || null,
    };
  });

  return NextResponse.json({ employees });
}

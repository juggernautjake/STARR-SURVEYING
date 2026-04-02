// app/api/admin/users/route.ts
// Admin user management: list all registered users, promote/create users
import { auth, isAdmin, ALL_ROLES } from '@/lib/auth';
import type { UserRole } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { NextRequest, NextResponse } from 'next/server';

export async function GET() {
  const session = await auth();
  if (!session?.user?.email || !isAdmin(session.user.roles)) {
    // Tech support can also view users (read-only enforced in frontend)
    const userRoles = (session?.user as any)?.roles || [];
    if (!userRoles.includes('tech_support')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const { data, error } = await supabaseAdmin
    .from('registered_users')
    .select('id, email, name, roles, is_approved, is_banned, banned_at, banned_reason, auth_provider, avatar_url, last_sign_in, created_at, updated_at')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching users:', error);
    return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 });
  }

  const users = data || [];
  const pending_count = users.filter((u: { is_approved: boolean; is_banned: boolean }) => !u.is_approved && !u.is_banned).length;
  return NextResponse.json({ users, pending_count });
}

// POST - Create or promote a user (creates/upserts registered_users entry)
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.email || !isAdmin(session.user.roles)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { email, name, roles } = await req.json();
  if (!email) return NextResponse.json({ error: 'Email required' }, { status: 400 });

  const validRoleSet = new Set(ALL_ROLES as readonly string[]);
  const provided = roles || ['employee'];
  const invalidRoles = provided.filter((r: string) => !validRoleSet.has(r));
  if (invalidRoles.length > 0) {
    return NextResponse.json({ error: `Invalid roles: ${invalidRoles.join(', ')}. Valid: ${ALL_ROLES.join(', ')}` }, { status: 400 });
  }
  const finalRoles = provided.filter((r: string) => validRoleSet.has(r));
  if (!finalRoles.includes('employee')) finalRoles.push('employee');

  const { data, error } = await supabaseAdmin
    .from('registered_users')
    .upsert({
      email: email.toLowerCase(),
      name: name || email.split('@')[0],
      roles: finalRoles,
      is_approved: true,
      password_hash: '',
    }, { onConflict: 'email' })
    .select()
    .single();

  if (error) {
    console.error('Error promoting user:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const displayRoles = finalRoles.filter((r: string) => r !== 'employee').join(', ') || 'employee';
  return NextResponse.json({ success: true, user: data, message: `${email} assigned roles: ${displayRoles}` });
}

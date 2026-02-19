// app/api/admin/users/route.ts
// Admin user management: list all registered users, promote company users
import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { NextRequest, NextResponse } from 'next/server';

export async function GET() {
  const session = await auth();
  if (!session?.user?.email || !isAdmin(session.user.email)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data, error } = await supabaseAdmin
    .from('registered_users')
    .select('id, email, name, roles, is_approved, is_banned, banned_at, banned_reason, created_at, updated_at')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching users:', error);
    return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 });
  }

  const users = data || [];
  const pending_count = users.filter((u: { is_approved: boolean; is_banned: boolean }) => !u.is_approved && !u.is_banned).length;
  return NextResponse.json({ users, pending_count });
}

// POST - Promote a company employee to teacher (creates registered_users entry for role tracking)
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.email || !isAdmin(session.user.email)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { email, name, roles } = await req.json();
  if (!email) return NextResponse.json({ error: 'Email required' }, { status: 400 });

  const validRoles = ['admin', 'teacher', 'employee'];
  const finalRoles = (roles || ['employee', 'teacher']).filter((r: string) => validRoles.includes(r));
  if (!finalRoles.includes('employee')) finalRoles.push('employee');

  // Upsert: create if not exists, update roles if exists
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

  return NextResponse.json({ success: true, user: data, message: `${email} promoted to ${finalRoles.filter((r: string) => r !== 'employee').join(', ')}` });
}

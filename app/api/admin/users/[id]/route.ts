// app/api/admin/users/[id]/route.ts
// Admin user management: update roles, ban/unban, delete individual users
import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { NextRequest, NextResponse } from 'next/server';

// PATCH - Update user (roles, ban/unban)
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user?.email || !isAdmin(session.user.email)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = params;
  const body = await req.json();
  const { action, roles, reason } = body;

  // Validate the user exists
  const { data: user, error: fetchErr } = await supabaseAdmin
    .from('registered_users')
    .select('id, email, name')
    .eq('id', id)
    .single();

  if (fetchErr || !user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  if (action === 'update_roles') {
    // Validate roles array
    const validRoles = ['admin', 'teacher', 'employee'];
    if (!Array.isArray(roles) || roles.length === 0) {
      return NextResponse.json({ error: 'Roles must be a non-empty array' }, { status: 400 });
    }
    if (!roles.every((r: string) => validRoles.includes(r))) {
      return NextResponse.json({ error: 'Invalid role(s). Must be: admin, teacher, or employee' }, { status: 400 });
    }
    // Always include employee as base role
    const finalRoles = roles.includes('employee') ? roles : ['employee', ...roles];

    const { error } = await supabaseAdmin
      .from('registered_users')
      .update({ roles: finalRoles, updated_at: new Date().toISOString() })
      .eq('id', id);

    if (error) {
      console.error('Error updating roles:', error);
      return NextResponse.json({ error: 'Failed to update roles' }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: `Roles updated for ${user.name}` });
  }

  if (action === 'ban') {
    const { error } = await supabaseAdmin
      .from('registered_users')
      .update({
        is_banned: true,
        banned_at: new Date().toISOString(),
        banned_reason: reason || 'Banned by administrator',
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (error) {
      console.error('Error banning user:', error);
      return NextResponse.json({ error: 'Failed to ban user' }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: `${user.name} has been banned` });
  }

  if (action === 'unban') {
    const { error } = await supabaseAdmin
      .from('registered_users')
      .update({
        is_banned: false,
        banned_at: null,
        banned_reason: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (error) {
      console.error('Error unbanning user:', error);
      return NextResponse.json({ error: 'Failed to unban user' }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: `${user.name} has been unbanned` });
  }

  if (action === 'approve') {
    const { error } = await supabaseAdmin
      .from('registered_users')
      .update({
        is_approved: true,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (error) {
      console.error('Error approving user:', error);
      return NextResponse.json({ error: 'Failed to approve user' }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: `${user.name} has been approved` });
  }

  if (action === 'reject') {
    // Reject = delete the pending registration
    const { error } = await supabaseAdmin
      .from('registered_users')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error rejecting user:', error);
      return NextResponse.json({ error: 'Failed to reject user' }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: `Registration for ${user.name} (${user.email}) has been rejected` });
  }

  return NextResponse.json({ error: 'Invalid action. Use: update_roles, ban, unban, approve, or reject' }, { status: 400 });
}

// DELETE - Permanently delete a user
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user?.email || !isAdmin(session.user.email)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = params;

  // Validate the user exists
  const { data: user, error: fetchErr } = await supabaseAdmin
    .from('registered_users')
    .select('id, email, name')
    .eq('id', id)
    .single();

  if (fetchErr || !user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  const { error } = await supabaseAdmin
    .from('registered_users')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Error deleting user:', error);
    return NextResponse.json({ error: 'Failed to delete user' }, { status: 500 });
  }

  return NextResponse.json({ success: true, message: `${user.name} (${user.email}) has been deleted` });
}

// app/api/admin/invites/[id]/route.ts
//
// Revoke a pending invite. Phase D-3 of CUSTOMER_PORTAL.md.

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';

export const runtime = 'nodejs';

interface RouteParams { params: Promise<{ id: string }> }

export async function DELETE(_req: Request, { params }: RouteParams): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;

  const { data: user } = await supabaseAdmin
    .from('registered_users')
    .select('default_org_id')
    .eq('email', session.user.email)
    .maybeSingle();
  if (!user?.default_org_id) return NextResponse.json({ error: 'No org' }, { status: 403 });

  const { data: membership } = await supabaseAdmin
    .from('organization_members')
    .select('role')
    .eq('org_id', user.default_org_id)
    .eq('user_email', session.user.email)
    .maybeSingle();
  if (!membership || membership.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden — admins only' }, { status: 403 });
  }

  const { data: invite, error } = await supabaseAdmin
    .from('org_invitations')
    .update({ status: 'revoked', revoked_at: new Date().toISOString() })
    .eq('id', id)
    .eq('org_id', user.default_org_id)
    .eq('status', 'pending')
    .select('id, invitee_email')
    .maybeSingle();

  if (error) {
    console.error('[admin/invites/:id] revoke failed', error);
    return NextResponse.json({ error: 'Failed to revoke invite' }, { status: 500 });
  }
  if (!invite) {
    return NextResponse.json({ error: 'Invite not found or already accepted/revoked' }, { status: 404 });
  }

  await supabaseAdmin.from('audit_log').insert({
    org_id: user.default_org_id,
    customer_email: session.user.email,
    action: 'INVITE_REVOKED',
    severity: 'info',
    metadata: { invite_id: id, invitee: invite.invitee_email },
  });

  return NextResponse.json({ ok: true });
}

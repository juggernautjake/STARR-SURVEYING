// app/api/admin/invites/route.ts
//
// Customer-side org invitations API. GET lists this org's pending +
// recent invites; POST creates + emails a new one.
//
// Phase D-3 of CUSTOMER_PORTAL.md (smallest viable slice — list +
// create + revoke; acceptance UI lands when M-9 auth refactor adds
// activeOrgId switching to the session).

import { NextResponse, type NextRequest } from 'next/server';
import { randomBytes } from 'crypto';

import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { dispatch } from '@/lib/saas/notifications';
import { registerAllEvents } from '@/lib/saas/notifications/events';

registerAllEvents();

export const runtime = 'nodejs';

type OrgRole = 'admin' | 'surveyor' | 'bookkeeper' | 'field_only' | 'view_only';
const VALID_ROLES: OrgRole[] = ['admin', 'surveyor', 'bookkeeper', 'field_only', 'view_only'];

interface InviteRow {
  id: string;
  inviteeEmail: string;
  inviterEmail: string;
  role: string;
  status: string;
  expiresAt: string;
  acceptedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

async function resolveAdminOrg(email: string): Promise<{ orgId: string; orgName: string; orgSlug: string } | null> {
  const { data: user } = await supabaseAdmin
    .from('registered_users')
    .select('default_org_id, user_name')
    .eq('email', email)
    .maybeSingle();
  if (!user?.default_org_id) return null;

  const { data: membership } = await supabaseAdmin
    .from('organization_members')
    .select('role')
    .eq('org_id', user.default_org_id)
    .eq('user_email', email)
    .maybeSingle();
  if (!membership || membership.role !== 'admin') return null;

  const { data: org } = await supabaseAdmin
    .from('organizations')
    .select('id, name, slug')
    .eq('id', user.default_org_id)
    .maybeSingle();
  if (!org) return null;

  return { orgId: org.id, orgName: org.name, orgSlug: org.slug };
}

export async function GET(): Promise<NextResponse<{ invites: InviteRow[] } | { error: string }>> {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const ctx = await resolveAdminOrg(session.user.email);
  if (!ctx) return NextResponse.json({ invites: [] });

  const { data, error } = await supabaseAdmin
    .from('org_invitations')
    .select('id, invitee_email, inviter_email, role, status, expires_at, accepted_at, revoked_at, created_at')
    .eq('org_id', ctx.orgId)
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) {
    console.error('[admin/invites] list failed', error);
    return NextResponse.json({ error: 'Failed to load invites' }, { status: 500 });
  }

  const invites: InviteRow[] = (data ?? []).map((r: Record<string, unknown>) => ({
    id: r.id as string,
    inviteeEmail: r.invitee_email as string,
    inviterEmail: r.inviter_email as string,
    role: r.role as string,
    status: r.status as string,
    expiresAt: r.expires_at as string,
    acceptedAt: (r.accepted_at as string | null) ?? null,
    revokedAt: (r.revoked_at as string | null) ?? null,
    createdAt: r.created_at as string,
  }));

  return NextResponse.json({ invites });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const ctx = await resolveAdminOrg(session.user.email);
  if (!ctx) return NextResponse.json({ error: 'Forbidden — admins only' }, { status: 403 });

  let body: { inviteeEmail?: string; role?: string };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const inviteeEmail = body.inviteeEmail?.trim().toLowerCase();
  if (!inviteeEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(inviteeEmail)) {
    return NextResponse.json({ error: 'Valid invitee email required' }, { status: 400 });
  }

  const role = (body.role as OrgRole | undefined) ?? 'surveyor';
  if (!VALID_ROLES.includes(role)) {
    return NextResponse.json({ error: `Role must be one of: ${VALID_ROLES.join(', ')}` }, { status: 400 });
  }

  // If invitee is already a member, short-circuit.
  const { data: existingMember } = await supabaseAdmin
    .from('organization_members')
    .select('user_email')
    .eq('org_id', ctx.orgId)
    .eq('user_email', inviteeEmail)
    .maybeSingle();
  if (existingMember) {
    return NextResponse.json({ error: 'That email is already a member of this organization' }, { status: 409 });
  }

  const token = randomBytes(32).toString('base64url');

  const { data: invite, error } = await supabaseAdmin
    .from('org_invitations')
    .insert({
      org_id: ctx.orgId,
      inviter_email: session.user.email,
      invitee_email: inviteeEmail,
      role,
      token,
      status: 'pending',
    })
    .select('id, token')
    .single();

  if (error || !invite) {
    console.error('[admin/invites] create failed', error);
    return NextResponse.json({ error: 'Failed to create invite' }, { status: 500 });
  }

  // Fire-and-forget invite email
  try {
    await dispatch('invite_sent', {
      orgId: ctx.orgId,
      payload: {
        inviteeEmail,
        inviter: { name: session.user.name ?? session.user.email, email: session.user.email },
        org: { name: ctx.orgName },
        invite: {
          role,
          url: `https://${ctx.orgSlug}.starrsoftware.com/accept-invite/${invite.token}`,
        },
      },
    });
  } catch (err) {
    console.error('[admin/invites] dispatch failed', err);
  }

  await supabaseAdmin.from('audit_log').insert({
    org_id: ctx.orgId,
    customer_email: session.user.email,
    action: 'INVITE_SENT',
    severity: 'info',
    metadata: { invitee: inviteeEmail, role, invite_id: invite.id },
  });

  return NextResponse.json({ id: invite.id, inviteeEmail, role }, { status: 201 });
}

// app/api/admin/orgs/route.ts
//
// Caller's organization memberships. GET lists every org the caller
// belongs to + flags the currently active one. POST switches the
// active org.
//
// Pre-M-9 active-org mechanism: we mirror the change into both
// `user_active_org.active_org_id` (the persistent backup) and
// `registered_users.default_org_id` (the field every org-scoped API
// currently reads). When M-9 lands and the JWT carries activeOrgId,
// the POST will additionally trigger a session refresh.
//
// Phase D-8 of CUSTOMER_PORTAL.md.

import { NextResponse, type NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';

export const runtime = 'nodejs';

interface MembershipOut {
  orgId: string;
  orgName: string;
  orgSlug: string;
  role: string;
  status: string;
  joinedAt: string | null;
  isActive: boolean;
}

export async function GET(): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const [{ data: user }, { data: memberships }] = await Promise.all([
    supabaseAdmin
      .from('registered_users')
      .select('default_org_id')
      .eq('email', session.user.email)
      .maybeSingle(),
    supabaseAdmin
      .from('organization_members')
      .select('org_id, role, status, joined_at, organizations(id, name, slug)')
      .eq('user_email', session.user.email)
      .eq('status', 'active'),
  ]);

  const activeOrgId = user?.default_org_id as string | undefined;

  const out: MembershipOut[] = (memberships ?? []).map((m: Record<string, unknown>) => {
    const org = (m.organizations as { id: string; name: string; slug: string } | null) ?? null;
    return {
      orgId: (m.org_id as string),
      orgName: org?.name ?? '(unknown)',
      orgSlug: org?.slug ?? '',
      role: m.role as string,
      status: m.status as string,
      joinedAt: (m.joined_at as string | null) ?? null,
      isActive: m.org_id === activeOrgId,
    };
  });

  return NextResponse.json({ memberships: out });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { orgId?: string };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (!body.orgId) return NextResponse.json({ error: 'orgId required' }, { status: 400 });

  // Verify the caller is actually a member of the target org
  const { data: membership } = await supabaseAdmin
    .from('organization_members')
    .select('org_id, role, status')
    .eq('user_email', session.user.email)
    .eq('org_id', body.orgId)
    .maybeSingle();

  if (!membership || membership.status !== 'active') {
    return NextResponse.json({ error: 'Not a member of that organization' }, { status: 403 });
  }

  const now = new Date().toISOString();

  // Mirror the active org into both tables: user_active_org (persistent
  // backup) and registered_users.default_org_id (the field every
  // org-scoped API currently reads, pre-M-9).
  await Promise.all([
    supabaseAdmin
      .from('user_active_org')
      .upsert({ user_email: session.user.email, active_org_id: body.orgId, updated_at: now }, { onConflict: 'user_email' }),
    supabaseAdmin
      .from('registered_users')
      .update({ default_org_id: body.orgId })
      .eq('email', session.user.email),
  ]);

  await supabaseAdmin.from('audit_log').insert({
    org_id: body.orgId,
    customer_email: session.user.email,
    action: 'ACTIVE_ORG_SWITCHED',
    severity: 'info',
    metadata: { to_org_id: body.orgId },
  });

  return NextResponse.json({ ok: true, activeOrgId: body.orgId });
}

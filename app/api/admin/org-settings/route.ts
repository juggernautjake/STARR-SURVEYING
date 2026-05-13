// app/api/admin/org-settings/route.ts
//
// Customer org settings API. GET returns the caller's org's
// organizations row + org_settings row; PATCH updates whatever's in
// the body. Admin-only.
//
// Phase D-4 of CUSTOMER_PORTAL.md (smallest viable slice — basic
// fields. Logo upload + domain restriction enforcement land in
// follow-up slices when Supabase Storage policies + signin-time
// domain check ship).

import { NextResponse, type NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';

export const runtime = 'nodejs';

interface OrgRow {
  id: string;
  slug: string;
  name: string;
  state: string | null;
  phone: string | null;
  primaryAdminEmail: string | null;
  billingContactEmail: string | null;
}

interface OrgSettingsRow {
  defaultInviteRole: string;
  mfaRequired: boolean;
  sessionTimeoutMin: number;
  webhookUrl: string | null;
  featureFlags: Record<string, unknown>;
  notificationsPref: Record<string, unknown>;
}

async function resolveAdminOrg(email: string): Promise<{ orgId: string } | null> {
  const { data: user } = await supabaseAdmin
    .from('registered_users')
    .select('default_org_id')
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

  return { orgId: user.default_org_id };
}

export async function GET(): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const ctx = await resolveAdminOrg(session.user.email);
  if (!ctx) return NextResponse.json({ error: 'Forbidden — admins only' }, { status: 403 });

  const { data: org } = await supabaseAdmin
    .from('organizations')
    .select('id, slug, name, state, phone, primary_admin_email, billing_contact_email')
    .eq('id', ctx.orgId)
    .maybeSingle();
  if (!org) return NextResponse.json({ error: 'Org not found' }, { status: 404 });

  const { data: settings } = await supabaseAdmin
    .from('org_settings')
    .select('default_invite_role, mfa_required, session_timeout_min, webhook_url, feature_flags, notifications_pref')
    .eq('org_id', ctx.orgId)
    .maybeSingle();

  const orgOut: OrgRow = {
    id: org.id,
    slug: org.slug,
    name: org.name,
    state: (org.state as string | null) ?? null,
    phone: (org.phone as string | null) ?? null,
    primaryAdminEmail: (org.primary_admin_email as string | null) ?? null,
    billingContactEmail: (org.billing_contact_email as string | null) ?? null,
  };

  const settingsOut: OrgSettingsRow = settings ? {
    defaultInviteRole: (settings.default_invite_role as string) ?? 'surveyor',
    mfaRequired: (settings.mfa_required as boolean) ?? false,
    sessionTimeoutMin: (settings.session_timeout_min as number) ?? 480,
    webhookUrl: (settings.webhook_url as string | null) ?? null,
    featureFlags: (settings.feature_flags as Record<string, unknown>) ?? {},
    notificationsPref: (settings.notifications_pref as Record<string, unknown>) ?? {},
  } : {
    defaultInviteRole: 'surveyor',
    mfaRequired: false,
    sessionTimeoutMin: 480,
    webhookUrl: null,
    featureFlags: {},
    notificationsPref: {},
  };

  return NextResponse.json({ org: orgOut, settings: settingsOut });
}

export async function PATCH(req: NextRequest): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const ctx = await resolveAdminOrg(session.user.email);
  if (!ctx) return NextResponse.json({ error: 'Forbidden — admins only' }, { status: 403 });

  let body: {
    name?: string;
    state?: string;
    phone?: string;
    billingContactEmail?: string;
    defaultInviteRole?: 'admin' | 'surveyor' | 'bookkeeper' | 'field_only' | 'view_only';
    mfaRequired?: boolean;
    sessionTimeoutMin?: number;
    webhookUrl?: string | null;
  };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const orgPatch: Record<string, unknown> = {};
  if (typeof body.name === 'string' && body.name.trim().length > 0) orgPatch.name = body.name.trim();
  if (typeof body.state === 'string') orgPatch.state = body.state.trim() || null;
  if (typeof body.phone === 'string') orgPatch.phone = body.phone.trim() || null;
  if (typeof body.billingContactEmail === 'string') {
    const email = body.billingContactEmail.trim().toLowerCase();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: 'Invalid billing contact email' }, { status: 400 });
    }
    orgPatch.billing_contact_email = email || null;
  }

  if (Object.keys(orgPatch).length > 0) {
    const { error } = await supabaseAdmin
      .from('organizations')
      .update(orgPatch)
      .eq('id', ctx.orgId);
    if (error) {
      console.error('[org-settings] org patch failed', error);
      return NextResponse.json({ error: 'Failed to update organization' }, { status: 500 });
    }
  }

  const settingsPatch: Record<string, unknown> = {};
  if (typeof body.defaultInviteRole === 'string') settingsPatch.default_invite_role = body.defaultInviteRole;
  if (typeof body.mfaRequired === 'boolean') settingsPatch.mfa_required = body.mfaRequired;
  if (typeof body.sessionTimeoutMin === 'number' && body.sessionTimeoutMin >= 30) settingsPatch.session_timeout_min = body.sessionTimeoutMin;
  if (body.webhookUrl !== undefined) settingsPatch.webhook_url = body.webhookUrl;

  if (Object.keys(settingsPatch).length > 0) {
    settingsPatch.updated_at = new Date().toISOString();
    const { error } = await supabaseAdmin
      .from('org_settings')
      .upsert({ org_id: ctx.orgId, ...settingsPatch }, { onConflict: 'org_id' });
    if (error) {
      console.error('[org-settings] settings upsert failed', error);
      return NextResponse.json({ error: 'Failed to update settings' }, { status: 500 });
    }
  }

  await supabaseAdmin.from('audit_log').insert({
    org_id: ctx.orgId,
    customer_email: session.user.email,
    action: 'ORG_SETTINGS_UPDATED',
    severity: 'info',
    metadata: { changed: { ...orgPatch, ...settingsPatch } },
  });

  return NextResponse.json({ ok: true });
}

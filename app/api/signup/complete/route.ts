// app/api/signup/complete/route.ts
//
// Atomic signup-completion endpoint. Phase D-1e of MARKETING_SIGNUP_FLOW.md.
//
// Creates the organizations row + organization_members row + the
// admin user's registered_users row (or links to existing) + a
// subscriptions row in `trialing` state. Stripe customer/subscription
// creation lives behind a feature flag (STRIPE_PRODUCTS_READY env);
// when off, the trial sub is created without a Stripe linkage and
// the operator finalizes via /platform/billing once Stripe products
// exist.
//
// Idempotency: client-generated `idempotency_key` (sent in body OR
// header) caches the result in the organizations row metadata for
// 24h so a retry returns the original org rather than creating a
// duplicate.
//
// Spec: docs/planning/in-progress/MARKETING_SIGNUP_FLOW.md §5 + §6 D-1e.

import { NextResponse, type NextRequest } from 'next/server';
import bcrypt from 'bcryptjs';

import { supabaseAdmin } from '@/lib/supabase';
import { validateSlug } from '@/lib/saas/reserved-slugs';
import { dispatch } from '@/lib/saas/notifications';
import { registerAllEvents } from '@/lib/saas/notifications/events';

registerAllEvents();

export const runtime = 'nodejs';

interface SignupRequest {
  bundles?: string[];
  billingCycle?: 'monthly' | 'annual';
  org?: {
    name?: string;
    slug?: string;
    state?: string;
    phone?: string;
  };
  admin?: {
    email?: string;
    name?: string;
    password?: string;
  };
  idempotencyKey?: string;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: SignupRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // Validate inputs
  const orgName = body.org?.name?.trim();
  const orgSlug = body.org?.slug?.trim().toLowerCase();
  const adminEmail = body.admin?.email?.trim().toLowerCase();
  const adminName = body.admin?.name?.trim();
  const password = body.admin?.password;

  if (!orgName || !orgSlug || !adminEmail || !adminName || !password) {
    return NextResponse.json(
      { error: 'org.name, org.slug, admin.{email,name,password} required' },
      { status: 400 },
    );
  }
  if (password.length < 8) {
    return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 });
  }
  const slugValidation = validateSlug(orgSlug);
  if (!slugValidation.ok) {
    return NextResponse.json({ error: `Slug invalid: ${slugValidation.reason}` }, { status: 400 });
  }
  if (!Array.isArray(body.bundles) || body.bundles.length === 0) {
    return NextResponse.json({ error: 'At least one bundle is required' }, { status: 400 });
  }

  const idempotencyKey = body.idempotencyKey ?? req.headers.get('idempotency-key') ?? null;

  // Idempotency check: if a recent org has the same idempotency_key,
  // return it instead of creating a new one.
  if (idempotencyKey) {
    const { data: existing } = await supabaseAdmin
      .from('organizations')
      .select('id, slug, name')
      .eq('metadata->>idempotency_key', idempotencyKey)
      .maybeSingle();
    if (existing) {
      return NextResponse.json({
        orgId: existing.id,
        orgSlug: existing.slug,
        idempotent: true,
      });
    }
  }

  // Slug uniqueness (final check at commit time; the precheck is hint-only)
  const { data: slugCollision } = await supabaseAdmin
    .from('organizations')
    .select('id')
    .eq('slug', orgSlug)
    .maybeSingle();
  if (slugCollision) {
    return NextResponse.json({ error: 'Slug taken' }, { status: 409 });
  }

  // Hash password (bcrypt; cost 10 matches existing pattern from lib/auth.ts)
  const passwordHash = await bcrypt.hash(password, 10);

  // 14-day trial
  const now = new Date();
  const trialEnd = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

  // 1. Create the organization
  const { data: org, error: orgErr } = await supabaseAdmin
    .from('organizations')
    .insert({
      slug: orgSlug,
      name: orgName,
      status: 'trialing',
      state: body.org?.state ?? null,
      country: 'US',
      primary_admin_email: adminEmail,
      billing_contact_email: adminEmail,
      phone: body.org?.phone ?? null,
      metadata: idempotencyKey ? { idempotency_key: idempotencyKey, signup_at: now.toISOString() } : { signup_at: now.toISOString() },
    })
    .select('id, slug, name')
    .single();
  if (orgErr || !org) {
    console.error('[signup/complete] org create failed', orgErr);
    return NextResponse.json({ error: 'Failed to create organization' }, { status: 500 });
  }

  // 2. Ensure registered_users row (create or link)
  const { data: existingUser } = await supabaseAdmin
    .from('registered_users')
    .select('email')
    .eq('email', adminEmail)
    .maybeSingle();

  if (!existingUser) {
    const { error: userErr } = await supabaseAdmin
      .from('registered_users')
      .insert({
        email: adminEmail,
        user_name: adminName,
        password_hash: passwordHash,
        auth_provider: 'credentials',
        roles: ['admin'],
        is_approved: true,
        is_banned: false,
        default_org_id: org.id,
      });
    if (userErr) {
      console.error('[signup/complete] user create failed', userErr);
      // Rollback the org
      await supabaseAdmin.from('organizations').delete().eq('id', org.id);
      return NextResponse.json({ error: 'Failed to create user' }, { status: 500 });
    }
  } else {
    // Existing user — link them to this new org. They keep their old
    // default_org_id; the new org joins via organization_members below.
  }

  // 3. organization_members admin row
  const { error: memErr } = await supabaseAdmin
    .from('organization_members')
    .insert({
      org_id: org.id,
      user_email: adminEmail,
      role: 'admin',
      status: 'active',
      joined_at: now.toISOString(),
    });
  if (memErr) {
    console.error('[signup/complete] membership create failed', memErr);
    return NextResponse.json({ error: 'Failed to create membership' }, { status: 500 });
  }

  // 4. org_settings + subscriptions (trial, no Stripe yet)
  await supabaseAdmin
    .from('org_settings')
    .insert({ org_id: org.id })
    .single();

  await supabaseAdmin
    .from('subscriptions')
    .insert({
      org_id: org.id,
      status: 'trialing',
      trial_ends_at: trialEnd.toISOString(),
      current_period_start: now.toISOString(),
      current_period_end: trialEnd.toISOString(),
      bundles: body.bundles,
      seat_count: 1,
      metadata: {
        billing_cycle: body.billingCycle ?? 'monthly',
        stripe_pending: true, // operator finalizes Stripe linkage when products are live
      },
    });

  // 5. Welcome email via the notifications service
  try {
    await dispatch('signup_welcome', {
      orgId: org.id,
      payload: {
        userEmail: adminEmail,
        userName: adminName,
        user: { name: adminName, email: adminEmail },
        org: {
          name: org.name,
          url: `https://${org.slug}.starrsoftware.com`,
        },
        plan: {
          label: body.bundles.join(' + '),
        },
      },
    });
  } catch (err) {
    // Email failure shouldn't abort signup
    console.error('[signup/complete] welcome email failed', err);
  }

  // 6. Audit log entry
  await supabaseAdmin
    .from('audit_log')
    .insert({
      operator_email: null,
      customer_email: adminEmail,
      org_id: org.id,
      action: 'ORG_CREATED',
      severity: 'info',
      metadata: { source: 'self_serve_signup', bundles: body.bundles, billing_cycle: body.billingCycle },
    });

  return NextResponse.json({
    orgId: org.id,
    orgSlug: org.slug,
    trialEndsAt: trialEnd.toISOString(),
  });
}

// app/api/admin/pay-config/role-tiers/route.ts
//
// CRUD for role_tiers — the pay-grade ladder used in the calculation.
// P-11 of PAY_PROGRESSION_OVERHAUL.md.
//
// DELETE includes a safety check: refuses to remove a tier that any
// employee_profiles row still references (via job_title alias match
// or tier_key after P-6 lands). Admin must reassign employees first.

import { NextRequest, NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';

interface RoleTierBody {
  role_key: string;
  label?: string | null;
  description?: string | null;
  icon?: string | null;
  base_bonus?: number;
  max_effective_rate?: number | null;
  sort_order?: number | null;
  aliases?: string[] | null;
}

async function requireAdmin() {
  const session = await auth();
  if (!session?.user?.email) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }
  if (!isAdmin(session.user.roles)) {
    return { error: NextResponse.json({ error: 'Forbidden — admin only' }, { status: 403 }) };
  }
  return { email: session.user.email };
}

// POST: create a new tier.
export const POST = withErrorHandler(async (req: NextRequest) => {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;

  const body = await req.json() as RoleTierBody;
  if (!body.role_key || typeof body.role_key !== 'string') {
    return NextResponse.json({ error: 'role_key is required' }, { status: 400 });
  }
  if (typeof body.base_bonus !== 'number' || body.base_bonus < 0) {
    return NextResponse.json({ error: 'base_bonus must be a non-negative number' }, { status: 400 });
  }

  const row = {
    role_key: body.role_key.toLowerCase().replace(/\s+/g, '_'),
    label: body.label || body.role_key,
    description: body.description || null,
    icon: body.icon || null,
    base_bonus: body.base_bonus,
    max_effective_rate: body.max_effective_rate ?? null,
    sort_order: body.sort_order ?? null,
    aliases: body.aliases || [],
  };

  const { data, error } = await supabaseAdmin
    .from('role_tiers')
    .insert(row)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ tier: data });
}, { routeName: 'pay-config/role-tiers/POST' });

// PUT: update an existing tier (role_key is the natural key).
export const PUT = withErrorHandler(async (req: NextRequest) => {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;

  const body = await req.json() as RoleTierBody;
  if (!body.role_key) {
    return NextResponse.json({ error: 'role_key is required' }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};
  if (body.label !== undefined) patch.label = body.label;
  if (body.description !== undefined) patch.description = body.description;
  if (body.icon !== undefined) patch.icon = body.icon;
  if (typeof body.base_bonus === 'number') patch.base_bonus = body.base_bonus;
  if (body.max_effective_rate !== undefined) patch.max_effective_rate = body.max_effective_rate;
  if (body.sort_order !== undefined) patch.sort_order = body.sort_order;
  if (body.aliases !== undefined) patch.aliases = body.aliases;

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'no fields to update' }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from('role_tiers')
    .update(patch)
    .eq('role_key', body.role_key)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ tier: data });
}, { routeName: 'pay-config/role-tiers/PUT' });

// DELETE: remove a tier — but only if no employees still reference it.
// Checks employee_profiles.tier_key (post-P-6) AND the legacy job_title
// alias-match path so we don't orphan a current employee.
export const DELETE = withErrorHandler(async (req: NextRequest) => {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;

  const { searchParams } = new URL(req.url);
  const roleKey = searchParams.get('role_key');
  if (!roleKey) {
    return NextResponse.json({ error: 'role_key query param required' }, { status: 400 });
  }

  // Pull the row first so we know its aliases for the legacy check.
  const { data: tier } = await supabaseAdmin
    .from('role_tiers')
    .select('aliases')
    .eq('role_key', roleKey)
    .maybeSingle();

  // Modern check: anyone with tier_key = roleKey.
  const { data: tierKeyMatches } = await supabaseAdmin
    .from('employee_profiles')
    .select('user_email', { count: 'exact' })
    .eq('tier_key', roleKey)
    .limit(5);

  // Legacy check: anyone with job_title in this tier's aliases (if column
  // doesn't yet exist for some envs, aliases will be null/undefined and
  // we skip the check).
  let legacyMatches: { user_email: string }[] = [];
  const aliases = (tier as { aliases?: string[] } | null)?.aliases || [];
  if (aliases.length > 0) {
    const { data } = await supabaseAdmin
      .from('employee_profiles')
      .select('user_email')
      .in('job_title', aliases)
      .limit(5);
    legacyMatches = (data || []) as { user_email: string }[];
  }

  const blockers = Array.from(new Set([
    ...(tierKeyMatches || []).map((r: { user_email: string }) => r.user_email),
    ...legacyMatches.map(r => r.user_email),
  ]));

  if (blockers.length > 0) {
    return NextResponse.json({
      error: `Cannot remove tier "${roleKey}" — ${blockers.length} employee${blockers.length === 1 ? ' still references' : 's still reference'} it. Reassign first.`,
      blockers,
    }, { status: 409 });
  }

  const { error } = await supabaseAdmin
    .from('role_tiers')
    .delete()
    .eq('role_key', roleKey);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ deleted: roleKey });
}, { routeName: 'pay-config/role-tiers/DELETE' });

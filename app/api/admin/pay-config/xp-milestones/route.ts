// app/api/admin/pay-config/xp-milestones/route.ts
//
// CRUD for xp_pay_milestones — the XP thresholds that grant cumulative
// pay bumps as employees earn XP.
// P-13 of PAY_PROGRESSION_OVERHAUL.md.
//
// Natural key: xp_threshold.

import { NextRequest, NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';

interface MilestoneBody {
  xp_threshold: number;
  bonus_per_hour?: number;
  label?: string | null;
  description?: string | null;
  is_active?: boolean;
  new_xp_threshold?: number;
}

async function requireAdmin() {
  const session = await auth();
  if (!session?.user?.email) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  if (!isAdmin(session.user.roles)) return { error: NextResponse.json({ error: 'Forbidden — admin only' }, { status: 403 }) };
  return { email: session.user.email };
}

export const POST = withErrorHandler(async (req: NextRequest) => {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;

  const body = await req.json() as MilestoneBody;
  if (typeof body.xp_threshold !== 'number' || body.xp_threshold <= 0) {
    return NextResponse.json({ error: 'xp_threshold must be a positive number' }, { status: 400 });
  }
  if (typeof body.bonus_per_hour !== 'number' || body.bonus_per_hour < 0) {
    return NextResponse.json({ error: 'bonus_per_hour must be a non-negative number' }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from('xp_pay_milestones')
    .insert({
      xp_threshold: body.xp_threshold,
      bonus_per_hour: body.bonus_per_hour,
      label: body.label || `${(body.xp_threshold / 1000).toFixed(0)}k XP`,
      description: body.description || null,
      is_active: body.is_active ?? true,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ milestone: data });
}, { routeName: 'pay-config/xp-milestones/POST' });

export const PUT = withErrorHandler(async (req: NextRequest) => {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;

  const body = await req.json() as MilestoneBody;
  if (typeof body.xp_threshold !== 'number') {
    return NextResponse.json({ error: 'xp_threshold is required (the row to update)' }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};
  if (typeof body.bonus_per_hour === 'number') patch.bonus_per_hour = body.bonus_per_hour;
  if (body.label !== undefined) patch.label = body.label;
  if (body.description !== undefined) patch.description = body.description;
  if (body.is_active !== undefined) patch.is_active = body.is_active;
  if (typeof body.new_xp_threshold === 'number' && body.new_xp_threshold !== body.xp_threshold) {
    patch.xp_threshold = body.new_xp_threshold;
  }
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: 'no fields to update' }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from('xp_pay_milestones')
    .update(patch)
    .eq('xp_threshold', body.xp_threshold)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ milestone: data });
}, { routeName: 'pay-config/xp-milestones/PUT' });

export const DELETE = withErrorHandler(async (req: NextRequest) => {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;

  const { searchParams } = new URL(req.url);
  const xpThreshold = searchParams.get('xp_threshold');
  if (xpThreshold === null) return NextResponse.json({ error: 'xp_threshold query param required' }, { status: 400 });

  const { error } = await supabaseAdmin
    .from('xp_pay_milestones')
    .delete()
    .eq('xp_threshold', Number(xpThreshold));

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ deleted: Number(xpThreshold) });
}, { routeName: 'pay-config/xp-milestones/DELETE' });

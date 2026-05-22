// app/api/admin/pay-config/work-types/route.ts
//
// CRUD for work_type_rates — the base $/hr rate plus bonus multiplier
// and cap that anchors the pay-progression calculation per work type.
// P-10 of PAY_PROGRESSION_OVERHAUL.md.
//
// All write ops are admin-gated. GET is omitted because the rewards API
// already reads this table for the pay-progression page; this route is
// strictly for edits triggered by the in-page admin edit mode.

import { NextRequest, NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';

interface WorkTypeBody {
  work_type: string;
  base_rate?: number;
  bonus_multiplier?: number | null;
  max_bonus_cap?: number | null;
  icon?: string | null;
  label?: string | null;
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

// POST: create a new work_type row.
export const POST = withErrorHandler(async (req: NextRequest) => {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;

  const body = await req.json() as WorkTypeBody;
  if (!body.work_type || typeof body.work_type !== 'string') {
    return NextResponse.json({ error: 'work_type is required' }, { status: 400 });
  }
  if (typeof body.base_rate !== 'number' || body.base_rate < 0) {
    return NextResponse.json({ error: 'base_rate must be a non-negative number' }, { status: 400 });
  }

  const row = {
    work_type: body.work_type.toLowerCase().replace(/\s+/g, '_'),
    base_rate: body.base_rate,
    bonus_multiplier: body.bonus_multiplier ?? 1.0,
    max_bonus_cap: body.max_bonus_cap ?? null,
    icon: body.icon || null,
    label: body.label || body.work_type,
  };

  const { data, error } = await supabaseAdmin
    .from('work_type_rates')
    .insert(row)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ work_type: data });
}, { routeName: 'pay-config/work-types/POST' });

// PUT: update an existing work_type row (work_type is the natural key).
export const PUT = withErrorHandler(async (req: NextRequest) => {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;

  const body = await req.json() as WorkTypeBody;
  if (!body.work_type) {
    return NextResponse.json({ error: 'work_type is required' }, { status: 400 });
  }

  // Only set the columns the client included so partial edits work.
  const patch: Record<string, unknown> = {};
  if (typeof body.base_rate === 'number') patch.base_rate = body.base_rate;
  if (body.bonus_multiplier !== undefined) patch.bonus_multiplier = body.bonus_multiplier;
  if (body.max_bonus_cap !== undefined) patch.max_bonus_cap = body.max_bonus_cap;
  if (body.icon !== undefined) patch.icon = body.icon;
  if (body.label !== undefined) patch.label = body.label;

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'no fields to update' }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from('work_type_rates')
    .update(patch)
    .eq('work_type', body.work_type)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ work_type: data });
}, { routeName: 'pay-config/work-types/PUT' });

// DELETE: remove a work_type row.
export const DELETE = withErrorHandler(async (req: NextRequest) => {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;

  const { searchParams } = new URL(req.url);
  const workType = searchParams.get('work_type');
  if (!workType) {
    return NextResponse.json({ error: 'work_type query param required' }, { status: 400 });
  }

  const { error } = await supabaseAdmin
    .from('work_type_rates')
    .delete()
    .eq('work_type', workType);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ deleted: workType });
}, { routeName: 'pay-config/work-types/DELETE' });

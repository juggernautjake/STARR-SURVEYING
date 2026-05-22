// app/api/admin/pay-config/seniority-brackets/route.ts
//
// CRUD for seniority_brackets — the years-of-service tiers that grant
// the seniority bonus in the pay calculation.
// P-12 of PAY_PROGRESSION_OVERHAUL.md.
//
// Natural key: min_years (the seed treats min_years as unique per the
// brackets, and the page uses it as the React key). PUT and DELETE
// route on `min_years`.

import { NextRequest, NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';

interface SeniorityBody {
  min_years: number;
  max_years?: number | null;
  bonus_per_hour?: number;
  label?: string | null;
  // For PUT-rename: change the bracket's min_years value itself.
  new_min_years?: number;
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

export const POST = withErrorHandler(async (req: NextRequest) => {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;

  const body = await req.json() as SeniorityBody;
  if (typeof body.min_years !== 'number' || body.min_years < 0) {
    return NextResponse.json({ error: 'min_years must be a non-negative number' }, { status: 400 });
  }
  if (typeof body.bonus_per_hour !== 'number' || body.bonus_per_hour < 0) {
    return NextResponse.json({ error: 'bonus_per_hour must be a non-negative number' }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from('seniority_brackets')
    .insert({
      min_years: body.min_years,
      max_years: body.max_years ?? null,
      bonus_per_hour: body.bonus_per_hour,
      label: body.label || `${body.min_years}+ years`,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ bracket: data });
}, { routeName: 'pay-config/seniority/POST' });

export const PUT = withErrorHandler(async (req: NextRequest) => {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;

  const body = await req.json() as SeniorityBody;
  if (typeof body.min_years !== 'number') {
    return NextResponse.json({ error: 'min_years is required (the bracket to update)' }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};
  if (body.max_years !== undefined) patch.max_years = body.max_years;
  if (typeof body.bonus_per_hour === 'number') patch.bonus_per_hour = body.bonus_per_hour;
  if (body.label !== undefined) patch.label = body.label;
  if (typeof body.new_min_years === 'number' && body.new_min_years !== body.min_years) {
    patch.min_years = body.new_min_years;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'no fields to update' }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from('seniority_brackets')
    .update(patch)
    .eq('min_years', body.min_years)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ bracket: data });
}, { routeName: 'pay-config/seniority/PUT' });

export const DELETE = withErrorHandler(async (req: NextRequest) => {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;

  const { searchParams } = new URL(req.url);
  const minYears = searchParams.get('min_years');
  if (minYears === null) {
    return NextResponse.json({ error: 'min_years query param required' }, { status: 400 });
  }

  const { error } = await supabaseAdmin
    .from('seniority_brackets')
    .delete()
    .eq('min_years', Number(minYears));

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ deleted: Number(minYears) });
}, { routeName: 'pay-config/seniority/DELETE' });

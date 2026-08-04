// app/api/admin/pay-config/work-types/route.ts
//
// CRUD for work_type_rates — the activities somebody can log hours against.
//
// Under the simple pay model (owner decision, 2026-08-04) each row answers one question:
//
//   rate_mode 'base' — this activity pays the person's own base pay. `base_rate` is IGNORED.
//                      Field work is $25 for somebody on $25 and $18 for somebody on $18.
//   rate_mode 'flat' — this activity pays `base_rate` to everybody. *"If people are riding in a
//                      vehicle for an hour to a job, then they all get $15."*
//
// `bonus_multiplier` and `max_bonus_cap` belong to the parked pay-progression system and are no
// longer written from here. They stay in the table so restoring progression is wiring rather than a
// migration; see `lib/payroll/resolve-rate.ts`.
//
// GET lists every row for the management screen at /admin/pay-rates. Writes are admin-gated.

import { NextRequest, NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';

interface WorkTypeBody {
  work_type: string;
  base_rate?: number;
  rate_mode?: string;
  icon?: string | null;
  label?: string | null;
  description?: string | null;
  is_active?: boolean;
  sort_order?: number;
}

/**
 * Only 'base' and 'flat' exist. Anything else is refused rather than stored, because the check
 * constraint would reject it anyway and a 500 from Postgres reads as a bug rather than as "you
 * typed the wrong thing".
 */
function validMode(mode: unknown): mode is 'base' | 'flat' {
  return mode === 'base' || mode === 'flat';
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

// GET: list every activity, for the management screen.
export const GET = withErrorHandler(async () => {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;

  const { data, error } = await supabaseAdmin
    .from('work_type_rates')
    .select('id, work_type, label, base_rate, rate_mode, icon, description, is_active, sort_order')
    .order('sort_order');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ work_types: data ?? [] });
}, { routeName: 'pay-config/work-types/GET' });

// POST: create a new work_type row.
export const POST = withErrorHandler(async (req: NextRequest) => {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;

  const body = await req.json() as WorkTypeBody;
  if (!body.work_type || typeof body.work_type !== 'string') {
    return NextResponse.json({ error: 'work_type is required' }, { status: 400 });
  }
  const mode = body.rate_mode ?? 'base';
  if (!validMode(mode)) {
    return NextResponse.json({ error: "rate_mode must be 'base' or 'flat'" }, { status: 400 });
  }
  // A set rate needs a number; an activity that pays base pay does not, and demanding one would
  // make the common case harder than the rare one.
  if (mode === 'flat' && (typeof body.base_rate !== 'number' || body.base_rate < 0)) {
    return NextResponse.json({ error: 'A set-rate activity needs a rate of $0 or more.' }, { status: 400 });
  }

  const row = {
    work_type: body.work_type.toLowerCase().replace(/\s+/g, '_'),
    base_rate: typeof body.base_rate === 'number' ? body.base_rate : 0,
    rate_mode: mode,
    icon: body.icon || null,
    label: body.label || body.work_type,
    description: body.description || null,
    is_active: body.is_active ?? true,
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
  if (body.rate_mode !== undefined) {
    if (!validMode(body.rate_mode)) {
      return NextResponse.json({ error: "rate_mode must be 'base' or 'flat'" }, { status: 400 });
    }
    patch.rate_mode = body.rate_mode;
  }
  if (body.icon !== undefined) patch.icon = body.icon;
  if (body.label !== undefined) patch.label = body.label;
  if (body.description !== undefined) patch.description = body.description;
  if (body.is_active !== undefined) patch.is_active = body.is_active;
  if (body.sort_order !== undefined) patch.sort_order = body.sort_order;

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

  // Deactivate rather than delete. Hours already logged against this activity keep their label, and
  // a hard delete would leave rows pointing at an activity that no longer exists — with the row's
  // own rate the only record of what it was. Deactivating takes it out of every picker, which is
  // what "remove it" means to the person asking.
  const { data, error } = await supabaseAdmin
    .from('work_type_rates')
    .update({ is_active: false })
    .eq('work_type', workType)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ deactivated: workType, work_type: data });
}, { routeName: 'pay-config/work-types/DELETE' });

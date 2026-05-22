// app/api/admin/pay-config/overrides/route.ts
//
// CRUD for user_pay_overrides — per-employee exceptions to the default
// pay calculation. P-17 of PAY_PROGRESSION_OVERHAUL.md.
//
// GET ?email=...        — returns history for the user (newest first)
//                         + the currently-active row from user_pay_overrides_current
// POST                  — create a new override row (becomes the active row
//                         if its effective_date <= today and not expired)
// DELETE ?id=...        — remove a single row (auditing is via the trail,
//                         which keeps all rows including superseded ones)
//
// All ops admin-gated. The `reason` field is required on non-default rows
// (also enforced by a DB CHECK constraint from seed 286).

import { NextRequest, NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';

interface OverrideBody {
  user_email: string;
  fixed_rate?: number | null;
  role_bonus_multiplier?: number;
  seniority_multiplier?: number;
  flat_addition?: number;
  reason?: string | null;
  effective_date?: string;
  expires_at?: string | null;
}

async function requireAdmin() {
  const session = await auth();
  if (!session?.user?.email) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  if (!isAdmin(session.user.roles)) return { error: NextResponse.json({ error: 'Forbidden — admin only' }, { status: 403 }) };
  return { email: session.user.email };
}

function isNonDefault(body: OverrideBody): boolean {
  return (
    (body.fixed_rate !== undefined && body.fixed_rate !== null) ||
    (body.role_bonus_multiplier !== undefined && body.role_bonus_multiplier !== 1) ||
    (body.seniority_multiplier !== undefined && body.seniority_multiplier !== 1) ||
    (body.flat_addition !== undefined && body.flat_addition !== 0)
  );
}

export const GET = withErrorHandler(async (req: NextRequest) => {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;

  const { searchParams } = new URL(req.url);
  const email = searchParams.get('email');
  if (!email) return NextResponse.json({ error: 'email query param required' }, { status: 400 });

  // History (newest first) — includes superseded + expired rows so the
  // audit-trail viewer in P-18 can show what changed and when.
  const { data: history, error: historyErr } = await supabaseAdmin
    .from('user_pay_overrides')
    .select('*')
    .eq('user_email', email)
    .order('effective_date', { ascending: false })
    .order('created_at', { ascending: false });
  if (historyErr) return NextResponse.json({ error: historyErr.message }, { status: 500 });

  // Currently-active row from the view (single row or none).
  const { data: current, error: currentErr } = await supabaseAdmin
    .from('user_pay_overrides_current')
    .select('*')
    .eq('user_email', email)
    .maybeSingle();
  if (currentErr) return NextResponse.json({ error: currentErr.message }, { status: 500 });

  return NextResponse.json({ history: history || [], current: current || null });
}, { routeName: 'pay-config/overrides/GET' });

export const POST = withErrorHandler(async (req: NextRequest) => {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;

  const body = await req.json() as OverrideBody;
  if (!body.user_email) return NextResponse.json({ error: 'user_email is required' }, { status: 400 });

  if (isNonDefault(body) && (!body.reason || !body.reason.trim())) {
    return NextResponse.json({ error: 'reason is required when any override field is non-default' }, { status: 400 });
  }

  const row = {
    user_email: body.user_email,
    fixed_rate: body.fixed_rate ?? null,
    role_bonus_multiplier: body.role_bonus_multiplier ?? 1.0,
    seniority_multiplier: body.seniority_multiplier ?? 1.0,
    flat_addition: body.flat_addition ?? 0,
    reason: body.reason || null,
    effective_date: body.effective_date || new Date().toISOString().slice(0, 10),
    expires_at: body.expires_at || null,
    approved_by: gate.email,
  };

  const { data, error } = await supabaseAdmin
    .from('user_pay_overrides')
    .insert(row)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ override: data });
}, { routeName: 'pay-config/overrides/POST' });

export const DELETE = withErrorHandler(async (req: NextRequest) => {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id query param required' }, { status: 400 });

  const { error } = await supabaseAdmin
    .from('user_pay_overrides')
    .delete()
    .eq('id', id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ deleted: id });
}, { routeName: 'pay-config/overrides/DELETE' });

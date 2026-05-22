// app/api/admin/pay-config/system/route.ts
//
// Read + update for pay_system_config — the key/value table of system
// caps (max_credential_stack, max_xp_milestone_bonus, etc.).
// P-14 of PAY_PROGRESSION_OVERHAUL.md.
//
// GET is admin-only because the values surface internal calculation
// caps; non-admins don't need to see the full key/value list (the
// relevant caps are already inlined on the pay-progression page text).
// No POST/DELETE — keys are stable; admin only edits values.

import { NextRequest, NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';

interface ConfigBody {
  key: string;
  value: number;
}

async function requireAdmin() {
  const session = await auth();
  if (!session?.user?.email) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  if (!isAdmin(session.user.roles)) return { error: NextResponse.json({ error: 'Forbidden — admin only' }, { status: 403 }) };
  return { email: session.user.email };
}

export const GET = withErrorHandler(async () => {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;

  const { data, error } = await supabaseAdmin
    .from('pay_system_config')
    .select('key, value, description')
    .order('key');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ config: data || [] });
}, { routeName: 'pay-config/system/GET' });

export const PUT = withErrorHandler(async (req: NextRequest) => {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;

  const body = await req.json() as ConfigBody;
  if (!body.key || typeof body.key !== 'string') {
    return NextResponse.json({ error: 'key is required' }, { status: 400 });
  }
  if (typeof body.value !== 'number') {
    return NextResponse.json({ error: 'value must be a number' }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from('pay_system_config')
    .update({ value: body.value })
    .eq('key', body.key)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ entry: data });
}, { routeName: 'pay-config/system/PUT' });

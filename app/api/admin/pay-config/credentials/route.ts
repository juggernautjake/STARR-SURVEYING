// app/api/admin/pay-config/credentials/route.ts
//
// CRUD for credential_bonuses — the certifications + licenses that grant
// the credentials bonus in the pay calculation.
// P-13 of PAY_PROGRESSION_OVERHAUL.md.
//
// Natural key: credential_key.

import { NextRequest, NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';

interface CredentialBody {
  credential_key: string;
  label?: string | null;
  bonus_per_hour?: number;
  credential_type?: string | null;
  description?: string | null;
  sort_order?: number | null;
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

  const body = await req.json() as CredentialBody;
  if (!body.credential_key || typeof body.credential_key !== 'string') {
    return NextResponse.json({ error: 'credential_key is required' }, { status: 400 });
  }
  if (typeof body.bonus_per_hour !== 'number' || body.bonus_per_hour < 0) {
    return NextResponse.json({ error: 'bonus_per_hour must be a non-negative number' }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from('credential_bonuses')
    .insert({
      credential_key: body.credential_key.toLowerCase().replace(/\s+/g, '_'),
      label: body.label || body.credential_key,
      bonus_per_hour: body.bonus_per_hour,
      credential_type: body.credential_type || 'other',
      description: body.description || null,
      sort_order: body.sort_order ?? null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ credential: data });
}, { routeName: 'pay-config/credentials/POST' });

export const PUT = withErrorHandler(async (req: NextRequest) => {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;

  const body = await req.json() as CredentialBody;
  if (!body.credential_key) return NextResponse.json({ error: 'credential_key is required' }, { status: 400 });

  const patch: Record<string, unknown> = {};
  if (body.label !== undefined) patch.label = body.label;
  if (typeof body.bonus_per_hour === 'number') patch.bonus_per_hour = body.bonus_per_hour;
  if (body.credential_type !== undefined) patch.credential_type = body.credential_type;
  if (body.description !== undefined) patch.description = body.description;
  if (body.sort_order !== undefined) patch.sort_order = body.sort_order;
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: 'no fields to update' }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from('credential_bonuses')
    .update(patch)
    .eq('credential_key', body.credential_key)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ credential: data });
}, { routeName: 'pay-config/credentials/PUT' });

export const DELETE = withErrorHandler(async (req: NextRequest) => {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;

  const { searchParams } = new URL(req.url);
  const credentialKey = searchParams.get('credential_key');
  if (!credentialKey) return NextResponse.json({ error: 'credential_key query param required' }, { status: 400 });

  // Refuse if any employee has earned this credential (would orphan their bonus).
  const { count } = await supabaseAdmin
    .from('employee_earned_credentials')
    .select('user_email', { count: 'exact', head: true })
    .eq('credential_key', credentialKey);
  if ((count ?? 0) > 0) {
    return NextResponse.json({
      error: `Cannot remove credential "${credentialKey}" — ${count} employee${count === 1 ? '' : 's'} have already earned it. Revoke first or rename instead.`,
    }, { status: 409 });
  }

  const { error } = await supabaseAdmin
    .from('credential_bonuses')
    .delete()
    .eq('credential_key', credentialKey);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ deleted: credentialKey });
}, { routeName: 'pay-config/credentials/DELETE' });

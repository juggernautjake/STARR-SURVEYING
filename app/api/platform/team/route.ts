// app/api/platform/team/route.ts
//
// Operator roster API. GET lists every operator_users row; POST
// adds a new operator (platform_admin only). MFA-required to log in
// is enforced at sign-in time, not at invite creation.
//
// Phase C-9 of OPERATOR_CONSOLE.md.

import { NextResponse, type NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';

export const runtime = 'nodejs';

type OperatorRole = 'platform_admin' | 'platform_billing' | 'platform_support' | 'platform_developer' | 'platform_observer';
const VALID_ROLES: OperatorRole[] = ['platform_admin', 'platform_billing', 'platform_support', 'platform_developer', 'platform_observer'];

interface OperatorRow {
  email: string;
  name: string;
  role: string;
  status: string;
  invitedBy: string | null;
  invitedAt: string | null;
  lastSigninAt: string | null;
  mfaEnrolledAt: string | null;
}

async function gateOperator(email: string): Promise<{ role: string } | null> {
  const { data: opr } = await supabaseAdmin
    .from('operator_users')
    .select('email, role, status')
    .eq('email', email)
    .maybeSingle();
  if (!opr || opr.status !== 'active') return null;
  return { role: opr.role as string };
}

export async function GET(): Promise<NextResponse<{ operators: OperatorRow[] } | { error: string }>> {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const opr = await gateOperator(session.user.email);
  if (!opr) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { data, error } = await supabaseAdmin
    .from('operator_users')
    .select('email, name, role, status, invited_by, invited_at, last_signin_at, mfa_enrolled_at')
    .order('invited_at', { ascending: false });

  if (error) {
    console.error('[platform/team] list failed', error);
    return NextResponse.json({ error: 'Failed to load operators' }, { status: 500 });
  }

  const operators: OperatorRow[] = (data ?? []).map((r: Record<string, unknown>) => ({
    email: r.email as string,
    name: r.name as string,
    role: r.role as string,
    status: r.status as string,
    invitedBy: (r.invited_by as string | null) ?? null,
    invitedAt: (r.invited_at as string | null) ?? null,
    lastSigninAt: (r.last_signin_at as string | null) ?? null,
    mfaEnrolledAt: (r.mfa_enrolled_at as string | null) ?? null,
  }));

  return NextResponse.json({ operators });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const opr = await gateOperator(session.user.email);
  if (!opr) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  if (opr.role !== 'platform_admin') {
    return NextResponse.json({ error: 'Only platform_admin can invite operators' }, { status: 403 });
  }

  let body: { email?: string; name?: string; role?: OperatorRole };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const email = body.email?.trim().toLowerCase();
  const name = body.name?.trim();
  const role = body.role;
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'Valid email required' }, { status: 400 });
  }
  if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 });
  if (!role || !VALID_ROLES.includes(role)) {
    return NextResponse.json({ error: `role must be one of: ${VALID_ROLES.join(', ')}` }, { status: 400 });
  }

  const { error } = await supabaseAdmin
    .from('operator_users')
    .insert({
      email,
      name,
      role,
      status: 'active',
      invited_by: session.user.email,
    });

  if (error) {
    if ((error as { code?: string }).code === '23505') {
      return NextResponse.json({ error: 'Operator with that email already exists' }, { status: 409 });
    }
    console.error('[platform/team] create failed', error);
    return NextResponse.json({ error: 'Failed to add operator' }, { status: 500 });
  }

  await supabaseAdmin.from('audit_log').insert({
    operator_email: session.user.email,
    action: 'OPERATOR_INVITED',
    severity: 'warning',
    metadata: { invitee: email, role, name },
  });

  return NextResponse.json({ ok: true }, { status: 201 });
}

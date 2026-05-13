// app/api/platform/audit/route.ts
//
// Operator-side cross-tenant audit log query. Returns rows from
// public.audit_log across every org. Auth-gated to operators
// (session.user.isOperator); non-operators get 403.
//
// Phase C-5 of OPERATOR_CONSOLE.md.

import { NextResponse, type NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';

export const runtime = 'nodejs';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  // Until M-9 puts isOperator in JWT, fall back to operator_users.email check.
  if (!session.user.isOperator) {
    const { data: opr } = await supabaseAdmin
      .from('operator_users')
      .select('email, status')
      .eq('email', session.user.email)
      .maybeSingle();
    if (!opr || opr.status !== 'active') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  }

  const url = new URL(req.url);
  const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '200', 10) || 200, 1000);

  const { data, error } = await supabaseAdmin
    .from('audit_log')
    .select('id, operator_email, customer_email, org_id, action, severity, metadata, created_at')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('[platform/audit] query failed', error);
    return NextResponse.json({ error: 'Failed to load' }, { status: 500 });
  }

  const rows = (data ?? []).map((r: Record<string, unknown>) => ({
    id: r.id as string,
    operatorEmail: (r.operator_email as string | null) ?? null,
    customerEmail: (r.customer_email as string | null) ?? null,
    orgId: (r.org_id as string | null) ?? null,
    action: r.action as string,
    severity: (r.severity as 'info' | 'warning' | 'critical') ?? 'info',
    metadata: (r.metadata as Record<string, unknown>) ?? {},
    createdAt: r.created_at as string,
  }));

  return NextResponse.json({ rows });
}

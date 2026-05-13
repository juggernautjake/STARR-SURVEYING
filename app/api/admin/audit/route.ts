// app/api/admin/audit/route.ts
//
// Customer-scoped audit log query. Returns rows from public.audit_log
// where org_id = caller's active org. Per CUSTOMER_PORTAL.md §3.10
// org admins see this — non-admin org members get an empty list (the
// page itself doesn't gate; defense in depth).
//
// Spec: docs/planning/in-progress/CUSTOMER_PORTAL.md §3.10.

import { NextResponse, type NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';

export const runtime = 'nodejs';

interface AuditRow {
  id: string;
  operatorEmail: string | null;
  customerEmail: string | null;
  action: string;
  severity: 'info' | 'warning' | 'critical';
  metadata: Record<string, unknown>;
  createdAt: string;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(req.url);
  const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '100', 10) || 100, 500);

  // Resolve org. Until M-9 puts activeOrgId in JWT, fall back to
  // default_org_id from registered_users.
  const { data: user } = await supabaseAdmin
    .from('registered_users')
    .select('default_org_id')
    .eq('email', session.user.email)
    .maybeSingle();

  if (!user?.default_org_id) {
    return NextResponse.json({ rows: [] });
  }

  // Check that the user is an admin of the org (per §10c open
  // question — recommended admin-only visibility).
  const { data: membership } = await supabaseAdmin
    .from('organization_members')
    .select('role')
    .eq('org_id', user.default_org_id)
    .eq('user_email', session.user.email)
    .maybeSingle();

  if (!membership || membership.role !== 'admin') {
    return NextResponse.json({ rows: [] });
  }

  const { data, error } = await supabaseAdmin
    .from('audit_log')
    .select('id, operator_email, customer_email, action, severity, metadata, created_at')
    .eq('org_id', user.default_org_id)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('[audit] query failed', error);
    return NextResponse.json({ error: 'Failed to load audit log' }, { status: 500 });
  }

  const rows: AuditRow[] = (data ?? []).map((r: Record<string, unknown>) => ({
    id: r.id as string,
    operatorEmail: (r.operator_email as string | null) ?? null,
    customerEmail: (r.customer_email as string | null) ?? null,
    action: r.action as string,
    severity: (r.severity as 'info' | 'warning' | 'critical') ?? 'info',
    metadata: (r.metadata as Record<string, unknown>) ?? {},
    createdAt: r.created_at as string,
  }));

  return NextResponse.json({ rows });
}

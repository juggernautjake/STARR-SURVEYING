// app/api/platform/support/tickets/route.ts
//
// Operator-side cross-tenant ticket inbox. Lists every ticket across
// every org. Phase E-4 of SUPPORT_DESK.md.

import { NextResponse, type NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';

export const runtime = 'nodejs';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
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
  const statusFilter = url.searchParams.get('status');
  const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '100', 10) || 100, 500);

  let query = supabaseAdmin
    .from('support_tickets')
    .select('id, ticket_number, subject, status, priority, category, requester_email, assigned_to, org_id, created_at, updated_at')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (statusFilter === 'open') {
    query = query.not('status', 'in', '(resolved,closed)');
  } else if (statusFilter && statusFilter !== 'all') {
    query = query.eq('status', statusFilter);
  }

  const { data: tickets, error } = await query;
  if (error) {
    console.error('[platform/support] list failed', error);
    return NextResponse.json({ error: 'Failed to load' }, { status: 500 });
  }

  // Look up org names for the rows we got
  const orgIds = Array.from(new Set((tickets ?? []).map((t: { org_id: string }) => t.org_id)));
  const { data: orgs } = await supabaseAdmin
    .from('organizations')
    .select('id, name, slug')
    .in('id', orgIds);
  const orgById = new Map<string, { name: string; slug: string }>();
  for (const o of orgs ?? []) {
    orgById.set(o.id as string, { name: o.name as string, slug: o.slug as string });
  }

  const rows = (tickets ?? []).map((t: Record<string, unknown>) => ({
    id: t.id as string,
    ticketNumber: t.ticket_number as string,
    subject: t.subject as string,
    status: t.status as string,
    priority: t.priority as string,
    category: (t.category as string | null) ?? null,
    requesterEmail: t.requester_email as string,
    assignedTo: (t.assigned_to as string | null) ?? null,
    orgId: t.org_id as string,
    orgName: orgById.get(t.org_id as string)?.name ?? '?',
    orgSlug: orgById.get(t.org_id as string)?.slug ?? '?',
    createdAt: t.created_at as string,
    updatedAt: t.updated_at as string,
  }));

  return NextResponse.json({ tickets: rows });
}

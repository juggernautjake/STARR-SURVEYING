// app/api/admin/support/tickets/route.ts
//
// Customer-facing support API. GET lists the caller's org's tickets;
// POST creates a new ticket. Consumed by:
//   - /admin/support page (list)
//   - /admin/support/new page (create — landed in a future slice)
//
// Phase E-2 backend complement to lib/saas/tickets.ts.
//
// Spec: docs/planning/in-progress/SUPPORT_DESK.md §3 + §7 E-2.

import { NextResponse, type NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';

import {
  createSupportTicket,
  listCustomerTickets,
  type CreateTicketInput,
} from '@/lib/saas/tickets';

export const runtime = 'nodejs';

interface TicketRow {
  id: string;
  ticketNumber: string;
  subject: string;
  status: string;
  priority: string;
  createdAt: string;
  updatedAt: string;
}

interface TicketsResponse {
  tickets: TicketRow[];
}

export async function GET(): Promise<NextResponse<TicketsResponse | { error: string }>> {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Resolve org. Until M-9 puts activeOrgId in JWT, fall back to
  // default_org_id from registered_users.
  const { data: user } = await supabaseAdmin
    .from('registered_users')
    .select('default_org_id')
    .eq('email', session.user.email)
    .maybeSingle();

  if (!user?.default_org_id) {
    return NextResponse.json({ tickets: [] });
  }

  try {
    const tickets = await listCustomerTickets({
      orgId: user.default_org_id,
      userEmail: session.user.email,
      status: 'all',
      limit: 50,
    });
    return NextResponse.json({ tickets });
  } catch (err) {
    console.error('[support/tickets] list failed', err);
    return NextResponse.json({ error: 'Failed to load tickets' }, { status: 500 });
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: Partial<CreateTicketInput>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!body.subject || !body.initialMessage) {
    return NextResponse.json(
      { error: 'subject and initialMessage are required' },
      { status: 400 },
    );
  }

  const { data: user } = await supabaseAdmin
    .from('registered_users')
    .select('default_org_id')
    .eq('email', session.user.email)
    .maybeSingle();

  if (!user?.default_org_id) {
    return NextResponse.json(
      { error: 'No active organization for this user' },
      { status: 400 },
    );
  }

  try {
    const result = await createSupportTicket({
      orgId: user.default_org_id,
      requesterEmail: session.user.email,
      subject: body.subject,
      initialMessage: body.initialMessage,
      priority: body.priority ?? 'normal',
      category: body.category,
      context: body.context,
    });
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    console.error('[support/tickets] create failed', err);
    return NextResponse.json({ error: 'Failed to create ticket' }, { status: 500 });
  }
}

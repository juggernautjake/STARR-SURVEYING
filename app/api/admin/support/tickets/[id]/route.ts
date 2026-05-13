// app/api/admin/support/tickets/[id]/route.ts
//
// Single-ticket fetch + message append for customer-facing thread
// view. Phase E-3 of SUPPORT_DESK.md.

import { NextResponse, type NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';

export const runtime = 'nodejs';

interface RouteContext {
  params: Promise<{ id: string }>;
}

interface MessageOut {
  id: string;
  authorEmail: string;
  authorType: 'customer' | 'operator';
  body: string;
  isInternalNote: boolean;
  createdAt: string;
}

export async function GET(_req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  const { id } = await ctx.params;
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Resolve org gate
  const { data: user } = await supabaseAdmin
    .from('registered_users')
    .select('default_org_id')
    .eq('email', session.user.email)
    .maybeSingle();
  if (!user?.default_org_id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const { data: ticket, error: tErr } = await supabaseAdmin
    .from('support_tickets')
    .select('id, ticket_number, subject, status, priority, category, requester_email, assigned_to, created_at, updated_at, metadata, org_id')
    .eq('id', id)
    .eq('org_id', user.default_org_id)
    .maybeSingle();

  if (tErr || !ticket) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const { data: messages } = await supabaseAdmin
    .from('support_ticket_messages')
    .select('id, author_email, author_type, body, is_internal_note, created_at')
    .eq('ticket_id', id)
    // Customers never see internal notes
    .eq('is_internal_note', false)
    .order('created_at', { ascending: true });

  const out: MessageOut[] = (messages ?? []).map((m: Record<string, unknown>) => ({
    id: m.id as string,
    authorEmail: m.author_email as string,
    authorType: m.author_type as 'customer' | 'operator',
    body: m.body as string,
    isInternalNote: m.is_internal_note as boolean,
    createdAt: m.created_at as string,
  }));

  return NextResponse.json({
    ticket: {
      id: ticket.id,
      ticketNumber: ticket.ticket_number,
      subject: ticket.subject,
      status: ticket.status,
      priority: ticket.priority,
      category: ticket.category,
      requesterEmail: ticket.requester_email,
      assignedTo: ticket.assigned_to,
      createdAt: ticket.created_at,
      updatedAt: ticket.updated_at,
    },
    messages: out,
  });
}

export async function POST(req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  // Append a message to the thread.
  const { id } = await ctx.params;
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { body?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (!body.body?.trim()) {
    return NextResponse.json({ error: 'body required' }, { status: 400 });
  }

  // Verify the ticket belongs to caller's org
  const { data: user } = await supabaseAdmin
    .from('registered_users')
    .select('default_org_id')
    .eq('email', session.user.email)
    .maybeSingle();
  if (!user?.default_org_id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const { data: ticket } = await supabaseAdmin
    .from('support_tickets')
    .select('id, status')
    .eq('id', id)
    .eq('org_id', user.default_org_id)
    .maybeSingle();
  if (!ticket) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const { error: insErr } = await supabaseAdmin
    .from('support_ticket_messages')
    .insert({
      ticket_id: id,
      author_email: session.user.email,
      author_type: 'customer',
      body: body.body.trim(),
      is_internal_note: false,
    });

  if (insErr) {
    console.error('[support/tickets/id] reply failed', insErr);
    return NextResponse.json({ error: 'Failed to post reply' }, { status: 500 });
  }

  // Bump ticket status to awaiting_reply if was awaiting customer
  if (ticket.status === 'awaiting_customer') {
    await supabaseAdmin
      .from('support_tickets')
      .update({ status: 'awaiting_reply', updated_at: new Date().toISOString() })
      .eq('id', id);
  } else {
    await supabaseAdmin
      .from('support_tickets')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', id);
  }

  return NextResponse.json({ ok: true });
}

export async function PATCH(req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  // Customer can mark resolved (closes ticket; reopen via reply later).
  const { id } = await ctx.params;
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { action?: 'mark_resolved' | 'reopen' };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { data: user } = await supabaseAdmin
    .from('registered_users')
    .select('default_org_id')
    .eq('email', session.user.email)
    .maybeSingle();
  if (!user?.default_org_id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  if (body.action === 'mark_resolved') {
    const { error } = await supabaseAdmin
      .from('support_tickets')
      .update({ status: 'resolved', resolved_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('org_id', user.default_org_id);
    if (error) {
      return NextResponse.json({ error: 'Failed to update' }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }

  if (body.action === 'reopen') {
    const { error } = await supabaseAdmin
      .from('support_tickets')
      .update({ status: 'open', resolved_at: null, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('org_id', user.default_org_id);
    if (error) {
      return NextResponse.json({ error: 'Failed to update' }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}

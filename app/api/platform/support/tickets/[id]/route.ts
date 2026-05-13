// app/api/platform/support/tickets/[id]/route.ts
//
// Operator-side ticket detail. Returns the ticket row (cross-tenant),
// every message including internal notes, the org row, and accepts
// PATCH for assignee / status / priority changes + POST for replies
// and internal notes.
//
// Phase E-5 of SUPPORT_DESK.md.

import { NextResponse, type NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';

export const runtime = 'nodejs';

interface RouteContext {
  params: Promise<{ id: string }>;
}

async function gateOperator(email: string): Promise<boolean> {
  const { data: opr } = await supabaseAdmin
    .from('operator_users')
    .select('email, status')
    .eq('email', email)
    .maybeSingle();
  return !!opr && opr.status === 'active';
}

const VALID_STATUSES = ['open', 'awaiting_customer', 'awaiting_operator', 'resolved', 'closed'];
const VALID_PRIORITIES = ['low', 'normal', 'high', 'urgent'];

export async function GET(_req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!session.user.isOperator && !(await gateOperator(session.user.email))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await ctx.params;

  const { data: ticket } = await supabaseAdmin
    .from('support_tickets')
    .select('id, ticket_number, subject, status, priority, category, requester_email, assigned_to, created_at, updated_at, metadata, org_id, organizations(id, slug, name)')
    .eq('id', id)
    .maybeSingle();

  if (!ticket) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { data: messages } = await supabaseAdmin
    .from('support_ticket_messages')
    .select('id, author_email, author_type, body, is_internal_note, created_at')
    .eq('ticket_id', id)
    .order('created_at', { ascending: true });

  const org = ticket.organizations as { id: string; slug: string; name: string } | null;

  return NextResponse.json({
    ticket: {
      id: ticket.id,
      ticketNumber: ticket.ticket_number,
      subject: ticket.subject,
      status: ticket.status,
      priority: ticket.priority,
      category: ticket.category,
      requesterEmail: ticket.requester_email,
      assignedTo: (ticket.assigned_to as string | null) ?? null,
      createdAt: ticket.created_at,
      updatedAt: ticket.updated_at,
      orgId: ticket.org_id,
      orgName: org?.name ?? null,
      orgSlug: org?.slug ?? null,
      metadata: (ticket.metadata as Record<string, unknown>) ?? {},
    },
    messages: (messages ?? []).map((m: Record<string, unknown>) => ({
      id: m.id as string,
      authorEmail: m.author_email as string,
      authorType: m.author_type as 'customer' | 'operator',
      body: m.body as string,
      isInternalNote: (m.is_internal_note as boolean) ?? false,
      createdAt: m.created_at as string,
    })),
  });
}

export async function POST(req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!session.user.isOperator && !(await gateOperator(session.user.email))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await ctx.params;

  let body: { body?: string; internal?: boolean };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!body.body || body.body.trim().length === 0) {
    return NextResponse.json({ error: 'body required' }, { status: 400 });
  }

  const isInternal = body.internal === true;

  const { error: msgErr } = await supabaseAdmin
    .from('support_ticket_messages')
    .insert({
      ticket_id: id,
      author_email: session.user.email,
      author_type: 'operator',
      body: body.body.trim(),
      is_internal_note: isInternal,
    });

  if (msgErr) {
    console.error('[platform/support/tickets/:id] reply failed', msgErr);
    return NextResponse.json({ error: 'Failed to post reply' }, { status: 500 });
  }

  // External reply flips the ticket to awaiting_customer; internal note doesn't change status
  if (!isInternal) {
    await supabaseAdmin
      .from('support_tickets')
      .update({ status: 'awaiting_customer', updated_at: new Date().toISOString() })
      .eq('id', id)
      .in('status', ['open', 'awaiting_operator']);
  }

  return NextResponse.json({ ok: true });
}

export async function PATCH(req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!session.user.isOperator && !(await gateOperator(session.user.email))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await ctx.params;

  let body: { status?: string; priority?: string; assignedTo?: string | null };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.status !== undefined) {
    if (!VALID_STATUSES.includes(body.status)) {
      return NextResponse.json({ error: `status must be one of: ${VALID_STATUSES.join(', ')}` }, { status: 400 });
    }
    patch.status = body.status;
  }
  if (body.priority !== undefined) {
    if (!VALID_PRIORITIES.includes(body.priority)) {
      return NextResponse.json({ error: `priority must be one of: ${VALID_PRIORITIES.join(', ')}` }, { status: 400 });
    }
    patch.priority = body.priority;
  }
  if (body.assignedTo !== undefined) {
    patch.assigned_to = body.assignedTo || null;
  }

  const { error } = await supabaseAdmin
    .from('support_tickets')
    .update(patch)
    .eq('id', id);

  if (error) {
    console.error('[platform/support/tickets/:id] patch failed', error);
    return NextResponse.json({ error: 'Failed to update ticket' }, { status: 500 });
  }

  await supabaseAdmin.from('audit_log').insert({
    operator_email: session.user.email,
    action: 'TICKET_UPDATED',
    severity: 'info',
    metadata: { ticket_id: id, changes: patch },
  });

  return NextResponse.json({ ok: true });
}

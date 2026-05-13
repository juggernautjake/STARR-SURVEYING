// lib/saas/tickets.ts
//
// Helpers for the support-desk ticketing system. The customer's
// /admin/support/new form posts to a route that calls these helpers;
// the operator's /platform/support inbox reads via the standard
// supabaseAdmin queries directly.
//
// Schema: seeds/267 (support_tickets + support_ticket_messages) and
// seeds/268 (ticket_subscribers, ticket_kb_links). Ticket numbering
// uses the SQL function public.next_ticket_number() shipped in 267.
//
// Spec: docs/planning/in-progress/SUPPORT_DESK.md §3 + §4.

import { supabaseAdmin } from '@/lib/supabase';

export type TicketPriority = 'low' | 'normal' | 'high' | 'urgent' | 'critical';
export type TicketStatus = 'open' | 'awaiting_reply' | 'awaiting_customer' | 'resolved' | 'closed';

export interface CreateTicketInput {
  orgId: string;
  requesterEmail: string;
  subject: string;
  initialMessage: string;
  /** Auto-attached context per SUPPORT_DESK §3.2 (URL, browser, etc). */
  context?: Record<string, unknown>;
  priority?: TicketPriority;
  category?: string;
}

export interface CreatedTicket {
  id: string;
  ticketNumber: string;
}

/** Creates a new support ticket + its first message in a single
 *  logical operation. Returns the ticket id + the human-readable
 *  number (T-0042) for use in confirmation UI + email subjects.
 *
 *  Throws on any DB failure — the caller (the API route handler)
 *  should catch + return a 500 with a generic message to the user. */
export async function createSupportTicket(input: CreateTicketInput): Promise<CreatedTicket> {
  // 1. Generate the ticket number via the SQL helper (single source of truth).
  const { data: nextNum, error: numErr } = await supabaseAdmin
    .rpc('next_ticket_number');
  if (numErr) {
    throw new Error(`Failed to allocate ticket number: ${numErr.message}`);
  }
  const ticketNumber = typeof nextNum === 'string' ? nextNum : String(nextNum);

  // 2. Insert the ticket row.
  const { data: ticket, error: ticketErr } = await supabaseAdmin
    .from('support_tickets')
    .insert({
      ticket_number: ticketNumber,
      org_id: input.orgId,
      requester_email: input.requesterEmail,
      subject: input.subject.trim().slice(0, 200),
      status: 'open' as TicketStatus,
      priority: input.priority ?? 'normal',
      category: input.category ?? null,
      metadata: {
        context: input.context ?? {},
        source: 'customer_portal',
      },
    })
    .select('id, ticket_number')
    .single();

  if (ticketErr || !ticket) {
    throw new Error(`Failed to insert ticket: ${ticketErr?.message ?? 'no row returned'}`);
  }

  // 3. Insert the first message.
  const { error: msgErr } = await supabaseAdmin
    .from('support_ticket_messages')
    .insert({
      ticket_id: ticket.id,
      author_email: input.requesterEmail,
      author_type: 'customer',
      body: input.initialMessage,
      is_internal_note: false,
    });

  if (msgErr) {
    // Soft-fail on the message: the ticket exists; operator can see it
    // even without the body. Better to log + return than to leak a
    // half-created ticket.
    console.error(
      `[tickets] Created ticket ${ticket.ticket_number} but failed to insert initial message:`,
      msgErr,
    );
  }

  return { id: ticket.id, ticketNumber: ticket.ticket_number };
}

export interface TicketSummary {
  id: string;
  ticketNumber: string;
  subject: string;
  status: TicketStatus;
  priority: TicketPriority;
  category: string | null;
  requesterEmail: string;
  assignedTo: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Fetches the list of tickets visible to a customer (their own +
 *  any they're subscribed to). Phase E-2 customer-side list UI
 *  consumes this. */
export async function listCustomerTickets(opts: {
  orgId: string;
  userEmail: string;
  status?: TicketStatus | 'all';
  limit?: number;
}): Promise<TicketSummary[]> {
  const limit = Math.min(opts.limit ?? 50, 100);

  let query = supabaseAdmin
    .from('support_tickets')
    .select('id, ticket_number, subject, status, priority, category, requester_email, assigned_to, created_at, updated_at')
    .eq('org_id', opts.orgId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (opts.status && opts.status !== 'all') {
    query = query.eq('status', opts.status);
  }

  const { data, error } = await query;
  if (error) throw new Error(`Failed to list tickets: ${error.message}`);

  return (data ?? []).map((r: Record<string, unknown>) => ({
    id: r.id as string,
    ticketNumber: r.ticket_number as string,
    subject: r.subject as string,
    status: r.status as TicketStatus,
    priority: r.priority as TicketPriority,
    category: (r.category as string | null) ?? null,
    requesterEmail: r.requester_email as string,
    assignedTo: (r.assigned_to as string | null) ?? null,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  }));
}

/** Server-side priority label for UI consistency. */
export const PRIORITY_LABELS: Record<TicketPriority, string> = {
  low: 'Low',
  normal: 'Normal',
  high: 'High',
  urgent: 'Urgent',
  critical: 'Critical',
};

/** Server-side status label for UI consistency. */
export const STATUS_LABELS: Record<TicketStatus, string> = {
  open: 'Open',
  awaiting_reply: 'Awaiting reply',
  awaiting_customer: 'Awaiting your reply',
  resolved: 'Resolved',
  closed: 'Closed',
};

/** UI hint color per priority. */
export const PRIORITY_COLORS: Record<TicketPriority, string> = {
  low: '#6B7280',
  normal: '#1D3095',
  high: '#D97706',
  urgent: '#BD1218',
  critical: '#7F1D1D',
};

// lib/proposals/proposals.ts — the front door of every surveying job (audit §3, Phase 2 item 9).
//
// §3: *"No proposal / estimate / contract with customer acceptance. A lead has a `quote_amount` field
// and that's it… For a surveying firm this is the front door of every job."*
//
// A proposal here IS a `lead_quotes` row with the parts a customer-facing document needs. Seed 523's
// header explains why it is not a new table: `lead_quotes` already owns "what did we offer this
// customer", versioned and append-only, and a second table would be a second answer.

import crypto from 'node:crypto';

export interface ProposalLineItem {
  description: string;
  quantity: number;
  unit: string;
  unit_price_cents: number;
  total_cents: number;
}

export interface Proposal {
  id: string;
  lead_id: string;
  version: number;
  amount_cents: number;
  status: 'draft' | 'sent' | 'accepted' | 'declined' | 'expired' | 'superseded';
  scope_of_work: string | null;
  scope_notes: string | null;
  terms: string | null;
  line_items: ProposalLineItem[];
  valid_until: string | null;
  public_token: string | null;
  sent_at: string | null;
  decided_at: string | null;
  quoted_at: string;
}

/** An unguessable token for a customer with no account.
 *
 *  256 bits from a CSPRNG, base64url. Not a UUID: a v4 UUID is 122 bits and, more importantly, looks
 *  enumerable to anyone who has seen one — and the thing behind this link is a priced contract with a
 *  customer's name and address on it. */
export function mintProposalToken(): string {
  return crypto.randomBytes(32).toString('base64url');
}

/** Sum of the line items, in cents. Rounded per line, not at the end: a customer adding up the column
 *  on screen gets the same answer we do, and a total that differs from the visible arithmetic by a
 *  cent is a phone call. */
export function sumLineItems(items: ProposalLineItem[]): number {
  return items.reduce((a, i) => a + Math.round(i.total_cents), 0);
}

/** Normalise one line, computing its total from quantity × price when it was not supplied.
 *
 *  A line item arriving with a total and no quantity is normal — "Boundary survey, $2,400" is one
 *  line — so a missing quantity means 1 rather than 0. Zero would silently zero the line. */
export function normaliseLineItem(raw: Partial<ProposalLineItem>): ProposalLineItem {
  const quantity = Number.isFinite(raw.quantity as number) && (raw.quantity as number) > 0 ? Number(raw.quantity) : 1;
  const unitPrice = Math.round(Number(raw.unit_price_cents ?? 0));
  const total = Number.isFinite(raw.total_cents as number)
    ? Math.round(Number(raw.total_cents))
    : Math.round(quantity * unitPrice);
  return {
    description: String(raw.description ?? '').trim() || 'Item',
    quantity,
    unit: String(raw.unit ?? 'ea').trim() || 'ea',
    unit_price_cents: unitPrice,
    total_cents: total,
  };
}

export type ProposalViewState =
  | 'acceptable'
  | 'already_accepted'
  | 'declined'
  | 'expired'
  | 'superseded'
  | 'not_sent';

/** What a customer opening the link should see — and specifically, whether the Accept button exists.
 *
 *  Each refusal is its own state rather than one "unavailable", because a customer who accepted last
 *  week, a customer whose quote was revised, and a customer whose quote expired need three different
 *  sentences and only one of them should be "call us". */
export function proposalViewState(
  p: Pick<Proposal, 'status' | 'valid_until' | 'sent_at'>,
  hasAcceptance: boolean,
  today = new Date(),
): ProposalViewState {
  if (hasAcceptance || p.status === 'accepted') return 'already_accepted';
  if (p.status === 'declined') return 'declined';
  if (p.status === 'superseded') return 'superseded';
  // `sent_at` rather than `status === 'sent'`: a draft whose token leaked must not be acceptable, and
  // the moment of sending is the fact that matters.
  if (!p.sent_at) return 'not_sent';
  if (p.status === 'expired') return 'expired';
  if (p.valid_until) {
    const until = new Date(`${p.valid_until}T23:59:59Z`);
    // Compared inclusively to the END of the day. A proposal valid until the 31st is valid ON the
    // 31st, and treating the date as midnight loses the customer a day without telling them.
    if (today.getTime() > until.getTime()) return 'expired';
  }
  return 'acceptable';
}

/** The customer-safe projection. Everything a customer may see, and nothing else.
 *
 *  `scope_notes` is deliberately absent: seed 505 describes it as the internal "why is v2 lower"
 *  record, and it is exactly the field that says "we can go to 2,200 if they push". Building this as
 *  an allow-list rather than a delete-list means a column added later is private by default. */
export function customerFacingProposal(p: Proposal): Record<string, unknown> {
  return {
    version: p.version,
    amount_cents: p.amount_cents,
    scope_of_work: p.scope_of_work,
    terms: p.terms,
    line_items: p.line_items,
    valid_until: p.valid_until,
    sent_at: p.sent_at,
  };
}

/** Hash an IP for the acceptance trail.
 *
 *  Stored hashed rather than raw: it is evidence that the same party who opened the link accepted it,
 *  which a hash proves just as well, and a raw IP is personal data the firm has no reason to hold.
 *  Salted with a per-deployment secret so the hash cannot be reversed by trying every IPv4 address —
 *  which takes minutes, and is the flaw in every unsalted-IP-hash scheme. */
export function hashIp(ip: string | null | undefined, salt = process.env.NEXTAUTH_SECRET ?? 'starr'): string | null {
  if (!ip) return null;
  return crypto.createHmac('sha256', salt).update(ip).digest('hex').slice(0, 32);
}

/** What a job looks like when it comes from an accepted proposal.
 *
 *  Pure so the mapping is testable without a database. The caller writes it. */
export function jobFromAcceptedProposal(input: {
  lead: { name: string | null; email: string | null; phone: string | null; company: string | null; property_address: string | null; city: string | null; state: string | null; survey_type: string | null; estimated_acreage: number | null; customer_id: string | null; id: string };
  proposal: Pick<Proposal, 'id' | 'amount_cents' | 'scope_of_work'>;
  acceptedAt: string;
}): Record<string, unknown> {
  const { lead, proposal, acceptedAt } = input;
  return {
    name: lead.property_address || lead.name || 'New job',
    address: lead.property_address,
    city: lead.city,
    state: lead.state,
    survey_type: lead.survey_type,
    acreage: lead.estimated_acreage,
    client_name: lead.name,
    client_email: lead.email,
    client_phone: lead.phone,
    client_company: lead.company,
    customer_id: lead.customer_id,
    origin_lead_id: lead.id,
    accepted_quote_id: proposal.id,
    // Dollars, because that is what the column is. Converted once, here, rather than in each caller.
    quote_amount: proposal.amount_cents / 100,
    description: proposal.scope_of_work,
    // The acceptance IS the acceptance date. Not now(): a proposal accepted at 11pm and processed by
    // a cron at 6am should not be dated the next morning.
    date_accepted: acceptedAt,
    stage: 'accepted',
    stage_changed_at: acceptedAt,
  };
}

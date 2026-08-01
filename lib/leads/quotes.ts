// lib/leads/quotes.ts — the official quote, versioned. A5.
//
// The owner names this step explicitly: *"he can give the official quote, which he will record."* Today
// that is `leads.quote_amount`, one nullable number, and a revision overwrites it — so the moment a
// customer asks "can you do it for less?", what we originally asked for is gone. With it goes the
// discount rate, the decline reasons, and the question of which quote a won job should report to Google.
//
// ── THE RULES, AND WHY EACH ONE IS HERE ─────────────────────────────────────────────────────────────
//
// **A revision is a new version, never an edit.** `(lead_id, version)` is unique at the database level,
// so history cannot be rewritten by a careless update — which is the entire reason the table exists.
//
// **Only one quote is live at a time.** Recording v2 supersedes v1. Two "sent" quotes for one lead is a
// state where nobody — not the office, not the customer, not this code — can say what was actually
// offered.
//
// **A decline must carry a reason.** It is the only moment the reason is knowable; nobody reconstructs
// "why did we lose that one" a month later. This module refuses a decline without one rather than
// accepting an empty string and quietly producing a "why we lose" report full of blanks.
//
// **`leads.quote_amount` is a MIRROR.** It stays because the leads board, the detail page, the conversion
// flow and at least one report read it, and rewriting all of those would be a wide, risky change for no
// benefit. A mirror can drift, which is a real cost accepted knowingly — mitigated by writing it in the
// same function that writes the quote, and nowhere else.
//
// ── PURE CORE ───────────────────────────────────────────────────────────────────────────────────────
//
// `nextVersion`, `validateQuoteInput` and `deriveMirror` carry the judgement and touch nothing. The rules
// above must be assertable without a database, because they are the ones that lose information when wrong.

import { supabaseAdmin } from '@/lib/supabase';
import { recordMilestone, toCents } from '@/lib/pipeline/events';

export type QuoteStatus = 'draft' | 'sent' | 'accepted' | 'declined' | 'expired' | 'superseded';

/** The statuses a quote can be in while it is still the LIVE one. Anything else is history. */
export const OPEN_QUOTE_STATUSES: readonly QuoteStatus[] = ['draft', 'sent'];

/** Statuses that mean a decision has been made and the quote is closed. */
export const DECIDED_QUOTE_STATUSES: readonly QuoteStatus[] = ['accepted', 'declined', 'expired', 'superseded'];

export interface LeadQuote {
  id: string;
  lead_id: string;
  version: number;
  amount_cents: number;
  scope_notes: string | null;
  status: QuoteStatus;
  decline_reason: string | null;
  quoted_by: string | null;
  quoted_at: string;
  sent_at: string | null;
  decided_at: string | null;
  expires_at: string | null;
}

/** The next version for a lead. PURE. 1 when there is no history — versions are 1-based because they are
 *  shown to people ("quote v2"), and a "v0" would need explaining every time. */
export function nextVersion(existing: Array<{ version: number }>): number {
  if (!existing.length) return 1;
  return Math.max(...existing.map((q) => q.version)) + 1;
}

export interface QuoteInputErrors {
  amount?: string;
  declineReason?: string;
}

/** Validate a quote before it is written. PURE, and returns EVERY problem rather than the first — a form
 *  that reveals its objections one at a time is a form people fight with. */
export function validateQuoteInput(input: {
  amountCents?: number | null;
  status?: QuoteStatus;
  declineReason?: string | null;
}): QuoteInputErrors {
  const errors: QuoteInputErrors = {};

  if (input.status !== 'declined') {
    const amount = input.amountCents;
    if (typeof amount !== 'number' || !Number.isFinite(amount)) {
      errors.amount = 'Enter the quoted amount.';
    } else if (amount < 0) {
      errors.amount = 'A quote cannot be negative.';
    }
    // ZERO IS ALLOWED, deliberately. A no-charge survey — a favour, a warranty revisit, a goodwill
    // callback — is a real thing this business does, and rejecting it would push the office into typing
    // a fake number.
  }

  if (input.status === 'declined' && !(input.declineReason ?? '').trim()) {
    // The only moment the reason is knowable. See the header.
    errors.declineReason = 'Say why it was declined — this is the "why we lose" report.';
  }

  return errors;
}

/** What `leads.quote_amount` should mirror, given the quote history. PURE.
 *
 *  The ACCEPTED quote wins if there is one — that is the number the job will be built from. Otherwise the
 *  latest live quote. Otherwise null: a lead whose only quote was declined has no current quote, and
 *  leaving the declined figure in the mirror would show a number nobody is offering.
 */
export function deriveMirror(quotes: Array<{ version: number; amount_cents: number; status: QuoteStatus }>): number | null {
  if (!quotes.length) return null;
  const accepted = quotes.filter((q) => q.status === 'accepted').sort((a, b) => b.version - a.version)[0];
  if (accepted) return accepted.amount_cents / 100;
  const live = quotes
    .filter((q) => OPEN_QUOTE_STATUSES.includes(q.status))
    .sort((a, b) => b.version - a.version)[0];
  return live ? live.amount_cents / 100 : null;
}

// ── I/O ─────────────────────────────────────────────────────────────────────────────────────────────

/** Every quote for a lead, newest version first. */
export async function listQuotes(leadId: string): Promise<LeadQuote[]> {
  const { data } = await supabaseAdmin
    .from('lead_quotes')
    .select('*')
    .eq('lead_id', leadId)
    .order('version', { ascending: false });
  return (data ?? []) as LeadQuote[];
}

/** Recompute and write the `leads.quote_amount` mirror. The ONLY writer of that column. */
async function syncMirror(leadId: string): Promise<void> {
  const quotes = await listQuotes(leadId);
  const mirror = deriveMirror(quotes);
  await supabaseAdmin.from('leads').update({ quote_amount: mirror }).eq('id', leadId);
}

/**
 * Record a new quote — a first one, or a revision.
 *
 * Supersedes any still-live version, so there is never more than one quote a customer could reasonably
 * believe is current.
 */
export async function recordQuote(input: {
  leadId: string;
  amountCents: number;
  scopeNotes?: string | null;
  quotedBy?: string | null;
  status?: Extract<QuoteStatus, 'draft' | 'sent'>;
  expiresAt?: string | null;
}): Promise<{ quote: LeadQuote | null; error?: string }> {
  const errors = validateQuoteInput({ amountCents: input.amountCents, status: input.status ?? 'sent' });
  if (errors.amount) return { quote: null, error: errors.amount };

  const existing = await listQuotes(input.leadId);
  const version = nextVersion(existing);
  const status = input.status ?? 'sent';

  // Supersede the previous live version FIRST. If the insert then fails, the worst case is a lead with no
  // live quote — visibly wrong, and fixable by recording one. The reverse order risks two live quotes,
  // which is wrong in a way nobody notices.
  const liveIds = existing.filter((q) => OPEN_QUOTE_STATUSES.includes(q.status)).map((q) => q.id);
  if (liveIds.length) {
    await supabaseAdmin
      .from('lead_quotes')
      .update({ status: 'superseded', updated_at: new Date().toISOString() })
      .in('id', liveIds);
  }

  const { data, error } = await supabaseAdmin
    .from('lead_quotes')
    .insert({
      lead_id: input.leadId,
      version,
      amount_cents: input.amountCents,
      scope_notes: input.scopeNotes ?? null,
      quoted_by: input.quotedBy ?? null,
      status,
      sent_at: status === 'sent' ? new Date().toISOString() : null,
      expires_at: input.expiresAt ?? null,
    })
    .select('*')
    .single();

  if (error || !data) return { quote: null, error: error?.message ?? 'Could not record the quote.' };

  await syncMirror(input.leadId);

  // Milestone 3. Only for a quote that actually went to the customer — a draft is not a quote yet, and
  // counting it would report work as an offer.
  if (status === 'sent') {
    await recordMilestone({
      milestone: 'quoted',
      leadId: input.leadId,
      valueCents: input.amountCents,
      actor: input.quotedBy ?? 'admin',
      sourceTable: 'lead_quotes',
      sourceId: (data as LeadQuote).id,
      metadata: { version },
    });
  }

  return { quote: data as LeadQuote };
}

/** Accept or decline a quote. A decline without a reason is refused. */
export async function decideQuote(input: {
  quoteId: string;
  decision: Extract<QuoteStatus, 'accepted' | 'declined'>;
  declineReason?: string | null;
  actor?: string | null;
}): Promise<{ quote: LeadQuote | null; error?: string }> {
  const errors = validateQuoteInput({ status: input.decision, declineReason: input.declineReason });
  if (errors.declineReason) return { quote: null, error: errors.declineReason };

  const { data, error } = await supabaseAdmin
    .from('lead_quotes')
    .update({
      status: input.decision,
      decline_reason: input.decision === 'declined' ? (input.declineReason ?? '').trim() : null,
      decided_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', input.quoteId)
    .select('*')
    .maybeSingle();

  if (error || !data) return { quote: null, error: error?.message ?? 'Quote not found.' };
  const quote = data as LeadQuote;

  await syncMirror(quote.lead_id);

  // Milestone 4 — or the loss. Both matter: the funnel is as interested in where leads stop as where
  // they finish.
  await recordMilestone({
    milestone: input.decision === 'accepted' ? 'quote_accepted' : 'lost',
    leadId: quote.lead_id,
    valueCents: input.decision === 'accepted' ? quote.amount_cents : null,
    actor: input.actor ?? 'admin',
    sourceTable: 'lead_quotes',
    sourceId: quote.id,
    metadata: input.decision === 'declined' ? { decline_reason: quote.decline_reason } : { version: quote.version },
  });

  return { quote };
}

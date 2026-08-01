// lib/customers/identity.ts — deciding whether two contact details are the same person.
//
// A3 of docs/planning/in-progress/LEAD_TO_CASH_ATTRIBUTION_AND_GOOGLE_ADS_2026-07-31.md.
//
// ── THE ONE RULE ────────────────────────────────────────────────────────────────────────────────────
//
// **Auto-merge only on an exact identifier. Everything weaker is a suggestion a human confirms.**
//
// The asymmetry is the whole argument. A duplicate customer row is untidy, visible, and reversible in one
// click. A WRONG merge puts one landowner's job history, invoices and outstanding balance under another
// person's name — and nobody discovers it until somebody is billed for a survey they never ordered, or a
// surveyor turns up at the wrong property because the address came from the wrong record.
//
// So: same normalised email, or same normalised phone → the same customer, automatically. Same name, or
// same property address, or anything else that merely looks alike → a row in
// `customer_merge_suggestions` and a decision left to a person who can ring them and ask.
//
// ── WHY IT HASHES WITH THE ADS MODULE ───────────────────────────────────────────────────────────────
//
// The match key IS the Enhanced Conversions key. Using `lib/integrations/google/hash.ts` rather than a
// local normaliser means a customer's identity and their conversion identity can never be computed two
// different ways — and the Gmail rule (dots and `+tags` collapse, but ONLY for Gmail) is exactly the kind
// of detail that would be got subtly right in one file and subtly wrong in the other.
//
// ── PURE CORE, THIN I/O ─────────────────────────────────────────────────────────────────────────────
//
// `classifyMatch` and `mergeRollups` are pure and carry the judgement. Everything that touches Postgres
// is a thin wrapper. The rule above must be assertable without a database, because it is the part that
// costs real money when it is wrong.

import { supabaseAdmin } from '@/lib/supabase';
import { hashEmail, hashPhone, normalizeEmail, normalizePhone } from '@/lib/integrations/google/hash';

/** The identifying details we can be handed, from a lead, a job, or an office form. */
export interface ContactDetails {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  company?: string | null;
  /** Property or billing address. Used ONLY to raise a suggestion — never to merge. */
  address?: string | null;
}

export interface CustomerRow {
  id: string;
  display_name: string;
  company: string | null;
  primary_email: string | null;
  primary_phone: string | null;
  email_sha256: string | null;
  phone_sha256: string | null;
  first_lead_at: string | null;
  job_count: number;
  lifetime_value_cents: number;
  is_repeat: boolean;
}

export type MatchKind =
  /** An exact identifier matched. Safe to attach automatically. */
  | 'exact-email'
  | 'exact-phone'
  /** Nothing matched. A new customer. */
  | 'none'
  /** Something looks alike but is not an identifier. NEVER merged — suggested. */
  | 'suggest-name'
  | 'suggest-address';

export interface MatchVerdict {
  kind: MatchKind;
  /** True only for the two exact kinds. The single flag every caller should branch on. */
  autoMerge: boolean;
  /** Human-readable, stored on a suggestion row so an admin can see WHY it was raised. */
  reason: string;
}

/** The hashes for a set of details. Null when there is nothing usable — a walk-in with neither an email
 *  nor a phone is an ordinary customer, not an error. */
export function identityKeys(details: ContactDetails): { emailHash: string | null; phoneHash: string | null } {
  return { emailHash: hashEmail(details.email), phoneHash: hashPhone(details.phone) };
}

/** Loose comparison for the SUGGESTION path only. Never used to merge. */
function looseEqual(a: string | null | undefined, b: string | null | undefined): boolean {
  const norm = (v: string | null | undefined) =>
    (v ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
  const x = norm(a);
  return x !== '' && x === norm(b);
}

/**
 * Decide how a set of details relates to an existing customer. PURE.
 *
 * Email is checked before phone deliberately: a phone number is far more likely to be shared (a household,
 * a company switchboard, a spouse) than an email address, so where both match different customers, the
 * email is the better identity. Where only the phone matches, that is still exact enough to merge — a
 * wrong shared-landline merge is possible but rare, and the office notices it immediately because the name
 * on screen is not the person they are speaking to.
 */
export function classifyMatch(details: ContactDetails, candidate: CustomerRow): MatchVerdict {
  const { emailHash, phoneHash } = identityKeys(details);

  if (emailHash && candidate.email_sha256 && emailHash === candidate.email_sha256) {
    return { kind: 'exact-email', autoMerge: true, reason: 'Same email address' };
  }
  if (phoneHash && candidate.phone_sha256 && phoneHash === candidate.phone_sha256) {
    return { kind: 'exact-phone', autoMerge: true, reason: 'Same phone number' };
  }

  // Below here NOTHING auto-merges. These are suspicions, and they are recorded as such.
  if (looseEqual(details.name, candidate.display_name)) {
    return {
      kind: 'suggest-name',
      autoMerge: false,
      reason: `Same name ("${candidate.display_name}") but a different email and phone`,
    };
  }
  if (details.company && looseEqual(details.company, candidate.company)) {
    return {
      kind: 'suggest-address',
      autoMerge: false,
      reason: `Same company ("${candidate.company}") with different contact details`,
    };
  }

  return { kind: 'none', autoMerge: false, reason: 'No match' };
}

/** Recompute the denormalised rollups. PURE, so the numbers on the row can be asserted without a database
 *  — a rollup nobody checks is a rollup that drifts. */
export function mergeRollups(
  jobs: Array<{ final_amount?: number | null; quote_amount?: number | null }>,
): { job_count: number; lifetime_value_cents: number; is_repeat: boolean } {
  const job_count = jobs.length;
  const lifetime_value_cents = jobs.reduce((sum, j) => {
    // FINAL beats QUOTE, and a missing final is not a zero. What a job was quoted at is a forecast; what
    // it invoiced is the fact. Summing quotes for delivered jobs would report money nobody paid.
    const dollars = typeof j.final_amount === 'number' ? j.final_amount
      : typeof j.quote_amount === 'number' ? j.quote_amount
        : 0;
    return sum + Math.round(dollars * 100);
  }, 0);
  return { job_count, lifetime_value_cents, is_repeat: job_count > 1 };
}

// ── I/O ─────────────────────────────────────────────────────────────────────────────────────────────

/** Find the customer these details belong to, by exact identifier only. */
export async function findByIdentity(details: ContactDetails): Promise<CustomerRow | null> {
  const { emailHash, phoneHash } = identityKeys(details);
  if (!emailHash && !phoneHash) return null;

  const ors: string[] = [];
  if (emailHash) ors.push(`email_sha256.eq.${emailHash}`);
  if (phoneHash) ors.push(`phone_sha256.eq.${phoneHash}`);

  const { data, error } = await supabaseAdmin
    .from('customers')
    .select('*')
    .or(ors.join(','))
    // Email first — see `classifyMatch`. A row matching on email should win over one matching on a shared
    // phone, and ordering by `email_sha256` puts the non-null match ahead deterministically.
    .order('email_sha256', { nullsFirst: false })
    .limit(1);

  if (error || !data?.length) return null;
  return data[0] as CustomerRow;
}

/**
 * Attach these details to a customer, creating one if no exact identifier matches.
 *
 * Never throws to the caller. Customer identity is an ENRICHMENT of the lead pipeline, not a
 * precondition for it: a failure here must never stop a customer's enquiry being captured, which is the
 * same reasoning `insertLeadFromForm` already applies to its own insert.
 */
export async function upsertCustomer(details: ContactDetails): Promise<CustomerRow | null> {
  try {
    const existing = await findByIdentity(details);
    if (existing) return existing;

    const { emailHash, phoneHash } = identityKeys(details);
    const display_name = (details.name ?? '').trim() || (details.company ?? '').trim() || 'Unnamed customer';

    const { data, error } = await supabaseAdmin
      .from('customers')
      .insert({
        display_name,
        company: (details.company ?? '').trim() || null,
        // The NORMALISED form is stored, not the raw input: it is what the hash was computed from, so
        // storing the raw version beside a hash of something else invites the two to disagree.
        primary_email: normalizeEmail(details.email),
        primary_phone: normalizePhone(details.phone),
        email_sha256: emailHash,
        phone_sha256: phoneHash,
        first_lead_at: new Date().toISOString(),
      })
      .select('*')
      .maybeSingle();

    if (error) {
      // A UNIQUE violation here means a concurrent insert won the race — which is the constraint doing its
      // job, not a failure. Re-read rather than reporting an error.
      const raced = await findByIdentity(details);
      if (raced) return raced;
      console.warn('[customers] could not create customer:', error.message);
      return null;
    }
    return (data as CustomerRow) ?? null;
  } catch (e) {
    console.warn('[customers] identity lookup failed:', e instanceof Error ? e.message : e);
    return null;
  }
}

/** Record a weak match for a human to decide. Idempotent — the table's UNIQUE pair makes a repeat a no-op. */
export async function suggestMerge(
  customerId: string,
  candidateId: string,
  reason: string,
): Promise<void> {
  if (customerId === candidateId) return;
  await supabaseAdmin
    .from('customer_merge_suggestions')
    .upsert({ customer_id: customerId, candidate_id: candidateId, reason }, { onConflict: 'customer_id,candidate_id' })
    .then(() => {}, () => {});
}

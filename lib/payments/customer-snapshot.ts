// lib/payments/customer-snapshot.ts
//
// P3 of payment-infrastructure-2026-06-18.md — pure helper that
// builds the customer-contact snapshot persisted on
// `invoices.{customer_email,customer_name,customer_phone,billing_address}`
// at invoice-creation time.
//
// Why a snapshot:
//   - The lead's contact info can change (customer moves, gets a new
//     phone, the office cleans a duplicate). The invoice is a legal
//     record and the receipt always needs to land somewhere valid.
//   - We never want a future contact-info edit to silently re-route a
//     receipt to the new address.
//
// The helper picks the best source in this priority order:
//   1. explicit `overrides` (office typed it into the new-invoice form)
//   2. primary `contact` (from contacts table via job_contacts)
//   3. originating `lead` (the public-form intake row)
//   4. legacy `job` columns (client_name / client_email / client_phone)
//
// Empty strings fall back to the next layer — a typo'd "" doesn't
// mask a valid downstream value. The address shape is JSONB-friendly
// (street / city / state / zip) so the column accepts it directly.

export interface InvoiceCustomerSnapshot {
  customer_email: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  billing_address: BillingAddress;
}

export interface BillingAddress {
  street: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
}

export interface ContactLike {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
}

export interface LeadLike {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  property_address?: string | null;
  city?: string | null;
  state?: string | null;
}

export interface JobLike {
  client_name?: string | null;
  client_email?: string | null;
  client_phone?: string | null;
}

export interface SnapshotOverrides {
  customer_email?: string | null;
  customer_name?: string | null;
  customer_phone?: string | null;
  billing_address?: Partial<BillingAddress> | null;
}

export interface SnapshotSources {
  overrides?: SnapshotOverrides | null;
  contact?: ContactLike | null;
  lead?: LeadLike | null;
  job?: JobLike | null;
}

const EMPTY_ADDRESS: BillingAddress = {
  street: null,
  city: null,
  state: null,
  zip: null,
};

/** Pure helper — collapse "", whitespace, null, undefined → null so a
 *  trimmed-empty value doesn't beat a populated fallback. */
export function cleanField(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

/** Pure helper — first non-null value in priority order. */
export function pickFirst(...values: ReadonlyArray<unknown>): string | null {
  for (const v of values) {
    const cleaned = cleanField(v);
    if (cleaned !== null) return cleaned;
  }
  return null;
}

/** Pure helper — merge an address from multiple sources, field by
 *  field. Each field falls through independently: a customer whose
 *  contact card has only `street` set still gets `city`/`state`/`zip`
 *  from the lead. */
export function mergeBillingAddress(
  overrides: Partial<BillingAddress> | null | undefined,
  contact: ContactLike | null | undefined,
  lead: LeadLike | null | undefined,
): BillingAddress {
  return {
    street: pickFirst(overrides?.street, contact?.address, lead?.property_address),
    city: pickFirst(overrides?.city, contact?.city, lead?.city),
    state: pickFirst(overrides?.state, contact?.state, lead?.state),
    zip: pickFirst(overrides?.zip, contact?.zip),
  };
}

/** Pure helper — build the four snapshot fields ready for the
 *  invoices INSERT. */
export function buildInvoiceCustomerSnapshot(sources: SnapshotSources): InvoiceCustomerSnapshot {
  const { overrides, contact, lead, job } = sources;
  return {
    customer_email: pickFirst(
      overrides?.customer_email,
      contact?.email,
      lead?.email,
      job?.client_email,
    ),
    customer_name: pickFirst(
      overrides?.customer_name,
      contact?.name,
      lead?.name,
      job?.client_name,
    ),
    customer_phone: pickFirst(
      overrides?.customer_phone,
      contact?.phone,
      lead?.phone,
      job?.client_phone,
    ),
    billing_address: mergeBillingAddress(overrides?.billing_address ?? null, contact, lead),
  };
}

/** Pure helper — is the snapshot good enough to send a receipt to?
 *  An invoice with no email + no name + no address is a paper-only
 *  invoice; the office must hand-deliver it. The portal blocks
 *  receipt sends when this returns false. */
export function snapshotIsReceiptReady(snapshot: InvoiceCustomerSnapshot): boolean {
  return cleanField(snapshot.customer_email) !== null;
}

/** Pure helper — defaults to use when the office creates a draft
 *  invoice with NO sources at all yet (rare; happens when invoice is
 *  created before the lead is linked). */
export function emptyInvoiceCustomerSnapshot(): InvoiceCustomerSnapshot {
  return {
    customer_email: null,
    customer_name: null,
    customer_phone: null,
    billing_address: { ...EMPTY_ADDRESS },
  };
}

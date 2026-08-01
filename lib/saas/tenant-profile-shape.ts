// lib/saas/tenant-profile-shape.ts — what a firm's identity IS, with nothing that can only run on a
// server (audit §3c.3, item 8h).
//
// Split out of `tenant-profile.ts` for one mechanical reason: that module imports the Supabase service
// client, and the client-side hook (`use-tenant-profile.ts`) needs the same type, the same blank, and
// the same derivations. Importing the server module from a client one would drag the service-role
// client into a browser bundle. So the pure half lives here and both sides import it.
//
// Everything in this file is a pure function of its arguments. No I/O, no environment.

export interface TenantProfile {
  orgId: string | null;
  /** Display name — invoices, emails, plat title blocks. */
  name: string;
  /** The email domain that means "this firm's own staff", or null when the firm does not use one.
   *  Null is a real answer: a firm whose crews use personal addresses has no such domain, and the
   *  code that consumes this must treat "no domain" as "nobody is internal by email", never as
   *  "everybody is". Staff status itself is membership — see lib/saas/internal-user.ts. */
  emailDomain: string | null;
  /** Where a customer replies. */
  contactEmail: string;
  /** Where a customer complains. Falls back to contactEmail rather than inventing `support@`. */
  supportEmail: string;
  /** As a human reads it — "(936) 662-0077". Null when unset. */
  phone: string | null;
  /** As a `tel:` link wants it — "+19366620077". Derived, never stored twice. */
  phoneE164: string | null;
  /** Two-letter state. Surveying is licensed per state, so this is not cosmetic. */
  state: string;
  /** Street line of the office — where a customer posts a cheque. */
  addressLine1: string;
  /** City, state and postal code as one line. */
  addressLine2: string;
  website: string;
  brandColor: string | null;
  logoUrl: string | null;
}

/** What an unresolved tenant looks like.
 *
 *  Blank on purpose. §3c.1 item 3 is explicit: *"Starr Surveying is tenant #1 in the same database,
 *  not a special case in the code."* A code-level default of Starr's name is exactly that special
 *  case, and its failure mode is the expensive one — a second firm whose org row is missing a field
 *  silently sends invoices signed by a competitor. A blank is visible in one glance; the wrong firm's
 *  name is not visible at all. */
export const EMPTY_PROFILE: TenantProfile = {
  orgId: null,
  name: '',
  emailDomain: null,
  contactEmail: '',
  supportEmail: '',
  phone: null,
  phoneE164: null,
  state: '',
  addressLine1: '',
  addressLine2: '',
  website: '',
  brandColor: null,
  logoUrl: null,
};

/** "(936) 662-0077" → "+19366620077". Returns null when there are not enough digits to dial, because
 *  a half-formed `tel:` link is a button that fails silently when tapped. */
export function toE164(phone: string | null | undefined, country = '1'): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) return `+${country}${digits}`;
  if (digits.length === 11 && digits.startsWith(country)) return `+${digits}`;
  return null;
}

export interface OrgRow {
  id: string;
  name: string | null;
  state: string | null;
  phone: string | null;
  logo_url: string | null;
  brand_color: string | null;
  domain_restriction: string | null;
  address_line1: string | null;
  address_line2: string | null;
  website: string | null;
  primary_admin_email: string | null;
  billing_contact_email: string | null;
}

export function profileFromRow(row: OrgRow | null | undefined): TenantProfile {
  if (!row) return EMPTY_PROFILE;
  const contact = row.billing_contact_email ?? row.primary_admin_email ?? '';
  return {
    orgId: row.id,
    name: row.name ?? '',
    // Stored with or without the leading '@' depending on who typed it; normalised here so callers
    // can do one comparison instead of each guessing.
    emailDomain: row.domain_restriction ? row.domain_restriction.replace(/^@/, '').toLowerCase() : null,
    contactEmail: contact,
    supportEmail: contact,
    phone: row.phone,
    phoneE164: toE164(row.phone),
    state: row.state ?? '',
    addressLine1: row.address_line1 ?? '',
    addressLine2: row.address_line2 ?? '',
    website: row.website ?? '',
    brandColor: row.brand_color,
    logoUrl: row.logo_url,
  };
}

/** Is this address one of the firm's own?
 *
 *  **A firm with no configured domain has no internal users by this test**, which is the safe
 *  direction: treating "no domain configured" as "everyone is internal" would hand a brand-new firm's
 *  whole staff list to whoever signed up first. Note this is only ONE of the two ways to be staff —
 *  membership is the other and the primary one. See lib/saas/internal-user.ts. */
export function isInternalEmail(email: string | null | undefined, profile: TenantProfile): boolean {
  if (!email || !profile.emailDomain) return false;
  return email.toLowerCase().endsWith(`@${profile.emailDomain}`);
}

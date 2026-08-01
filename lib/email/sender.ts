// lib/email/sender.ts — who an outbound email is FROM, per tenant (audit §3c.3, item 8h).
//
// Six routes hard-coded `from: 'Starr Surveying <info@starr-surveying.com>'`. That is two different
// facts jammed into one string, and they have very different constraints:
//
//   · the DISPLAY NAME is the firm's, always. A customer of a second firm must never see
//     another firm's name in their inbox.
//   · the ENVELOPE ADDRESS cannot be, at least not for free. Resend (and every other provider) only
//     sends from a domain the account has verified with DNS. A tenant's own address requires that
//     tenant to complete a domain verification, which is an onboarding step, not a settings field.
//
// Getting this backwards is the trap: naively substituting the tenant's contact address into `from:`
// makes every email fail to send — or worse, silently land in spam via a failed SPF/DKIM check, which
// looks like "the customer never replied" rather than "the mail never arrived".
//
// So: **name from the tenant, address from a verified sender, reply-to at the tenant.** A customer who
// hits Reply reaches the firm; the transport stays valid. When a firm has verified its own domain
// (`organizations.sending_domain`, a later slice), the address follows the name — the shape below
// already allows it without another rewrite.

import type { TenantProfile } from '@/lib/saas/tenant-profile-shape';

/** The platform's verified sending address. Overridable per deployment; the fallback is a literal so
 *  a missing env var produces a working send rather than an empty `from:` header that every provider
 *  rejects with a 422 the caller reports as "email failed" with no cause. */
const VERIFIED_SENDER = process.env.OUTBOUND_EMAIL_ADDRESS ?? 'info@starr-surveying.com';
const VERIFIED_NOREPLY = process.env.OUTBOUND_NOREPLY_ADDRESS ?? 'noreply@starr-surveying.com';

export interface OutboundIdentity {
  /** Ready for Resend's `from:` — `"Firm Name <verified@sender>"`. */
  from: string;
  /** Where a reply goes: the firm's own contact address when it has one. */
  replyTo: string;
}

/** The From/Reply-To pair for mail sent on a firm's behalf.
 *
 *  `noreply` picks the no-reply envelope for machine mail (notifications, alerts) where a reply has
 *  nowhere useful to land — the reply-to still points at the firm, because a customer who replies
 *  anyway should reach a human rather than a black hole. */
export function outboundIdentity(profile: TenantProfile, opts: { noreply?: boolean } = {}): OutboundIdentity {
  const address = opts.noreply ? VERIFIED_NOREPLY : VERIFIED_SENDER;
  // A firm with no name yet renders as the bare address rather than "undefined <…>". Blank is the
  // deliberate unresolved value (see EMPTY_PROFILE) and it must degrade to something sendable.
  const from = profile.name ? `${sanitiseDisplayName(profile.name)} <${address}>` : address;
  return { from, replyTo: profile.contactEmail || address };
}

/** Strip what would break the header. A firm name containing `<`, `>`, a quote or a newline would let
 *  a tenant-set value forge additional headers — the classic email-header injection — and every one of
 *  these characters is meaningless in a display name anyway. */
function sanitiseDisplayName(name: string): string {
  return name.replace(/[<>"\r\n]/g, '').trim();
}

// lib/payments/firm.ts — which firm is sending this money document (audit §3c.3, item 8h).
//
// The email builders take `firm` as a required input. This is where callers get one.
//
// ── THE ORG COMES FROM THE ROW, NOT FROM THE SESSION ─────────────────────────────────────────────
//
// Two of the four callers are **public** routes: `/api/public/invoice/[number]/attempt` and
// `/receipt`. A customer paying an invoice has no session, so there is no `activeOrgId` to read —
// and reaching for one would resolve null and send a nameless email. The invoice row itself carries
// `org_id` (seed 513/517), and that is the authoritative answer to "whose invoice is this" in both
// the public and the admin case. So every caller passes the row's org, session or not.
//
// A blank name is deliberate when the org cannot be resolved: see `EMPTY_PROFILE`'s header. It is
// visible at a glance in a test render, where the wrong firm's name is not visible at all.

import { getTenantProfile } from '@/lib/saas/tenant-profile';
import type { FirmIdentity } from './invoice-email';

/** The sending firm for a document belonging to `orgId`. */
export async function firmForOrg(orgId: string | null | undefined): Promise<FirmIdentity> {
  const profile = await getTenantProfile(orgId);
  return { name: profile.name, phone: profile.phone, phoneE164: profile.phoneE164 };
}

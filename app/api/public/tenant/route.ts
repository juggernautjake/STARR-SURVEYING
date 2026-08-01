// app/api/public/tenant/route.ts — which firm a PUBLIC page is showing (audit §3c.3, item 8h).
//
// The pay portal (`/pay`, `/pay/[invoice]`) is the one customer-facing surface inside the app, and it
// spelled out one firm's name and phone number nine times. A customer of a second firm would have been
// asked to "call Starr Surveying" about their own invoice.
//
// There is no session here — a customer paying an invoice is not signed in — so the tenant has to be
// resolved from the request itself. Three sources, most specific first:
//
//   1. `?invoice=<number>` — the invoice row carries `org_id`. Unambiguous, and the only one that is
//      right when several firms share a deployment on one hostname.
//   2. The request's **Host**, matched against `organizations.custom_domain`. This is how a firm on
//      its own domain gets its own portal, and the column already exists.
//   3. The sole organisation, when there is exactly one. True for this deployment today.
//
// **There is no fourth step.** With two or more orgs, no custom-domain match and no invoice, this
// returns a blank profile rather than picking one. Guessing here means showing a customer another
// firm's branding on a page asking them for money.
//
// Only the fields a public page may show: name, phone, address, website. Not the email domain (an
// internal-membership fact), not the billing contact.
import { NextRequest, NextResponse } from 'next/server';
import { supabaseUnscoped } from '@/lib/supabase';
import { getTenantProfile } from '@/lib/saas/tenant-profile';
import { EMPTY_PROFILE } from '@/lib/saas/tenant-profile-shape';
import { withErrorHandler } from '@/lib/apiErrorHandler';

export interface PublicFirm {
  name: string;
  phone: string | null;
  phoneE164: string | null;
  addressLine1: string;
  addressLine2: string;
  website: string;
  logoUrl: string | null;
  brandColor: string | null;
}

async function resolveOrgId(req: NextRequest): Promise<string | null> {
  const url = new URL(req.url);

  const invoiceNumber = url.searchParams.get('invoice');
  if (invoiceNumber) {
    // Matched on `public_slug` OR `invoice_number` because the portal links use the slug and a
    // customer reading off a paper invoice has the number. Both are public identifiers already.
    const { data } = await supabaseUnscoped
      .from('customer_invoices')
      .select('org_id')
      .or(`public_slug.eq.${invoiceNumber},invoice_number.eq.${invoiceNumber}`)
      .maybeSingle();
    const orgId = (data as { org_id: string | null } | null)?.org_id ?? null;
    if (orgId) return orgId;
  }

  const host = (req.headers.get('host') ?? '').split(':')[0].toLowerCase();
  if (host) {
    const { data } = await supabaseUnscoped
      .from('organizations')
      .select('id')
      .eq('custom_domain', host)
      .eq('custom_domain_verified', true)
      .maybeSingle();
    const orgId = (data as { id: string } | null)?.id ?? null;
    if (orgId) return orgId;
  }

  // The sole org. `limit(2)` rather than `limit(1)` on purpose: it is the difference between "there
  // is one firm" and "here is the first of several", and only the first is an answer.
  const { data: orgs } = await supabaseUnscoped.from('organizations').select('id').limit(2);
  const rows = (orgs ?? []) as Array<{ id: string }>;
  return rows.length === 1 ? rows[0].id : null;
}

export const GET = withErrorHandler(async (req: NextRequest) => {
  const orgId = await resolveOrgId(req);
  const p = orgId ? await getTenantProfile(orgId) : EMPTY_PROFILE;
  const firm: PublicFirm = {
    name: p.name,
    phone: p.phone,
    phoneE164: p.phoneE164,
    addressLine1: p.addressLine1,
    addressLine2: p.addressLine2,
    website: p.website,
    logoUrl: p.logoUrl,
    brandColor: p.brandColor,
  };
  return NextResponse.json({ firm }, { headers: { 'Cache-Control': 'public, max-age=300' } });
});

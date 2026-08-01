// app/api/public/portal/[token]/route.ts — a customer's own job (audit §3, Phase 2 item 10).
//
//   GET → { job, phase, deliverables, invoices, changeOrders, firm }
//
// No session. The token is the authorisation, and it grants exactly ONE job (seed 524).
//
// ── EVERY BRANCH HERE IS ABOUT WHAT NOT TO SEND ────────────────────────────────────────────────
//
// This is the widest disclosure surface in the application: an unauthenticated request that returns
// job data. The audit's §3b rule for search applies with more force here — *"results are assembled by
// the service role across tables whose own pages gate access individually. Every hit must be filtered
// by the same rules its own surface would apply."*
//
// So every projection is an ALLOW-LIST. Not `select('*')` with fields deleted afterwards: the next
// column somebody adds to `jobs` — a margin, an internal note, a crew's phone number — must be
// private by default, and it only is if the query names what it wants.
import { NextRequest, NextResponse } from 'next/server';
import { supabaseUnscoped } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { getTenantProfile } from '@/lib/saas/tenant-profile';

const db = supabaseUnscoped;

export interface PortalPhase {
  label: string;
  note: string | null;
  progressPct: number;
}

/** Resolve the token to a live grant, or null. */
async function resolveGrant(token: string) {
  const { data, error } = await db
    .from('customer_portal_access')
    .select('id, job_id, org_id, issued_to_name, issued_to_email, expires_at, revoked_at, view_count')
    .eq('token', token)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const grant = data as { id: string; job_id: string; org_id: string | null; issued_to_name: string | null; issued_to_email: string | null; expires_at: string | null; revoked_at: string | null; view_count: number } | null;
  if (!grant) return null;
  if (grant.revoked_at) return null;
  if (grant.expires_at && Date.parse(grant.expires_at) < Date.now()) return null;
  return grant;
}

export const GET = withErrorHandler(async (req: NextRequest) => {
  const token = decodeURIComponent(new URL(req.url).pathname.split('/').filter(Boolean).pop() ?? '');
  if (!token) return NextResponse.json({ error: 'Not found.' }, { status: 404 });

  const grant = await resolveGrant(token);
  // One 404 for missing, revoked and expired. Distinguishing them tells someone probing which
  // guesses were close.
  if (!grant) return NextResponse.json({ error: 'This link is no longer valid. Please contact us for a new one.' }, { status: 404 });

  const [job, phaseRows, deliverables, invoices, changeOrders] = await Promise.all([
    db.from('jobs')
      // Allow-list. No `quote_amount`, no `final_amount`, no `notes`, no `lead_rpls_email`, no
      // `instructions` — the last two are internal crew direction and would be read as promises.
      .select('id, job_number, name, address, city, state, zip, survey_type, acreage, stage, stage_changed_at, date_accepted, date_fieldwork_complete, date_delivered, deadline')
      .eq('id', grant.job_id)
      .maybeSingle(),
    db.from('portal_stage_labels').select('stage, customer_label, customer_note, progress_pct, is_visible').eq('org_id', grant.org_id ?? '00000000-0000-0000-0000-000000000000'),
    db.from('deliverables')
      // Only what has actually been issued. A draft plat is not a document the customer has, and
      // showing it invites a call asking for it.
      .select('id, name, kind, revision, state, file_url, issued_at, sealed_at')
      .eq('job_id', grant.job_id)
      .in('state', ['issued', 'final'])
      .order('issued_at', { ascending: false }),
    db.from('customer_invoices')
      .select('id, invoice_number, public_slug, total_cents, status, issued_at, due_at, paid_at')
      .eq('job_id', grant.job_id)
      .not('status', 'in', '("draft","voided")')
      .order('issued_at', { ascending: false }),
    db.from('change_orders')
      // Sent and decided ones only. A draft change order is an internal thought, and a customer
      // seeing a price they have not been quoted is a phone call at best.
      .select('id, number, description, amount_cents, days_added, status, requested_at, decided_at, public_token')
      .eq('job_id', grant.job_id)
      .in('status', ['sent', 'approved', 'declined'])
      .order('number'),
  ]);

  const jobRow = job.data as { stage: string | null } & Record<string, unknown> | null;
  if (!jobRow) return NextResponse.json({ error: 'This job is no longer available.' }, { status: 404 });

  // Unmapped stages fail CLOSED — an internal stage name reaching a customer is the thing this table
  // exists to prevent, and "on_hold" is explicitly marked invisible rather than omitted, so the
  // difference between "we chose not to say" and "we forgot to map it" stays visible to the firm.
  const labels = (phaseRows.data ?? []) as Array<{ stage: string; customer_label: string; customer_note: string | null; progress_pct: number; is_visible: boolean }>;
  const match = labels.find((l) => l.stage === jobRow.stage);
  const phase: PortalPhase | null = match && match.is_visible
    ? { label: match.customer_label, note: match.customer_note, progressPct: match.progress_pct }
    : null;

  const firm = await getTenantProfile(grant.org_id);

  // Seen. Fire-and-forget: a failed counter must never stop a customer reading their own job, and
  // awaiting it would put a write on the critical path of every page view.
  void db.from('customer_portal_access').update({
    first_seen_at: grant.view_count === 0 ? new Date().toISOString() : undefined,
    last_seen_at: new Date().toISOString(),
    view_count: grant.view_count + 1,
  }).eq('id', grant.id);

  return NextResponse.json({
    job: jobRow,
    // Null means "we are not saying right now", which the page renders as a neutral message rather
    // than leaking `on_hold`.
    phase,
    issuedTo: { name: grant.issued_to_name, email: grant.issued_to_email },
    deliverables: deliverables.data ?? [],
    invoices: invoices.data ?? [],
    changeOrders: changeOrders.data ?? [],
    firm: {
      name: firm.name, phone: firm.phone, phoneE164: firm.phoneE164, email: firm.contactEmail,
      addressLine1: firm.addressLine1, addressLine2: firm.addressLine2, logoUrl: firm.logoUrl, website: firm.website,
    },
  }, { headers: { 'Cache-Control': 'no-store' } });
});

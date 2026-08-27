// app/api/admin/leads/[id]/enrichment/route.ts — background on a lead, before the callback. §I3.1
//
// GET → { status, signals, briefing, subject }
//
// ── ADMIN-ONLY, AND ON DEMAND ───────────────────────────────────────────────────────────────────
//
// Two deliberate choices, both about not doing this automatically:
//
// **It is gated to admins**, not merely to a signed-in employee. This returns unverified web results
// about a named person or business; that is ordinary commercial diligence for whoever is deciding
// how to price and staff a job, and it is not something to spray across every account.
//
// **It runs when asked, not on intake.** Enriching every submission would spend a search on the spam
// and the tyre-kickers alongside the real enquiries, and would put a third-party API on the critical
// path of saving a customer's quote request — which must never fail for a reason like this. Somebody
// opening a lead is the signal that the lookup is worth doing.
//
// ── WHAT THIS DELIBERATELY DOES NOT DO ──────────────────────────────────────────────────────────
//
// It does not write to the lead, and it is not wired into `ai-draft.ts`. Search results are
// unverified by construction, and this firm's product is a licensed professional's assurance — so
// nothing here may reach a customer-facing reply, directly or by being quoted into a draft. The
// output is for a person to read, click through, and judge.

import { NextRequest, NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { enrichLead, enrichmentBriefing } from '@/lib/leads/enrichment';

/** Path is /api/admin/leads/{id}/enrichment — `withErrorHandler` passes only the request, so the id
 *  comes off the path, the same way the sibling `attribution` and `timeline` routes do it. */
function leadIdFromPath(req: NextRequest): string | null {
  const segments = new URL(req.url).pathname.split('/').filter(Boolean);
  const idIdx = segments.indexOf('enrichment') - 1;
  return idIdx >= 0 ? segments[idIdx] : null;
}

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isAdmin(session.user.roles)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const id = leadIdFromPath(req);
  if (!id) return NextResponse.json({ error: 'Lead id missing from path.' }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from('leads')
    .select('name, company, property_address, city, survey_type, notes')
    .eq('id', id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'Lead not found.' }, { status: 404 });

  const row = data as Record<string, string | null>;

  const enrichment = await enrichLead({
    name: row.name,
    company: row.company,
    propertyAddress: row.property_address,
    city: row.city,
    serviceType: row.survey_type,
    projectDetails: row.notes,
  });

  return NextResponse.json({
    // The client must branch on this rather than on `signals.length`. An empty list means four
    // different things, and only one of them is "we looked and this is an ordinary enquiry".
    status: enrichment.status,
    signals: enrichment.signals,
    briefing: enrichmentBriefing(enrichment),
    subject: enrichment.subject,
  });
}, { routeName: 'admin/leads/[id]/enrichment' });

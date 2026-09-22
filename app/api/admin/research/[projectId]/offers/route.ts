// app/api/admin/research/[projectId]/offers/route.ts — what the run found and did not buy.
//
// Owner, 2026-09-21: "This way we only download and post the free files, but we make the
// purchasable files available to be purchased individually if the researcher wants to do that."
//
// GET lists them. The buying lives in `./purchase`, deliberately separated: a list that is read on
// every page load and an action that spends money should not be the same endpoint with a verb
// switch, because the day somebody adds a `method` parameter to a fetch is the day a page refresh
// buys a deed.
//
// ── WHY NOT THE ANALYZE ROUTE ───────────────────────────────────────────────────────────────────
//
// `analyze` already selects deferred purchases and returns `deferredPurchases`. That field has
// never been read by anything: `useRunState.ts` parses `paidDocumentsNotice` from the same response
// and drops the rest. It is also the wrong home — analyze is a heavyweight summary that the run
// view calls while a run is in flight, and an offer list needs to refresh on its own after a
// purchase without re-running an analysis.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { toOffer, sortOffers, offersTotalUsd, offersHeadline, LISTABLE_STATUSES, type OfferRow } from '@/lib/research/offers';

export const dynamic = 'force-dynamic';

function extractProjectId(req: NextRequest): string | null {
  const parts = req.nextUrl.pathname.split('/research/')[1]?.split('/');
  return parts?.[0] || null;
}

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const projectId = extractProjectId(req);
  if (!projectId) return NextResponse.json({ error: 'Project ID required' }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from('research_document_purchases')
    .select('id, instrument_raw, document_type, platform_id, cost_usd, pages, vendor_ref, preview_path, offered_at, failure_reason, county_fips, status')
    .eq('research_project_id', projectId)
    // All three "found it, did not buy it" statuses — see LISTABLE_STATUSES for why they are one
    // list. A run that hit its ceiling used to show nothing at all here.
    .in('status', [...LISTABLE_STATUSES])
    .order('offered_at', { ascending: false, nullsFirst: false })
    .limit(200);

  if (error) {
    return NextResponse.json({ error: 'Could not read the offers', details: error.message }, { status: 500 });
  }

  // An offer row that has been bought is DELETED, not marked — the completed row written by the
  // ledger is the record of what happened, and seed 531's uniqueness index would refuse a second
  // completed row for the same document anyway. So "still on offer" is exactly "still here".
  const rows = (data ?? []) as unknown as OfferRow[];
  const offers = sortOffers(rows.map(toOffer));

  return NextResponse.json({
    projectId,
    offers,
    totalUsd: offersTotalUsd(offers),
    headline: offersHeadline(offers),
  });
});

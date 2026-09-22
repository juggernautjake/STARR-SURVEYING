// app/api/admin/research/[projectId]/offers/purchase/route.ts — the purchase button.
//
// Owner, 2026-09-21: "if the researcher clicks the purchase button, the worker will go and purchase
// the document, download it, and add it to the list of viewable documents."
//
// ── WHY THIS IS ITS OWN ROUTE AND NOT A POST ON ../offers ───────────────────────────────────────
//
// The list is read on every page load. This spends money. Sharing one endpoint between them means
// the difference is a `method` string in a fetch call, and the day somebody adds a retry or a
// prefetch to the list, a page view buys a deed. Two files cannot make that mistake.
//
// ── WHAT THIS ROUTE DOES NOT DO ─────────────────────────────────────────────────────────────────
//
// It does not decide what anything costs, and it does not pass a price, a vendor reference or a
// ceiling to the worker. It passes an id. The worker reads the row for itself — see the handler's
// own note on why. Everything this route knows came from the browser, and the browser is not
// allowed to name a price.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { isBuyable, offerLabel, type OfferRow } from '@/lib/research/offers';

export const dynamic = 'force-dynamic';
/** A browser purchase opens a real browser on the worker, logs in, and pays. Well over the default. */
export const maxDuration = 300;

const WORKER_URL = process.env.WORKER_URL || '';
const WORKER_API_KEY = process.env.WORKER_API_KEY || '';

function extractProjectId(req: NextRequest): string | null {
  const parts = req.nextUrl.pathname.split('/research/')[1]?.split('/');
  return parts?.[0] || null;
}

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const projectId = extractProjectId(req);
  if (!projectId) return NextResponse.json({ error: 'Project ID required' }, { status: 400 });

  const body = (await req.json().catch(() => ({}))) as { offerId?: string };
  const offerId = (body.offerId ?? '').trim();
  if (!offerId) return NextResponse.json({ error: 'offerId is required' }, { status: 400 });

  if (!WORKER_URL || !WORKER_API_KEY) {
    return NextResponse.json({ error: 'The worker is not configured, so nothing can be bought from here.' }, { status: 503 });
  }

  // Read the row here too — not to send it on, but to refuse early and in words. A person who
  // clicks a row we cannot buy should be told that in the same second, not after a browser session
  // has been opened on the worker and torn down again.
  const { data, error } = await supabaseAdmin
    .from('research_document_purchases')
    .select('id, instrument_raw, document_type, platform_id, cost_usd, vendor_ref, preview_path, offered_at, failure_reason, county_fips, status')
    .eq('id', offerId)
    .eq('research_project_id', projectId)
    .maybeSingle();

  if (error) return NextResponse.json({ error: 'Could not read that offer', details: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'That offer is no longer listed. It may already have been bought.' }, { status: 404 });

  const row = data as unknown as OfferRow & { status: string };
  if (row.status !== 'offered') {
    return NextResponse.json({ error: 'That document is not on offer any more.' }, { status: 409 });
  }
  if (!isBuyable(row)) {
    return NextResponse.json({
      error: `${offerLabel(row)} has to be bought on the vendor site — we do not hold the vendor’s own id for it, so buying it automatically could fetch the wrong document.`,
    }, { status: 422 });
  }

  let workerRes: Response;
  try {
    workerRes = await fetch(`${WORKER_URL}/research/offer-purchase`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${WORKER_API_KEY}` },
      body: JSON.stringify({ projectId, offerId }),
    });
  } catch (e) {
    // The worker may well have bought it and died on the way back. Say so rather than inviting a
    // second click: TexasFile charges per purchase, and "try again" is the wrong advice here.
    return NextResponse.json({
      error: 'The worker could not be reached. If the charge went through, the document will appear '
        + 'in the documents list shortly — check there before buying it again.',
      details: e instanceof Error ? e.message : String(e),
    }, { status: 504 });
  }

  const result = (await workerRes.json().catch(() => ({}))) as { ok?: boolean; message?: string; error?: string; mismatched?: boolean; instrument?: string; pages?: number; costUsd?: number };

  if (!workerRes.ok || result.ok === false) {
    return NextResponse.json(
      { error: result.error ?? result.message ?? `The purchase did not go through (HTTP ${workerRes.status}).` },
      { status: workerRes.status === 200 ? 502 : workerRes.status },
    );
  }

  return NextResponse.json({
    ok: true,
    message: result.message ?? 'Bought. It is in the documents list.',
    mismatched: result.mismatched ?? false,
    instrument: result.instrument ?? null,
    pages: result.pages ?? null,
    costUsd: result.costUsd ?? null,
  });
});

// app/api/admin/marketing/people/route.ts — the people behind the numbers. A7.
//
// GET ?from=&to=  → the leads in range, each with what we actually know about how they arrived.
//
// Owner: *"we need to be able to review the unique customer info for a given click, conversion,
// and/or form submission."* The dashboard reports counts; this is how you get from a count to a
// person.
//
// ── PII, AND THE GATE IS THE POINT ──────────────────────────────────────────────────────────────
//
// Names, emails, phone numbers and the ad that caught each person. Three deliberate choices:
//
//   · admin only, the same gate as the money pages — checked here, in the route, because the API is
//     the real boundary and a page-level check is a suggestion;
//   · nothing is logged. Not the rows, not the count, not a "fetched N leads for X" line. A log is
//     a copy of this data in a place with different retention and different access;
//   · no caching header, and it is a dynamic route by construction. A cached response to an admin
//     request is a response that can be served to the next request.
//
// ── IT RETURNS WHAT IS KNOWN, INCLUDING "NOTHING" ───────────────────────────────────────────────
//
// Leads with no click id are INCLUDED, marked anonymous. Filtering them out would make the list
// agree with the traceable count and quietly hide the people the business cannot explain — which
// are exactly the ones worth looking at.

import { NextRequest, NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { describeLeadIdentity, summariseIdentities } from '@/lib/leads/identity';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Enough for any period a person reads on one screen; the page paginates by narrowing the range. */
const MAX_ROWS = 500;

export const dynamic = 'force-dynamic';

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isAdmin(session.user.roles)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const url = new URL(req.url);
  const toParam = url.searchParams.get('to');
  const fromParam = url.searchParams.get('from');
  const to = toParam && DATE_RE.test(toParam) ? toParam : new Date().toISOString().slice(0, 10);
  const from = fromParam && DATE_RE.test(fromParam)
    ? fromParam
    : new Date(Date.parse(`${to}T00:00:00Z`) - 30 * 86_400_000).toISOString().slice(0, 10);

  const { data, error } = await supabaseAdmin
    .from('leads')
    .select('id, name, email, phone, source, how_heard, gclid, gbraid, wbraid, '
      + 'utm_source, utm_medium, utm_campaign, utm_term, utm_content, landing_page, referrer, created_at')
    .gte('created_at', `${from}T00:00:00.000Z`)
    .lte('created_at', `${to}T23:59:59.999Z`)
    .order('created_at', { ascending: false })
    .limit(MAX_ROWS);

  // The message, not the rows. A Postgres error can echo the filter values back, and those are
  // dates here — but the habit is what keeps PII out of logs when the filter is an email.
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = (data ?? []) as Array<Parameters<typeof describeLeadIdentity>[0] & { created_at: string }>;
  const people = rows.map((r) => ({ ...describeLeadIdentity(r), createdAt: r.created_at }));

  return NextResponse.json({
    range: { from, to },
    summary: summariseIdentities(people),
    calls: await callAttribution(from, to),
    people,
    // Surfaced rather than silently truncating: a list that stops at 500 and does not say so reads
    // as "that is everybody".
    truncated: rows.length === MAX_ROWS,
  });
}, { routeName: 'admin/marketing/people' });

/**
 * Phone calls in the same period, and how many can be tied to the website or an ad.
 *
 * Owner, 2026-10-06: one business number, no call-tracking numbers. A call is tied to a visit when the
 * visitor tapped the number on the site shortly before it rang (lib/receptionist/call-source.ts), so
 * this counts the taps, the calls matched to one, and the matched calls that began with a Google ad
 * click. Robocalls and blocked calls are left out of "calls" — they are not enquiries.
 */
async function callAttribution(from: string, to: string): Promise<{
  calls: number; taps: number; matched: number; fromAds: number; likely: number;
}> {
  const lo = `${from}T00:00:00.000Z`;
  const hi = `${to}T23:59:59.999Z`;
  const [calls, taps] = await Promise.all([
    supabaseAdmin.from('phone_calls').select('caller_verdict, answered_by, source, tap_id')
      .eq('is_test', false).gte('started_at', lo).lte('started_at', hi).limit(5000),
    supabaseAdmin.from('phone_taps').select('match_confidence, call_id')
      .gte('tapped_at', lo).lte('tapped_at', hi).limit(5000),
  ]);
  const real = ((calls.data ?? []) as Array<{ caller_verdict: string | null; answered_by: string | null; source: string | null; tap_id: string | null }>)
    .filter((c) => c.answered_by !== 'blocked' && c.caller_verdict !== 'robocall' && c.caller_verdict !== 'blocked');
  const tapRows = (taps.data ?? []) as Array<{ match_confidence: string | null; call_id: string | null }>;
  return {
    calls: real.length,
    taps: tapRows.length,
    matched: real.filter((c) => c.tap_id).length,
    fromAds: real.filter((c) => c.source === 'google_ads').length,
    likely: tapRows.filter((t) => t.call_id && t.match_confidence === 'likely').length,
  };
}

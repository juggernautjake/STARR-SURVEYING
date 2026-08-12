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
    people,
    // Surfaced rather than silently truncating: a list that stops at 500 and does not say so reads
    // as "that is everybody".
    truncated: rows.length === MAX_ROWS,
  });
}, { routeName: 'admin/marketing/people' });

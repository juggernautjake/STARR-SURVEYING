// app/api/admin/field-live/route.ts — what has come in from the field, both ways (audit §3d, 8p).
//
//   GET                 → the newest arrivals across every job.
//   GET ?jobId=…        → the same, for one job.
//   GET ?since=<iso>    → additionally reports how many of them are newer than the caller's cursor.
//
// Two tables, one answer. `field_data_points` is the phone — §3d step 4, the only path with no vendor
// cloud in the loop and therefore the only one that is literally live. `instrument_points` is the
// collector — §3d steps 1–3, which arrives on a sync or an import. The merge, the ordering and the
// what-do-we-tell-the-reader decisions all live in `lib/field-live/feed.ts` so they are testable
// without a database; this handler fetches and joins names.
//
// ── THE CURSOR IS A SERVER TIMESTAMP THE CLIENT WAS GIVEN ───────────────────────────────────────
//
// `?since=` must be a `received_at` the client read from a previous response, never `new Date()` in
// the browser. A laptop an hour behind would otherwise ask for an hour of history on every poll and
// announce all of it as new. The client is handed `cursor` in each response for exactly this, and
// the parameter is validated as a parseable instant rather than trusted.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { supabaseAdmin } from '@/lib/supabase';
import {
  countSince,
  feedPromise,
  instrumentToFeedItem,
  mergeFieldFeed,
  phoneToFeedItem,
  summariseFreshness,
  type InstrumentPointRow,
  type PhonePointRow,
} from '@/lib/field-live/feed';

/** Per source. The merge takes the newest LIMIT of the union, so each side is fetched at the same
 *  depth — fetching fewer from one side would make a quiet day on that source look like an absent
 *  one after the merge trimmed it. */
const LIMIT = 60;

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  const sp = new URL(req.url).searchParams;
  const jobId = sp.get('jobId');
  const sinceRaw = sp.get('since');
  const since = sinceRaw && Number.isFinite(Date.parse(sinceRaw)) ? sinceRaw : null;

  let phoneQ = supabaseAdmin
    .from('field_data_points')
    .select('id, job_id, name, description, code_category, device_lat, device_lon, device_accuracy_m, created_at, received_at')
    .order('received_at', { ascending: false })
    .limit(LIMIT);
  if (jobId) phoneQ = phoneQ.eq('job_id', jobId);

  let instQ = supabaseAdmin
    .from('instrument_points')
    .select('id, job_id, point_name, code, description, northing, easting, elevation, unit, measured_at, received_at, batch_id')
    .order('received_at', { ascending: false })
    .limit(LIMIT);
  if (jobId) instQ = instQ.eq('job_id', jobId);

  const [phoneRes, instRes] = await Promise.all([phoneQ, instQ]);

  // One source failing is reported as a partial read, not rendered as a quiet half-feed. "No points
  // from the collector today" and "the collector table could not be read" look identical on screen
  // and mean opposite things — the §1.1b defect, which this repo has shipped five times.
  const degraded: string[] = [];
  if (phoneRes.error) degraded.push(`Phone captures could not be read: ${phoneRes.error.message}`);
  if (instRes.error) degraded.push(`Collector arrivals could not be read: ${instRes.error.message}`);
  if (phoneRes.error && instRes.error) {
    return NextResponse.json({ error: 'The field feed could not be read.', degraded }, { status: 500 });
  }

  const phoneRows = (phoneRes.data ?? []) as PhonePointRow[];
  const instRows = (instRes.data ?? []) as InstrumentPointRow[];

  // Job names in one round trip rather than a join per source — the two tables reference `jobs`
  // differently and a PostgREST embed on each would return two shapes to reconcile.
  const jobIds = [...new Set([...phoneRows, ...instRows].map((r) => r.job_id).filter((v): v is string => !!v))];
  const jobLabel = new Map<string, string>();
  if (jobIds.length > 0) {
    const { data: jobs } = await supabaseAdmin.from('jobs').select('id, job_number, name').in('id', jobIds);
    for (const j of (jobs ?? []) as Array<{ id: string; job_number: string | null; name: string | null }>) {
      jobLabel.set(j.id, [j.job_number, j.name].filter(Boolean).join(' · ') || j.id.slice(0, 8));
    }
  }

  const items = mergeFieldFeed(
    phoneRows.map((r) => phoneToFeedItem(r, r.job_id ? jobLabel.get(r.job_id) : null)),
    instRows.map((r) => instrumentToFeedItem(r, r.job_id ? jobLabel.get(r.job_id) : null)),
    LIMIT,
  );

  const freshness = summariseFreshness(items, new Date());

  return NextResponse.json(
    {
      items,
      freshness,
      promise: feedPromise(freshness),
      newSince: countSince(items, since),
      // The next poll's cursor, issued by the server so the client never has to invent one.
      cursor: items[0]?.receivedAt ?? since ?? null,
      degraded,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
});

// app/api/admin/field-data/route.ts — Admin viewer for mobile-captured
// field data (data points + photos).
//
// Closes the F3 plan item: "Office reviewer sees points + photos in
// web app." Mobile writes via PowerSync into `field_data_points` and
// `field_media`; this endpoint surfaces them to the bookkeeper /
// dispatcher / office side.
//
// GET /api/admin/field-data?job_id=&user_id=&from=&to=&limit=&offset=
//   - Returns a list of data points (one row each), enriched with:
//       * job_name, job_number — from `jobs`
//       * created_by_email / _name — from auth.users
//       * media_count + thumbnail_url — first media row's signed URL
//         (so the table can show a small thumb without a per-row
//         GET to /field-data/[id]).
//
// All filters are optional; bounded `limit` (max 200) + `offset` for
// paging. Sorted captured DESC so the latest finds bubble up.
//
// Auth: admin / developer / tech_support (matches /admin/team +
// /admin/mileage).
import { NextRequest, NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';

// ── Constants ────────────────────────────────────────────────────────────────

const PHOTO_BUCKET = 'starr-field-photos';
const SIGNED_URL_TTL_SEC = 60 * 60; // 1 hour
const MAX_LIMIT = 200;
const DEFAULT_LIMIT = 50;

// ── Types ────────────────────────────────────────────────────────────────────

interface DataPointRow {
  id: string;
  job_id: string;
  name: string;
  code_category: string | null;
  description: string | null;
  device_lat: number | null;
  device_lon: number | null;
  device_altitude_m: number | null;
  device_accuracy_m: number | null;
  device_compass_heading: number | null;
  is_offset: boolean | null;
  is_correction: boolean | null;
  corrects_point_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string | null;
}

interface MediaRow {
  id: string;
  data_point_id: string | null;
  job_id: string;
  media_type: string;
  storage_url: string | null;
  thumbnail_url: string | null;
  upload_state: string | null;
  captured_at: string | null;
}

export interface AdminFieldDataPointRow extends DataPointRow {
  job_name: string | null;
  job_number: string | null;
  created_by_email: string | null;
  created_by_name: string | null;
  /** Number of `field_media` rows attached to this point (any
   *  upload_state). Helps the bookkeeper spot points missing photos. */
  media_count: number;
  /** Signed URL of the first attached media's thumbnail (or storage_url
   *  when thumbnail_url is null). null when no media. 1-hour TTL. */
  thumb_signed_url: string | null;
}

// ── Handler ──────────────────────────────────────────────────────────────────

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userRoles = (session.user as { roles?: string[] } | undefined)
    ?.roles ?? [];
  if (!isAdmin(session.user.roles) && !userRoles.includes('tech_support')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const jobId = searchParams.get('job_id');
  const userId = searchParams.get('user_id'); // auth.users.id
  const userEmail = searchParams.get('user_email'); // bookkeeper-friendly
  const from = searchParams.get('from'); // YYYY-MM-DD
  const to = searchParams.get('to'); // YYYY-MM-DD
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, parseInt(searchParams.get('limit') || String(DEFAULT_LIMIT)))
  );
  const offset = Math.max(0, parseInt(searchParams.get('offset') || '0'));

  // Resolve email → user_id when only email was provided. Field data
  // is keyed on auth.users.id (not email like time logs), so we have
  // to resolve before querying.
  let resolvedUserId: string | null = userId;
  if (!resolvedUserId && userEmail) {
    const { data: userRow, error: userErr } = await supabaseAdmin
      .from('registered_users')
      .select('id')
      .eq('email', userEmail.toLowerCase().trim())
      .maybeSingle();
    if (userErr) {
      return NextResponse.json({ error: userErr.message }, { status: 500 });
    }
    if (!userRow) {
      // No matching user → empty result rather than error.
      return NextResponse.json({ points: [], total: 0 });
    }
    resolvedUserId = (userRow as { id: string }).id;
  }

  let query = supabaseAdmin
    .from('field_data_points')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (jobId) query = query.eq('job_id', jobId);
  if (resolvedUserId) query = query.eq('created_by', resolvedUserId);
  if (from) query = query.gte('created_at', `${from}T00:00:00Z`);
  if (to) query = query.lte('created_at', `${to}T23:59:59Z`);

  const { data: pointsRaw, error: pointsErr, count } = await query;
  if (pointsErr) {
    return NextResponse.json({ error: pointsErr.message }, { status: 500 });
  }
  const points = (pointsRaw ?? []) as DataPointRow[];

  if (points.length === 0) {
    return NextResponse.json({ points: [], total: count ?? 0 });
  }

  // Bulk-look-up the join data once per request rather than per row.
  const jobIds = [...new Set(points.map((p) => p.job_id).filter(Boolean))];
  const userIds = [
    ...new Set(points.map((p) => p.created_by).filter(Boolean) as string[]),
  ];
  const pointIds = points.map((p) => p.id);

  const [jobsRes, usersRes, mediaRes] = await Promise.all([
    jobIds.length
      ? supabaseAdmin
          .from('jobs')
          .select('id, name, job_number')
          .in('id', jobIds)
      : Promise.resolve({ data: [], error: null }),
    userIds.length
      ? supabaseAdmin
          .from('registered_users')
          .select('id, email, name')
          .in('id', userIds)
      : Promise.resolve({ data: [], error: null }),
    supabaseAdmin
      .from('field_media')
      .select(
        'id, data_point_id, job_id, media_type, storage_url, thumbnail_url, upload_state, captured_at'
      )
      .in('data_point_id', pointIds)
      .order('position', { ascending: true })
      .order('captured_at', { ascending: true }),
  ]);

  if (jobsRes.error) {
    return NextResponse.json(
      { error: jobsRes.error.message },
      { status: 500 }
    );
  }
  if (usersRes.error) {
    return NextResponse.json(
      { error: usersRes.error.message },
      { status: 500 }
    );
  }
  if (mediaRes.error) {
    return NextResponse.json(
      { error: mediaRes.error.message },
      { status: 500 }
    );
  }

  const jobsById = new Map(
    ((jobsRes.data ?? []) as Array<{
      id: string;
      name: string;
      job_number: string;
    }>).map((j) => [j.id, j])
  );
  const usersById = new Map(
    ((usersRes.data ?? []) as Array<{
      id: string;
      email: string;
      name: string;
    }>).map((u) => [u.id, u])
  );
  // Group media by point_id; pick the first row's thumbnail/storage URL
  // for the table thumb.
  const mediaByPoint = new Map<string, MediaRow[]>();
  for (const m of (mediaRes.data ?? []) as MediaRow[]) {
    if (!m.data_point_id) continue;
    const arr = mediaByPoint.get(m.data_point_id) ?? [];
    arr.push(m);
    mediaByPoint.set(m.data_point_id, arr);
  }

  // Sign the first thumbnail per point in parallel. Failures are
  // non-fatal — the row renders with a "no thumb" placeholder.
  let signFailures = 0;
  const annotated: AdminFieldDataPointRow[] = await Promise.all(
    points.map(async (p) => {
      const job = jobsById.get(p.job_id) ?? null;
      const user = p.created_by ? usersById.get(p.created_by) : null;
      const mediaRows = mediaByPoint.get(p.id) ?? [];
      const first = mediaRows[0];
      let thumbUrl: string | null = null;
      const thumbPath = first?.thumbnail_url ?? first?.storage_url ?? null;
      if (thumbPath) {
        const { data: signed, error: signErr } = await supabaseAdmin.storage
          .from(PHOTO_BUCKET)
          .createSignedUrl(thumbPath, SIGNED_URL_TTL_SEC);
        if (signErr) {
          if (signFailures < 3) {
            console.warn('[admin/field-data] thumb sign failed', {
              path: thumbPath,
              error: signErr.message,
            });
            signFailures += 1;
          }
        } else {
          thumbUrl = signed?.signedUrl ?? null;
        }
      }
      return {
        ...p,
        job_name: job?.name ?? null,
        job_number: job?.job_number ?? null,
        created_by_email: user?.email ?? null,
        created_by_name: user?.name ?? null,
        media_count: mediaRows.length,
        thumb_signed_url: thumbUrl,
      };
    })
  );

  return NextResponse.json({
    points: annotated,
    total: count ?? annotated.length,
    limit,
    offset,
  });
}, { routeName: 'admin/field-data' });

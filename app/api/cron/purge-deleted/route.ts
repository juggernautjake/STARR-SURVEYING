// app/api/cron/purge-deleted/route.ts
//
// GET /api/cron/purge-deleted
//
// job-soft-delete plan Slice 3 — daily purge that enforces the 30-day
// recovery window. Hard-deletes `jobs` + `cad_drawings` rows whose
// `deleted_at` is older than `purgeCutoffIso(now)` (30 days). Until a
// row crosses that line it stays recoverable from the respective "🗑
// Deleted" view; after it, this cron removes it for good.
//
// FK audit (2026-05-30): every table referencing jobs(id) /
// cad_drawings(id) is ON DELETE CASCADE or ON DELETE SET NULL, so the
// hard delete cascades cleanly — no blocking child rows. The delete is
// still best-effort (a failure leaves the row in the trash, which is
// safe) and reports counts.
//
// Auth: `Authorization: Bearer <CRON_SECRET>` (same as the other crons;
// Vercel attaches it automatically). Register in vercel.json.

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { purgeCutoffIso } from '@/lib/jobs/soft-delete';

export const GET = withErrorHandler(async (req: NextRequest) => {
  const authHeader = req.headers.get('authorization') ?? '';
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    console.error('[cron/purge-deleted] CRON_SECRET not set');
    return NextResponse.json({ error: 'CRON_SECRET not configured.' }, { status: 500 });
  }
  if (authHeader !== `Bearer ${expected}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const cutoff = purgeCutoffIso(Date.now());

  // Hard-delete each entity past the recovery window. `.select('id')`
  // on a delete returns the removed rows so we can report a count.
  const { data: jobs, error: jobsErr } = await supabaseAdmin
    .from('jobs')
    .delete()
    .not('deleted_at', 'is', null)
    .lt('deleted_at', cutoff)
    .select('id');

  const { data: drawings, error: drawingsErr } = await supabaseAdmin
    .from('cad_drawings')
    .delete()
    .not('deleted_at', 'is', null)
    .lt('deleted_at', cutoff)
    .select('id');

  if (jobsErr) console.error('[cron/purge-deleted] jobs purge failed', jobsErr);
  if (drawingsErr) console.error('[cron/purge-deleted] drawings purge failed', drawingsErr);

  return NextResponse.json({
    cutoff,
    purged: {
      jobs: jobs?.length ?? 0,
      drawings: drawings?.length ?? 0,
    },
    errors: {
      jobs: jobsErr?.message ?? null,
      drawings: drawingsErr?.message ?? null,
    },
  });
}, { routeName: 'cron/purge-deleted' });

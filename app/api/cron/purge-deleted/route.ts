// app/api/cron/purge-deleted/route.ts
//
// GET /api/cron/purge-deleted
//
// job-soft-delete plan Slice 3 — daily purge that enforces the 30-day
// recovery window. Hard-deletes `jobs` + `cad_drawings` rows whose
// `deleted_at` is older than `purgeCutoffIso(now)` (30 days). Until a
// row crosses that line it stays recoverable from the respective "🗑
// Deleted" view; after it, this cron removes it for good. Since 2026-09-27 it also empties the
// File Explorer bin (`file_nodes.deleted_at`) on the same 30-day line, storage objects included.
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
import { purge, type DeletedNode } from '@/lib/files/recycle';
import { recordFileEvents } from '@/lib/files/audit-log';

/** File Explorer nodes purged per run. The cron is daily; a backlog drains over a few days rather
 *  than one run trying to remove thousands of storage objects inside a function time limit. */
const FILE_PURGE_BATCH = 500;

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

  // ── File Explorer bin (2026-09-27) ────────────────────────────────────────────────────────────
  // Deleted files and folders stay in the bin (restorable, "Recently deleted") for the same 30 days,
  // then go for good: objects first, then rows (lib/files/recycle.ts `purge`, the same call as the
  // bin's own "Delete forever"). A whole folder deleted in one act shares one timestamp, so it
  // crosses the line together. The history entry is written BEFORE the rows go.
  const { data: oldNodes, error: nodesErr } = await supabaseAdmin
    .from('file_nodes')
    .select('id, parent_id, node_type, name, owner_email, mime_type, size_bytes, storage_bucket, storage_path, deleted_at, created_by')
    .not('deleted_at', 'is', null)
    .lt('deleted_at', cutoff)
    .limit(FILE_PURGE_BATCH);
  let filesPurged = 0;
  let filesErr: string | null = nodesErr?.message ?? null;
  const expired = (oldNodes ?? []) as unknown as DeletedNode[];
  if (expired.length > 0) {
    await recordFileEvents('file_purged', expired.map((n) => n.id), 'system:purge-deleted', { reason: 'bin_retention_30_days', cutoff });
    const res = await purge(expired);
    if (res.ok) filesPurged = expired.length;
    else filesErr = res.error ?? 'purge failed';
  }
  if (filesErr) console.error('[cron/purge-deleted] file bin purge failed', filesErr);

  if (jobsErr) console.error('[cron/purge-deleted] jobs purge failed', jobsErr);
  if (drawingsErr) console.error('[cron/purge-deleted] drawings purge failed', drawingsErr);

  return NextResponse.json({
    cutoff,
    purged: {
      jobs: jobs?.length ?? 0,
      drawings: drawings?.length ?? 0,
      files: filesPurged,
    },
    errors: {
      jobs: jobsErr?.message ?? null,
      drawings: drawingsErr?.message ?? null,
      files: filesErr,
    },
  });
}, { routeName: 'cron/purge-deleted' });

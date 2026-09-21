// app/api/cron/field-sync/route.ts — the scheduler the streaming feature never had.
//
// GET /api/cron/field-sync
// Auth: `Authorization: Bearer <CRON_SECRET>`, the same as every other tick here.
//
// Owner, 2026-09-20: "if we have a specific job opened up on a tsc5 and are shooting points, then
// is it possible to stream those points … so that they then show up in our backend … Then could we
// have it where the interactive map point layer gets automatically updated?"
//
// ── WHAT WAS ACTUALLY MISSING ───────────────────────────────────────────────────────────────────
//
// Almost nothing, which is the surprise. `lib/field-ingest/trimble-connect.ts` has been a complete
// cursor-based poller since August — it advances the high-water mark only after points are saved,
// overlaps each poll by two minutes, and records the outcome on `instrument_sources`. The parsers
// behind it handle LandXML, GSI, RW5, JobXML and CSV with an idempotent content hash.
//
// It has never once run. There was no cron entry calling it, so `runSourcePoll` had zero production
// callers and the whole path existed as tested code nobody had ever executed. This file is the
// caller.
//
// ── TWO HALVES, AND THE SECOND ONE IS USEFUL ON ITS OWN ─────────────────────────────────────────
//
//   1. POLL — ask each enabled source what has changed. Needs Trimble credentials, which are an
//      owner purchase (a paid Business licence, a corporate-domain Trimble ID, and keys from
//      Trimble's request form), so this half is skipped cleanly when they are absent.
//
//   2. BRIDGE — put whatever is in `instrument_points` onto the map. This needs NO credentials at
//      all. Points dragged in through the collector upload on the field data tab go through the
//      same table, so the bridge is what makes that path finish the journey to the map.
//
// Running the bridge even when the poll is skipped is the difference between "this feature works
// once you buy a subscription" and "this feature works, and a subscription makes it automatic".
//
// ── FREQUENCY ───────────────────────────────────────────────────────────────────────────────────
//
// Every 5 minutes, matching `instrument_sources.poll_seconds` (default 300) and Trimble Access's
// own cadence — their documentation says Access "checks for changes made to the project data in
// Trimble Connect every 5 minutes". Going faster would not make points arrive sooner: the limit is
// when the crew's controller syncs, not when we ask.

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { bridgeJobToMap, jobsWithCollectorPoints } from '@/lib/field-ingest/to-map';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

interface SourceRow {
  id: string;
  name: string;
  kind: string;
  enabled: boolean | null;
  config: Record<string, unknown> | null;
  sync_cursor: string | null;
}

export const GET = withErrorHandler(async (req: NextRequest) => {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    console.error('[cron/field-sync] CRON_SECRET not set');
    return NextResponse.json({ error: 'CRON_SECRET not configured.' }, { status: 500 });
  }
  if ((req.headers.get('authorization') ?? '') !== `Bearer ${expected}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const started = Date.now();
  const polled: Array<{ source: string; result: string }> = [];
  const bridged: Array<{ jobId: string; added: number; moved: number; skipped: number; blocked: string | null }> = [];

  // ── 1 · POLL ─────────────────────────────────────────────────────────────────────────────────
  //
  // Skipped without a token, and SAID rather than silently passed over. "No credentials" and "no
  // new points" look identical in a log that does not distinguish them, and one of those is a
  // thing the owner can fix.
  const hasTrimble = Boolean(process.env.TRIMBLE_CONNECT_TOKEN);

  if (hasTrimble) {
    const { data: sourceRows } = await supabaseAdmin
      .from('instrument_sources')
      .select('id, name, kind, enabled, config, sync_cursor')
      .eq('kind', 'trimble_connect')
      .neq('enabled', false);

    const sources = (sourceRows ?? []) as SourceRow[];

    // Imported here rather than at module load: `createTrimbleConnectClient` throws
    // `TrimbleConnectNotConfigured` by design, and a cron that cannot poll must still run the
    // bridge below.
    const { createTrimbleConnectClient, runSourcePoll } = await import('@/lib/field-ingest/trimble-connect');

    for (const s of sources) {
      try {
        // One client per source rather than one for the run: a source in another Connect region
        // needs a different base URL, and reusing a client across them would quietly poll the
        // wrong host.
        const client = createTrimbleConnectClient();
        const out = await runSourcePoll(client, {
          id: s.id,
          config: (s.config ?? {}) as { projectId?: string; jobId?: string | null; extensions?: string[] },
          sync_cursor: s.sync_cursor ?? null,
        });
        const failed = 'error' in out ? out.error : null;
        polled.push({ source: s.name, result: failed ? `error: ${failed}` : 'ok' });
      } catch (e) {
        // One broken source must not stop the others, or the bridge.
        polled.push({ source: s.name, result: `error: ${e instanceof Error ? e.message : String(e)}` });
      }
    }
  }

  // ── 2 · BRIDGE ───────────────────────────────────────────────────────────────────────────────
  //
  // Every job that has collector points, whether they arrived by poll or by somebody dragging a
  // file onto the field data tab. Idempotent, so running it every five minutes over a job that has
  // not changed writes nothing.
  const jobIds = await jobsWithCollectorPoints();

  for (const jobId of jobIds) {
    try {
      const r = await bridgeJobToMap(jobId, 'cron/field-sync');
      // Only worth a line when something happened or something is stuck. A quiet job every five
      // minutes for a month is how a log becomes unreadable.
      if (r.added || r.moved || r.blocked || r.skipped.length) {
        bridged.push({ jobId, added: r.added, moved: r.moved, skipped: r.skipped.length, blocked: r.blocked });
      }
    } catch (e) {
      bridged.push({ jobId, added: 0, moved: 0, skipped: 0, blocked: e instanceof Error ? e.message : String(e) });
    }
  }

  const added = bridged.reduce((n, b) => n + b.added, 0);
  const moved = bridged.reduce((n, b) => n + b.moved, 0);
  const ms = Date.now() - started;

  console.log(
    `[cron/field-sync] ${hasTrimble ? `${polled.length} source(s) polled` : 'no Trimble credentials — poll skipped'}; ` +
    `${jobIds.length} job(s) checked, ${added} point(s) added, ${moved} moved (${ms}ms)`,
  );

  return NextResponse.json({
    ok: true,
    ms,
    trimble: hasTrimble
      ? { configured: true, polled }
      : {
        configured: false,
        // The exact three things, so this answers "why is nothing arriving?" without a code read.
        needs: [
          'a paid Trimble Connect Business licence — a personal/free subscription cannot use the API',
          'a Trimble ID on a corporate domain, not a free email provider',
          'OAuth credentials from Trimble’s Request for API Credentials form, as TRIMBLE_CONNECT_TOKEN',
        ],
      },
    bridge: { jobsChecked: jobIds.length, added, moved, detail: bridged },
  });
}, { routeName: 'cron/field-sync' });

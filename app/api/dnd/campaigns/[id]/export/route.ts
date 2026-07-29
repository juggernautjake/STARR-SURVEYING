// app/api/dnd/campaigns/[id]/export/route.ts — download a whole campaign as JSON (P9-2, audit H-2).
//
// The counterpart to P2-5's delete. That slice made deleting deliberate — archive by default, `?hard=1`
// plus a confirmation naming what it destroys — but it could not make it SAFE, because there was no way
// to keep what was about to go. A dialog listing eight things you are about to lose forever is a better
// warning, not a safety net.
//
// DM only, and specifically THIS campaign's DM: the document contains the whole chat log, every roll, the
// invite list and the roster.
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getDndSession, getCampaignRole } from '@/lib/dnd/auth';
import { enforceRateLimit } from '@/lib/dnd/rate-limit';
import {
  CAMPAIGN_EXPORT_TABLES, buildCampaignExport, campaignExportToJson, campaignExportFileBase,
} from '@/lib/dnd/export/campaign-export';

export const runtime = 'nodejs';

/** Read every row of one table for this campaign, by whichever link the manifest declares.
 *
 *  Returns [] rather than throwing when a table is missing: several of these arrive with later seeds, and
 *  an export that 500s because the soundboard was never migrated is useless in exactly the situation it
 *  exists for. Every empty result is still counted and reported, so a thin backup is visibly thin. */
async function readTable(
  entry: (typeof CAMPAIGN_EXPORT_TABLES)[number],
  ids: { campaignId: string; sessionIds: string[]; encounterIds: string[] },
): Promise<unknown[]> {
  try {
    let q = supabaseAdmin.from(entry.table).select('*');
    if (entry.link.via === 'campaign') {
      q = q.eq('campaign_id', ids.campaignId);
    } else if (entry.link.via === 'session') {
      if (!ids.sessionIds.length) return [];
      q = q.in(entry.link.column, ids.sessionIds);
    } else {
      if (!ids.encounterIds.length) return [];
      q = q.in(entry.link.column, ids.encounterIds);
    }
    const { data, error } = await q;
    if (error) return [];
    return data ?? [];
  } catch {
    return [];
  }
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = getDndSession();
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  if ((await getCampaignRole(params.id)) !== 'dm') {
    return NextResponse.json({ error: 'Only the DM can export this campaign.' }, { status: 403 });
  }
  // Reads every row of a dozen tables, so it is throttled like a write rather than like a page view.
  const limited = await enforceRateLimit('write', session.userId);
  if (limited) return limited;

  const { data: campaign, error } = await supabaseAdmin
    .from('dnd_campaigns').select('*').eq('id', params.id).maybeSingle();
  if (error || !campaign) return NextResponse.json({ error: 'Campaign not found.' }, { status: 404 });

  // Sessions and encounters are fetched FIRST because the manifest's indirect links resolve through them.
  const { data: sessionRows } = await supabaseAdmin
    .from('dnd_sessions').select('id').eq('campaign_id', params.id);
  const sessionIds = ((sessionRows ?? []) as { id: string }[]).map((r) => r.id);

  let encounterIds: string[] = [];
  if (sessionIds.length) {
    const { data: encRows } = await supabaseAdmin
      .from('dnd_encounters').select('id').in('session_id', sessionIds);
    encounterIds = ((encRows ?? []) as { id: string }[]).map((r) => r.id);
  }

  const ids = { campaignId: params.id, sessionIds, encounterIds };
  const tables: Record<string, unknown[]> = {};
  // Sequential rather than Promise.all: this is a rare, DM-initiated download of a dozen tables, and a
  // burst of parallel queries against the pool is a worse trade than a second of wall-clock.
  for (const entry of CAMPAIGN_EXPORT_TABLES) {
    tables[entry.key] = await readTable(entry, ids);
  }

  const doc = buildCampaignExport({
    campaign: campaign as Record<string, unknown>,
    tables,
    exportedAt: new Date().toISOString(),
  });

  const base = campaignExportFileBase(String((campaign as { name?: unknown }).name ?? 'campaign'));
  return new NextResponse(campaignExportToJson(doc), {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="${base}-campaign.json"`,
      'Cache-Control': 'no-store',
    },
  });
}

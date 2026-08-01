// app/api/dnd/campaigns/[id]/map-objects/undo/route.ts — take back the last thing you did (M4-2 · G7).
//
//   POST { nodeId }  → undo the most recent batch on that map
//
// G7: *"Every DM action is undoable. Map authoring is destructive by nature — drag something, lose its
// old position."* A DM mid-session who has just dragged the wrong token off a ledge should not have to
// remember where it was.
//
// ── THE GATE IS THE NODE'S CAMPAIGN, NOT THE URL'S ─────────────────────────────────────────────────
//
// Same rule as every other verb in this directory. Reading the campaign from `[id]` and the node from the
// body would let a DM of their own campaign undo edits on someone else's map by naming its node — and
// undo is the one verb where that is worst, because it un-does work rather than adding something
// obviously wrong that its owner would notice.
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getDndSession, getCampaignRole } from '@/lib/dnd/auth';
import { enforceRateLimit } from '@/lib/dnd/rate-limit';
import { undoLatestBatch } from '@/lib/dnd/maps/journal';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const session = getDndSession();
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  const limited = await enforceRateLimit('write', session.userId);
  if (limited) return limited;

  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  if (typeof body.nodeId !== 'string' || !body.nodeId) {
    return NextResponse.json({ error: 'nodeId is required.' }, { status: 400 });
  }

  const { data: node } = await supabaseAdmin
    .from('dnd_map_nodes').select('id, campaign_id').eq('id', body.nodeId).maybeSingle();
  if (!node) return NextResponse.json({ error: 'No such map node.' }, { status: 404 });
  if ((await getCampaignRole((node as { campaign_id: string }).campaign_id)) !== 'dm') {
    return NextResponse.json({ error: 'Only the DM can undo map changes.' }, { status: 403 });
  }

  const result = await undoLatestBatch(body.nodeId);
  // 200 with `ok: false` rather than a 404: "there is nothing left to undo" is a normal state of a map,
  // not a failed request, and a client that has to tell an error from an empty history will get it wrong.
  return NextResponse.json(result);
}

// app/api/dnd/campaigns/[id]/map-triggers/fire/route.ts — actually set a trigger off (M6-4).
//
//   POST { triggerId }            → fire this one, and whatever it chains to
//   POST { nodeId, event: {...} } → fire everything on that map listening for this event
//
// DM ONLY. A trigger is the machinery behind a puzzle: a player who could fire one could reveal the
// secret door, spawn the ambush early, or damage another character's sheet. Gated against the campaign
// that owns the NODE, never the id in the URL — the same rule every other map verb follows.
//
// ── THE PREVIEW AND THE FIRING RESOLVE THE SAME WAY ────────────────────────────────────────────────
//
// M6-4's board already shows the DM a plan built by `preview()`, and its whole argument is that a preview
// from a parallel code path is a preview of something else. So this route calls the same `resolve` /
// `preview` and hands the result to the executor: what the DM read is what runs.
//
// ── `once` IS DISARMED AFTER A REAL FIRING, NOT AFTER A PREVIEW ────────────────────────────────────
//
// The board's dry run must be repeatable — testing a puzzle is the point — so nothing is disarmed there.
// This route is the live path, so a `once` trigger is marked fired here.
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getDndSession, getCampaignRole } from '@/lib/dnd/auth';
import { enforceRateLimit } from '@/lib/dnd/rate-limit';
import { preview, readTrigger, resolve, type TriggerEvent } from '@/lib/dnd/maps/triggers';
import { describeExecution, executePlan } from '@/lib/dnd/maps/execute';

export const dynamic = 'force-dynamic';

const EVENT_KINDS = new Set([
  'token_enters', 'token_leaves', 'object_discovered', 'check_passed', 'check_failed',
  'turn_starts', 'turn_ends', 'door_opened', 'manual',
]);

export async function POST(req: NextRequest) {
  const session = getDndSession();
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  const limited = await enforceRateLimit('write', session.userId);
  if (limited) return limited;

  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const triggerId = typeof body.triggerId === 'string' ? body.triggerId : null;
  const bodyNodeId = typeof body.nodeId === 'string' ? body.nodeId : null;

  // The NODE decides the campaign, and it is found from the trigger when one is named — so a DM cannot
  // reach another campaign's trigger by naming their own node beside it.
  let nodeId = bodyNodeId;
  if (triggerId) {
    const { data: row } = await supabaseAdmin
      .from('dnd_map_triggers').select('map_node_id').eq('id', triggerId).maybeSingle();
    if (!row) return NextResponse.json({ error: 'No such trigger.' }, { status: 404 });
    nodeId = (row as { map_node_id: string }).map_node_id;
  }
  if (!nodeId) return NextResponse.json({ error: 'triggerId or nodeId is required.' }, { status: 400 });

  const { data: node } = await supabaseAdmin
    .from('dnd_map_nodes').select('id, campaign_id, grid, bounds').eq('id', nodeId).maybeSingle();
  if (!node) return NextResponse.json({ error: 'No such map node.' }, { status: 404 });
  const n = node as { id: string; campaign_id: string; grid: unknown; bounds: unknown };
  if ((await getCampaignRole(n.campaign_id)) !== 'dm') {
    return NextResponse.json({ error: 'Only the DM can fire a trigger.' }, { status: 403 });
  }

  const { data: rows } = await supabaseAdmin
    .from('dnd_map_triggers')
    .select('id, name, fires_when, fires_then, once, armed, fired_at')
    .eq('map_node_id', nodeId);
  const triggers = ((rows ?? []) as Parameters<typeof readTrigger>[0][]).map(readTrigger);

  let plan;
  let firedIds: string[];
  if (triggerId) {
    const target = triggers.find((t) => t.id === triggerId);
    if (!target) return NextResponse.json({ error: 'That trigger is not on this map.' }, { status: 404 });
    // `preview` for the RESOLUTION, deliberately: the DM has explicitly chosen this trigger, and refusing
    // to fire a disarmed one from a "fire it" button would be a control that silently does nothing.
    // Everything it chains to is still walked under the ordinary rules.
    plan = preview(target, triggers);
    firedIds = plan.fired;
  } else {
    const raw = (body.event ?? {}) as Record<string, unknown>;
    const kind = String(raw.kind ?? '');
    if (!EVENT_KINDS.has(kind)) {
      return NextResponse.json({ error: `"${kind}" is not an event this map knows.` }, { status: 400 });
    }
    const event: TriggerEvent = {
      kind: kind as TriggerEvent['kind'],
      targetId: typeof raw.targetId === 'string' ? raw.targetId : null,
      actorId: typeof raw.actorId === 'string' ? raw.actorId : null,
    };
    plan = resolve(event, triggers);
    firedIds = plan.fired;
  }

  const report = await executePlan(plan, {
    campaignId: n.campaign_id,
    nodeId: n.id,
    grid: n.grid,
    bounds: n.bounds,
    actorName: session.displayName,
  });

  // Disarm the `once` triggers that actually fired. AFTER the work, so a run that failed part-way leaves
  // them armed — a puzzle a DM can retry beats one that is spent and did nothing.
  const spent = triggers.filter((t) => t.once && firedIds.includes(t.id)).map((t) => t.id);
  if (spent.length) {
    await supabaseAdmin
      .from('dnd_map_triggers')
      .update({ armed: false, fired_at: new Date().toISOString() })
      .in('id', spent);
  }

  return NextResponse.json({
    ok: true,
    summary: describeExecution(report),
    outcomes: report.outcomes,
    // The engine's own findings travel with the result: a cycle or a dangling reference is the reason
    // half a puzzle did nothing, and it must not be discoverable only on the board the DM already left.
    problems: plan.problems,
    disarmed: spent.length,
  });
}

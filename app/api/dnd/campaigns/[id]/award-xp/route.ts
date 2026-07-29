// app/api/dnd/campaigns/[id]/award-xp/route.ts — award XP to the whole party (P3-4b).
//
// DM-only, and deliberately PLANS before it writes: `planAward` decides what each character's award does —
// including "nothing, because Intuitive Games levels by milestone" — and the writes follow that plan. So the
// response can tell the DM exactly what happened per character rather than reporting a count that quietly
// includes characters nothing was written to.
//
// XP lives in `data.meta.xp`, not a column (P3-4 chose that to avoid a migration), which is why this
// read-modify-writes each row's jsonb rather than issuing one UPDATE.
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getDndSession, getCampaignRole } from '@/lib/dnd/auth';
import { enforceRateLimit } from '@/lib/dnd/rate-limit';
import { planAward, summarizeAward, type AwardTarget } from '@/lib/dnd/xp-award';
import { normalizeXp } from '@/lib/dnd/xp';
import { characterIdsInCampaign } from '@/lib/dnd/characters';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = getDndSession();
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  // DM-only: handing out XP is the DM's call, and a player awarding themselves is the obvious abuse.
  const role = await getCampaignRole(params.id);
  if (role !== 'dm') return NextResponse.json({ error: 'Only the DM can award XP.' }, { status: 403 });

  const limited = await enforceRateLimit('write', session.userId);
  if (limited) return limited;

  const body = await req.json().catch(() => ({}));
  const amount = Math.round(Number(body?.amount) || 0);
  if (!amount) return NextResponse.json({ error: 'Enter how much XP to award.' }, { status: 400 });
  // Bounded so a mistyped amount cannot push a character to level 20 in one keystroke. Negative is allowed
  // — correcting an over-award is a real thing — and `normalizeXp` floors the result at 0.
  if (Math.abs(amount) > 100_000) return NextResponse.json({ error: 'That is more XP than any award should be.' }, { status: 400 });

  // The roster is the JOIN TABLE ∪ the legacy `campaign_id` column, which is why this uses the shared
  // `characterIdsInCampaign` rather than filtering on `campaign_id` directly — that would silently miss
  // every character attached through `dnd_campaign_characters`, i.e. most of them, and the DM would have no
  // way to tell which players were skipped.
  //
  // Player characters only: awarding XP to the DM's NPC roster is never what "award XP to the party" means,
  // and would quietly level every monster in the campaign.
  const charIds = await characterIdsInCampaign(params.id);
  const { data: rows } = charIds.length
    ? await supabaseAdmin
        .from('dnd_characters')
        .select('id, name, system, data, is_npc')
        .in('id', charIds)
        .eq('is_npc', false)
    : { data: [] };

  const characters = (rows ?? []) as { id: string; name: string; system: string | null; data: Record<string, unknown> | null }[];
  if (!characters.length) return NextResponse.json({ error: 'No player characters in this campaign.' }, { status: 400 });

  const targets: AwardTarget[] = characters.map((c) => {
    const meta = (c.data?.meta ?? {}) as { xp?: unknown; level?: unknown };
    return { id: c.id, name: c.name, system: c.system, xp: normalizeXp(meta.xp), level: Number(meta.level) || 1 };
  });

  const plan = planAward(targets, amount);

  // Write only what the plan says to write. A milestone character is not touched at all — not written with
  // an unchanged value, which would bump `updated_at` and imply something happened.
  for (const outcome of plan.outcomes) {
    if (!outcome.applied) continue;
    const row = characters.find((c) => c.id === outcome.id);
    if (!row) continue;
    const data = (row.data ?? {}) as Record<string, unknown>;
    const meta = (data.meta ?? {}) as Record<string, unknown>;
    await supabaseAdmin
      .from('dnd_characters')
      .update({ data: { ...data, meta: { ...meta, xp: outcome.xpAfter } }, updated_at: new Date().toISOString() })
      .eq('id', outcome.id);
  }

  return NextResponse.json({
    ok: true,
    summary: summarizeAward(plan),
    // The per-character detail the UI needs to deep-link anyone who levelled into their level walker.
    outcomes: plan.outcomes,
    levelUps: plan.levelUps.map((o) => ({ id: o.id, name: o.name, level: o.levelAfter })),
  });
}

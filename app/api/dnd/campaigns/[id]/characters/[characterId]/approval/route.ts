// app/api/dnd/campaigns/[id]/characters/[characterId]/approval/route.ts — the DM reviews a character's build
// into their campaign (owner 2026-07-18: "the DM must approve all character builds … or reject it and tell the
// player why and what to fix"). DM-only. POST { status: 'approved' | 'rejected', reason? } writes the approval
// onto the `dnd_campaign_characters` join row (the store the campaign-scope/approval gate reads). A rejection
// should carry a reason; the route requires one so the player always learns what to fix.
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getDndSession, getCampaignRole } from '@/lib/dnd/auth';
import { normalizeApproval, type ApprovalStatus } from '@/lib/dnd/campaign-approval';

export async function POST(req: NextRequest, { params }: { params: { id: string; characterId: string } }) {
  const session = getDndSession();
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  // DM of THIS campaign only — approval is the DM's gate.
  const role = await getCampaignRole(params.id);
  if (role !== 'dm') return NextResponse.json({ error: 'Only the campaign’s DM can review character builds.' }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const status = body?.status as ApprovalStatus;
  if (status !== 'approved' && status !== 'rejected') {
    return NextResponse.json({ error: 'status must be "approved" or "rejected".' }, { status: 400 });
  }
  const reason = typeof body?.reason === 'string' ? body.reason.trim() : '';
  if (status === 'rejected' && !reason) {
    return NextResponse.json({ error: 'A rejection needs a reason so the player knows what to fix.' }, { status: 400 });
  }

  // The character must be on this campaign's roster to be reviewed.
  const { data: rosterRow } = await supabaseAdmin
    .from('dnd_campaign_characters')
    .select('id')
    .eq('campaign_id', params.id)
    .eq('character_id', params.characterId)
    .maybeSingle();
  if (!rosterRow) return NextResponse.json({ error: 'That character is not in this campaign.' }, { status: 404 });

  const approval = normalizeApproval({ status, reason: reason || undefined, reviewedByUserId: session.userId, reviewedAt: new Date().toISOString() });
  const { error } = await supabaseAdmin
    .from('dnd_campaign_characters')
    .update({ approval })
    .eq('campaign_id', params.id)
    .eq('character_id', params.characterId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, approval });
}

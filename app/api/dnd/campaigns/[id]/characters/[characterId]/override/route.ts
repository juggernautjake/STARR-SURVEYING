// app/api/dnd/campaigns/[id]/characters/[characterId]/override/route.ts — the DM's ISOLATED in-campaign edit
// (owner 2026-07-18: "the DM can change a character's info, but only the version of that character inside their
// campaign … the original exists outside the campaign and only its creator edits it … the campaign version is
// isolated to that campaign").
//
//   • POST { data } — the DM stores their edited sheet as this campaign's override. The FIRST write forks the
//     campaign's own copy (a deep snapshot); the ORIGINAL (dnd_characters.data) is never touched. Only the
//     campaign's DM may write — a player's own edits go through the normal character route to the original.
//   • DELETE — discard the campaign override so the campaign shows the live original again.
//
// Storage is seed 451's dnd_campaign_characters.data_override (+ override_updated_at/by). The pure fork/render
// plumbing lives in lib/dnd/campaign-character-copy.ts; who-can-do-what in lib/dnd/character-visibility.ts.
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getDndSession, getCampaignRole } from '@/lib/dnd/auth';
import { forkCampaignCopy, cloneSheetData } from '@/lib/dnd/campaign-character-copy';

async function loadRoster(campaignId: string, characterId: string) {
  const { data } = await supabaseAdmin
    .from('dnd_campaign_characters')
    .select('id, data_override')
    .eq('campaign_id', campaignId)
    .eq('character_id', characterId)
    .maybeSingle();
  return data;
}

export async function POST(req: NextRequest, { params }: { params: { id: string; characterId: string } }) {
  const session = getDndSession();
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  // Only the campaign's DM edits the campaign copy (the isolation rule: players edit their own original elsewhere).
  const role = await getCampaignRole(params.id);
  if (role !== 'dm') return NextResponse.json({ error: 'Only the campaign’s DM can edit the in-campaign copy.' }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const edited = body?.data;
  if (edited == null || typeof edited !== 'object') {
    return NextResponse.json({ error: 'Provide the edited character { data }.' }, { status: 400 });
  }

  const roster = await loadRoster(params.id, params.characterId);
  if (!roster) return NextResponse.json({ error: 'That character is not in this campaign.' }, { status: 404 });

  // Fork on first edit: if no override exists yet this write creates the isolated copy; the original is untouched.
  // (The DM sends the full edited sheet, so `forkCampaignCopy` here documents intent + guards against aliasing.)
  const existing = (roster as { data_override?: unknown }).data_override ?? null;
  forkCampaignCopy(edited, existing as Record<string, unknown> | null); // first-edit semantics; the stored value is `edited`.
  const override = cloneSheetData(edited);

  const { error } = await supabaseAdmin
    .from('dnd_campaign_characters')
    .update({ data_override: override, override_updated_at: new Date().toISOString(), override_updated_by: session.userId })
    .eq('campaign_id', params.id)
    .eq('character_id', params.characterId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, forked: existing == null });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string; characterId: string } }) {
  const session = getDndSession();
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  const role = await getCampaignRole(params.id);
  if (role !== 'dm') return NextResponse.json({ error: 'Only the campaign’s DM can reset the in-campaign copy.' }, { status: 403 });

  const roster = await loadRoster(params.id, params.characterId);
  if (!roster) return NextResponse.json({ error: 'That character is not in this campaign.' }, { status: 404 });

  const { error } = await supabaseAdmin
    .from('dnd_campaign_characters')
    .update({ data_override: null, override_updated_at: null, override_updated_by: null })
    .eq('campaign_id', params.id)
    .eq('character_id', params.characterId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, reset: true });
}

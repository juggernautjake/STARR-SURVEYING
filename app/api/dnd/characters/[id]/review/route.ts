// app/api/dnd/characters/[id]/review/route.ts — the DM approves or rejects a submitted character
// (IG builder Slice 4). DM-gated (must be the DM of the character's campaign). On reject the DM's notes
// are stored and surfaced to the player as a notification (see the notifications feed). Approve/reject
// only apply to a character that has been submitted.
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getDndSession, getCampaignRole } from '@/lib/dnd/auth';
import { getCharacterAccess } from '@/lib/dnd/characters';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = getDndSession();
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  const res = await getCharacterAccess(params.id);
  if (!res.access) return NextResponse.json({ error: res.error }, { status: res.status });
  const { character } = res.access;
  // Only a DM of the character's campaign may approve/reject.
  const isDM = character.campaign_id ? (await getCampaignRole(character.campaign_id)) === 'dm' : false;
  if (!isDM) return NextResponse.json({ error: 'Only the campaign DM can review a character.' }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const decision = String(body?.decision ?? '').toLowerCase();
  if (decision !== 'approve' && decision !== 'reject') {
    return NextResponse.json({ error: 'decision must be "approve" or "reject".' }, { status: 400 });
  }
  const notes = String(body?.notes ?? '').trim() || null;
  if (decision === 'reject' && !notes) {
    return NextResponse.json({ error: 'Please add a note explaining the rejection so the player knows what to change.' }, { status: 400 });
  }

  const status = decision === 'approve' ? 'approved' : 'rejected';
  const { error } = await supabaseAdmin
    .from('dnd_characters')
    .update({ submission_status: status, dm_review_notes: notes, reviewed_at: new Date().toISOString() })
    .eq('id', params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, status, notes });
}

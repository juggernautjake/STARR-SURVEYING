// app/api/dnd/content/[id]/route.ts — single custom-content row (Phase C19).
// GET returns global content or a content row in a campaign the caller belongs to;
// DELETE is allowed for the creator or the campaign DM.
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getDndSession, getCampaignRole } from '@/lib/dnd/auth';

async function loadContent(id: string) {
  const { data } = await supabaseAdmin.from('dnd_content').select('*').eq('id', id).maybeSingle();
  return data;
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = getDndSession();
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  const content = await loadContent(params.id);
  if (!content) return NextResponse.json({ error: 'Content not found.' }, { status: 404 });
  if (content.campaign_id && (await getCampaignRole(content.campaign_id)) === null) {
    return NextResponse.json({ error: 'No access to this content.' }, { status: 403 });
  }
  return NextResponse.json({ content });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = getDndSession();
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  const content = await loadContent(params.id);
  if (!content) return NextResponse.json({ error: 'Content not found.' }, { status: 404 });

  const isCreator = content.created_by === session.userId;
  const isDM = content.campaign_id ? (await getCampaignRole(content.campaign_id)) === 'dm' : false;
  if (!isCreator && !isDM) {
    return NextResponse.json({ error: 'Only the creator or the campaign DM can delete this.' }, { status: 403 });
  }

  const { error } = await supabaseAdmin.from('dnd_content').delete().eq('id', params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

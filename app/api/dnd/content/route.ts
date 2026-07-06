// app/api/dnd/content/route.ts — custom/homebrew content library (Phase C19).
// POST creates a content row; GET lists global content plus (for members) a
// campaign's content. The `data` jsonb holds stats + effects[] consumed by the
// engine converter (engine/content.ts).
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getDndSession, getCampaignRole } from '@/lib/dnd/auth';

const KINDS = ['armor', 'weapon', 'item', 'magic_item', 'feat', 'feature', 'spell', 'ability', 'attack'];

export async function POST(req: NextRequest) {
  const session = getDndSession();
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  try {
    const { campaignId, kind, name, rarity, data, requiresAttunement } = await req.json();
    if (!kind || !KINDS.includes(kind)) return NextResponse.json({ error: 'Invalid content kind.' }, { status: 400 });
    if (!name || !String(name).trim()) return NextResponse.json({ error: 'name is required.' }, { status: 400 });
    // Campaign-scoped content requires membership; omit campaignId for global homebrew.
    if (campaignId && (await getCampaignRole(String(campaignId))) === null) {
      return NextResponse.json({ error: 'Not a member of that campaign.' }, { status: 403 });
    }

    const { data: row, error } = await supabaseAdmin
      .from('dnd_content')
      .insert({
        campaign_id: campaignId ?? null,
        kind,
        name: String(name).trim(),
        rarity: rarity ?? null,
        data: data ?? {},
        requires_attunement: !!requiresAttunement,
        created_by: session.userId,
        is_homebrew: true,
      })
      .select('*')
      .single();
    if (error || !row) return NextResponse.json({ error: error?.message ?? 'Could not create content.' }, { status: 500 });
    return NextResponse.json({ content: row });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Create failed.' }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const session = getDndSession();
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  const campaignId = req.nextUrl.searchParams.get('campaignId');
  let query = supabaseAdmin.from('dnd_content').select('*').order('created_at', { ascending: false });

  if (campaignId && (await getCampaignRole(campaignId)) !== null) {
    // members see the campaign's content + global content
    query = query.or(`campaign_id.eq.${campaignId},campaign_id.is.null`);
  } else {
    query = query.is('campaign_id', null); // global only
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ content: data ?? [] });
}

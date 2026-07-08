// app/api/dnd/characters/[id]/stream/donate/route.ts — superchats & donations (Phase R).
// Throws Kibbles 🐟 into the stream: the DM/owner can fire one from a random or a specific
// handle; a fellow player (campaign member) can donate as themselves once the DM has
// switched donations ON. Each donation posts a highlighted superchat line and adds to the
// streamer's convertible Kibble stash (dnd_stream_state.kibbles_earned).
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getDndSession, getCampaignRole } from '@/lib/dnd/auth';
import { makeUsernames, styleForName } from '@/lib/dnd/stream-names';
import { superTier, CHAT_CURRENCY } from '@/lib/dnd/stream-currency';

async function characterAccess(id: string, userId: string) {
  const { data } = await supabaseAdmin.from('dnd_characters').select('campaign_id, owner_user_id').eq('id', id).maybeSingle();
  const row = data as { campaign_id: string; owner_user_id: string | null } | null;
  if (!row) return null;
  const role = await getCampaignRole(row.campaign_id);
  return { isDM: role === 'dm', isOwner: row.owner_user_id === userId, isMember: role !== null };
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = getDndSession();
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  const access = await characterAccess(params.id, session.userId);
  if (!access) return NextResponse.json({ error: 'Character not found.' }, { status: 404 });
  if (!access.isMember) return NextResponse.json({ error: 'Join the campaign first.' }, { status: 403 });
  const privileged = access.isDM || access.isOwner;

  // Members can only donate when the DM has turned donations on; DM/owner always can.
  const { data: st } = await supabaseAdmin.from('dnd_stream_state').select('donations_enabled').eq('character_id', params.id).maybeSingle();
  const enabled = (st as { donations_enabled?: boolean } | null)?.donations_enabled ?? false;
  if (!privileged && !enabled) return NextResponse.json({ error: 'Donations are turned off.' }, { status: 403 });

  const { amount, username, message, kind } = await req.json().catch(() => ({}));
  const amt = Math.floor(Number(amount) || 0);
  if (amt < 1) return NextResponse.json({ error: 'A positive Kibble amount is required.' }, { status: 400 });
  const cappedAmt = Math.min(amt, 1_000_000_000);
  const evtKind = kind === 'donation' ? 'donation' : 'superchat';

  // Who it's from: a plain member → themselves (party badge); DM/owner → a chosen handle or
  // a random viewer.
  const who = !privileged
    ? { name: String(session.displayName).slice(0, 24), color: '#ffd23f', badges: ['party'], senderId: session.userId as string | null }
    : username
      ? { name: String(username).slice(0, 24), ...styleForName(String(username)), senderId: null as string | null }
      : { ...makeUsernames(1, Math.floor(Math.random() * 100000))[0], senderId: null as string | null };

  const tier = superTier(cappedAmt);
  const body = (message && String(message).trim()) || `donated ${cappedAmt.toLocaleString()} ${CHAT_CURRENCY.name}!`;
  const badges = Array.from(new Set([...who.badges, evtKind === 'superchat' ? 'super' : 'gift']));

  const { data: msg, error } = await supabaseAdmin
    .from('dnd_stream_messages')
    .insert({ character_id: params.id, username: who.name, body: String(body).slice(0, 240), badges, color: tier.color, kind: evtKind, amount: cappedAmt, sender_user_id: who.senderId })
    .select('id, username, body, badges, color, created_at, kind, amount, sender_user_id')
    .single();
  if (error || !msg) return NextResponse.json({ error: error?.message ?? 'Could not send donation.' }, { status: 500 });

  // Add to the streamer's convertible stash (read-modify-write; best-effort).
  const { data: cur } = await supabaseAdmin.from('dnd_stream_state').select('kibbles_earned').eq('character_id', params.id).maybeSingle();
  const earned = Number((cur as { kibbles_earned?: number } | null)?.kibbles_earned ?? 0) + cappedAmt;
  await supabaseAdmin.from('dnd_stream_state').upsert({ character_id: params.id, kibbles_earned: earned }, { onConflict: 'character_id' });

  return NextResponse.json({ message: msg, kibblesEarned: earned, tier: tier.label });
}

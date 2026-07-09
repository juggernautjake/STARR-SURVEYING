// app/api/dnd/characters/[id]/stream/tip/route.ts — a fellow player tips the streamer
// (Phase R). Unlike the DM's free super chats, a party member's tip is funded by THEIR
// character's notes (the base currency): the notes come out of their inventory and land
// on the streamer as NeoNuggets (10,000 NeoNuggets = 1 note). `[id]` is the streamer
// character. GET returns the caller's spendable notes; POST performs the tip.
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getDndSession, getCampaignRole } from '@/lib/dnd/auth';
import { superTier, NUGGETS_PER_NOTE } from '@/lib/dnd/stream-currency';

// The caller's own PC in the streamer's campaign (the character whose notes fund the tip).
async function donorFor(streamerId: string, userId: string) {
  const { data: streamer } = await supabaseAdmin.from('dnd_characters').select('id, campaign_id').eq('id', streamerId).maybeSingle();
  const s = streamer as { id: string; campaign_id: string | null } | null;
  if (!s?.campaign_id) return { campaignId: null, donor: null };
  const role = await getCampaignRole(s.campaign_id);
  if (role === null) return { campaignId: s.campaign_id, donor: null, notMember: true };
  const { data: chars } = await supabaseAdmin
    .from('dnd_characters')
    .select('id, name, data, is_npc')
    .eq('campaign_id', s.campaign_id)
    .eq('owner_user_id', userId)
    .neq('id', streamerId);
  const rows = (chars ?? []) as { id: string; name: string; data: Record<string, unknown> | null; is_npc: boolean }[];
  const donor = rows.find((c) => !c.is_npc) ?? rows[0] ?? null;
  return { campaignId: s.campaign_id, donor };
}

function notesOf(data: Record<string, unknown> | null): number {
  const cur = (data as { currency?: { credits?: number } } | null)?.currency;
  return Math.max(0, Math.floor(Number(cur?.credits ?? 0)));
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = getDndSession();
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  const { donor, notMember } = await donorFor(params.id, session.userId);
  if (notMember) return NextResponse.json({ error: 'No access.' }, { status: 403 });
  if (!donor) return NextResponse.json({ canTip: false, notes: 0 });
  return NextResponse.json({ canTip: true, notes: notesOf(donor.data), donorName: donor.name });
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = getDndSession();
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  const { notes, message } = await req.json().catch(() => ({}));
  const n = Math.floor(Number(notes) || 0);
  if (n < 1) return NextResponse.json({ error: 'Enter at least 1 note.' }, { status: 400 });

  const { donor, notMember } = await donorFor(params.id, session.userId);
  if (notMember) return NextResponse.json({ error: 'Join the campaign to tip.' }, { status: 403 });
  if (!donor) return NextResponse.json({ error: 'You have no character in this campaign to tip from.' }, { status: 400 });

  const bal = notesOf(donor.data);
  if (n > bal) return NextResponse.json({ error: `You only have ${bal} note${bal === 1 ? '' : 's'}.` }, { status: 400 });

  // 1) Take the notes out of the donor's inventory.
  const data = (donor.data ?? {}) as { currency?: Record<string, number> };
  const currency = { ...(data.currency ?? {}) } as Record<string, number>;
  currency.credits = bal - n;
  const { error: dErr } = await supabaseAdmin.from('dnd_characters').update({ data: { ...data, currency }, updated_at: new Date().toISOString() }).eq('id', donor.id);
  if (dErr) return NextResponse.json({ error: dErr.message }, { status: 500 });

  // 2) Credit the streamer with the NeoNuggets (notes × 10,000).
  const nuggets = n * NUGGETS_PER_NOTE;
  const { data: cur } = await supabaseAdmin.from('dnd_stream_state').select('kibbles_earned').eq('character_id', params.id).maybeSingle();
  const earned = Number((cur as { kibbles_earned?: number } | null)?.kibbles_earned ?? 0) + nuggets;
  await supabaseAdmin.from('dnd_stream_state').upsert({ character_id: params.id, kibbles_earned: earned }, { onConflict: 'character_id' });

  // 3) Post a highlighted super chat card in her chat, from the donor character.
  const tier = superTier(nuggets);
  const body = (message && String(message).trim()) || `tipped ${n} note${n === 1 ? '' : 's'}!`;
  const { data: msg, error } = await supabaseAdmin
    .from('dnd_stream_messages')
    .insert({
      character_id: params.id,
      username: String(donor.name).slice(0, 24),
      body: String(body).slice(0, 240),
      badges: Array.from(new Set(['party', 'super'])),
      color: tier.color,
      kind: 'superchat',
      amount: nuggets,
      sender_user_id: session.userId,
    })
    .select('id')
    .single();
  if (error || !msg) return NextResponse.json({ error: error?.message ?? 'Could not post the tip.' }, { status: 500 });

  return NextResponse.json({ ok: true, donorNotesLeft: currency.credits, streamerNuggets: earned });
}

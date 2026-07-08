// app/api/dnd/characters/[id]/stream/convert/route.ts — cash out NeoNuggets (Phase R).
// The DM/owner converts the streamer's earned NeoNuggets 🪙 into notes (the campaign's
// base currency, ≈ $1 each): 10,000 NeoNuggets = 1 note. Whole notes move onto the sheet;
// the leftover NeoNuggets stay in the stash for next time.
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getDndSession, getCampaignRole } from '@/lib/dnd/auth';
import { nuggetsToNotes, nuggetsRemainder, NUGGETS_PER_NOTE } from '@/lib/dnd/stream-currency';

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = getDndSession();
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  const { data: ch } = await supabaseAdmin.from('dnd_characters').select('campaign_id, owner_user_id, data').eq('id', params.id).maybeSingle();
  const row = ch as { campaign_id: string | null; owner_user_id: string | null; data: Record<string, unknown> | null } | null;
  if (!row) return NextResponse.json({ error: 'Character not found.' }, { status: 404 });
  const isDM = row.campaign_id ? (await getCampaignRole(row.campaign_id)) === 'dm' : false;
  if (!isDM && row.owner_user_id !== session.userId) return NextResponse.json({ error: 'Only the DM or owner can convert.' }, { status: 403 });

  const { data: st } = await supabaseAdmin.from('dnd_stream_state').select('kibbles_earned').eq('character_id', params.id).maybeSingle();
  const earned = Number((st as { kibbles_earned?: number } | null)?.kibbles_earned ?? 0);
  const notes = nuggetsToNotes(earned);
  if (notes < 1) return NextResponse.json({ error: `Need at least ${NUGGETS_PER_NOTE.toLocaleString()} NeoNuggets to convert 1 note.` }, { status: 400 });
  const leftover = nuggetsRemainder(earned);

  // Add the notes onto the sheet. Notes are the campaign's base currency, stored on the
  // sheet's `currency.credits` field (labelled "Notes" in the UI). Read-modify-write.
  const data = (row.data ?? {}) as { currency?: { credits?: number } };
  const currency = { ...(data.currency ?? {}) } as Record<string, number>;
  currency.credits = Math.max(0, Math.floor(Number(currency.credits ?? 0))) + notes;
  const nextData = { ...data, currency };

  const { error: dErr } = await supabaseAdmin.from('dnd_characters').update({ data: nextData, updated_at: new Date().toISOString() }).eq('id', params.id);
  if (dErr) return NextResponse.json({ error: dErr.message }, { status: 500 });
  await supabaseAdmin.from('dnd_stream_state').upsert({ character_id: params.id, kibbles_earned: leftover }, { onConflict: 'character_id' });

  return NextResponse.json({ ok: true, notesAdded: notes, nuggetsLeft: leftover, totalNotes: currency.credits });
}

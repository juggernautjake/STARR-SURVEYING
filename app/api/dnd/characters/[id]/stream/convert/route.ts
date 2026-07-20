// app/api/dnd/characters/[id]/stream/convert/route.ts — cash out NeoNuggets (Phase R).
// The DM/owner converts the streamer's earned NeoNuggets 🪙 into notes (the campaign's
// base currency, ≈ $1 each): 10,000 NeoNuggets = 1 note. Whole notes move onto the sheet;
// the leftover NeoNuggets stay in the stash for next time.
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getDndSession, getCampaignRole } from '@/lib/dnd/auth';
import { nuggetsToNotes, nuggetsRemainder, NUGGETS_PER_NOTE } from '@/lib/dnd/stream-currency';
import { readNotes, writeNotes, type Currency } from '@/lib/dnd/currency';

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = getDndSession();
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  const { data: ch } = await supabaseAdmin.from('dnd_characters').select('campaign_id, owner_user_id, data').eq('id', params.id).maybeSingle();
  const row = ch as { campaign_id: string | null; owner_user_id: string | null; data: Record<string, unknown> | null } | null;
  if (!row) return NextResponse.json({ error: 'Character not found.' }, { status: 404 });
  const isDM = row.campaign_id ? (await getCampaignRole(row.campaign_id)) === 'dm' : false;
  if (!isDM && row.owner_user_id !== session.userId) return NextResponse.json({ error: 'Only the DM or owner can convert.' }, { status: 403 });

  const body = await _req.json().catch(() => ({}));
  const data = (row.data ?? {}) as { currency?: { credits?: number }; currencies?: Currency[] };
  const before = readNotes(data.currencies, data.currency?.credits);

  // MANUAL SET — the owner types the number of notes they actually have. Independent of the
  // stash, so a sheet whose notes drifted (or never received an earlier broken conversion) can
  // be corrected without inventing NeoNuggets to convert.
  if (body.setNotes != null) {
    const exact = Math.max(0, Math.floor(Number(body.setNotes) || 0));
    const nextData = applyNotes(data, exact);
    const { error } = await supabaseAdmin.from('dnd_characters').update({ data: nextData, updated_at: new Date().toISOString() }).eq('id', params.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, mode: 'set', notesAdded: exact - before, totalNotes: exact, nuggetsLeft: null });
  }

  const { data: st } = await supabaseAdmin.from('dnd_stream_state').select('kibbles_earned').eq('character_id', params.id).maybeSingle();
  const earned = Number((st as { kibbles_earned?: number } | null)?.kibbles_earned ?? 0);
  const notes = nuggetsToNotes(earned);
  if (notes < 1) return NextResponse.json({ error: `Need at least ${NUGGETS_PER_NOTE.toLocaleString()} NeoNuggets to convert 1 note.` }, { status: 400 });
  // The whole stash is cashed out and the balance returns to zero, so the bar plainly reads
  // "you have been paid" rather than leaving a confusing sub-note remainder sitting there
  // (owner 2026-07-19). `spentRemainder` is reported, never silently swallowed.
  const spentRemainder = nuggetsRemainder(earned);

  // Write the notes WHERE THE SHEET READS THEM. This is the bug: notes went onto the legacy
  // fixed-key `currency.credits`, but a sheet with the flexible `currencies` list renders that
  // list instead — so the payout was invisible and the feature looked broken.
  const total = before + notes;
  const nextData = applyNotes(data, total);

  const { error: dErr } = await supabaseAdmin.from('dnd_characters').update({ data: nextData, updated_at: new Date().toISOString() }).eq('id', params.id);
  if (dErr) return NextResponse.json({ error: dErr.message }, { status: 500 });
  await supabaseAdmin.from('dnd_stream_state').upsert({ character_id: params.id, kibbles_earned: 0 }, { onConflict: 'character_id' });

  return NextResponse.json({ ok: true, mode: 'convert', notesAdded: notes, nuggetsLeft: 0, spentRemainder, totalNotes: total });
}

/** Put an exact note total onto the sheet, in whichever money model it uses. Keeps the legacy
 *  field in step when a flexible list exists, so nothing reading the old shape goes stale. */
function applyNotes(
  data: { currency?: { credits?: number }; currencies?: Currency[] },
  total: number,
): Record<string, unknown> {
  const flexible = writeNotes(data.currencies, total);
  const legacy = { ...(data.currency ?? {}) } as Record<string, number>;
  legacy.credits = total;
  return flexible ? { ...data, currencies: flexible, currency: legacy } : { ...data, currency: legacy };
}

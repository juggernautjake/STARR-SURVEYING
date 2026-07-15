// app/api/dnd/characters/import/route.ts — create a character from an upload (Phase M3).
// Saves the source files + art to the dnd-media bucket + dnd_character_uploads rows,
// stores the notes as a source doc + the style/mechanics text on the character, and
// creates an "under construction" character on the generic sheet owned by the caller.
// The AI ingestion (M4) runs next to populate the sheet from these uploads.
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { supabaseAdmin, ensureStorageBucket } from '@/lib/supabase';
import { getDndSession, getCampaignRole } from '@/lib/dnd/auth';
import { blankCharacter } from '@/app/dnd/_sheet/data/blank';

const BUCKET = 'dnd-media';
const MAX_BYTES = 25 * 1024 * 1024; // 25 MB per file
const ART_MIME = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);

function extFromName(name: string, fallback: string): string {
  const m = /\.([a-z0-9]+)$/i.exec(name || '');
  return (m?.[1] ?? fallback).toLowerCase().slice(0, 8);
}

export async function POST(req: NextRequest) {
  const session = getDndSession();
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  try {
    const form = await req.formData();
    const campaignId = String(form.get('campaignId') ?? '');
    const name = String(form.get('name') ?? '').trim();
    const notes = String(form.get('notes') ?? '').trim();
    const styleNotes = String(form.get('styleNotes') ?? '').trim();
    if (!name) return NextResponse.json({ error: 'A character name is required.' }, { status: 400 });
    // A campaign is OPTIONAL: with one you must be a member (it lands in that campaign); without one the
    // character is a private, personal sheet owned by the caller that they can build fully on its own and
    // attach to a campaign later.
    const hasCampaign = !!campaignId;
    if (hasCampaign && (await getCampaignRole(campaignId)) === null) return NextResponse.json({ error: 'Not a member of this campaign.' }, { status: 403 });

    // 1. Create the under-construction character (generic blank sheet, owned by caller).
    const { data: created, error: cErr } = await supabaseAdmin
      .from('dnd_characters')
      .insert({
        campaign_id: hasCampaign ? campaignId : null,
        owner_user_id: session.userId,
        name,
        sheet_type: 'generic',
        data: blankCharacter(name),
        visibility: hasCampaign ? 'campaign' : 'private',
        under_construction: true,
        style_notes: styleNotes || null,
      })
      .select('id')
      .single();
    if (cErr || !created) return NextResponse.json({ error: cErr?.message ?? 'Could not create character.' }, { status: 500 });
    const characterId = created.id as string;

    // Roster link for the multi-campaign model (Phase S). The player automatically owns
    // the character they just made; this places it in the campaign they built it for (if any).
    if (hasCampaign) {
      try {
        await supabaseAdmin
          .from('dnd_campaign_characters')
          .upsert({ campaign_id: campaignId, character_id: characterId, added_by: session.userId }, { onConflict: 'campaign_id,character_id', ignoreDuplicates: true });
      } catch {
        /* join table not present yet */
      }
    }

    await ensureStorageBucket(BUCKET, { public: true });
    const uploads: { url: string; filename: string; mime: string; kind: string }[] = [];

    const put = async (bytes: Buffer, filename: string, mime: string, kind: 'source' | 'art' | 'reference') => {
      const key = `imports/${characterId}/${crypto.randomUUID()}.${extFromName(filename, kind === 'art' ? 'png' : 'bin')}`;
      const { error } = await supabaseAdmin.storage.from(BUCKET).upload(key, bytes, { contentType: mime || 'application/octet-stream', upsert: true });
      if (error) return;
      const url = supabaseAdmin.storage.from(BUCKET).getPublicUrl(key).data.publicUrl;
      uploads.push({ url, filename, mime: mime || '', kind });
    };

    // 2. Notes saved as a source doc so the AI ingests it like any file.
    if (notes) await put(Buffer.from(notes, 'utf8'), 'player-notes.txt', 'text/plain', 'source');

    // 3. Source files + art.
    for (const f of form.getAll('sources')) {
      if (f instanceof File && f.size > 0 && f.size <= MAX_BYTES) await put(Buffer.from(await f.arrayBuffer()), f.name, f.type, 'source');
    }
    for (const f of form.getAll('art')) {
      if (f instanceof File && f.size > 0 && f.size <= MAX_BYTES && ART_MIME.has(f.type)) await put(Buffer.from(await f.arrayBuffer()), f.name, f.type, 'art');
    }

    // 4. Record the uploads; set the first art as the character token.
    if (uploads.length) {
      await supabaseAdmin.from('dnd_character_uploads').insert(uploads.map((u) => ({ character_id: characterId, url: u.url, filename: u.filename, mime: u.mime, kind: u.kind })));
      const firstArt = uploads.find((u) => u.kind === 'art');
      if (firstArt) await supabaseAdmin.from('dnd_characters').update({ art_url: firstArt.url, token_url: firstArt.url }).eq('id', characterId);
    }

    return NextResponse.json({ characterId, uploadCount: uploads.length });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Import failed.' }, { status: 500 });
  }
}

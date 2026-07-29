// app/api/dnd/characters/import-json/route.ts — restore a character from its own JSON export (P9-1, H-1).
//
// The counterpart to `/api/dnd/characters/[id]/export?format=json`, which has always produced a loss-less
// document that nothing could read back. `/api/dnd/characters/import` is a DIFFERENT route with a
// confusingly similar name: it takes uploads and hands them to a model to interpret. Restoring your own
// perfect backup should not involve a model guessing at it.
//
// Body: { document: <the exported object or its JSON text>, campaignId?: string }
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getDndSession, getCampaignRole } from '@/lib/dnd/auth';
import { enforceRateLimit } from '@/lib/dnd/rate-limit';
import { normalizeCharacter } from '@/app/dnd/_sheet/data/blank';
import { parseCharacterExport, MAX_IMPORT_BYTES } from '@/lib/dnd/export/character-import';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const session = getDndSession();
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  // Same write throttle as the upload import: this creates a row and accepts a multi-megabyte body, so
  // an unthrottled version is a cheap way to fill the table.
  const limited = await enforceRateLimit('write', session.userId);
  if (limited) return limited;

  const body = (await req.json().catch(() => null)) as { document?: unknown; campaignId?: unknown } | null;
  if (!body) return NextResponse.json({ error: 'Send a JSON body with a `document`.' }, { status: 400 });

  const parsed = parseCharacterExport(body.document);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const doc = parsed.value;

  // Size is checked on the SERIALISED document, not on the request body: a caller can send the object
  // directly rather than as text, and the limit has to mean the same thing either way.
  if (JSON.stringify(doc.data).length > MAX_IMPORT_BYTES) {
    return NextResponse.json({ error: 'That character is too large to import.' }, { status: 413 });
  }

  // A campaign is OPTIONAL — the same rule the upload importer uses. Without one the restored character is
  // a private personal sheet the caller can attach to a campaign later, which is what you want when you
  // are restoring a backup and the campaign it belonged to is gone.
  const campaignId = typeof body.campaignId === 'string' && body.campaignId ? body.campaignId : null;
  if (campaignId && (await getCampaignRole(campaignId)) === null) {
    return NextResponse.json({ error: 'Not a member of this campaign.' }, { status: 403 });
  }

  // Normalised on the way in, exactly as every other write path does. An export from an older build can
  // be missing fields the sheet now expects, and a restore that renders a broken sheet is barely better
  // than no restore at all — `normalizeCharacter` runs the same legacy migrations the sheet loader does.
  const data = normalizeCharacter(doc.data);

  const { data: created, error } = await supabaseAdmin
    .from('dnd_characters')
    .insert({
      campaign_id: campaignId,
      owner_user_id: session.userId,
      name: doc.name,
      sheet_type: doc.sheet_type,
      system: doc.system,
      bio: doc.bio,
      data,
      // Private by default, and NOT the export's original visibility — which the export does not carry
      // anyway. A restored character appearing in a campaign the moment it lands is a surprise; making it
      // visible is one click, and un-sharing something already seen is not.
      visibility: 'private',
      is_npc: false,
    })
    .select('id, name, system, sheet_type')
    .single();

  if (error || !created) {
    return NextResponse.json({ error: error?.message ?? 'Could not import that character.' }, { status: 500 });
  }

  if (campaignId) {
    try {
      await supabaseAdmin
        .from('dnd_campaign_characters')
        .upsert(
          { campaign_id: campaignId, character_id: (created as { id: string }).id, added_by: session.userId },
          { onConflict: 'campaign_id,character_id', ignoreDuplicates: true },
        );
    } catch {
      /* join table not present yet */
    }
  }

  return NextResponse.json({
    character: created,
    // Reported, never written to `updated_at` — that column must say when this row was written, not when
    // the file was made. A restore whose timestamp claims last March sorts wrong in every list.
    exportedAt: doc.exportedUpdatedAt,
  });
}

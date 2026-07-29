// app/api/dnd/characters/import-pathbuilder/route.ts — bring a character over from Pathbuilder (P9-3, H-3).
//
// The third import path, and each exists for a different reason:
//   · `/import`            — uploads, interpreted by a model. For a PDF, a photo, a pile of notes.
//   · `/import-json`       — our own loss-less export (P9-1). Exact, because we wrote the file.
//   · `/import-pathbuilder`— this one. Exact where the format is understood, HONEST where it is not.
//
// Deterministic on purpose: it is instant, costs nothing, and — unlike the AI path — it can tell the
// player exactly what it did and did not understand. PF2 players are the least-served group here and
// almost all of them already have a character in Pathbuilder.
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getDndSession, getCampaignRole } from '@/lib/dnd/auth';
import { enforceRateLimit } from '@/lib/dnd/rate-limit';
import { parsePathbuilder, describePathbuilderImport } from '@/lib/dnd/systems/pathfinder2e/pathbuilder';
import { assemblePF2VanillaCharacter, type PF2Picks } from '@/lib/dnd/systems/pathfinder2e/builder';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const session = getDndSession();
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  const limited = await enforceRateLimit('write', session.userId);
  if (limited) return limited;

  const body = (await req.json().catch(() => null)) as { document?: unknown; campaignId?: unknown } | null;
  if (!body) return NextResponse.json({ error: 'Send a JSON body with a `document`.' }, { status: 400 });

  const parsed = parsePathbuilder(body.document);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const { picks, unmapped, notes } = parsed.value;

  if (!picks.name && !picks.className) {
    return NextResponse.json({ error: 'That export has no name and no class — it may be empty.' }, { status: 400 });
  }

  const campaignId = typeof body.campaignId === 'string' && body.campaignId ? body.campaignId : null;
  if (campaignId && (await getCampaignRole(campaignId)) === null) {
    return NextResponse.json({ error: 'Not a member of this campaign.' }, { status: 403 });
  }

  // Assembled through the SAME builder every other PF2 character goes through, rather than by writing a
  // sidecar directly. That is what makes an imported character indistinguishable from a built one — it
  // gets the level-appropriate proficiency ranks (P5-10), the doctrine tracks, the HP formula and the
  // Strike ranks, all from one place. An importer that hand-assembles a sidecar is an importer that
  // slowly drifts from the builder.
  const name = picks.name || `${picks.className ?? 'Imported'} character`;
  const built = assemblePF2VanillaCharacter({ ...(picks as PF2Picks), name });

  const { data: created, error } = await supabaseAdmin
    .from('dnd_characters')
    .insert({
      campaign_id: campaignId,
      owner_user_id: session.userId,
      name,
      sheet_type: 'default',
      system: 'pathfinder2e',
      data: built,
      // Private, like every other import: un-sharing something already seen is not a thing you can do.
      visibility: 'private',
      is_npc: false,
    })
    .select('id, name, system')
    .single();

  if (error || !created) {
    return NextResponse.json({ error: error?.message ?? 'Could not import that character.' }, { status: 500 });
  }

  if (campaignId) {
    try {
      await supabaseAdmin.from('dnd_campaign_characters').upsert(
        { campaign_id: campaignId, character_id: (created as { id: string }).id, added_by: session.userId },
        { onConflict: 'campaign_id,character_id', ignoreDuplicates: true },
      );
    } catch {
      /* join table not present yet */
    }
  }

  // `unmapped` and `notes` are returned, not logged. The whole advantage of a deterministic importer over
  // the AI one is that it can say what it missed; hiding that would throw the advantage away.
  return NextResponse.json({
    character: created,
    summary: describePathbuilderImport(parsed.value),
    notes,
    unmapped,
  });
}

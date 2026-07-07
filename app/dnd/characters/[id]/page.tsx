// app/dnd/characters/[id]/page.tsx — a DB-backed character sheet (Phase E9).
// Renders any character the caller can access (owner / DM / campaign-visible) on
// the shared engine, DB-backed (C3) with DM control (C10) when applicable. This is
// where E9 routes a player: straight to their own character.
import { redirect } from 'next/navigation';
import { getDndUser, isDndOpenAccess } from '@/lib/dnd/auth';
import { getCharacterAccess } from '@/lib/dnd/characters';
import { supabaseAdmin } from '@/lib/supabase';
import SheetRoot from '@/app/dnd/_sheet/SheetRoot';
import UnderConstructionBanner from '@/app/dnd/_ui/UnderConstructionBanner';
import SheetChatPanel from '@/app/dnd/_ui/SheetChatPanel';

export const dynamic = 'force-dynamic';

export default async function CharacterSheetPage({ params }: { params: { id: string } }) {
  const user = await getDndUser();
  if (!user) redirect(isDndOpenAccess() ? '/dnd' : `/dnd/login?next=/dnd/characters/${params.id}`);

  const res = await getCharacterAccess(params.id);
  if (!res.access) redirect('/dnd'); // no access → back to the hub
  const { character, isDM } = res.access;

  let banner = null;
  if (character.under_construction) {
    const { data } = await supabaseAdmin.from('dnd_character_uploads').select('url, filename, kind').eq('character_id', character.id).order('created_at', { ascending: true });
    banner = (
      <UnderConstructionBanner
        importNotes={character.import_notes}
        styleNotes={character.style_notes}
        uploads={(data ?? []) as { url: string; filename: string | null; kind: string }[]}
      />
    );
  }

  return (
    <>
      {banner}
      <SheetRoot characterId={character.id} campaignId={character.campaign_id ?? undefined} sheetType={character.sheet_type} isDM={isDM} />
      {character.campaign_id && <SheetChatPanel campaignId={character.campaign_id} actorName={character.name} />}
    </>
  );
}

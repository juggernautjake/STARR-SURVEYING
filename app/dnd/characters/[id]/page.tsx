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
import CharacterBuildKit from '@/app/dnd/_ui/CharacterBuildKit';
import BuildQuestions from '@/app/dnd/_ui/BuildQuestions';
import SheetStyleBrowser from '@/app/dnd/_ui/SheetStyleBrowser';
import SheetEditChat from '@/app/dnd/_ui/SheetEditChat';
import SystemSwitcher from '@/app/dnd/_ui/SystemSwitcher';
import SheetApprovalPanel from '@/app/dnd/_ui/SheetApprovalPanel';
import { readVariants, builtSystems, type ActiveSheet } from '@/lib/dnd/system-variants';
import { normalizeSystem } from '@/lib/dnd/systems';
import { summarizeCharacterProvenance, type ElementKind } from '@/lib/dnd/provenance';
import { normalizeSubmissionStatus } from '@/lib/dnd/submission';
import { blankCharacter } from '@/app/dnd/_sheet/data/blank';
import type { Character } from '@/app/dnd/_sheet/types';
import SheetChatPanel from '@/app/dnd/_ui/SheetChatPanel';
import AddToDemoButton from '@/app/dnd/_ui/AddToDemoButton';
import { dndAiConfigured } from '@/lib/dnd/ai';
import { DEMO_CAMPAIGN_ID } from '@/lib/dnd/constants';

export const dynamic = 'force-dynamic';

export default async function CharacterSheetPage({ params }: { params: { id: string } }) {
  const user = await getDndUser();
  if (!user) redirect(isDndOpenAccess() ? '/dnd' : `/dnd/login?next=/dnd/characters/${params.id}`);

  const res = await getCharacterAccess(params.id);
  if (!res.access) redirect('/dnd'); // no access → back to the hub
  const { character, isDM, canWrite } = res.access;

  // Submission/approval panel (IG builder Slice 5): show the custom/vanilla content summary + submit
  // (owner) / review (DM) controls for any character in a campaign. The provenance is computed live so
  // it reflects the current sheet, and the campaign's custom policy drives whether a submit is allowed.
  let approvalPanel = null;
  if (character.campaign_id && (canWrite || isDM)) {
    const sys = normalizeSystem((character as { system?: string }).system);
    const dmGranted = (Array.isArray(character.dm_granted) ? character.dm_granted : []) as { kind?: ElementKind; name: string; grantedBy?: string | null; mechanics?: string | null }[];
    const summary = summarizeCharacterProvenance((character.data as unknown as Character | null) ?? blankCharacter(character.name), sys, dmGranted);
    const { data: camp } = await supabaseAdmin.from('dnd_campaigns').select('allow_custom').eq('id', character.campaign_id).maybeSingle();
    const allowCustom = (camp as { allow_custom?: boolean } | null)?.allow_custom !== false;
    approvalPanel = (
      <SheetApprovalPanel
        characterId={character.id}
        status={normalizeSubmissionStatus((character as { submission_status?: string }).submission_status)}
        reviewNotes={(character as { dm_review_notes?: string | null }).dm_review_notes ?? null}
        isDM={isDM}
        canWrite={canWrite}
        elements={summary.elements}
        allowCustom={allowCustom}
        hasBlockingCustom={summary.hasBlockingCustom}
      />
    );
  }

  // Whoever can edit gets the Build Kit (add files/art/comments + AI build) above the
  // sheet — always, so a basic character can be fleshed out later. Viewers who can't edit
  // still see the read-only "under construction" banner while a sheet is being built.
  let topPanel = null;
  if (canWrite) {
    topPanel = <CharacterBuildKit characterId={character.id} characterName={character.name} aiConfigured={dndAiConfigured()} />;
  } else if (character.under_construction) {
    const { data } = await supabaseAdmin.from('dnd_character_uploads').select('url, filename, kind').eq('character_id', character.id).order('created_at', { ascending: true });
    topPanel = (
      <UnderConstructionBanner
        importNotes={character.import_notes}
        styleNotes={character.style_notes}
        uploads={(data ?? []) as { url: string; filename: string | null; kind: string }[]}
      />
    );
  }

  return (
    <>
      {topPanel}
      {approvalPanel}
      {canWrite && Array.isArray((character as { build_questions?: string[] }).build_questions) && (character as { build_questions?: string[] }).build_questions!.length > 0 && (
        <BuildQuestions characterId={character.id} questions={(character as { build_questions?: string[] }).build_questions as string[]} />
      )}
      {canWrite && character.campaign_id !== DEMO_CAMPAIGN_ID && (
        <AddToDemoButton characterId={character.id} campaignId={DEMO_CAMPAIGN_ID} />
      )}
      {canWrite && (() => {
        const active: ActiveSheet = {
          system: normalizeSystem((character as { system?: string }).system),
          data: character.data,
          sheet_type: character.sheet_type,
        };
        const built = builtSystems(active, readVariants((character as { system_variants?: unknown }).system_variants));
        return <SystemSwitcher characterId={character.id} activeSystem={active.system} builtSystems={built} aiConfigured={dndAiConfigured()} />;
      })()}
      {canWrite && <SheetStyleBrowser characterId={character.id} current={character.sheet_type} />}
      <SheetRoot
        characterId={character.id}
        campaignId={character.campaign_id ?? undefined}
        sheetType={character.sheet_type}
        isDM={isDM}
        canWrite={canWrite}
        customLayout={character.custom_layout}
        customCss={character.custom_css}
      />
      {character.campaign_id && <SheetChatPanel campaignId={character.campaign_id} actorName={character.name} />}
      {canWrite && <SheetEditChat characterId={character.id} characterName={character.name} aiConfigured={dndAiConfigured()} />}
    </>
  );
}

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
import DmGrantPanel from '@/app/dnd/_ui/DmGrantPanel';
import IGVanillaLibrary from '@/app/dnd/_ui/IGVanillaLibrary';
import IGCharacterBuilder from '@/app/dnd/_ui/IGCharacterBuilder';
import IGSheet from '@/app/dnd/_ui/IGSheet';
import { isIGCharacter } from '@/lib/dnd/systems/intuitive-games/model';
import PF2CharacterBuilder from '@/app/dnd/_ui/PF2CharacterBuilder';
import PF2Sheet from '@/app/dnd/_ui/PF2Sheet';
import { isPF2Character } from '@/lib/dnd/systems/pathfinder2e/model';
import { readVariants, builtSystems, type ActiveSheet } from '@/lib/dnd/system-variants';
import { normalizeSystem } from '@/lib/dnd/systems';
import { summarizeCharacterProvenance, type ElementKind } from '@/lib/dnd/provenance';
import { normalizeSubmissionStatus } from '@/lib/dnd/submission';
import { readGrants } from '@/lib/dnd/dm-grant';
import { blankCharacter } from '@/app/dnd/_sheet/data/blank';
import type { Character } from '@/app/dnd/_sheet/types';
import SheetChatPanel from '@/app/dnd/_ui/SheetChatPanel';
import LibraryChat from '@/app/dnd/_ui/LibraryChat';
import AddToDemoButton from '@/app/dnd/_ui/AddToDemoButton';
import { dndAiConfigured } from '@/lib/dnd/ai';
import { DEMO_CAMPAIGN_ID } from '@/lib/dnd/constants';
import { resolvePreferences, type EffectivePreferences } from '@/lib/dnd/preferences';
import { readCampaignPreferences } from '@/lib/dnd/campaign-preferences';

export const dynamic = 'force-dynamic';

export default async function CharacterSheetPage({ params }: { params: { id: string } }) {
  const user = await getDndUser();
  if (!user) redirect('/dnd');

  const res = await getCharacterAccess(params.id);
  if (!res.access) redirect('/dnd'); // no access → back to the hub
  const { character, isDM, canWrite } = res.access;

  // Effective preferences (Area P2c) — the campaign's DM settings, resolved for this player, fed to the sheet
  // store so configurable mechanics (long-rest model, …) actually follow the campaign's house rules. Player-
  // side overrides (P2b) aren't stored yet, so the player object is empty → the campaign values win (with any
  // DM lock). No campaign → undefined → the store's vanilla default.
  let effectivePreferences: EffectivePreferences | undefined;
  if (character.campaign_id) {
    const { data: campPrefRow } = await supabaseAdmin.from('dnd_campaigns').select('theme').eq('id', character.campaign_id).maybeSingle();
    effectivePreferences = resolvePreferences(readCampaignPreferences((campPrefRow as { theme?: unknown } | null)?.theme));
  }

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

  // DM-granted content (IG builder Slice 6): only the campaign DM sees the grant composer + revoke list.
  const grantPanel = character.campaign_id && isDM
    ? <DmGrantPanel characterId={character.id} initialGrants={readGrants(character.dm_granted)} />
    : null;

  // Intuitive Games vanilla library (IG builder Slice 7): the always-VANILLA reference + builder picker
  // source, shown to anyone who can edit an Intuitive Games character.
  const isIG = canWrite && normalizeSystem((character as { system?: string }).system) === 'intuitive-games';
  const igLibrary = isIG ? <IGVanillaLibrary /> : null;
  const igBuilder = isIG ? <IGCharacterBuilder characterId={character.id} initialName={character.name} aiConfigured={dndAiConfigured()} /> : null;

  // The bespoke IG sheet (full-sheet Slice 4+): render the IGCharacter model sidecar (data.ig) for ANY
  // viewer of an Intuitive Games character that has been built with the IG builder, with provenance badges.
  let igSheet = null;
  if (normalizeSystem((character as { system?: string }).system) === 'intuitive-games') {
    const igData = (character.data as { ig?: unknown } | null)?.ig;
    if (isIGCharacter(igData)) {
      const dmGranted = (Array.isArray(character.dm_granted) ? character.dm_granted : []) as { kind?: ElementKind; name: string; grantedBy?: string | null; mechanics?: string | null }[];
      const summary = summarizeCharacterProvenance((character.data as unknown as Character | null) ?? blankCharacter(character.name), 'intuitive-games', dmGranted);
      igSheet = <IGSheet ig={igData} elements={summary.elements} canEdit={canWrite} characterId={character.id} />;
    }
  }

  // Pathfinder 2e builder + bespoke sheet (mirrors the IG flow): the builder shows to anyone who can edit
  // a PF2 character; the sheet renders the pf2e sidecar (real Remaster numbers) for any viewer once built.
  const isPF2 = canWrite && normalizeSystem((character as { system?: string }).system) === 'pathfinder2e';
  const pf2Builder = isPF2 ? <PF2CharacterBuilder characterId={character.id} initialName={character.name} aiConfigured={dndAiConfigured()} /> : null;
  let pf2Sheet = null;
  if (normalizeSystem((character as { system?: string }).system) === 'pathfinder2e') {
    const pf2Data = (character.data as { pf2e?: unknown } | null)?.pf2e;
    if (isPF2Character(pf2Data)) pf2Sheet = <PF2Sheet pf2={pf2Data} />;
  }

  return (
    <>
      {topPanel}
      {approvalPanel}
      {grantPanel}
      {igSheet}
      {igBuilder}
      {igLibrary}
      {pf2Sheet}
      {pf2Builder}
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
        system={normalizeSystem((character as { system?: string }).system)}
        isDM={isDM}
        canWrite={canWrite}
        customLayout={character.custom_layout}
        customCss={character.custom_css}
        preferences={effectivePreferences}
      />
      {/* Ask the librarian ABOUT THIS CHARACTER. The system is pinned to the character's own, and
          passing characterId makes the chat adjudicate against the real sheet ("can I shove while
          grappled?") rather than answer about a generic character. Anyone who can see the sheet can
          ask; the route re-checks access itself. */}
      <LibraryChat
        aiConfigured={dndAiConfigured()}
        system={normalizeSystem((character as { system?: string }).system)}
        characterId={character.id}
        characterName={character.name}
        title={`Ask the librarian about ${character.name}`}
      />
      {character.campaign_id && <SheetChatPanel campaignId={character.campaign_id} actorName={character.name} />}
      {canWrite && <SheetEditChat characterId={character.id} characterName={character.name} aiConfigured={dndAiConfigured()} />}
    </>
  );
}

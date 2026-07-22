// app/dnd/characters/[id]/page.tsx — a DB-backed character sheet (Phase E9).
// Renders any character the caller can access (owner / DM / campaign-visible) on
// the shared engine, DB-backed (C3) with DM control (C10) when applicable. This is
// where E9 routes a player: straight to their own character.
import { redirect } from 'next/navigation';
import { getDndUser, isDndOpenAccess } from '@/lib/dnd/auth';
import { getCharacterAccess } from '@/lib/dnd/characters';
import { supabaseAdmin } from '@/lib/supabase';
import SheetRoot from '@/app/dnd/_sheet/SheetRoot';
import { VariantToggleView } from '@/app/dnd/_sheet/components/VariantToggle';
import UnderConstructionBanner from '@/app/dnd/_ui/UnderConstructionBanner';
import CharacterBuildKit from '@/app/dnd/_ui/CharacterBuildKit';
import BuildQuestions from '@/app/dnd/_ui/BuildQuestions';
import SheetChrome from '@/app/dnd/_ui/SheetChrome';
import CharacterSettingsModal from '@/app/dnd/_ui/CharacterSettingsModal';
import SheetVisibilityToggle from '@/app/dnd/_ui/SheetVisibilityToggle';
import PromoteCampaignVersionButton from '@/app/dnd/_ui/PromoteCampaignVersionButton';
import ExportSheetButton from '@/app/dnd/_ui/ExportSheetButton';
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
import { readVariants, builtSystems, listSheets, readActiveSlotMeta, type ActiveSheet } from '@/lib/dnd/system-variants';
import { normalizeSystem, systemLabel } from '@/lib/dnd/systems';
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
import { resolvePreferences, normalizePlayerPreferences, DEFAULT_CAMPAIGN_PREFERENCES, type EffectivePreferences } from '@/lib/dnd/preferences';
import { readCampaignPreferences } from '@/lib/dnd/campaign-preferences';
import HouseRulesPanel from '@/app/dnd/_ui/HouseRulesPanel';

export const dynamic = 'force-dynamic';

export default async function CharacterSheetPage({ params }: { params: { id: string } }) {
  const user = await getDndUser();
  if (!user) redirect('/dnd');

  const res = await getCharacterAccess(params.id);
  if (!res.access) redirect('/dnd'); // no access → back to the hub
  const { character, isDM, canWrite, isOwner } = res.access;

  // The owner's display name, for the Codex identity column's "Owner" row. Resolved here rather
  // than in the sheet because the sheet is a client component and this is a single indexed
  // lookup on a column it has no business querying. Stays null for an unclaimed character (an
  // NPC with no owner) — the row is then omitted rather than showing a placeholder, since
  // inventing an owner is worse than not listing one.
  let ownerName: string | null = null;
  const ownerId = (character as { owner_user_id?: string | null }).owner_user_id;
  if (ownerId) {
    const { data: ownerRow } = await supabaseAdmin
      .from('dnd_users')
      .select('display_name')
      .eq('id', ownerId)
      .maybeSingle();
    ownerName = (ownerRow as { display_name?: string } | null)?.display_name ?? null;
  }

  // Effective preferences (Area P2c) — the campaign's DM settings ∩ the PLAYER's own choices, resolved and
  // fed to the sheet store so configurable mechanics (long-rest model, dice style, …) follow both. The
  // player's overrides (P2b / settings overhaul S-2) live on `data.playerPreferences`; a DM lock
  // (`playerCanChoose: false`) still wins at resolve time, so the campaign's rule is enforced even when the
  // player has a stored choice for it. Outside a campaign the player's choices apply against the vanilla
  // baseline; with no stored choices the result is exactly the previous behaviour.
  const playerPreferences = normalizePlayerPreferences((character.data as { playerPreferences?: unknown } | null)?.playerPreferences);
  let effectivePreferences: EffectivePreferences | undefined;
  // Whether the AI may create custom content when transposing this character (Area TR2). Allowed unless the
  // campaign is vanilla-only; a character with no campaign has no such restriction.
  let transposeAllowsCustom = true;
  if (character.campaign_id) {
    const { data: campPrefRow } = await supabaseAdmin.from('dnd_campaigns').select('theme, allow_custom').eq('id', character.campaign_id).maybeSingle();
    effectivePreferences = resolvePreferences(readCampaignPreferences((campPrefRow as { theme?: unknown } | null)?.theme), playerPreferences);
    transposeAllowsCustom = (campPrefRow as { allow_custom?: boolean } | null)?.allow_custom !== false;
  } else {
    // No campaign: fold the player's own choices over the vanilla baseline (every setting playerCanChoose),
    // so a character in the owner's lobby honours its own settings. Undefined only when the player has none.
    const hasChoices = Object.keys(playerPreferences).length > 0;
    if (hasChoices) effectivePreferences = resolvePreferences(DEFAULT_CAMPAIGN_PREFERENCES, playerPreferences);
  }

  // Area VIS6a — the creator's "replace my original with the in-campaign version" offer. It appears ONLY when
  // the character is in a campaign that holds its own edited copy (a DM override, seed 451) AND the viewer is the
  // creator (only they own the original). The promote route (creator-only) does the overwrite; here we just
  // decide whether to show the button by checking the override exists.
  let campaignOverridePending = false;
  if (isOwner && character.campaign_id) {
    const { data: rosterRow } = await supabaseAdmin
      .from('dnd_campaign_characters')
      .select('data_override')
      .eq('campaign_id', character.campaign_id)
      .eq('character_id', character.id)
      .maybeSingle();
    campaignOverridePending = (rosterRow as { data_override?: unknown } | null)?.data_override != null;
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
  const igBuilder = isIG ? <IGCharacterBuilder characterId={character.id} initialName={character.name} aiConfigured={dndAiConfigured()} variantKind={readActiveSlotMeta((character as { system_variants?: unknown }).system_variants).kind ?? 'vanilla'} /> : null;

  // The bespoke IG sheet (full-sheet Slice 4+): render the IGCharacter model sidecar (data.ig) for ANY
  // viewer of an Intuitive Games character that has been built with the IG builder, with provenance badges.
  let igSheet = null;
  if (normalizeSystem((character as { system?: string }).system) === 'intuitive-games') {
    const igData = (character.data as { ig?: unknown } | null)?.ig;
    if (isIGCharacter(igData)) {
      const dmGranted = (Array.isArray(character.dm_granted) ? character.dm_granted : []) as { kind?: ElementKind; name: string; grantedBy?: string | null; mechanics?: string | null }[];
      const summary = summarizeCharacterProvenance((character.data as unknown as Character | null) ?? blankCharacter(character.name), 'intuitive-games', dmGranted);
      // `isDM` and the variant are SERVER-derived, exactly as the ig-edit route derives them, so the
      // sheet's authoring hint can never disagree with the gate that actually decides (IG-S2).
      igSheet = (
        <IGSheet
          ig={igData} elements={summary.elements} canEdit={canWrite} characterId={character.id}
          isDM={isDM}
          variantKind={readActiveSlotMeta((character as { system_variants?: unknown }).system_variants).kind ?? 'vanilla'}
          sheetType={character.sheet_type}
          layout={(character.data as { sheetLayout?: string } | null)?.sheetLayout}
          artUrl={(character as { art_url?: string | null }).art_url}
          name={character.name}
          skinVariant={(character.data as { skinVariant?: string } | null)?.skinVariant}
        />
      );
    }
  }

  // Pathfinder 2e builder + bespoke sheet (mirrors the IG flow): the builder shows to anyone who can edit
  // a PF2 character; the sheet renders the pf2e sidecar (real Remaster numbers) for any viewer once built.
  const isPF2 = canWrite && normalizeSystem((character as { system?: string }).system) === 'pathfinder2e';
  const pf2Builder = isPF2 ? <PF2CharacterBuilder characterId={character.id} initialName={character.name} aiConfigured={dndAiConfigured()} /> : null;
  let pf2Sheet = null;
  if (normalizeSystem((character as { system?: string }).system) === 'pathfinder2e') {
    const pf2Data = (character.data as { pf2e?: unknown } | null)?.pf2e;
    if (isPF2Character(pf2Data)) pf2Sheet = (
      <PF2Sheet
        pf2={pf2Data} characterId={character.id} canEdit={canWrite} isDM={isDM}
        variantKind={readActiveSlotMeta((character as { system_variants?: unknown }).system_variants).kind ?? 'vanilla'}
        sheetType={character.sheet_type}
        layout={(character.data as { sheetLayout?: string } | null)?.sheetLayout}
        artUrl={(character as { art_url?: string | null }).art_url}
        name={character.name}
        skinVariant={(character.data as { skinVariant?: string } | null)?.skinVariant}
      />
    );
  }

  // A PF2 or IG character that has been BUILT renders its own bespoke sheet (real Remaster / IG
  // numbers). When it does, the shared 5e engine below MUST NOT also render — its `Character` view
  // of a PF2 character is a blank level-1 default (data lives in `data.pf2e` / `data.ig`, not the
  // shared fields), which stacked a second, empty sheet under the real one. That double-render is
  // the "two character sheets on top of each other" the owner reported, and it got far more visible
  // once the build toggle and customization panel were added to the shared engine. So: the bespoke
  // sheet, when present, is the ONLY sheet.
  const bespokeSheet = pf2Sheet ?? igSheet;
  const activeKind = readActiveSlotMeta((character as { system_variants?: unknown }).system_variants).kind;

  return (
    <>
      {topPanel}
      {/* The unified STYLE · TEMPLATE · THEME chip block (U-4), surfaced right below the Build Kit so all
          three axes sit in the SAME spot on every character — above every sheet (5e engine, PF2, IG all
          render further down), chosen the same way (highlighted chips), for every system. Replaces the old
          Style/Template dropdowns and the in-sheet 5e THEME row; each chip POSTs its axis's endpoint. */}
      {canWrite && (
        <SheetChrome
          characterId={character.id}
          system={normalizeSystem((character as { system?: string }).system)}
          currentSkin={character.sheet_type}
          currentTemplate={(character.data as { sheetLayout?: string } | null)?.sheetLayout}
          currentTheme={(character.data as { skinVariant?: string } | null)?.skinVariant}
          canWrite={canWrite}
        />
      )}
      {/* Per-character settings gear (S-3) — rules variants + display/roller prefs in one place, for every
          system. Fed the SSR-resolved effective preferences (DM locks honoured) + the player's own choices;
          always resolvable even outside a campaign (vanilla baseline ∩ the player's choices). */}
      {canWrite && (
        <CharacterSettingsModal
          characterId={character.id}
          effective={effectivePreferences ?? resolvePreferences(DEFAULT_CAMPAIGN_PREFERENCES, playerPreferences)}
          player={playerPreferences}
          canWrite={canWrite}
        />
      )}
      {approvalPanel}
      {grantPanel}
      {igSheet}
      {igBuilder}
      {igLibrary}
      {pf2Sheet}
      {pf2Builder}
      {/* Vanilla ⇄ Custom for a bespoke (PF2/IG) sheet. The shared 5e engine carries its own copy
          of this control, but that engine no longer renders for a built PF2/IG character, so the
          toggle is mounted here in the page chrome instead — same endpoint, same server-derived
          kind. Only when a bespoke sheet is actually showing. */}
      {bespokeSheet && canWrite && (
        <VariantToggleView characterId={character.id} variantKind={activeKind} canWrite={canWrite} />
      )}
      {canWrite && Array.isArray((character as { build_questions?: string[] }).build_questions) && (character as { build_questions?: string[] }).build_questions!.length > 0 && (
        <BuildQuestions characterId={character.id} questions={(character as { build_questions?: string[] }).build_questions as string[]} />
      )}
      {canWrite && character.campaign_id !== DEMO_CAMPAIGN_ID && (
        <AddToDemoButton characterId={character.id} campaignId={DEMO_CAMPAIGN_ID} />
      )}
      {canWrite && (() => {
        const rawVariants = (character as { system_variants?: unknown }).system_variants;
        const activeMeta = readActiveSlotMeta(rawVariants);
        const active: ActiveSheet = {
          system: normalizeSystem((character as { system?: string }).system),
          data: character.data,
          sheet_type: character.sheet_type,
          ...(activeMeta.slotId ? { slotId: activeMeta.slotId } : {}),
          kind: activeMeta.kind,
          ...(activeMeta.name ? { name: activeMeta.name } : {}),
        };
        const variants = readVariants(rawVariants);
        const built = builtSystems(active, variants);
        // Every sheet the character holds (Area MV2c) — active + each stored slot, with kind + name.
        const sheets = listSheets(active, variants, systemLabel);
        return <SystemSwitcher characterId={character.id} activeSystem={active.system} builtSystems={built} sheets={sheets} aiConfigured={dndAiConfigured()} allowCustom={transposeAllowsCustom} />;
      })()}
      {/* Private/Public is the creator's call — only the owner sees this control (the DM always sees the
          character regardless; other players' view is governed by this flag). */}
      {isOwner && <SheetVisibilityToggle characterId={character.id} current={character.visibility} />}
      {campaignOverridePending && character.campaign_id && (
        <PromoteCampaignVersionButton campaignId={character.campaign_id} characterId={character.id} />
      )}
      {/* Export the whole sheet — PDF (via print), self-contained HTML, or JSON. Anyone who can view the sheet
          can export it (the export route is read-gated the same as opening it). */}
      <ExportSheetButton characterId={character.id} />
      {/* (Sheet style + template pickers moved UP to just below the Build Kit — see above — so they sit
          in the same spot on every template, for both 5e and the bespoke PF2/IG sheets.) */}
      {/* The shared 5e engine — the tabbed sheet, ability rail, dice tray, build toggle and
          customization panel. It renders for 5e and system-ambiguous characters, AND for a PF2/IG
          character that has not been built yet (a "build me" placeholder). It does NOT render
          underneath a built bespoke sheet — see `bespokeSheet` above for why. */}
      {!bespokeSheet && (
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
          // Vanilla vs custom, read from the ACTIVE sheet slot's own metadata. Drives whether the
          // builders hard-block off-rules content or merely flag it. `readActiveSlotMeta` already
          // defaults to 'vanilla' for an unlabelled slot, which is the safe direction.
          variantKind={activeKind}
          ownerName={ownerName}
        />
      )}
      {/* The campaign's active house rules, read-only (Area P3 scaffold) — so a player can see the rules in
          force and which the DM locked. Only shown for a character in a campaign. */}
      {effectivePreferences && <HouseRulesPanel preferences={effectivePreferences} />}
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

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
import SheetEditHistory from '@/app/dnd/_ui/SheetEditHistory';
import UnderConstructionBanner from '@/app/dnd/_ui/UnderConstructionBanner';
import CharacterBuildKit from '@/app/dnd/_ui/CharacterBuildKit';
import HomebrewDesignerLinks from '@/app/dnd/_ui/HomebrewDesignerLinks';
import BuildQuestions from '@/app/dnd/_ui/BuildQuestions';
import SheetChrome from '@/app/dnd/_ui/SheetChrome';
import CharacterSettingsModal from '@/app/dnd/_ui/CharacterSettingsModal';
import SheetVisibilityToggle from '@/app/dnd/_ui/SheetVisibilityToggle';
import PromoteCampaignVersionButton from '@/app/dnd/_ui/PromoteCampaignVersionButton';
import ExportSheetButton from '@/app/dnd/_ui/ExportSheetButton';
import SheetEditChat from '@/app/dnd/_ui/SheetEditChat';
import SheetApprovalPanel from '@/app/dnd/_ui/SheetApprovalPanel';
import DmGrantPanel from '@/app/dnd/_ui/DmGrantPanel';
import IGVanillaLibrary from '@/app/dnd/_ui/IGVanillaLibrary';
import IGSheet from '@/app/dnd/_ui/IGSheet';
import { isIGCharacter } from '@/lib/dnd/systems/intuitive-games/model';
import PF2Sheet from '@/app/dnd/_ui/PF2Sheet';
import { isPF2Character } from '@/lib/dnd/systems/pathfinder2e/model';
import { readVariants, readActiveSlotMeta, resolveOriginSlotId, type ActiveSheet } from '@/lib/dnd/system-variants';
import { sheetExceptionLabels, sheetExceptions } from '@/lib/dnd/slots/sheet-exceptions';
import VariantBrowser from '@/app/dnd/_ui/VariantBrowser';
import CharacterCampaigns from '@/app/dnd/_ui/CharacterCampaigns';
import DraftSaveBanner from '@/app/dnd/_ui/DraftSaveBanner';
import { buildVariantCards, effectiveCampaignId } from '@/lib/dnd/variant-view';
import type { SubmissionStatusLite } from '@/lib/dnd/variant-tags';
import { availableSystems } from '@/lib/dnd/systems';
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
  // The ALWAYS-resolvable form. `effectivePreferences` is deliberately left undefined when there is nothing
  // to say (no campaign, no stored choices) because several panels use its presence as "is this character
  // governed by settings at all". The bespoke PF2/IG sheets need a real value regardless — their rules
  // variants must resolve to the vanilla defaults rather than to `undefined` — so they read this instead.
  const resolvedPreferences: EffectivePreferences =
    effectivePreferences ?? resolvePreferences(DEFAULT_CAMPAIGN_PREFERENCES, playerPreferences);

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

  // The campaign the VERSION BEING VIEWED belongs to — not the character row's. A variant is personal
  // until explicitly assigned (only the original inherits the character's campaign), so reading
  // `character.campaign_id` here put "Awaiting DM review" over personal branches that no DM can even see.
  // Same rule the version cards tag with, from one exported definition.
  const activeSlotMetaForCampaign = readActiveSlotMeta((character as { system_variants?: unknown }).system_variants);
  const activeIsOrigin = resolveOriginSlotId(
    { system: normalizeSystem((character as { system?: string }).system), data: character.data, sheet_type: character.sheet_type, ...(activeSlotMetaForCampaign.slotId ? { slotId: activeSlotMetaForCampaign.slotId } : {}), ...(activeSlotMetaForCampaign.parentSlotId ? { parentSlotId: activeSlotMetaForCampaign.parentSlotId } : {}) },
    readVariants((character as { system_variants?: unknown }).system_variants),
  ) === (activeSlotMetaForCampaign.slotId ?? `active:${normalizeSystem((character as { system?: string }).system)}`);
  const activeCampaignId = effectiveCampaignId(activeSlotMetaForCampaign.campaignId, activeIsOrigin, character.campaign_id);

  // Submission/approval panel (IG builder Slice 5): show the custom/vanilla content summary + submit
  // (owner) / review (DM) controls for a version that is actually IN a campaign. The provenance is computed
  // live so it reflects the current sheet, and the campaign's custom policy drives whether a submit is allowed.
  let approvalPanel = null;
  if (activeCampaignId && (canWrite || isDM)) {
    const sys = normalizeSystem((character as { system?: string }).system);
    const dmGranted = (Array.isArray(character.dm_granted) ? character.dm_granted : []) as { kind?: ElementKind; name: string; grantedBy?: string | null; mechanics?: string | null }[];
    const summary = summarizeCharacterProvenance((character.data as unknown as Character | null) ?? blankCharacter(character.name), sys, dmGranted);
    const { data: camp } = await supabaseAdmin.from('dnd_campaigns').select('allow_custom').eq('id', activeCampaignId).maybeSingle();
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
        // The entitlement axis (S8c). Deliberately does NOT feed `hasBlockingCustom`: whether a
        // vanilla-only campaign should REFUSE a submission over an out-of-slot pick is a policy call for
        // the campaign owner, and quietly turning it into a blocker would start failing submissions that
        // succeed today. This surfaces it to the DM, who can already request changes.
        exceptions={sheetExceptions(character.data, sys)}
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
          rollerTemplate={(character.data as { rollerTemplate?: string } | null)?.rollerTemplate}
          rollerAnim={(character.data as { rollerAnim?: boolean } | null)?.rollerAnim}
          customSections={(character.data as { customSections?: import('@/lib/dnd/custom-sections').CustomSection[] } | null)?.customSections}
          // S-4a: the bespoke sheets were the one surface preferences never reached (only the 5e engine got
          // them, via SheetRoot). Passing the resolved set here is what lets a per-system rules variant
          // actually drive an IG/PF2 sheet instead of sitting inert in the settings modal.
          preferences={resolvedPreferences}
        />
      );
    }
  }

  // Pathfinder 2e bespoke sheet (mirrors the IG flow): renders the pf2e sidecar (real Remaster numbers) for
  // any viewer once built. The PF2 / IG / 5e-manual BUILDERS are no longer mounted here — see the note at
  // their old render site: they live on /builder, reached from the Edit dialog.
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
        rollerTemplate={(character.data as { rollerTemplate?: string } | null)?.rollerTemplate}
        rollerAnim={(character.data as { rollerAnim?: boolean } | null)?.rollerAnim}
        customSections={(character.data as { customSections?: import('@/lib/dnd/custom-sections').CustomSection[] } | null)?.customSections}
        // S-4a/S-4b: carries the PF2 GM Core rules variants (proficiency without level, free archetype,
        // starting Hero Points) into the sheet's own resolve layer.
        preferences={resolvedPreferences}
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
  // What makes this sheet "Altered vanilla", already worded (S8b). Derived here because the ledger lives in
  // `data` and the badge is rendered from a server-computed prop — the same reason `activeKind` is.
  const activeExceptions = sheetExceptionLabels(character.data, normalizeSystem((character as { system?: string }).system));

  // ── Variant tracker (VT) + unified edit flow: the VERSIONS picker (every version as lobby-style cards with
  //    tags + AI summaries + Edit/Branch), OR — while editing a working-copy DRAFT — the Save banner in its
  //    place. Computed server-side so the client renders without fetching. Owner/DM only. ──
  let versionsPanel = null;
  if (canWrite) {
    const rawVariants = (character as { system_variants?: unknown }).system_variants;
    const vMeta = readActiveSlotMeta(rawVariants);
    const vbActive: ActiveSheet = {
      system: normalizeSystem((character as { system?: string }).system),
      data: character.data,
      sheet_type: character.sheet_type,
      ...(vMeta.slotId ? { slotId: vMeta.slotId } : {}),
      kind: vMeta.kind,
      ...(vMeta.name ? { name: vMeta.name } : {}),
      artUrl: (character as { art_url?: string | null }).art_url ?? vMeta.artUrl ?? null,
      ...(vMeta.parentSlotId ? { parentSlotId: vMeta.parentSlotId } : {}),
      ...(vMeta.campaignId != null ? { campaignId: vMeta.campaignId } : {}),
      ...(vMeta.summary != null ? { summary: vMeta.summary } : {}),
      ...(vMeta.summaryUpdatedAt ? { summaryUpdatedAt: vMeta.summaryUpdatedAt } : {}),
      ...(vMeta.summaryHash ? { summaryHash: vMeta.summaryHash } : {}),
      ...(vMeta.draft ? { draft: true } : {}),
    };
    const vbVariants = readVariants(rawVariants);
    // Resolve every referenced campaign's name for the Campaign tag (character-level + any per-slot).
    const campIds = new Set<string>();
    if (character.campaign_id) campIds.add(character.campaign_id);
    if (vMeta.campaignId) campIds.add(vMeta.campaignId);
    for (const v of Object.values(vbVariants)) if (v.campaignId) campIds.add(v.campaignId);
    const campaignNames: Record<string, string> = {};
    if (campIds.size) {
      const { data: camps } = await supabaseAdmin.from('dnd_campaigns').select('id, name').in('id', Array.from(campIds));
      for (const c of (camps ?? []) as { id: string; name: string }[]) campaignNames[c.id] = c.name;
    }
    const variantCards = buildVariantCards(vbActive, vbVariants, {
      characterName: character.name,
      characterCampaignId: character.campaign_id,
      campaignNames,
      isNpc: (character as { is_npc?: boolean }).is_npc,
      underConstruction: character.under_construction,
      submissionStatus: (character as { submission_status?: string }).submission_status as SubmissionStatusLite,
      hasDmGranted: Array.isArray(character.dm_granted) && character.dm_granted.length > 0,
    });
    if (vMeta.draft) {
      // A working-copy draft is active — show the Save bar (Save to source / new variant / discard) in place
      // of the versions list. The source is the version this draft branched from.
      const src = variantCards.find((c) => c.slotId === vMeta.parentSlotId);
      versionsPanel = <DraftSaveBanner characterId={character.id} sourceName={src?.name ?? 'the current version'} />;
    } else {
      const transposeSystems = availableSystems().map((s) => ({ id: s.key, label: s.name }));
      versionsPanel = (
        // allowCustom carries the campaign's vanilla-only policy (Area TR2) into the Edit dialog, so a
        // vanilla-only campaign never offers "let the AI homebrew" — the rule outlived the panel that
        // used to enforce it.
        <VariantBrowser characterId={character.id} cards={variantCards} aiConfigured={dndAiConfigured()} canWrite={canWrite} transposeSystems={transposeSystems} allowCustom={transposeAllowsCustom} />
      );
    }
  }

  return (
    <>
      {topPanel}
      {/* The homebrew designers (P0-4). They shipped complete and tested with NOTHING linking to them, so
          this is the door. Gated inside the component on `isSharedEngineSystem`, because they emit 5e
          shapes a PF2/IG engine cannot resolve — see its header. */}
      {canWrite && (
        <HomebrewDesignerLinks
          characterId={character.id}
          system={normalizeSystem((character as { system?: string }).system)}
        />
      )}
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
      {/* VERSIONS picker (VT) — every version of this character (up to 20): switch, Edit (direct/transpose),
          branch a new variant, read each version's AI summary. While editing a draft this becomes the Save
          banner instead. Sits with the STYLE·TEMPLATE·THEME chrome so the character-level controls are together. */}
      {versionsPanel}
      {/* Per-character settings gear (S-3) — rules variants + display/roller prefs in one place, for every
          system. Fed the SSR-resolved effective preferences (DM locks honoured) + the player's own choices;
          always resolvable even outside a campaign (vanilla baseline ∩ the player's choices). */}
      {canWrite && (
        <CharacterSettingsModal
          characterId={character.id}
          effective={effectivePreferences ?? resolvePreferences(DEFAULT_CAMPAIGN_PREFERENCES, playerPreferences)}
          player={playerPreferences}
          canWrite={canWrite}
          isOwner={isOwner}
          characterName={character.name}
          campaignId={character.campaign_id}
          system={normalizeSystem((character as { system?: string }).system)}
        />
      )}
      {approvalPanel}
      {grantPanel}
      {igSheet}
      {igLibrary}
      {pf2Sheet}
      {/* The Foundation BUILDERS (5e manual / PF2 / IG) were removed from the sheet in consolidation C4 —
          they live on the dedicated /builder wizard, reached from Edit → "Rebuild this version step by
          step". They REPLACE a sheet's foundation, so having them permanently expanded under a finished
          character was both redundant with /builder and the easiest way to overwrite a character by
          accident. `igLibrary` stays: it is a read-only vanilla reference, not a builder. */}
      {/* Vanilla ⇄ Custom for a bespoke (PF2/IG) sheet. The shared 5e engine carries its own copy
          of this control, but that engine no longer renders for a built PF2/IG character, so the
          toggle is mounted here in the page chrome instead — same endpoint, same server-derived
          kind. Only when a bespoke sheet is actually showing. */}
      {bespokeSheet && canWrite && (
        <VariantToggleView characterId={character.id} variantKind={activeKind} canWrite={canWrite} exceptions={activeExceptions} />
      )}
      {/* Edit history for a bespoke (PF2/IG) sheet — same reasoning as the toggle directly above, and it
          belongs HERE for the same reason. `EditReviewPanel` lives in the shared 5e engine, which no longer
          renders for a built PF2/IG character, so those sheets had no review surface at all.
          Mounted in the page chrome rather than inside IGSheet/PF2Sheet deliberately: both of those return
          EARLY for the codex / dashboard / play formats, so a panel placed in their Classic branch would
          exist on one layout in four — the "authored but not wired" defect this codebase keeps producing.
          One mount here covers every format, exactly as the toggle does. */}
      {bespokeSheet && canWrite && <SheetEditHistory characterId={character.id} canWrite={canWrite} />}
      {canWrite && Array.isArray((character as { build_questions?: string[] }).build_questions) && (character as { build_questions?: string[] }).build_questions!.length > 0 && (
        <BuildQuestions characterId={character.id} questions={(character as { build_questions?: string[] }).build_questions as string[]} />
      )}
      {canWrite && character.campaign_id !== DEMO_CAMPAIGN_ID && (
        <AddToDemoButton characterId={character.id} campaignId={DEMO_CAMPAIGN_ID} />
      )}
      {/* SystemSwitcher was RETIRED here (consolidation C3): every capability it had now lives in the
          VERSIONS picker + EditFlow above — switch/rename/delete on the cards, add/transpose and the
          vanilla-vs-homebrew choice in the Edit dialog, the build report after a transpose, and finally
          level-up-to-match. Two panels doing the same job was the redundancy this consolidation set out to
          remove; the component file stays until the branch merges, in case QA wants it back in one revert. */}
      {/* Private/Public is the creator's call — only the owner sees this control (the DM always sees the
          character regardless; other players' view is governed by this flag). */}
      {isOwner && <SheetVisibilityToggle characterId={character.id} current={character.visibility} />}
      {/* Which campaigns this character is in, with a way in and out (S11 — owner: "make sure there is a
          clear and easy way to take character into and out of a campaign"). Sits beside the visibility
          toggle because both answer "who can see and use this character". It renders for anyone who can view
          the sheet: the panel itself only offers the actions that caller may actually perform. */}
      <CharacterCampaigns characterId={character.id} />
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
          // The row is already in hand here — every prop above reads off it. Passing the data blob
          // too lets the sheet paint the real character on first render instead of a blank one that
          // showed `HP 1 / 1` for up to 2.5s on a slow connection. `IGSheet`/`PF2Sheet` below have
          // always worked this way; this makes the 5e engine match them.
          initialCharacter={character.data}
        />
      )}
      {/* The campaign's active house rules, read-only (Area P3 scaffold) — so a player can see the rules in
          force and which the DM locked. Only shown for a character in a campaign. */}
      {effectivePreferences && <HouseRulesPanel preferences={effectivePreferences} />}
      {/* Ask the librarian ABOUT THIS CHARACTER — for READ-ONLY viewers only. The sheet assistant below
          now answers questions with the same grounding AND proposes changes, so showing both to an editor
          is two boxes that do the same thing (Workstream B3). A viewer who can't write still needs a way
          to ask, so they keep the librarian. The system is pinned to the character's own, and passing
          characterId makes the chat adjudicate against the real sheet ("can I shove while grappled?")
          rather than answer about a generic character; the route re-checks access itself. */}
      {!canWrite && (
        <LibraryChat
          aiConfigured={dndAiConfigured()}
          system={normalizeSystem((character as { system?: string }).system)}
          characterId={character.id}
          characterName={character.name}
          title={`Ask the librarian about ${character.name}`}
        />
      )}
      {character.campaign_id && <SheetChatPanel campaignId={character.campaign_id} actorName={character.name} />}
      {/* One box: answers questions about this character AND proposes changes, each confirmed before it
          saves — to this version or as a new variant (the universal save choice). */}
      {canWrite && <SheetEditChat characterId={character.id} characterName={character.name} aiConfigured={dndAiConfigured()} />}
    </>
  );
}

'use client'
// Vendored Lazzuh sheet shell (Phase C). The `.dnd-sheet` wrapper is the scope
// root for the machine-scoped theme.css imported below — every rule in that file
// is prefixed with `.dnd-sheet`, so the sheet's global styles (background, fonts,
// scrollbars) apply here without leaking onto the rest of the Starr site.
import { useState } from 'react'
import './styles/theme.css'
// Codex layout styles (CX-1 …). Imported unconditionally beside theme.css rather than lazily:
// both are scoped under `.dnd-sheet`, and the Codex rules match nothing at all unless a
// CodexLayout is actually rendered, so a classic sheet pays only the (small) stylesheet size
// and none of the complexity of a dynamic import that could flash unstyled panes on switch.
import './styles/codex.css'
import './styles/play.css'
import { themeToCssVars, themeVariantsFor, resolveThemeVariant, type SheetTheme } from './theme'
import { getSheetConfig, type SheetModuleId } from './registry'
import { useChar } from './state/store'
import { SheetConfigProvider } from './state/sheetConfig'
import StreamChat from './components/StreamChat'
import StreamPoll from './components/StreamPoll'
import StreamAlert from './components/StreamAlert'
import ConditionTracker from './components/ConditionTracker'
import ActiveEffects from './components/ActiveEffects'
import Reactions from './components/Reactions'
import EditReviewPanel from './components/EditReviewPanel'
import Hero from './components/Hero'
import StatRail from './components/StatRail'
import Abilities from './components/Abilities'
import SavesSkills from './components/SavesSkills'
import CombatPanel from './components/CombatPanel'
import Resources from './components/Resources'
import Attacks from './components/Attacks'
import SpellsPanel from './components/SpellsPanel'
import Forms from './components/Forms'
import FormAbilities from './components/FormAbilities'
import Features from './components/Features'
import Balance from './components/Balance'
import Progression from './components/Progression'
import Inventory from './components/Inventory'
import Bio from './components/Bio'
import { rollerFor } from './components/rollers/rollerFor'
import RollerTemplateBar from './components/rollers/RollerTemplateBar'
import { resolveRollerTemplate } from '@/lib/dnd/roller-templates'
import FloatingRoller from './components/rollers/FloatingRoller'
import DmOverridePanel from './components/DmOverridePanel'
import StreamOwnerControls from './components/StreamOwnerControls'
import StreamControl from './components/StreamControl'
import MlmPanel from './components/MlmPanel'
import SheetArtUploader from './components/SheetArtUploader'
import TokenFramer from './components/TokenFramer'
import SkinSwitch from './components/SkinSwitch'
import VariantToggle from './components/VariantToggle'
import CustomizationSummary from './components/CustomizationSummary'
import CodexLayout from './codex/CodexLayout'
import DashboardLayout from './codex/DashboardLayout'
import PlayLayout from './codex/PlayLayout'
import InitiativePrompt from './components/InitiativePrompt'
import DescriptionsPanel from './components/DescriptionsPanel'
import CharacterGallery from './components/CharacterGallery'
import { md } from './lib/inline'

// A tab with an optional `module`: module tabs render only when the character's
// sheet_type registers that module (C8). Non-module tabs are always shown.
const TABS = [
  { id: 'overview', label: 'Overview', emoji: '◎' },
  { id: 'abilities', label: 'Abilities', emoji: '⬡' },
  { id: 'combat', label: 'Combat', emoji: '❤' },
  { id: 'attacks', label: 'Attacks', emoji: '✦' },
  { id: 'spells', label: 'Spells', emoji: '✨' },
  { id: 'forms', label: 'Forms', emoji: '⇡', module: 'forms' },
  { id: 'features', label: 'Features', emoji: '✧' },
  { id: 'business', label: 'Business', emoji: '💎', module: 'mlm' },
  { id: 'gear', label: 'Gear', emoji: '❖' },
  { id: 'story', label: 'Story', emoji: '❯' },
  { id: 'gallery', label: 'Gallery', emoji: '◲' },
] as const satisfies readonly { id: string; label: string; emoji: string; module?: SheetModuleId }[]

type TabId = (typeof TABS)[number]['id']

export default function App({ theme, sheetType, system, ownerName }: { theme?: SheetTheme; sheetType?: string; system?: string; ownerName?: string | null }) {
  const [tab, setTab] = useState<TabId>('overview')
  const { char, media, ledger, characterId, campaignId, isDM, canWrite, offline } = useChar()

  // Registry-driven config for this character's sheet_type (C8): which bespoke
  // skin + which character-only modules to render.
  const config = getSheetConfig(sheetType)
  const hasForms = config.modules.includes('forms')
  const hasStream = config.modules.includes('stream')
  const hasMlm = config.modules.includes('mlm')
  // Module tabs gate on sheet_type. The Spells tab is DATA-gated so martials like Lazzuh don't
  // get an empty tab — but that alone was a chicken-and-egg trap: a caster with no spells YET
  // had no tab, and the only place to add spells is inside it, so they could never get any
  // (owner 2026-07-19). Anyone who can edit the sheet now sees it, plus anyone who has spells,
  // spell slots, or a spellcasting ability set. A read-only viewer of a spell-less character
  // still doesn't get an empty tab.
  const hasSpellcasting =
    (char.spells?.length ?? 0) > 0 ||
    !!char.spellcasting?.ability ||
    Object.keys(char.spellcasting?.slots ?? {}).length > 0
  const visibleTabs = TABS.filter(
    (t) => (!('module' in t) || config.modules.includes(t.module)) && (t.id !== 'spells' || hasSpellcasting || canWrite),
  )

  // Colour theme / skin variant (Area TH). A skin can offer several palettes (the default Hextech skin's
  // Gold/Shadow-Isles/Noxus/Freljord set; the streamer's pink/blue). The chosen key lives on `char.skinVariant`
  // and resolves to a SheetTheme via `resolveThemeVariant`. An explicit `theme` prop wins; with NO chosen
  // variant we keep the sheet_type's own theme EXACTLY (so existing sheets are unchanged).
  const themeVariants = themeVariantsFor(config.skin)
  const hasThemePicker = themeVariants.length > 1
  const effectiveTheme = theme ?? (char.skinVariant ? resolveThemeVariant(config.skin, char.skinVariant).theme : config.theme)

  // The streamer additionally swaps the `.variant-<id>` class + per-variant art (§6.9) — a pink/blue-keyed
  // concern kept narrow here even though the theme key itself is now free-form.
  const supportsVariants = config.skin === 'streamer'
  const streamerVariant: 'pink' | 'blue' = char.skinVariant === 'blue' ? 'blue' : 'pink'
  // Per-variant art/token, falling back to the single DB art_url/token_url (media). An identity
  // `image`/`token` EFFECT (Slice 11) overlays the DISPLAYED portrait/token — a pendant that makes you
  // look like Zul — winning over the base here. Deliberately only at this DISPLAY site: the gallery
  // and token framer read base `media`, so they still manage the character's own art, not the costume.
  const vArt = supportsVariants ? char.variantArt?.[streamerVariant] : undefined
  const artUrl = ledger.identity('image')?.value ?? vArt?.art ?? media.artUrl
  const tokenUrl = ledger.identity('token')?.value ?? vArt?.token ?? media.tokenUrl
  // Portrait layout when the character has art: name/info left, full-body art right.
  const artBeside = !!artUrl

  // Which LAYOUT this sheet uses (CX-1). Defaults to 'classic', so every character that predates
  // the Codex — which is all of them — is untouched. The branch is deliberately placed HERE,
  // inside the themed `.dnd-sheet` root rather than above it, so the Codex inherits the skin
  // class, the `variant-<id>` class and the theme CSS variables exactly as the classic layout
  // does. That is what makes "any skin, any layout" true by construction instead of by a rule
  // someone has to remember.
  const layout = char.sheetLayout ?? 'classic'
  const isCodex = layout === 'codex'
  const isDashboard = layout === 'dashboard'
  const isPlay = layout === 'play'
  // Codex AND Play both carry identity themselves and lead with their own hero, so the page's big
  // round token and portrait header would be a redundant second copy pushing that hero below the
  // fold. Suppress both for either. (Dashboard keeps them — its identity column sits beside a grid,
  // not above a hero band.)
  const ownsIdentity = isCodex || isPlay

  // The ROLLER template (RO-2) is chosen INDEPENDENTLY of the sheet layout: a Codex sheet can roll with
  // the Dice Core. Resolve the character's explicit choice, else the default roller for the current
  // layout (so nothing regresses), and render THAT node in every path below instead of the one the shell
  // used to hardcode. All four rollers read the same store, so any renders under any layout. The
  // RollerTemplateBar (RO-4) rides above it so the player switches roller presentation FROM the roller.
  const rollerId = resolveRollerTemplate(char.rollerTemplate, layout)
  const rollerNode = (
    <>
      <RollerTemplateBar characterId={characterId} current={rollerId} canWrite={canWrite} />
      {rollerFor(rollerId)}
    </>
  )

  // A per-character theme overrides the stylesheet's default CSS variables here on
  // the scope root; omitted tokens keep the Lazzuh defaults from theme.css (C7). A
  // registered `skin` adds a `skin-<id>` class (+ `variant-<id>` for the streamer)
  // that unlocks its bespoke CSS treatment scoped under `.dnd-sheet.skin-<id>` (C8).
  // `sheet-shell` carries the shared FORMAT layout rules (codex/dashboard/play CSS), scoped apart from
  // theme.css's broad `.dnd-sheet` element rules so the same shells can render inside a bespoke PF2/IG
  // sheet without those rules bleeding onto its panels (T-SHELL-SCOPE). The 5e root carries both.
  const rootClass = `dnd-sheet sheet-shell${config.skin ? ` skin-${config.skin}` : ''}${supportsVariants ? ` variant-${streamerVariant}` : ''}`
  return (
    <SheetConfigProvider sheetType={sheetType} system={system}>
    {/* data-system makes the character's ruleset visible in the DOM — it decides which glossary
        the sheet's rule links resolve against, so being able to see it is worth the attribute. */}
    <div className={rootClass} data-system={system ?? 'ambiguous'} style={themeToCssVars(effectiveTheme)}>
      <div className="wrap">
      {/* Offline indicator (L10) — the DB is unreachable; edits are cached locally and
          will sync automatically when it returns. */}
      {offline && (
        <div
          role="status"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '6px 12px',
            marginBottom: 12,
            fontSize: 12.5,
            border: '1px solid var(--warn, #e0a83a)',
            color: 'var(--warn, #e0a83a)',
            background: 'rgba(224, 168, 58, 0.08)',
            borderRadius: 4,
          }}
        >
          <span aria-hidden>⚠️</span>
          Offline — changes are saved on this device and will sync when the connection returns.
        </div>
      )}
      {/* Round profile token (D2). Falls back to the hero art cropped to the top
          (her face) when no dedicated token is uploaded — so a full-body art still
          gives a face icon. */}
      {/* Not in the Codex: its identity column carries the portrait, and a second copy of the
          same face directly above it is noise, not navigation. */}
      {!ownsIdentity && (tokenUrl || artUrl) && (
        <div
          className="token-frame"
          style={{
            marginBottom: 12,
            width: 76,
            height: 76,
            borderRadius: '50%',
            overflow: 'hidden',
            border: '2px solid var(--violet-2)',
            boxShadow: '0 0 12px rgba(139, 92, 246, 0.5)',
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={tokenUrl ?? artUrl ?? ''}
            alt={`${char.meta.name} — token`}
            style={{
              width: '100%',
              height: '100%',
              display: 'block',
              objectFit: 'cover',
              // Adjustable framing (D2): focus point + zoom set via the token framer;
              // default centers a token, or shows the top of a full-body art (face).
              objectPosition: char.tokenFocus ? `${char.tokenFocus.x}% ${char.tokenFocus.y}%` : tokenUrl ? 'center' : '50% 8%',
              transform: char.tokenFocus && char.tokenFocus.zoom > 1 ? `scale(${char.tokenFocus.zoom})` : undefined,
              transformOrigin: char.tokenFocus ? `${char.tokenFocus.x}% ${char.tokenFocus.y}%` : 'center',
            }}
          />
        </div>
      )}

      {/* Header: name / race / info on the LEFT, full-body character art on the RIGHT
          (portrait layout, same for every sheet). Wraps to stacked on narrow screens.
          Falls back to just the hero when the character has no art yet. */}
      {/* Also not in the Codex: name, class, level and the art all move INTO the identity
          column, which is the layout's entire premise. Rendering the hero above it would push
          the two-column split below the fold on the screens the Codex exists for. */}
      {ownsIdentity ? null : artBeside ? (
        <div className="hero-portrait" style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap', marginBottom: 4 }}>
          <div style={{ flex: '1 1 360px', minWidth: 0 }}>
            <Hero />
          </div>
          <div className="card art-frame" style={{ flex: '0 1 320px', padding: 8, alignSelf: 'flex-start', textAlign: 'center' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={artUrl ?? ''}
              alt={`${char.meta.name} — character art`}
              // Scale to fit the frame, keep aspect ratio, show the whole image.
              style={{ display: 'inline-block', maxWidth: '100%', maxHeight: 560, width: 'auto', height: 'auto', borderRadius: 4 }}
            />
          </div>
        </div>
      ) : (
        <Hero />
      )}

      {/* Pink/blue style switch (streamer skin only) — swaps theme, class, and art. */}
      {hasThemePicker && <SkinSwitch variants={themeVariants} />}
      {/* The template (layout) switch used to live HERE, buried inside the 5e engine — which is
          exactly why the owner couldn't find it and why it never appeared for PF2/IG. It is now the
          page-chrome `TemplateBrowser`, surfaced for every system beside the skin picker (T-1). */}
      {/* Vanilla ⇄ Custom, and the customization summary directly beneath it — the two belong
          together: the toggle is what LETS a character hold custom content, and the summary is
          what REPORTS it. Both render for every layout, above the split, so they are the first
          thing a player sees about how their character deviates from the rules. */}
      <VariantToggle />
      <CustomizationSummary />
      {/* Owner-DM art/token uploader — per-variant when the skin has variants (D1/D2). */}
      <SheetArtUploader variant={supportsVariants ? streamerVariant : undefined} />
      {/* Adjust which part of the (variant-aware) image the round token crops from (D2). */}
      <TokenFramer src={tokenUrl ?? artUrl ?? undefined} />

      {/* The streamer's own controls (go live / end stream + NeoNuggets exchange) — renders for a
          non-DM owner on a stream character, inside a campaign or out (owner 2026-07-19).
          Returns null otherwise. */}
      {hasStream && <StreamOwnerControls />}

      {/* Outside a campaign, the character's OWNER gets the FULL stream director controls — go live, viewers,
          AI chat director, polls/alerts, moderation — exactly like the DM (owner 2026-07-18). Inside a campaign
          this is hidden for the owner; only the DM's panel (below) drives the stream. StreamControl self-gates
          to isDM || (owner && !campaign), so this render is the owner-outside-campaign path. */}
      {hasStream && canWrite && !isDM && !campaignId && <StreamControl />}

      {/* DM control panel — renders only in DM mode (§6.8.1 / C10). Stream controls
          inside it show only for characters with the `stream` module. */}
      <DmOverridePanel hasStream={hasStream} />

      {isCodex ? (
        <CodexLayout artUrl={artUrl} ownerName={ownerName} roller={rollerNode} />
      ) : isDashboard ? (
        <DashboardLayout artUrl={artUrl} ownerName={ownerName} roller={rollerNode} />
      ) : isPlay ? (
        <PlayLayout artUrl={artUrl} ownerName={ownerName} roller={rollerNode} />
      ) : (
      <div className="appgrid">
        <div className="maincol">
          {/* Cross-cutting panels (conditions, active effects, reactions, edit review) sit ABOVE the tab bar
              so each tab's info renders DIRECTLY beneath the tab selector, not pushed down by these
              (owner 2026-07-18). Applies wherever a sheet uses this tabbed engine layout. */}
          <ConditionTracker />
          <ActiveEffects />
          <Reactions />
          <EditReviewPanel />

          <div className="stickyhead">
            <StatRail />
            <nav className="tabs">
              {visibleTabs.map((t) => (
                <button key={t.id} className={`tab ${tab === t.id ? 'on' : ''}`} onClick={() => setTab(t.id)}>
                  <span className="tab-emoji">{t.emoji}</span>
                  {t.label}
                </button>
              ))}
            </nav>
          </div>

          <div className="tabpane" key={tab}>
            {tab === 'overview' && (
          <>
            <section>
              <div className="card">
                <h3>Dossier</h3>
                {char.bio.intro.map((p, i) => (
                  <p key={i}>{md(p)}</p>
                ))}
              </div>
            </section>
            <Resources />
          </>
        )}

        {tab === 'abilities' && (
          <>
            <Abilities />
            <SavesSkills />
          </>
        )}

        {tab === 'combat' && (
          <>
            <CombatPanel />
            <Resources />
          </>
        )}

        {tab === 'attacks' && <Attacks />}
        {tab === 'spells' && <SpellsPanel />}

        {tab === 'forms' && hasForms && (
          <>
            <FormAbilities />
            <Forms />
          </>
        )}

        {tab === 'features' && (
          <>
            <Features />
            <Balance />
            <Progression />
          </>
        )}

            {tab === 'business' && hasMlm && <MlmPanel />}

            {tab === 'gear' && <Inventory />}

            {tab === 'story' && (
              <>
                <Bio />
                <DescriptionsPanel />
              </>
            )}

            {tab === 'gallery' && <CharacterGallery />}
          </div>

          <div className="footer">
            {[
              char.meta.name,
              [char.meta.species, char.meta.className, char.meta.level].filter(Boolean).join(' '),
              char.meta.subclass,
              char.dmNote,
            ]
              .filter((s) => s != null && String(s).trim() !== '')
              .join(' · ')
              .toUpperCase()}
            <br />
            click a stat to roll · double-click to edit
          </div>
        </div>

        {/* The roller is a floating tool window (R-2): pinned in the viewport, movable, resizable,
            minimizable, and remembered per character. The dock owns the chrome; the roller node the rolls.
            The NODE is the chosen roller template (RO-2), not a hardcoded Dice Core — so the roller choice
            is independent of the sheet layout even on Classic. `position: fixed`, so no in-flow column. */}
        <FloatingRoller characterId={characterId}>
          {rollerNode}
        </FloatingRoller>
      </div>
      )}

      {/* Live-stream feature (chat + influence meter + alerts/polls) — only for
          characters whose sheet_type registers the `stream` module (§6.9). */}
      {hasStream && characterId && <StreamAlert characterId={characterId} />}
      {hasStream && characterId && <StreamPoll characterId={characterId} isController={isDM || (canWrite && !isDM && !campaignId)} isOwner={canWrite && !isDM} campaignId={campaignId ?? undefined} />}
      {/* A fellow party member watching this stream (not the streamer/owner or DM) can
          chat as a viewer and tip the streamer their own notes. */}
      {hasStream && characterId && <StreamChat characterId={characterId} campaignId={campaignId} viewerCanChat={!isDM && !canWrite} />}

      {/* DM-broadcast initiative roller — dims the screen + rolls with this
          character's bonus when the DM sends it out; flavor per sheet_type. */}
      {characterId && campaignId && <InitiativePrompt flavor={config.initiative} />}
      </div>
    </div>
    </SheetConfigProvider>
  )
}

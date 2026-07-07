'use client'
// Vendored Lazzuh sheet shell (Phase C). The `.dnd-sheet` wrapper is the scope
// root for the machine-scoped theme.css imported below — every rule in that file
// is prefixed with `.dnd-sheet`, so the sheet's global styles (background, fonts,
// scrollbars) apply here without leaking onto the rest of the Starr site.
import { useState } from 'react'
import './styles/theme.css'
import { themeToCssVars, streamerThemeBlue, type SheetTheme } from './theme'
import { getSheetConfig, type SheetModuleId } from './registry'
import { useChar } from './state/store'
import StreamChat from './components/StreamChat'
import StreamPoll from './components/StreamPoll'
import StreamAlert from './components/StreamAlert'
import ConditionTracker from './components/ConditionTracker'
import Hero from './components/Hero'
import StatRail from './components/StatRail'
import Abilities from './components/Abilities'
import SavesSkills from './components/SavesSkills'
import CombatPanel from './components/CombatPanel'
import Resources from './components/Resources'
import Attacks from './components/Attacks'
import Forms from './components/Forms'
import FormAbilities from './components/FormAbilities'
import Features from './components/Features'
import Balance from './components/Balance'
import Progression from './components/Progression'
import Inventory from './components/Inventory'
import Bio from './components/Bio'
import DiceTray from './components/DiceTray'
import DmOverridePanel from './components/DmOverridePanel'
import SheetArtUploader from './components/SheetArtUploader'
import TokenFramer from './components/TokenFramer'
import SkinSwitch from './components/SkinSwitch'
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
  { id: 'forms', label: 'Forms', emoji: '⇡', module: 'forms' },
  { id: 'features', label: 'Features', emoji: '✧' },
  { id: 'gear', label: 'Gear', emoji: '❖' },
  { id: 'story', label: 'Story', emoji: '❯' },
  { id: 'gallery', label: 'Gallery', emoji: '◲' },
] as const satisfies readonly { id: string; label: string; emoji: string; module?: SheetModuleId }[]

type TabId = (typeof TABS)[number]['id']

export default function App({ theme, sheetType }: { theme?: SheetTheme; sheetType?: string }) {
  const [tab, setTab] = useState<TabId>('overview')
  const { char, media, characterId, campaignId, isDM, offline } = useChar()

  // Registry-driven config for this character's sheet_type (C8): which bespoke
  // skin + which character-only modules to render.
  const config = getSheetConfig(sheetType)
  const hasForms = config.modules.includes('forms')
  const hasStream = config.modules.includes('stream')
  const visibleTabs = TABS.filter((t) => !('module' in t) || config.modules.includes(t.module))

  // Streamer skin variant (pink | blue) — the player toggles it; it swaps the color
  // theme, the `.variant-<id>` class, AND the character art/token (§6.9).
  const supportsVariants = config.skin === 'streamer'
  const variant = supportsVariants ? char.skinVariant ?? 'pink' : 'pink'
  // An explicit theme prop wins; otherwise the variant's theme, else the sheet_type's.
  const effectiveTheme = theme ?? (supportsVariants && variant === 'blue' ? streamerThemeBlue : config.theme)

  // Per-variant art/token, falling back to the single DB art_url/token_url (media).
  const vArt = supportsVariants ? char.variantArt?.[variant] : undefined
  const artUrl = vArt?.art ?? media.artUrl
  const tokenUrl = vArt?.token ?? media.tokenUrl
  // Portrait layout when the character has art: name/info left, full-body art right.
  const artBeside = !!artUrl

  // A per-character theme overrides the stylesheet's default CSS variables here on
  // the scope root; omitted tokens keep the Lazzuh defaults from theme.css (C7). A
  // registered `skin` adds a `skin-<id>` class (+ `variant-<id>` for the streamer)
  // that unlocks its bespoke CSS treatment scoped under `.dnd-sheet.skin-<id>` (C8).
  const rootClass = `dnd-sheet${config.skin ? ` skin-${config.skin}` : ''}${supportsVariants ? ` variant-${variant}` : ''}`
  return (
    <div className={rootClass} style={themeToCssVars(effectiveTheme)}>
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
      {(tokenUrl || artUrl) && (
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
      {artBeside ? (
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
      {supportsVariants && <SkinSwitch />}
      {/* Owner-DM art/token uploader — per-variant when the skin has variants (D1/D2). */}
      <SheetArtUploader variant={supportsVariants ? variant : undefined} />
      {/* Adjust which part of the (variant-aware) image the round token crops from (D2). */}
      <TokenFramer src={tokenUrl ?? artUrl ?? undefined} />

      {/* DM control panel — renders only in DM mode (§6.8.1 / C10). Stream controls
          inside it show only for characters with the `stream` module. */}
      <DmOverridePanel hasStream={hasStream} />

      <div className="appgrid">
        <div className="maincol">
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

          <ConditionTracker />

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

        <div className="sidecol">
          <DiceTray />
        </div>
      </div>

      {/* Live-stream feature (chat + influence meter + alerts/polls) — only for
          characters whose sheet_type registers the `stream` module (§6.9). */}
      {hasStream && characterId && <StreamAlert characterId={characterId} />}
      {hasStream && characterId && <StreamPoll characterId={characterId} isController={isDM} />}
      {hasStream && characterId && <StreamChat characterId={characterId} campaignId={campaignId} />}

      {/* DM-broadcast initiative roller — dims the screen + rolls with this
          character's bonus when the DM sends it out; flavor per sheet_type. */}
      {characterId && campaignId && <InitiativePrompt flavor={config.initiative} />}
      </div>
    </div>
  )
}

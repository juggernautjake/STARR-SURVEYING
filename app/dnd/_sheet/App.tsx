'use client'
// Vendored Lazzuh sheet shell (Phase C). The `.dnd-sheet` wrapper is the scope
// root for the machine-scoped theme.css imported below — every rule in that file
// is prefixed with `.dnd-sheet`, so the sheet's global styles (background, fonts,
// scrollbars) apply here without leaking onto the rest of the Starr site.
import { useState } from 'react'
import './styles/theme.css'
import { themeToCssVars, type SheetTheme } from './theme'
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
  const visibleTabs = TABS.filter((t) => !('module' in t) || config.modules.includes(t.module))
  // An explicit theme prop wins; otherwise fall back to the sheet_type's theme (C7).
  const effectiveTheme = theme ?? config.theme

  // A per-character theme overrides the stylesheet's default CSS variables here on
  // the scope root; omitted tokens keep the Lazzuh defaults from theme.css (C7). A
  // registered `skin` adds a `skin-<id>` class that unlocks its bespoke CSS treatment
  // (pixel frames, scanlines, glitch…) scoped under `.dnd-sheet.skin-<id>` (C8).
  const rootClass = `dnd-sheet${config.skin ? ` skin-${config.skin}` : ''}`
  // The streamer skin shows the full-body art beside the hero (portrait layout).
  const streamerArtBeside = config.skin === 'streamer' && !!media.artUrl
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
      {(media.tokenUrl || media.artUrl) && (
        <div className="token-frame" style={{ marginBottom: 12 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={media.tokenUrl ?? media.artUrl ?? ''}
            alt={`${char.meta.name} — token`}
            style={{
              width: 76,
              height: 76,
              borderRadius: '50%',
              objectFit: 'cover',
              objectPosition: media.tokenUrl ? 'center' : '50% 8%',
              border: '2px solid var(--violet-2)',
              boxShadow: '0 0 12px rgba(139, 92, 246, 0.5)',
            }}
          />
        </div>
      )}

      {/* Hero. For the streamer skin, the full-body art sits to the RIGHT of the
          name / race / stats block (portrait layout); other sheets keep the art in a
          card below (further down). */}
      {streamerArtBeside ? (
        <div className="hero-portrait" style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap', marginBottom: 4 }}>
          <div style={{ flex: '1 1 360px', minWidth: 0 }}>
            <Hero />
          </div>
          <div className="card art-frame" style={{ flex: '0 1 300px', padding: 8, alignSelf: 'stretch', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={media.artUrl ?? ''}
              alt={`${char.meta.name} — character art`}
              style={{ width: '100%', maxHeight: 560, objectFit: 'contain', display: 'block', borderRadius: 4 }}
            />
          </div>
        </div>
      ) : (
        <Hero />
      )}

      {/* Owner-DM art/token uploader — sets the images shown here + in the gallery (D1/D2). */}
      <SheetArtUploader />

      {/* Character art (D1) — card below the hero for non-portrait layouts. */}
      {media.artUrl && !streamerArtBeside && (
        <div className="card art-frame" style={{ padding: 8, marginBottom: 14 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={media.artUrl}
            alt={`${char.meta.name} — character art`}
            style={{ width: '100%', maxHeight: 440, objectFit: 'cover', display: 'block', borderRadius: 4 }}
          />
        </div>
      )}

      {/* DM control panel — renders only in DM mode (§6.8.1 / C10). */}
      <DmOverridePanel />

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

      {characterId && <StreamAlert characterId={characterId} />}
      {characterId && <StreamPoll characterId={characterId} isController={isDM} />}
      {characterId && <StreamChat characterId={characterId} campaignId={campaignId} />}
      </div>
    </div>
  )
}

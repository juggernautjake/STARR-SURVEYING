'use client'
// PlayLayout — the 5e ADAPTER for the Play format (T-SHELL). It runs inside the sheet provider,
// builds the 5e-specific identity strip, act-now furniture, and the big HERO (vitals + ability
// quick-roll + attacks), computes the drawer panels, and hands them to the pure `PlayShell`.
//
// Correctness comes from REUSE, not re-implementation: the vitals are the same `CombatPanel`, the
// actions the same `Attacks`, the quick-roll row the same `Abilities`, and the drawer is the shared
// `useFivePanels()` set minus the hero panels. So every number and every roll is the sheet's one
// answer — Play only rearranges where they sit and how big they are. PF2/IG reach the same Play format
// by building THEIR own hero + identity and feeding the same PlayShell (later slices).
import { useChar } from '../state/store'
import { useSheetSystem } from '../state/sheetConfig'
import { classDisplayFor } from '@/lib/dnd/classes/multiclass-resolve'
import { useFivePanels } from '../panels/fivePanels'
import PlayShell from '../shells/PlayShell'
import Abilities from '../components/Abilities'
import CombatPanel from '../components/CombatPanel'
import Attacks from '../components/Attacks'
import Resources from '../components/Resources'
import ConditionTracker from '../components/ConditionTracker'
import ActiveEffects from '../components/ActiveEffects'
import EditReviewPanel from '../components/EditReviewPanel'
import Reactions from '../components/Reactions'
import ImpactRoller from '../components/rollers/ImpactRoller'

// The panels Play promotes to the hero band; the reference drawer shows everything ELSE from the
// same shared set, so nothing is lost and the drawer never double-lists what is already up top.
// `abilities` is here too because the hero's quick-roll row already renders <Abilities/> — without
// it the ability scores would appear both in the hero and again in the drawer.
const HERO_PANELS = new Set(['combat', 'attacks', 'abilities'])

export default function PlayLayout({ artUrl, ownerName, roller }: { artUrl?: string | null; ownerName?: string | null; roller?: React.ReactNode }) {
  const { char, characterId } = useChar()
  const system = useSheetSystem()
  const panels = useFivePanels()
  const drawerPanels = panels.filter((p) => !HERO_PANELS.has(p.id))

  const meta = char.meta
  const subtitle = [
    classDisplayFor(system, meta), // multiclass split when 2+ classes, else class · subclass (MC-5e-5)
    meta.species,
    meta.level != null ? `Level ${meta.level}` : null,
  ]
    .filter(Boolean)
    .join('  ·  ')

  // Compact identity — a face, a name, one line of who-they-are. Play spends its vertical budget on
  // vitals and actions, so identity is a strip, not a column.
  const identity = (
    <header className="play-id">
      {artUrl && (
        <div className="play-portrait">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={artUrl}
            alt={`${meta.name} — character art`}
            style={{
              objectPosition: char.tokenFocus ? `${char.tokenFocus.x}% ${char.tokenFocus.y}%` : '50% 12%',
              transform: char.tokenFocus && char.tokenFocus.zoom > 1 ? `scale(${char.tokenFocus.zoom})` : undefined,
              transformOrigin: char.tokenFocus ? `${char.tokenFocus.x}% ${char.tokenFocus.y}%` : 'center',
            }}
          />
        </div>
      )}
      <div className="play-id-text">
        <h2 className="play-name">{meta.name}</h2>
        {subtitle && <p className="play-sub">{subtitle}</p>}
        {ownerName && <p className="play-owner">Played by {ownerName}</p>}
      </div>
    </header>
  )

  const above = (
    <>
      {/* Act-now furniture must never be buried below a hero band or inside the drawer. */}
      <EditReviewPanel />
      <Reactions />
      {/* Conditions + active effects sit directly under identity — they change every vital below. */}
      <div className="play-status">
        <ConditionTracker />
        <ActiveEffects />
      </div>
    </>
  )

  const hero = (
    <>
      <section className="play-vitals" aria-label="Vitals">
        <CombatPanel />
        <Resources />
      </section>
      <section className="play-quickroll" aria-label="Ability checks">
        <Abilities />
      </section>
      <section className="play-attacks" aria-label="Attacks and actions">
        <h3 className="play-h">Attacks &amp; Actions</h3>
        <Attacks />
      </section>
    </>
  )

  return (
    <PlayShell
      identity={identity}
      above={above}
      hero={hero}
      // Chosen roller template (RO-2) from App; Impact is the DEFAULT when none is threaded.
      roller={roller ?? <ImpactRoller />}
      storageKey={characterId}
      drawerPanels={drawerPanels}
      drawerHint="skills · abilities · features · spells · gear · story"
    />
  )
}

'use client'
// PlayLayout — the "Play mode" template (T-4). Built for the table, not the workshop: the things you
// touch DURING a fight are big and up front, and everything you only look up occasionally is folded
// into one reference drawer.
//
// It is deliberately a different SHAPE from the other formats, not a reskin:
//   - Classic  = one section at a time behind tabs.
//   - Codex    = identity column + a rail of resizable panes you curate.
//   - Dashboard= identity column + every panel a card, all open.
//   - Play     = a vitals band + an actions block as the hero, reference in a drawer.
//
// Correctness comes from REUSE, not re-implementation: the vitals are the same `CombatPanel`, the
// actions the same `Attacks`, the quick-roll row the same `Abilities`, and the drawer is the shared
// `useFivePanels()` set with the two hero panels removed. So every number and every roll is the sheet's
// one answer — Play only rearranges where they sit and how big they are. Styling is theme-token only
// (`play.css`), so all five skins apply with no format-specific rule, exactly as the Codex does.
import { useState } from 'react'
import { useChar } from '../state/store'
import { useFivePanels } from '../panels/fivePanels'
import Abilities from '../components/Abilities'
import CombatPanel from '../components/CombatPanel'
import Attacks from '../components/Attacks'
import Resources from '../components/Resources'
import ConditionTracker from '../components/ConditionTracker'
import ActiveEffects from '../components/ActiveEffects'
import EditReviewPanel from '../components/EditReviewPanel'
import Reactions from '../components/Reactions'
import DiceTray from '../components/DiceTray'

// The panels Play promotes to the hero band; the reference drawer shows everything ELSE from the
// same shared set, so nothing is lost and the drawer never double-lists what is already up top.
// `abilities` is here too because the hero's quick-roll row already renders <Abilities/> — without
// it the ability scores would appear both in the hero and again in the drawer.
const HERO_PANELS = new Set(['combat', 'attacks', 'abilities'])

export default function PlayLayout({ artUrl, ownerName }: { artUrl?: string | null; ownerName?: string | null }) {
  const { char } = useChar()
  const panels = useFivePanels()
  const reference = panels.filter((p) => !HERO_PANELS.has(p.id))
  const [openDrawer, setOpenDrawer] = useState(false)

  const meta = char.meta
  const subtitle = [
    [meta.className, meta.subclass].filter(Boolean).join(' · '),
    meta.species,
    meta.level != null ? `Level ${meta.level}` : null,
  ]
    .filter(Boolean)
    .join('  ·  ')

  return (
    <div className="play">
      {/* Compact identity — a face, a name, one line of who-they-are. Play spends its vertical budget
          on vitals and actions, so identity is a strip, not a column. */}
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

      {/* Act-now furniture stays at the very top for the same reason as the Codex: a pending review
          or a reaction prompt must never be buried below a hero band or inside the drawer. */}
      <EditReviewPanel />
      <Reactions />

      {/* Conditions + active effects sit directly under identity — they change every vital below, and
          at the table you glance here first ("am I still Frightened?"). */}
      <div className="play-status">
        <ConditionTracker />
        <ActiveEffects />
      </div>

      {/* THE HERO — vitals and actions, big. */}
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

      {/* The roller is docked below the hero. Play's bespoke "Impact Roller" is a following slice
          (T-DICE-PLAY); until then it shares the Dice Core so rolling works from day one. */}
      <div className="play-tray"><DiceTray /></div>

      {/* THE DRAWER — everything you only reach for occasionally, behind one toggle. Closed by default
          so the table view is vitals + actions; opens to the full reference stacked. */}
      <section className="play-ref" aria-label="Reference">
        <button
          type="button"
          className="play-ref-toggle"
          aria-expanded={openDrawer}
          onClick={() => setOpenDrawer((v) => !v)}
        >
          <span className="play-ref-caret" aria-hidden>{openDrawer ? '▾' : '▸'}</span>
          Reference
          <span className="play-ref-hint">skills · abilities · features · spells · gear · story</span>
        </button>
        {openDrawer && (
          <div className="play-ref-body">
            {reference.map((p) => (
              <section key={p.id} className="play-ref-card" data-panel={p.id} aria-label={p.label}>
                <h4 className="play-ref-h">
                  <span aria-hidden className="play-ref-emoji">{p.emoji}</span>
                  {p.label}
                  {p.count != null && <span className="play-ref-count"> · {p.count}</span>}
                </h4>
                <div className="play-ref-panel">{p.render()}</div>
              </section>
            ))}
          </div>
        )}
      </section>

      <div className="footer">tap a vital or attack to roll · double-click to edit · open Reference for the rest</div>
    </div>
  )
}

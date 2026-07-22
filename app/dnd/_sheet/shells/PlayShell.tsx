'use client'
// PlayShell — the pure "Play mode" FORMAT (T-SHELL): built for the table. A compact identity strip,
// any act-now furniture, a big HERO block, a docked roller, and everything else folded into one
// collapsible reference drawer.
//
// Unlike the Codex/Dashboard shells, Play's hero is genuinely SYSTEM-SPECIFIC (5e leads with vitals +
// ability quick-roll + attacks; PF2 would lead with defenses + strikes), so the shell does not take a
// flat panel list to arrange — it takes a ready-made `hero` node from the adapter plus the
// `drawerPanels` (the sections that go in the drawer). Every number is still the system's one answer;
// the shell only decides the table-vs-reference split and owns the drawer's open/closed state.
//
// Styling is theme-token only (`play.css`), so all five skins apply with no format-specific rule.
import { useState } from 'react'
import type { ReactNode } from 'react'
import FloatingRoller from '../components/rollers/FloatingRoller'
import type { SheetPanel } from '../panels/fivePanels'

export default function PlayShell({
  identity,
  above,
  hero,
  roller,
  drawerPanels,
  drawerHint,
  storageKey,
}: {
  /** The compact identity strip (portrait + name + who-they-are) — each system supplies its own. */
  identity: ReactNode
  /** Act-now furniture pinned above the hero (5e: review queue + reactions + conditions/effects). */
  above?: ReactNode
  /** The big table-facing hero — SYSTEM-SPECIFIC (5e: vitals + ability quick-roll + attacks). */
  hero: ReactNode
  /** The format's docked roller — Play's bespoke "Impact Roller" is a following slice (T-DICE-PLAY). */
  roller: ReactNode
  /** The sections tucked into the reference drawer (everything not promoted to the hero). */
  drawerPanels: SheetPanel[]
  /** A short hint of what the drawer holds, shown on the toggle (e.g. "skills · features · gear"). */
  drawerHint?: string
  /** Per-character key for the floating roller's remembered position/size/minimized (view preference). */
  storageKey?: string | null
}) {
  const [openDrawer, setOpenDrawer] = useState(false)

  return (
    <div className="play">
      {identity}

      {above}

      {hero}

      {/* Floating tool window (R-2): pinned in the viewport, movable, resizable, minimizable, remembered. */}
      <FloatingRoller characterId={storageKey}>{roller}</FloatingRoller>

      {/* THE DRAWER — everything reached for only occasionally, behind one toggle. Closed by default so
          the table view is identity + hero; opens to the full reference stacked. */}
      <section className="play-ref" aria-label="Reference">
        <button
          type="button"
          className="play-ref-toggle"
          aria-expanded={openDrawer}
          onClick={() => setOpenDrawer((v) => !v)}
        >
          <span className="play-ref-caret" aria-hidden>{openDrawer ? '▾' : '▸'}</span>
          Reference
          {drawerHint && <span className="play-ref-hint">{drawerHint}</span>}
        </button>
        {openDrawer && (
          <div className="play-ref-body">
            {drawerPanels.map((p) => (
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

'use client'
// DashboardShell — the pure "Dashboard" FORMAT (T-SHELL). It arranges an identity node, a panel set,
// a roller and any act-now furniture into a reflowing card grid, and knows NOTHING about any system's
// data model. A per-system adapter computes those parts (5e: `DashboardLayout`; PF2/IG: their sheets,
// later slices) and passes them in — so the SAME format renders every system. This is the seam that
// makes "4 formats × 4 systems" 4 + 4 units of work: the format lives here once, each system feeds it.
//
// Styling is theme-token only (the `.dash-*` rules in codex.css), so every skin applies with no
// format-specific rule — a test forbids any `.skin-x .dash-y` selector.
import type { ReactNode } from 'react'
import FloatingRoller from '../components/rollers/FloatingRoller'
import type { SheetPanel } from '../panels/fivePanels'

export default function DashboardShell({
  identity,
  panels,
  roller,
  above,
  storageKey,
}: {
  /** The left identity/vitals column — each system supplies its own (5e: `IdentityColumn`). */
  identity: ReactNode
  /** The ordered section set this system exposes; each renders as a card. */
  panels: SheetPanel[]
  /** The format's dice roller — floated by the shared dock (R-2); the system decides which roller. */
  roller: ReactNode
  /** Optional act-now furniture pinned above the grid (5e: the review queue + reactions), so a
   *  prompt to act is never buried inside a card the player may have scrolled past. */
  above?: ReactNode
  /** Per-character key so the floating roller's position/size/minimized state does not follow the
   *  player between characters (a view preference, never synced — see useFloatingDock). */
  storageKey?: string | null
}) {
  return (
    <div className="dashboard">
      {identity}

      <div className="dash-main">
        {above}

        <div className="dash-grid">
          {panels.map((p) => (
            <section key={p.id} className="dash-card" data-panel={p.id} aria-label={p.label}>
              <header className="dash-card-head">
                <span aria-hidden className="dash-card-emoji">{p.emoji}</span>
                <span className="dash-card-title">{p.label}</span>
                {p.count != null && <span className="dash-card-count">· {p.count}</span>}
              </header>
              {/* Scroll lives on the card body past a max height, so one long section (a full spell
                  list) does not stretch the whole row — the grid stays scannable. */}
              <div className="dash-card-body">{p.render()}</div>
            </section>
          ))}
        </div>

        {/* Floating tool window (R-2): pinned, movable, resizable, minimizable, remembered. */}
        <FloatingRoller characterId={storageKey}>{roller}</FloatingRoller>
        <div className="footer">click a stat to roll · double-click to edit · every section is open at once</div>
      </div>

      {/* A cheap "is there anything to show" guard, so a brand-new blank character does not render an
          empty grid with no explanation. */}
      {panels.length === 0 && <p className="dash-empty">This character has no sections yet.</p>}
    </div>
  )
}

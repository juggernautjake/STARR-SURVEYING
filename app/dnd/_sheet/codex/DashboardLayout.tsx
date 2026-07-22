'use client'
// DashboardLayout — the "Dashboard" template (T-3). Identity column on the left, and on the right
// EVERY panel as a card in a reflowing grid, so the whole character is visible at once.
//
// It shares the Codex's building blocks on purpose — the same `IdentityColumn` and the same
// `useFivePanels()` set — and differs in ONE deliberate way that makes it its own format rather
// than a Codex reskin: the panels are laid out as a responsive CARD GRID (all open, no rail, no
// resize), where the Codex is a vertical stack of tall tabs you open and resize. Dashboard is
// "see everything, scan"; Codex is "curate what's open, size it". Same data, same panels, a
// different question answered — which is exactly what the template axis is for.
//
// Styling is theme-token only (shared `codex.css`), so every skin applies with no format-specific
// rule, exactly as the Codex does.
import { useChar } from '../state/store'
import { useFivePanels } from '../panels/fivePanels'
import IdentityColumn from './IdentityColumn'
import EditReviewPanel from '../components/EditReviewPanel'
import Reactions from '../components/Reactions'
import DiceTray from '../components/DiceTray'

export default function DashboardLayout({ artUrl, ownerName }: { artUrl?: string | null; ownerName?: string | null }) {
  const { char } = useChar()
  const panels = useFivePanels()

  return (
    <div className="dashboard">
      <IdentityColumn artUrl={artUrl} ownerName={ownerName} />

      <div className="dash-main">
        {/* The act-now furniture stays above the grid, same reasoning as the Codex: a review queue
            or a reaction prompt must not be buried in a card the player may have scrolled past. */}
        <EditReviewPanel />
        <Reactions />

        <div className="dash-grid">
          {panels.map((p) => (
            <section key={p.id} className="dash-card" data-panel={p.id} aria-label={p.label}>
              <header className="dash-card-head">
                <span aria-hidden className="dash-card-emoji">{p.emoji}</span>
                <span className="dash-card-title">{p.label}</span>
                {p.count != null && <span className="dash-card-count">· {p.count}</span>}
              </header>
              {/* The scroll lives on the card body past a max height, so one long section (a full
                  spell list) does not stretch the whole row — the grid stays scannable. */}
              <div className="dash-card-body">{p.render()}</div>
            </section>
          ))}
        </div>

        {/* The dice tray is docked below the grid, as in the Codex — the two columns have already
            spent the horizontal budget. (Its bespoke "Roll Board" roller is a following slice.) */}
        <div className="dash-tray"><DiceTray /></div>
        <div className="footer">click a stat to roll · double-click to edit · every section is open at once</div>
      </div>

      {/* A cheap "is there anything to show" guard, so a brand-new blank character does not render an
          empty grid with no explanation. */}
      {panels.length === 0 && <p className="dash-empty">This character has no sections yet.</p>}
      {/* keep `char` referenced so the layout re-renders on any sheet change */}
      <span hidden aria-hidden>{char.meta.name}</span>
    </div>
  )
}

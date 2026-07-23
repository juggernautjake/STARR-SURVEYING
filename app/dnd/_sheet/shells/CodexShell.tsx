'use client'
// CodexShell — the pure "Codex" FORMAT (T-SHELL): an identity column on the left, and on the right a
// vertical rail of tall tabs opening simultaneously-open, resizable panes. It arranges an identity
// node, a panel set, a roller and any act-now furniture, and knows NOTHING about any system's data —
// a per-system adapter computes those and passes them in (5e: `CodexLayout`; PF2/IG: later slices).
//
// The pane-stack machinery (which pane is open, how tall) is FORMAT logic, not system logic — it
// operates on the panel ids — so it lives here. It only needs a per-character storage key so one
// character's open/resized layout does not follow the player to another; the adapter supplies it.
//
// Styling is theme-token only (`.codex-*` in codex.css) so every skin applies with no format-specific
// rule — a test forbids any `.skin-x .codex-y` selector.
import { useMemo } from 'react'
import type { ReactNode } from 'react'
import PaneStack, { type PaneDef } from '../codex/PaneStack'
import { usePaneStack } from '../codex/usePaneStack'
import FloatingRoller from '../components/rollers/FloatingRoller'
import type { SheetPanel } from '../panels/fivePanels'

/** Skills opens first, per the owner's ask — and the codex now opens a few panes so the column reads
 *  as a full sheet, not one short pane beside a tall staircase of closed rail tabs. */
const DEFAULT_PANE = 'skills'
/** How many panes open on a fresh codex load. ~3 × DEFAULT_PANE_H fills a laptop viewport while leaving
 *  a couple of tabs closed on the rail, so Codex still reads as "open a pane" — distinct from Dashboard's
 *  all-open grid. */
const DEFAULT_OPEN_COUNT = 3

export default function CodexShell({
  identity,
  panels,
  roller,
  above,
  storageKey,
}: {
  /** The left identity/vitals column — each system supplies its own (5e: `IdentityColumn`). */
  identity: ReactNode
  /** The ordered section set; `SheetPanel` is structurally a `PaneDef`, so it feeds the rail directly. */
  panels: SheetPanel[]
  /** The format's docked roller — the Codex uses the Sigil Stack (T-DICE-CODEX). */
  roller: ReactNode
  /** Optional act-now furniture pinned above the pane stack (5e: review queue + reactions). */
  above?: ReactNode
  /** Per-character key so open/resized pane state does not follow the player between characters. */
  storageKey?: string | null
}) {
  const defs: PaneDef[] = panels
  // The canonical order IS the panel order — one source, so the rail and the stack cannot disagree
  // about where a pane belongs.
  const order = useMemo(() => defs.map((d) => d.id), [defs])
  // Open a small set by default so the column FILLS: a skills-like pane first (5e `skills`, PF2
  // `pf2-skills`, IG `ig-skills` — matched loosely so every system lands one), then the next panes in
  // canonical order up to DEFAULT_OPEN_COUNT. Falls back to the first pane when nothing matches.
  const defaultOpenIds = useMemo(() => {
    const skillLike = order.find((id) => id === DEFAULT_PANE || /skills?$/i.test(id))
    const lead = skillLike ?? order[0]
    if (!lead) return [DEFAULT_PANE]
    const rest = order.filter((id) => id !== lead)
    return [lead, ...rest].slice(0, DEFAULT_OPEN_COUNT)
  }, [order])
  const stack = usePaneStack(storageKey, order, defaultOpenIds)

  return (
    <div className="codex">
      {identity}
      <div className="codex-main">
        {above}
        <PaneStack defs={defs} stack={stack} />
        {/* The roller is a floating tool window (R-2): pinned in the viewport, movable, resizable and
            minimizable, remembered per character — so it stays reachable however the stack scrolls. */}
        <FloatingRoller characterId={storageKey}>{roller}</FloatingRoller>
        <div className="footer">click a stat to roll · double-click to edit · drag a section edge to resize it</div>
      </div>
    </div>
  )
}

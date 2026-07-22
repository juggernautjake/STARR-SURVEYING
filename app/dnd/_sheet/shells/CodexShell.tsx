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
import type { SheetPanel } from '../panels/fivePanels'

/** Skills opens by default, per the owner's ask. */
const DEFAULT_PANE = 'skills'

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
  // Open Skills by default for 5e, per the owner's ask — but a non-5e system's panel set has no pane
  // with that id (PF2's is `pf2-skills`), so fall back to the FIRST pane rather than opening nothing.
  const defaultPane = defs.some((d) => d.id === DEFAULT_PANE) ? DEFAULT_PANE : (defs[0]?.id ?? DEFAULT_PANE)
  const stack = usePaneStack(storageKey, order, defaultPane)

  return (
    <div className="codex">
      {identity}
      <div className="codex-main">
        {above}
        <PaneStack defs={defs} stack={stack} />
        {/* The roller is docked BELOW the stack rather than in a sidebar: the Codex has already spent
            the horizontal budget on two columns, and a third would leave every one too narrow. */}
        <div className="codex-tray">{roller}</div>
        <div className="footer">click a stat to roll · double-click to edit · drag a section edge to resize it</div>
      </div>
    </div>
  )
}

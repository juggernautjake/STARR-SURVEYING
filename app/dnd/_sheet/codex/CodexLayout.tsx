'use client'
// The Codex layout (CX-1 … CX-9) — identity column on the left, a stack of simultaneously-open
// resizable panes on the right.
//
// SHIPS ALONGSIDE THE CLASSIC LAYOUT, never replacing it. Every existing character uses the
// classic sheet, including sheets in live streamed games; swapping the layout under a table
// mid-campaign is not a change anyone asked for. `char.sheetLayout` selects, defaulting to
// 'classic', so nothing changes for anyone who does not pick this.
//
// WHY THE PANE CONTENTS ARE THE EXISTING COMPONENTS, UNCHANGED. Every pane below renders the same
// component the classic tab renders. That is the whole reason this is a layout and not a fork: a
// Codex-specific SpellsPanel would be a second implementation of spell rendering to keep in sync
// with the first, and the two would diverge on the first bug fixed in only one. Panes reflow by
// CSS container queries against their own height (theme.css), which needs no per-component work.
//
// SKINS COME FOR FREE, which is the point of putting the branch here rather than higher up. App
// keeps ownership of the `.dnd-sheet skin-<id> variant-<x>` root and the theme CSS variables;
// this component renders inside it and styles itself entirely from those same `var(--…)` tokens.
// So every skin and every colour theme applies to the Codex without a single skin-specific rule.
import { useMemo } from 'react'
import { useChar } from '../state/store'
import IdentityColumn from './IdentityColumn'
import PaneStack, { type PaneDef } from './PaneStack'
import { usePaneStack } from './usePaneStack'
import { useFivePanels } from '../panels/fivePanels'
import EditReviewPanel from '../components/EditReviewPanel'
import Reactions from '../components/Reactions'
import SigilStack from '../components/rollers/SigilStack'

/** Skills opens by default, per the owner's ask. */
const DEFAULT_PANE = 'skills'

export default function CodexLayout({ artUrl, ownerName }: { artUrl?: string | null; ownerName?: string | null }) {
  const { characterId } = useChar()

  // The panels are the SHARED 5e panel set (`useFivePanels`, T-2) — the exact same source the
  // Dashboard reads — so the two formats can never disagree about which sections exist, in what
  // order, or how they are gated. `SheetPanel` is structurally a `PaneDef`, so it drops straight in.
  const defs: PaneDef[] = useFivePanels()

  // The canonical order IS the def order — one source, so the rail and the stack cannot disagree
  // about where a pane belongs.
  const order = useMemo(() => defs.map((d) => d.id), [defs])
  // Keyed by character, so a player's layout for one character does not follow them to another.
  const stack = usePaneStack(characterId, order, DEFAULT_PANE)

  return (
    <div className="codex">
      <IdentityColumn artUrl={artUrl} ownerName={ownerName} />
      <div className="codex-main">
        {/* CX-7 — the cross-cutting furniture. Conditions and active effects went INTO the
            identity column (they change the numbers printed above them, so they belong beside
            those numbers). What is left is the review queue, reactions and the dice tray.
            Reactions and the review queue sit above the stack because both are prompts to act
            NOW and must not be buried inside a pane the player may not have open. */}
        <EditReviewPanel />
        <Reactions />
        <PaneStack defs={defs} stack={stack} />
        {/* The roller is docked BELOW the stack rather than in the sidebar the classic layout
            gives it: the Codex has already spent the horizontal budget on two columns, and a
            third would leave every one of them too narrow to read. The Codex runs its OWN roller,
            the Sigil Stack (T-DICE-CODEX) — same roll data as Dice Core, a stacked-tile render
            that echoes the pane stack — instead of the shared DiceTray. */}
        <div className="codex-tray"><SigilStack /></div>
        <div className="footer">click a stat to roll · double-click to edit · drag a section edge to resize it</div>
      </div>
    </div>
  )
}

'use client'
// CodexLayout — the 5e ADAPTER for the Codex format (T-SHELL). It runs inside the sheet provider
// (where `useFivePanels`/`useChar` are valid), computes the 5e identity column, the shared panel set
// and the roller, and hands them to the pure `CodexShell`. PF2 and IG reach the same Codex by feeding
// THEIR own identity/panels/roller to the same shell (later slices).
//
// SHIPS ALONGSIDE THE CLASSIC LAYOUT, never replacing it — `char.sheetLayout` selects, defaulting to
// 'classic'. SKINS COME FOR FREE: `App` keeps the `.dnd-sheet skin-<id>` root + theme variables and
// this renders inside it, so the shell styles entirely from `var(--…)` tokens.
//
// The panels are the SHARED 5e panel set (`useFivePanels`, T-2) — the exact same source the Dashboard
// reads — so the formats can never disagree about which sections exist. The Codex docks its OWN roller,
// the Sigil Stack (T-DICE-CODEX), instead of the classic Dice Core.
import { useChar } from '../state/store'
import { useFivePanels } from '../panels/fivePanels'
import CodexShell from '../shells/CodexShell'
import IdentityColumn from './IdentityColumn'
import EditReviewPanel from '../components/EditReviewPanel'
import Reactions from '../components/Reactions'
import SigilStack from '../components/rollers/SigilStack'

export default function CodexLayout({ artUrl, ownerName, roller }: { artUrl?: string | null; ownerName?: string | null; roller?: React.ReactNode }) {
  const { characterId } = useChar()
  const panels = useFivePanels()
  return (
    <CodexShell
      identity={<IdentityColumn artUrl={artUrl} ownerName={ownerName} />}
      panels={panels}
      // The roller NODE is the chosen roller template (RO-2), passed from App; the Sigil Stack is only
      // the DEFAULT when no choice is threaded (kept so this layout still renders standalone).
      roller={roller ?? <SigilStack />}
      above={
        <>
          {/* Both are prompts to act NOW; they sit above the stack so they are never buried in a pane. */}
          <EditReviewPanel />
          <Reactions />
        </>
      }
      storageKey={characterId}
    />
  )
}

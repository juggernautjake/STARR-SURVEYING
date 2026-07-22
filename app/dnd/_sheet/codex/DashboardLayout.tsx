'use client'
// DashboardLayout — the 5e ADAPTER for the Dashboard format (T-SHELL). It runs inside the sheet
// provider (where `useFivePanels`/`useChar` are valid), computes the 5e identity column, panel set,
// roller and act-now furniture, and hands them to the pure `DashboardShell`. PF2 and IG reach the
// same Dashboard by feeding THEIR own identity/panels/roller to the same shell (later slices), so the
// format is written once and every system plugs into it.
import { useChar } from '../state/store'
import { useFivePanels } from '../panels/fivePanels'
import DashboardShell from '../shells/DashboardShell'
import IdentityColumn from './IdentityColumn'
import EditReviewPanel from '../components/EditReviewPanel'
import Reactions from '../components/Reactions'
import DiceTray from '../components/DiceTray'

export default function DashboardLayout({ artUrl, ownerName }: { artUrl?: string | null; ownerName?: string | null }) {
  const { characterId } = useChar()
  const panels = useFivePanels()
  return (
    <DashboardShell
      identity={<IdentityColumn artUrl={artUrl} ownerName={ownerName} />}
      panels={panels}
      roller={<DiceTray />}
      storageKey={characterId}
      above={
        <>
          {/* Both are prompts to act NOW; they stay above the grid so they are never buried in a card. */}
          <EditReviewPanel />
          <Reactions />
        </>
      }
    />
  )
}

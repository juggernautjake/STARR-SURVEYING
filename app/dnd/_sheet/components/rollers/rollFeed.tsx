'use client'
// rollFeed — the SYSTEM-AGNOSTIC roll feed the animated roller stages read (RO-5).
//
// The four roller STAGES (Dice Core / Sigil Stack / Roll Board / Impact) used to read the 5e store
// (`useChar`) directly, which is why they only worked on the 5e sheet. Their whole dependency is three
// things: the current `activeRoll` (the rich, already-resolved roll to animate), `commitRoll` (log it
// once the animation lands), and whether animation is on (`rollerAnim`). This context is exactly that
// seam. The 5e sheet PROVIDES the feed from its store; the bespoke PF2/IG sheets provide their OWN feed
// (their resolved rolls shaped into the same `ActiveRoll`) — so the SAME animated rollers, template
// picker, sounds and instant/animated toggle work on every system.
import { createContext, useContext, type ReactNode } from 'react'
import type { ActiveRoll, RollEntry } from '../../state/store'

export interface RollFeed {
  /** The current roll to animate + explain, or null when idle. */
  activeRoll: ActiveRoll | null
  /** Log the roll once its animation lands (the stage calls this at the end of the timeline). */
  commitRoll: (entry: Omit<RollEntry, 'id'>) => void
  /** Whether the roller animates (false → instant); folded with prefers-reduced-motion by the stage. */
  rollerAnim?: boolean
}

const RollFeedCtx = createContext<RollFeed | null>(null)

export function RollFeedProvider({ value, children }: { value: RollFeed; children: ReactNode }) {
  return <RollFeedCtx.Provider value={value}>{children}</RollFeedCtx.Provider>
}

/** Read the roll feed. A stage MUST be mounted inside a `RollFeedProvider` (the 5e sheet and the bespoke
 *  PF2/IG sheets each provide one); a clear throw beats a silent no-op roller if a mount forgets it. */
export function useRollFeed(): RollFeed {
  const feed = useContext(RollFeedCtx)
  if (!feed) throw new Error('useRollFeed must be used inside a <RollFeedProvider> (the sheet mounts it around the roller)')
  return feed
}

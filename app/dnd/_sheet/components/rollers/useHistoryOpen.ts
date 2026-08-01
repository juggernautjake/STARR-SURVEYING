'use client'
// useHistoryOpen — roll history starts collapsed on a window too short to hold it. D7-4.
//
// ── WHAT THIS CLOSES ────────────────────────────────────────────────────────────────────────────────
//
// D7-3's sweep ended with ten failing cells, every one of them a 360×640 phone, where the roller asks for
// roughly 90px more than the window can give. With the stage already at its minimum and both permitted
// scrollers at their 48px floor, nothing was left to take it from — so `.fld-body` scrolled, which is the
// one thing this whole phase exists to prevent.
//
// The doc ranked three candidates. This is the first, and the arithmetic is why: the history section plus
// its floor is ~90px, which is almost exactly the shortfall. Collapsing it is also the only one of the
// three that costs the player nothing — **the section header stays visible**, so they can see the history
// exists and open it with one tap, and once open it scrolls inside itself as designed.
//
// ── WHY A HOOK AND NOT FOUR `useState(false)`s ──────────────────────────────────────────────────────
//
// All four rollers declared `useState(true)` on their own line. Changing four lines is how three of them
// get the behaviour and one silently does not — the fourth roll log (D7-2), the stage token three of four
// stylesheets read (D7-3), the same failure twice already in this phase. One hook, four call sites, and
// `roller-history-cap.test.ts` already enumerates the four logs.
//
// ── WHY IT STARTS OPEN AND THEN COLLAPSES ───────────────────────────────────────────────────────────
//
// The obvious implementation — `useState(() => window.innerHeight < X)` — cannot work: `window` does not
// exist during the server render, and initialising from it produces markup that disagrees with the
// client's first paint. React calls that a hydration mismatch and, in this component tree, resolves it by
// discarding and re-rendering.
//
// So the initial value is `true` (identical on server and client) and an effect collapses it on mount
// where the window is short. The cost is one frame in which an open history is laid out on a phone. The
// benefit is that the roller renders at all.
//
// ── IT NEVER FIGHTS THE PLAYER ──────────────────────────────────────────────────────────────────────
//
// The effect runs ONCE, on mount, with no dependency on the viewport. A player who opens their history on
// a phone keeps it open — including through a rotation, a resize, or a roll. A rule that re-collapsed it
// whenever the window was short would be correct on paper and infuriating in the hand: it would close the
// thing they had just deliberately opened.
import { useEffect, useState, type Dispatch, type SetStateAction } from 'react'
import { currentRollerSize } from '../../lib/floating'

/**
 * Below this window height, roll history starts collapsed.
 *
 * Measured rather than chosen. The roller's content needs **508–575px** with both permitted scrollers at
 * their floor (D7-5), and history plus its header is a further ~90. 640 is the point below which history
 * could only ever be rendered as a 48px sliver that scrolls — at which case a collapsed section with a
 * visible header is strictly more useful than a slot too small to read a single entry in.
 *
 * The signal is the WINDOW's height, not the viewport's: `rollerSize` already accounts for the viewport,
 * the header inset and the edge margin, so this asks the question that actually matters — "is the box the
 * roller has to live in too small" — instead of inferring it from the screen.
 */
export const HISTORY_COLLAPSE_BELOW_PX = 640

/** `[histOpen, setHistOpen]`, with the short-window default applied on mount. Drop-in for `useState(true)`. */
export function useHistoryOpen(): [boolean, Dispatch<SetStateAction<boolean>>] {
  const [open, setOpen] = useState(true)

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (currentRollerSize().h < HISTORY_COLLAPSE_BELOW_PX) setOpen(false)
    // Deliberately empty: mount only. See the header — re-running this would close a history the player
    // had just opened, every time the window changed size.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return [open, setOpen]
}

'use client'
// Codex pane-stack state + persistence (CX-3/CX-4/CX-6).
//
// The arithmetic lives in `paneMath.ts`; this hook is the React shell around it — measurement of
// the available height, and the localStorage round-trip.
//
// THE PERSISTENCE RULE, which the plan doc states and which is easy to get wrong: which panes are
// open and how tall they are is a VIEW PREFERENCE, not character data. Concretely that means it
// must not write to the sheet, must not create edit-history entries, and must not sync to other
// viewers — a DM peeking at a player's sheet must not rearrange it for them. localStorage, keyed
// per character, satisfies all three by construction. Putting it on `char` would satisfy none of
// them, and would additionally fire the sheet's autosave on every drag frame.
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  type Pane,
  DEFAULT_PANE_H,
  capPaneToContent,
  closePane,
  openPane,
  resizePane,
  soloPane,
  toggleCollapse,
} from './paneMath'

/** Bumped if the stored shape ever changes, so a stale entry is ignored rather than crashing or
 *  silently half-applying. Cheaper than a migration for a preference nobody would mourn. */
const STORE_VERSION = 1
const storeKey = (characterId: string | null | undefined) => `dnd:codex:v${STORE_VERSION}:${characterId ?? 'anon'}`

interface Stored {
  panes: Pane[]
}

/**
 * Read the saved stack, filtered to panes that are still available to this character.
 *
 * The filter matters: module and system gating can REMOVE a pane between visits (a character
 * loses the `mlm` module; a system switch drops Forms). Restoring a pane id that no longer maps
 * to anything would render an empty box with a header and no way to explain itself.
 */
function load(characterId: string | null | undefined, available: readonly string[]): Pane[] | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(storeKey(characterId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as Stored
    if (!Array.isArray(parsed?.panes)) return null
    const panes = parsed.panes.filter((p) => p && typeof p.id === 'string' && available.includes(p.id))
    return panes.length ? panes : null
  } catch {
    // A corrupt or unreadable entry falls back to the default stack. A layout preference is never
    // worth surfacing an error to a player over.
    return null
  }
}

function save(characterId: string | null | undefined, panes: Pane[]) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(storeKey(characterId), JSON.stringify({ panes } satisfies Stored))
  } catch {
    // Private-browsing quota failures are not worth interrupting play for.
  }
}

export interface PaneStack {
  panes: Pane[]
  /** Attach to the scrolling stack viewport — its height is the budget the maths works against. */
  viewportRef: React.RefObject<HTMLDivElement>
  isOpen: (id: string) => boolean
  /** Clicking an open tab CLOSES it. Without this the stack only ever grows and there is no way
   *  back — see CX-9 improvement 1. */
  toggle: (id: string) => void
  resize: (id: string, height: number) => void
  /** Report a section's measured natural content height (D-11) — becomes its resize cap, and snaps the
   *  open pane down to it so it shows exactly its content with no empty space below. */
  setContentHeight: (id: string, contentH: number) => void
  collapse: (id: string) => void
  solo: (id: string) => void
  /** Any persisted-layout feature eventually strands someone in a state they cannot undo. */
  reset: () => void
}

export function usePaneStack(
  characterId: string | null | undefined,
  order: readonly string[],
  defaultOpen: string,
): PaneStack {
  const viewportRef = useRef<HTMLDivElement>(null)
  // Measured available height. Seeded with one default pane's worth rather than 0 so the very
  // first open — which can land before the observer has fired — does not compute against a
  // zero budget and slam everything to the minimum.
  const availableRef = useRef<number>(DEFAULT_PANE_H)
  const [panes, setPanes] = useState<Pane[]>(() => [{ id: defaultOpen, height: DEFAULT_PANE_H }])
  const loaded = useRef(false)

  // Restore AFTER mount, never during render. Reading localStorage while rendering makes the
  // server and client markup disagree, and Next hydration would discard the restored layout with
  // a mismatch warning — the classic way a persistence feature appears to work in dev and does
  // nothing in production.
  useEffect(() => {
    if (loaded.current) return
    loaded.current = true
    const restored = load(characterId, order)
    if (restored) setPanes(restored)
  }, [characterId, order])

  // Persist every settled change. Drag frames go through `resize`, so this writes often during a
  // drag; localStorage writes are synchronous but tiny, and the alternative (debouncing) risks
  // losing the final size if the player releases and navigates immediately.
  useEffect(() => {
    if (!loaded.current) return
    save(characterId, panes)
  }, [characterId, panes])

  // Track the viewport height as the budget. useLayoutEffect so the first measurement lands
  // before paint, and a ResizeObserver because the container's height changes with the window,
  // with the identity column's content, and with the browser chrome on mobile — none of which a
  // one-shot measurement would catch.
  useLayoutEffect(() => {
    const el = viewportRef.current
    if (!el) return
    const measure = () => {
      const h = el.getBoundingClientRect().height
      if (h > 0) availableRef.current = h
    }
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const isOpen = useCallback((id: string) => panes.some((p) => p.id === id), [panes])

  const toggle = useCallback(
    (id: string) => {
      setPanes((cur) =>
        cur.some((p) => p.id === id) ? closePane(cur, id) : openPane(cur, id, order),
      )
    },
    [order],
  )

  const resize = useCallback((id: string, height: number) => setPanes((cur) => resizePane(cur, id, height)), [])
  const setContentHeight = useCallback((id: string, contentH: number) => setPanes((cur) => capPaneToContent(cur, id, contentH)), [])
  const collapse = useCallback((id: string) => setPanes((cur) => toggleCollapse(cur, id)), [])
  const solo = useCallback((id: string) => setPanes((cur) => soloPane(cur, id, availableRef.current)), [])
  const reset = useCallback(() => setPanes([{ id: defaultOpen, height: DEFAULT_PANE_H }]), [defaultOpen])

  return { panes, viewportRef, isOpen, toggle, resize, setContentHeight, collapse, solo, reset }
}

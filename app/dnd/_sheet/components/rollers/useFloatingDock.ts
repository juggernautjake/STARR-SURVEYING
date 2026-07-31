'use client'
// useFloatingDock — the shared "floating tool window" behaviour for EVERY dice roller (R-1).
//
// One implementation, mounted by `FloatingRoller`, wraps whatever roller a format hands it (the 5e
// Dice Core, the Codex Sigil Stack, the PF2/IG roller nodes) and gives all of them the same window
// chrome: pinned in the viewport (`position: fixed`, so it never scrolls out of sight), draggable by
// its header, resizable from a corner (width AND height, with the body reflowing), minimizable, and
// REMEMBERED between visits per character.
//
// THE PERSISTENCE RULE (same one `usePaneStack` states, and just as easy to get wrong): where the
// roller sits, how big it is, and whether it is minimized is a VIEW PREFERENCE, not character data. It
// must never write to the sheet, never create edit-history, and never sync to other viewers — a DM
// peeking at a player's sheet must not move their roller. localStorage keyed per character satisfies
// all three by construction; putting it on `char` would satisfy none and would fire autosave on every
// drag frame.
//
// The dock owns ONLY the window chrome. It never reads or touches roll maths, roll data, or roll
// state — each roller keeps doing that itself. The one seam back to a roller is `expand()` (exposed
// via context by `FloatingRoller`) so a roller can pop itself open when a fresh roll arrives while
// minimized — window behaviour, not roll behaviour.
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { clampBox, currentRollerSize, safeTop, EDGE } from '../../lib/floating'

// ── persistence ─────────────────────────────────────────────────────────────────────────────────
/** Bumped if the stored shape changes, so a stale entry is ignored rather than half-applied. */
const STORE_VERSION = 1
export const rollerStoreKey = (characterId: string | null | undefined) =>
  `dnd:roller:v${STORE_VERSION}:${characterId ?? 'anon'}`

export interface DockState {
  x: number
  y: number
  w: number
  /** null = "fit content" — the initial state and the natural size for a small roller. Becomes a
   *  concrete number once the player resizes, and is remembered from then on. */
  h: number | null
  minimized: boolean
}

// Floors for the drag-resize path only. NOT a floor on the derived size — see `rollerSize`, which
// deliberately applies none, because a minimum can only bind on a screen smaller than it.
export const MIN_W = 248
export const MIN_H = 168

/**
 * The roller window is ONE SIZE PER SCREEN, and no longer resizable.
 *
 * Owner, 2026-07-28: *"the modal when open is a consistent size and is not resizable. It should always be
 * big enough to show all of the elements of the dice roller regardless of the roller template chosen."*
 * Owner, 2026-07-29: *"always … fully contain all of the content … never … a scrolling bar."*
 * Owner, 2026-07-30, resolving the two: **one size per screen** — every template shares one size, and that
 * size is derived from the viewport instead of being a universal constant.
 *
 * Before 07-28 the height was "fit content" (`h: null`) and drag-resizable, so the window CHANGED SHAPE when
 * you switched roller template — Impact's tall arena against Sigil Stack's shorter stack — and any size a
 * player had dragged to was then too small for whichever template needed more room. Two variables (template
 * and stored size) both fed one dimension, which is why no single value ever looked right.
 *
 * The fix for that was a pair of constants, and it left THREE defects that only showed on a small screen —
 * all of them the same mistake, a size treated as universal when it was really a desktop ideal:
 *
 *   1. a restored window was pinned to 396×560 regardless of viewport, so on a phone it was bigger than
 *      the screen;
 *   2. the resize handler only ever shrank the stored size (`Math.min`), so a phone rotated to landscape
 *      kept its portrait size and never grew back;
 *   3. `reset()` set `h: null` — content-fit — which is precisely the shape-changing behaviour 07-28
 *      forbade, so double-clicking the header reintroduced the original complaint.
 *
 * All three are gone because the size is no longer STORED at all: it is computed from the viewport wherever
 * it is needed (`currentRollerSize`). A value that is never persisted cannot be restored stale.
 *
 * `ROLLER_IDEAL_H = 560` is what clears the tallest composition on a desktop — header + template bar + the
 * 176px stage + the controls + the breakdown. D7-3's sweep is what proves that claim across the matrix
 * rather than asserting it here.
 */
export { ROLLER_IDEAL_W, ROLLER_IDEAL_H } from '../../lib/floating'

export function loadDockState(characterId: string | null | undefined): DockState | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(rollerStoreKey(characterId))
    if (!raw) return null
    const p = JSON.parse(raw) as Partial<DockState>
    if (typeof p?.x !== 'number' || typeof p?.y !== 'number' || typeof p?.w !== 'number') return null
    // POSITION is restored; SIZE is DERIVED, never restored. A stored size would keep an old box alive
    // forever — a drag-resized one from before the window became fixed, or (D7-1) a desktop 396×560 saved
    // on a laptop and reopened on a phone, where it is wider than the screen. Where the player put it is
    // still their preference; how big it is is a fact about the screen they are on right now.
    const size = currentRollerSize()
    return {
      x: p.x,
      y: p.y,
      w: size.w,
      h: size.h,
      minimized: p.minimized === true,
    }
  } catch {
    // A corrupt or unreadable entry falls back to the default — a preference is never worth an error.
    return null
  }
}

export function saveDockState(characterId: string | null | undefined, s: DockState) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(rollerStoreKey(characterId), JSON.stringify(s))
  } catch {
    // Private-browsing quota failures are not worth interrupting play for.
  }
}

// ── the hook ────────────────────────────────────────────────────────────────────────────────────
export interface FloatingDock {
  /** Attach to the window element — the hook measures it to clamp and to seed a content-fit height. */
  ref: React.RefObject<HTMLDivElement>
  minimized: boolean
  /** Positioning + size style for the EXPANDED window. */
  style: React.CSSProperties
  /** Fixed bottom-right style for the MINIMIZED toggle button (D-1) — independent of the window's
   *  remembered position, which stays put so expanding returns the roller to where the player left it. */
  minimizedStyle: React.CSSProperties
  onHeaderPointerDown: (e: React.PointerEvent) => void
  onResizePointerDown: (e: React.PointerEvent) => void
  toggleMinimize: () => void
  /** Recenter to the default bottom-right corner + content height — the always-available escape hatch. */
  reset: () => void
  /** Un-minimize. Handed to rollers via context so a fresh roll can pop the window open. */
  expand: () => void
  ready: boolean
}

function defaultPos(w: number, h: number): { x: number; y: number } {
  const iw = window.innerWidth
  const ih = window.innerHeight
  // Bottom-right corner. The height is no longer GUESSED at 440 — `currentRollerSize` already knows it,
  // and guessing here is what used to leave a shorter roller hanging above the corner until a second
  // measuring pass moved it.
  return clampBox(iw - w - EDGE, ih - h - EDGE, w, h)
}

export function useFloatingDock(characterId: string | null | undefined): FloatingDock {
  const ref = useRef<HTMLDivElement>(null)
  const [state, setState] = useState<DockState | null>(null)
  const loaded = useRef(false)
  // True only for a FRESH default placement (no saved state) that hasn't been measured yet. The
  // content-fit measure effect uses it to snap the window flush to the bottom-right corner once the
  // real height is known — a RESTORED position (even a content-fit one the player dragged to the top)
  // must be left exactly where they put it, so this stays false for restores. (CX-R3)
  const freshDefault = useRef(false)

  // Measure the window's live height (used for clamping when h is "fit content", and to place the
  // default bottom-right corner once we can see how tall the roller renders).
  const measuredH = useCallback(() => ref.current?.offsetHeight ?? 300, [])
  // The fallback is this screen's derived width, not a 396 literal. A second copy of that number living
  // here is how `DEFAULT_W` and `FIXED_W` came to be two names for one fact, both hand-maintained.
  const measuredW = useCallback(() => ref.current?.offsetWidth ?? currentRollerSize().w, [])

  // Restore AFTER mount, never during render (a localStorage read while rendering desyncs SSR/CSR and
  // Next discards it with a hydration warning — the classic "works in dev, does nothing in prod" bug).
  useLayoutEffect(() => {
    if (loaded.current) return
    loaded.current = true
    const saved = loadDockState(characterId)
    if (saved) {
      // `saved.w`/`saved.h` are already this screen's derived size — `loadDockState` computes them rather
      // than reading them back — so the clamp is against the box that will actually render.
      const { x, y } = clampBox(saved.x, saved.y, saved.w, saved.h ?? currentRollerSize().h)
      setState({ ...saved, x, y })
    } else {
      const { w, h } = currentRollerSize()
      const { x, y } = defaultPos(w, h)
      freshDefault.current = true
      // Start MINIMIZED (just the corner dice FAB) rather than open. An open 396px window docked
      // bottom-right otherwise overlaps the right edge of the sheet on a fresh load — on every
      // template and system — before the player has moved it. Minimized keeps the sheet unobstructed;
      // the roller pops open on the first roll (useExpandOnRoll) or a click of the FAB, and its
      // position/size/open-state persist per character from then on.
      setState({ x, y, w, h, minimized: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [characterId])

  // Once the element exists and we are content-fit, place the bottom-right corner against the REAL
  // rendered height. For a FRESH default we SNAP flush to the bottom edge (defaultPos guessed a 440px
  // height, so a shorter roller would otherwise hang ~140px above the corner, covering more content
  // than it needs to); for a restored position we only CLAMP, never reposition, so the player's own
  // spot is preserved. Either way a tall roller is never shoved off the bottom.
  useLayoutEffect(() => {
    if (!state || state.h != null) return
    const h = measuredH()
    const targetY = freshDefault.current ? window.innerHeight - h - EDGE : state.y
    freshDefault.current = false
    const { x, y } = clampBox(state.x, targetY, state.w, h)
    if (x !== state.x || y !== state.y) setState((s) => (s ? { ...s, x, y } : s))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.h, state?.w])

  // Persist every settled change (localStorage writes are tiny + synchronous; debouncing would risk
  // losing the final drop if the player navigates immediately after releasing).
  useEffect(() => {
    if (!loaded.current || !state) return
    saveDockState(characterId, state)
  }, [characterId, state])

  // Keep the window on-screen and clear of the sticky header when the browser window resizes — the one
  // event that can strand a saved position that was fine at the old viewport size.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const onResize = () => {
      setState((s) => {
        if (!s) return s
        // RECOMPUTED, not shrunk. This used to `Math.min` the stored size against the new viewport, which
        // is a one-way ratchet: a phone rotated to landscape, or a browser window pulled wider, kept the
        // smaller size forever because nothing ever grew it back. Deriving it fresh means the window is
        // correct for the screen it is on at every moment, which is the whole of the 07-30 decision.
        const { w, h } = currentRollerSize()
        const { x, y } = clampBox(s.x, s.y, w, h)
        return { ...s, x, y, w, h }
      })
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [measuredH])

  // ── drag ────────────────────────────────────────────────────────────────────────────────────
  const dragOff = useRef<{ dx: number; dy: number } | null>(null)
  const onHeaderPointerDown = useCallback((e: React.PointerEvent) => {
    // Never start a drag from a control in the header (minimize / reset).
    if ((e.target as HTMLElement).closest('button')) return
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    dragOff.current = { dx: e.clientX - r.left, dy: e.clientY - r.top }
    const move = (ev: PointerEvent) => {
      if (!dragOff.current) return
      const el2 = ref.current
      const w = el2?.offsetWidth ?? currentRollerSize().w
      const h = el2?.offsetHeight ?? 300 // measured height clamps correctly whether fixed or content-fit
      const { x, y } = clampBox(ev.clientX - dragOff.current.dx, ev.clientY - dragOff.current.dy, w, h)
      setState((s) => (s ? { ...s, x, y } : s))
    }
    const up = () => {
      dragOff.current = null
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    e.preventDefault()
  }, [])

  // ── resize (bottom-right corner) ──────────────────────────────────────────────────────────────
  const onResizePointerDown = useCallback((e: React.PointerEvent) => {
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const startX = e.clientX
    const startY = e.clientY
    const startW = r.width
    const startH = r.height
    const move = (ev: PointerEvent) => {
      setState((s) => {
        if (!s) return s
        // Cap the size so the window's far edge never leaves the viewport, keeping it fully reachable.
        const maxW = window.innerWidth - s.x - EDGE
        const maxH = window.innerHeight - s.y - EDGE
        const w = Math.max(MIN_W, Math.min(startW + (ev.clientX - startX), maxW))
        const h = Math.max(MIN_H, Math.min(startH + (ev.clientY - startY), maxH))
        return { ...s, w, h }
      })
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    e.preventDefault()
    e.stopPropagation()
  }, [])

  const toggleMinimize = useCallback(() => {
    setState((s) => {
      if (!s) return s
      const next = { ...s, minimized: !s.minimized }
      // Restoring near the bottom edge could overflow; re-clamp against the full height.
      if (!next.minimized) {
        const { x, y } = clampBox(next.x, next.y, next.w, next.h ?? measuredH())
        next.x = x
        next.y = y
      }
      return next
    })
  }, [measuredH])

  const expand = useCallback(() => {
    setState((s) => (s && s.minimized ? { ...s, minimized: false } : s))
  }, [])

  const reset = useCallback(() => {
    // `h: null` — content-fit — used to be the reset, and it was the third defect: the escape hatch put the
    // window straight back into the shape-changing behaviour 07-28 forbade, so a double-click on the header
    // reintroduced the original complaint. Reset now means "this screen's size, in the default corner".
    const { w, h } = currentRollerSize()
    const { x, y } = defaultPos(w, h)
    setState({ x, y, w, h, minimized: false })
  }, [])

  const style: React.CSSProperties = state
    ? {
        position: 'fixed',
        left: state.x,
        top: state.y,
        width: state.w,
        // A concrete height only once resized; otherwise the window fits its content.
        height: state.minimized ? 'auto' : state.h ?? 'auto',
        maxWidth: 'calc(100vw - 12px)',
        maxHeight: `calc(100vh - ${safeTop()}px - ${EDGE}px)`,
      }
    : { position: 'fixed', visibility: 'hidden' }

  // The minimized roller is a compact button pinned to the bottom-right corner of the viewport (D-1),
  // deliberately NOT at the window's remembered x/y — so it always sits in the same familiar spot while
  // the expanded window still reopens wherever the player last dragged it. It sits ABOVE the fixed
  // "Edit with AI" launcher (which is right:18 / bottom:18, ~52px tall, z-index 60) rather than on top of
  // it, and takes a higher z-index so it is never stuck behind it.
  const minimizedStyle: React.CSSProperties = {
    position: 'fixed',
    right: 18,
    bottom: 82,
    left: 'auto',
    top: 'auto',
    zIndex: 61,
  }

  return {
    ref,
    minimized: state?.minimized ?? false,
    style,
    minimizedStyle,
    onHeaderPointerDown,
    onResizePointerDown,
    toggleMinimize,
    reset,
    expand,
    ready: state != null,
  }
}

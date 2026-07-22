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
import { clampBox, safeTop, EDGE } from '../../lib/floating'

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

// Sensible tool-window defaults. 396px gives the roller headers (the Dice Core's title + style badge +
// mute + clear) room to sit on ONE line inside the dock's own chrome + body padding — 370 was a touch
// tight and wrapped "Dice Core". Players can still resize smaller (down to MIN_W); this is just the
// comfortable detach size.
export const DEFAULT_W = 396
export const MIN_W = 248
export const MIN_H = 168

export function loadDockState(characterId: string | null | undefined): DockState | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(rollerStoreKey(characterId))
    if (!raw) return null
    const p = JSON.parse(raw) as Partial<DockState>
    if (typeof p?.x !== 'number' || typeof p?.y !== 'number' || typeof p?.w !== 'number') return null
    return {
      x: p.x,
      y: p.y,
      w: p.w,
      h: typeof p.h === 'number' ? p.h : null,
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

function defaultPos(w: number): { x: number; y: number } {
  const iw = window.innerWidth
  const ih = window.innerHeight
  // Bottom-right corner, a comfortable guess of height before the element is measured.
  const guessH = Math.min(440, ih - safeTop() - EDGE)
  return clampBox(iw - w - EDGE, ih - guessH - EDGE, w, guessH)
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
  const measuredW = useCallback(() => ref.current?.offsetWidth ?? DEFAULT_W, [])

  // Restore AFTER mount, never during render (a localStorage read while rendering desyncs SSR/CSR and
  // Next discards it with a hydration warning — the classic "works in dev, does nothing in prod" bug).
  useLayoutEffect(() => {
    if (loaded.current) return
    loaded.current = true
    const saved = loadDockState(characterId)
    if (saved) {
      const h = saved.h
      const { x, y } = clampBox(saved.x, saved.y, saved.w, h ?? 440)
      setState({ ...saved, x, y })
    } else {
      const w = DEFAULT_W
      const { x, y } = defaultPos(w)
      freshDefault.current = true
      setState({ x, y, w, h: null, minimized: false })
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
        const w = Math.min(s.w, window.innerWidth - 2 * EDGE)
        const h = s.h != null ? Math.min(s.h, window.innerHeight - safeTop() - EDGE) : measuredH()
        const { x, y } = clampBox(s.x, s.y, w, h)
        return { ...s, x, y, w, h: s.h != null ? h : null }
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
      const w = el2?.offsetWidth ?? DEFAULT_W
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
    const w = DEFAULT_W
    const { x, y } = defaultPos(w)
    setState({ x, y, w, h: null, minimized: false })
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

'use client'
// The Codex right-hand pane stack (CX-3/CX-4/CX-5/CX-9) — a vertical rail of tall tabs beside a
// column of simultaneously-open, individually-resizable panes.
//
// The three decisions worth knowing before reading the code:
//
// 1. PANES RENDER IN CANONICAL ORDER, not click order. A player reaching for Spells finds it in
//    the same place every time. Recency ordering optimises for the pane you just opened — the one
//    you are already looking at — at the cost of every other lookup.
//
// 2. THE RESIZE HANDLE IS A role="separator", not a bare div with a mousedown listener. Drag is
//    mouse-only, and this is a primary surface: a keyboard user with no way to resize a pane
//    cannot use the layout at all. ArrowUp/Down adjust, Home/End jump to min/max, Enter collapses.
//
// 3. REFLOW IS BY CONTAINER, NOT VIEWPORT. Each pane body is a `container-type: size` element and
//    its contents respond with `@container` rules (see theme.css). Media queries describe the
//    WINDOW, and a pane's height here is set by dragging — so a media query would reflow every
//    pane identically no matter how tall each actually is, which is precisely the wrong answer.
//    The `data-density` attribute below is the JS-side mirror of those breakpoints, for content
//    that cannot be reflowed by CSS alone.
import { useCallback, useEffect, useMemo, useRef } from 'react'
import { MIN_PANE_H, renderedHeight, type Pane } from './paneMath'
import type { PaneStack as Stack } from './usePaneStack'

export interface PaneDef {
  id: string
  label: string
  emoji: string
  render: () => React.ReactNode
  /** Shown in the collapsed header as "Skills · 18", so a collapsed pane still carries
   *  information rather than being a blank strip. */
  count?: number
}

/** Keyboard resize step. 24px is roughly one row — small enough to be precise, large enough that
 *  reaching a useful size does not take forty keypresses. */
const KEY_STEP = 24

/** The density tier for a pane height, mirroring the @container breakpoints in theme.css. Kept in
 *  ONE place and passed down as `data-density`, so CSS and JS cannot disagree about which tier a
 *  pane is in — they would drift the first time one breakpoint is tuned and the other is not. */
export function densityFor(height: number, collapsed?: boolean): 'collapsed' | 'short' | 'medium' | 'tall' {
  if (collapsed) return 'collapsed'
  if (height <= 200) return 'short'
  if (height <= 420) return 'medium'
  return 'tall'
}

function PaneView({
  def,
  pane,
  stack,
}: {
  def: PaneDef
  pane: Pane
  stack: Stack
}) {
  const bodyRef = useRef<HTMLDivElement>(null)
  const dragFrom = useRef<{ y: number; h: number } | null>(null)
  const h = renderedHeight(pane)
  const density = densityFor(pane.height, pane.collapsed)

  // Pointer events rather than mouse events, so a stylus and a touch drag both work. Capture on
  // the handle means the drag survives the pointer leaving the element — without it, moving
  // faster than React re-renders drops the drag, which feels like the handle "slipping".
  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault()
      ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
      dragFrom.current = { y: e.clientY, h: pane.height }
    },
    [pane.height],
  )
  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const from = dragFrom.current
      if (!from) return
      stack.resize(def.id, from.h + (e.clientY - from.y))
    },
    [def.id, stack],
  )
  const onPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    dragFrom.current = null
    try {
      ;(e.target as HTMLElement).releasePointerCapture(e.pointerId)
    } catch {
      // Already released (the pointer left the window mid-drag). Nothing to do.
    }
  }, [])

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      const k = e.key
      if (k === 'ArrowUp') { e.preventDefault(); stack.resize(def.id, pane.height - KEY_STEP) }
      else if (k === 'ArrowDown') { e.preventDefault(); stack.resize(def.id, pane.height + KEY_STEP) }
      else if (k === 'Home') { e.preventDefault(); stack.resize(def.id, MIN_PANE_H) }
      else if (k === 'End') { e.preventDefault(); stack.solo(def.id) }
      else if (k === 'Enter' || k === ' ') { e.preventDefault(); stack.collapse(def.id) }
    },
    [def.id, pane.height, stack],
  )

  // Double-click the handle to fit content — the fastest way to say "just show me all of it".
  // Capped at 80% of the viewport so a 300-entry spell list cannot produce a pane taller than the
  // screen, which would make the handle itself unreachable.
  const fitToContent = useCallback(() => {
    const el = bodyRef.current
    if (!el) return
    const natural = el.scrollHeight
    const cap = typeof window !== 'undefined' ? window.innerHeight * 0.8 : natural
    stack.resize(def.id, Math.min(natural + 8, cap))
  }, [def.id, stack])

  return (
    <section className={`codex-pane${pane.collapsed ? ' is-collapsed' : ''}`} style={{ height: h }} data-density={density} aria-label={def.label}>
      <header className="codex-pane-head">
        <button className="codex-pane-collapse" onClick={() => stack.collapse(def.id)} aria-expanded={!pane.collapsed} title={pane.collapsed ? `Expand ${def.label}` : `Collapse ${def.label} to its header`}>
          <span aria-hidden>{pane.collapsed ? '▸' : '▾'}</span>
        </button>
        <span className="codex-pane-title">
          <span aria-hidden className="codex-pane-emoji">{def.emoji}</span>
          {def.label}
          {/* The count is what makes a collapsed pane still worth having on screen. */}
          {def.count != null && <span className="codex-pane-count"> · {def.count}</span>}
        </span>
        <button className="codex-pane-solo" onClick={() => stack.solo(def.id)} title={`Give ${def.label} the whole stack — collapses the others without closing them`}>⤢</button>
        <button className="codex-pane-close" onClick={() => stack.toggle(def.id)} title={`Close ${def.label}`}>✕</button>
      </header>

      {/* The scroll lives on the pane body, never the page, so the rail and the identity column
          stay put while a long list scrolls. `container-type: size` (theme.css) makes this element
          the query container its contents reflow against. */}
      {!pane.collapsed && (
        <div className="codex-pane-body" ref={bodyRef}>
          {def.render()}
        </div>
      )}

      {/* The grab bar, on EVERY expanded pane including a lone one.
          An earlier version hid it when only one pane was open, on the theory that there was
          nothing below to trade height with. Driving the layout in a browser showed that to be
          wrong twice over: `resizePane` never trades with neighbours anyway (it adjusts only the
          pane you grabbed and lets the stack scroll), and the single-pane case — the DEFAULT
          state, with just Skills open — is exactly when a player most wants to make the pane
          taller. The rule as written removed the handle from the one view everybody sees first. */}
      {!pane.collapsed && (
        <div
          className="codex-grab"
          role="separator"
          tabIndex={0}
          aria-orientation="horizontal"
          aria-label={`Resize ${def.label}`}
          aria-valuenow={Math.round(pane.height)}
          aria-valuemin={MIN_PANE_H}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onDoubleClick={fitToContent}
          onKeyDown={onKeyDown}
          title="Drag to resize · double-click to fit contents · ↑↓ to adjust · Enter to collapse"
        />
      )}
    </section>
  )
}

export default function PaneStack({ defs, stack }: { defs: PaneDef[]; stack: Stack }) {
  // Memoised because the dev-only warning effect below depends on it; a fresh Map every render
  // would re-run that effect on every keystroke anywhere in an open pane.
  const byId = useMemo(() => new Map(defs.map((d) => [d.id, d])), [defs])

  // Escape closes nothing and collapses nothing on purpose — panes are not modal, and a global
  // Escape handler on a sheet full of inline editors would fight every one of them.

  // Warn once in development if a persisted pane id no longer maps to a def. `usePaneStack`
  // already filters these out on load, so hitting this means a def disappeared at runtime — a
  // real bug rather than stale storage, and one that otherwise shows up as a silently missing pane.
  useEffect(() => {
    if (process.env.NODE_ENV === 'production') return
    const missing = stack.panes.filter((p) => !byId.has(p.id)).map((p) => p.id)
    if (missing.length) console.warn(`[codex] open pane(s) with no definition: ${missing.join(', ')}`)
  }, [stack.panes, byId])

  return (
    <div className="codex-stackwrap">
      {/* The vertical rail. Labels are written vertically (writing-mode: vertical-rl) per the
          owner's ask, which is also what lets the rail stay narrow while the tab targets stay
          tall enough to hit comfortably. */}
      <nav className="codex-rail" aria-label="Sheet sections">
        {defs.map((d) => {
          const open = stack.isOpen(d.id)
          return (
            <button
              key={d.id}
              className={`codex-railtab${open ? ' on' : ''}`}
              aria-pressed={open}
              onClick={() => stack.toggle(d.id)}
              title={open ? `Close ${d.label}` : `Open ${d.label} — it opens alongside what is already showing`}
            >
              <span aria-hidden className="codex-railemoji">{d.emoji}</span>
              <span className="codex-raillabel">{d.label}</span>
            </button>
          )
        })}
        <button className="codex-railreset" onClick={stack.reset} title="Reset this sheet's panes to just Skills. Only affects your own view.">
          <span aria-hidden>⟲</span>
          <span className="codex-raillabel">Reset</span>
        </button>
      </nav>

      {/* The scrolling stack viewport. Its measured height is the budget the opening arithmetic
          works against, and its overflow is the owner's asked-for "second vertical scroll bar". */}
      <div className="codex-stack" ref={stack.viewportRef}>
        {stack.panes.length === 0 ? (
          <p className="codex-empty">No sections open. Pick one from the rail — you can open as many as you like, and drag their edges to size them.</p>
        ) : (
          stack.panes.map((p) => {
            const def = byId.get(p.id)
            if (!def) return null
            return <PaneView key={p.id} def={def} pane={p} stack={stack} />
          })
        )}
      </div>
    </div>
  )
}

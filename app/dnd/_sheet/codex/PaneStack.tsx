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
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { MIN_PANE_H, renderedHeight, neededPaneHeight, reorder, type Pane } from './paneMath'
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
  const sectionRef = useRef<HTMLElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  // An UNCONSTRAINED inner wrapper around the content: `bodyRef.scrollHeight` returns the CONTAINER
  // height when the pane is taller than its content, so it can't tell us the natural content height.
  // This wrapper flows to the content's true height, which is what we cap the pane to (D-11).
  const contentRef = useRef<HTMLDivElement>(null)
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

  // Measure the section's natural CONTENT height and report the pane height that reveals it with NO in-pane
  // scroll (Part A). The pane's height covers the whole section — header + body(padding + content) + grab +
  // borders — so the reported height must be the content PLUS that chrome, or the body scrolls and clips the
  // last stretch of content (the old "not tall enough" bug, which measured only the inner content). The
  // chrome outside the body (`section.offsetHeight − body.offsetHeight` = header + grab + borders, all
  // flex:none) is stable even while the content overflows; the body's own padding is read from its computed
  // style. Measured on the UNCONSTRAINED inner wrapper + re-measured when the content resizes (a section's
  // content is per-character — a 2-spell list is far shorter than a 30-spell one).
  const setContentHeight = stack.setContentHeight
  useLayoutEffect(() => {
    const inner = contentRef.current
    const body = bodyRef.current
    const section = sectionRef.current
    if (!inner || !body || !section || pane.collapsed) return
    const report = () => {
      const content = inner.getBoundingClientRect().height
      if (content <= 0) return
      const chromeOutsideBody = section.offsetHeight - body.offsetHeight // header + grab + pane borders
      const cs = getComputedStyle(body)
      const bodyPadV = parseFloat(cs.paddingTop || '0') + parseFloat(cs.paddingBottom || '0')
      setContentHeight(def.id, neededPaneHeight(content, chromeOutsideBody, bodyPadV))
    }
    report()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(report)
    ro.observe(inner)
    return () => ro.disconnect()
  }, [def.id, pane.collapsed, setContentHeight])

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
    <section ref={sectionRef} className={`codex-pane${pane.collapsed ? ' is-collapsed' : ''}`} style={{ height: h }} data-density={density} aria-label={def.label}>
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
          <div ref={contentRef} className="codex-pane-measure">
            {def.render()}
          </div>
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

/** A rail label spelled TOP-TO-BOTTOM, one upright letter under another (owner 2026-07-22) — not a
 *  word rotated on its side. Each character is its own line; the whole word rides on `aria-label` so a
 *  screen reader still reads "Skills", not "S k i l l s". A space renders as a blank line's worth of gap. */
function StackedLabel({ text }: { text: string }) {
  return (
    <span className="codex-raillabel" aria-label={text}>
      {[...text].map((ch, i) => (
        <span key={i} className="rl-ch" aria-hidden>{ch === ' ' ? ' ' : ch}</span>
      ))}
    </span>
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

  const paneById = useMemo(() => new Map(stack.panes.map((p) => [p.id, p])), [stack.panes])

  // Render the rows in the player's EFFECTIVE order (Part B — drag-to-reorder). `stack.order` is the custom
  // order with new sections appended, or the canonical order when they haven't reordered. Any def not named
  // in the order (defensive) keeps its natural position at the end.
  const orderedDefs = useMemo(() => {
    const rank = new Map(stack.order.map((id, i) => [id, i]))
    return defs.slice().sort((a, b) => (rank.get(a.id) ?? defs.length) - (rank.get(b.id) ?? defs.length))
  }, [defs, stack.order])

  // ── Drag-to-reorder the vertical tab stack (Part B2) ──────────────────────────────────────────────────
  // Pointer-based so mouse, touch and stylus all reorder, and it's fully stylable. A tab TOGGLES on a tap;
  // a drag past a small threshold instead reorders, and we suppress the click that would fire on release.
  // The drop index is read from the cursor against the row midpoints (`reorder` does the array move); the
  // reset row is excluded. Keyboard users reorder the focused tab with Alt+↑/↓. All the arithmetic lives in
  // the unit-tested `reorder`/`effectiveOrder`; this is just the input plumbing.
  const DRAG_THRESHOLD = 6
  const dragStart = useRef<{ id: string; y: number; moved: boolean } | null>(null)
  const justDragged = useRef(false)
  const [drag, setDrag] = useState<{ id: string; over: number } | null>(null)

  const rowIndexAtY = useCallback(
    (clientY: number): number => {
      const container = stack.viewportRef.current
      if (!container) return 0
      const rows = Array.from(container.querySelectorAll<HTMLElement>('.codex-acc-row:not(.codex-acc-resetrow)'))
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i].getBoundingClientRect()
        if (clientY < r.top + r.height / 2) return i
      }
      return Math.max(0, rows.length - 1)
    },
    [stack.viewportRef],
  )

  const onTabPointerDown = useCallback((e: React.PointerEvent, id: string) => {
    if (e.button !== 0) return
    dragStart.current = { id, y: e.clientY, moved: false }
  }, [])
  const onTabPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const s = dragStart.current
      if (!s) return
      if (!s.moved) {
        if (Math.abs(e.clientY - s.y) < DRAG_THRESHOLD) return // still a tap, not yet a drag
        s.moved = true
        try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId) } catch { /* capture unsupported */ }
      }
      setDrag({ id: s.id, over: rowIndexAtY(e.clientY) })
    },
    [rowIndexAtY],
  )
  const onTabPointerUp = useCallback(
    (e: React.PointerEvent) => {
      const s = dragStart.current
      dragStart.current = null
      try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId) } catch { /* already released */ }
      if (s?.moved && drag) {
        justDragged.current = true // suppress the click-to-toggle that follows a real drag
        stack.setOrder(reorder(stack.order, s.id, drag.over))
      }
      setDrag(null)
    },
    [drag, stack],
  )
  const onTabClick = useCallback(
    (id: string) => {
      if (justDragged.current) { justDragged.current = false; return } // it was a drag, not a tap
      stack.toggle(id)
    },
    [stack],
  )
  const onTabKeyDown = useCallback(
    (e: React.KeyboardEvent, id: string, index: number) => {
      if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
        e.preventDefault() // Alt+↑/↓ moves the focused tab one place — keyboard-accessible reordering
        stack.setOrder(reorder(stack.order, id, index + (e.key === 'ArrowUp' ? -1 : 1)))
      }
    },
    [stack],
  )

  // The CONNECTED ACCORDION (D-11b): one vertical column of rows on the right, EACH a section. A row is
  // just its tab when closed; when open, the section body opens OUT to the LEFT of that tab, joined to it
  // as one unit. Because every section is a row in the same column, opening one PUSHES the tabs below it
  // DOWN (they stay on the right, pushed beneath the open section) and closing reflows them back UP — no
  // separate rail + pane column. Sections render in canonical order so a tab is always in the same place.
  return (
    <div className="codex-accordion" ref={stack.viewportRef} aria-label="Sheet sections">
      {orderedDefs.map((d, i) => {
        const open = stack.isOpen(d.id)
        const pane = open ? paneById.get(d.id) : undefined
        const dragging = drag?.id === d.id
        const dropHere = drag != null && !dragging && drag.over === i
        return (
          <div key={d.id} className={`codex-acc-row${open ? ' is-open' : ''}${dragging ? ' is-dragging' : ''}${dropHere ? ' drop-target' : ''}`}>
            {open && pane && <PaneView def={d} pane={pane} stack={stack} />}
            <button
              className={`codex-railtab codex-acc-tab${open ? ' on' : ''}`}
              aria-pressed={open}
              onPointerDown={(e) => onTabPointerDown(e, d.id)}
              onPointerMove={onTabPointerMove}
              onPointerUp={onTabPointerUp}
              onClick={() => onTabClick(d.id)}
              onKeyDown={(e) => onTabKeyDown(e, d.id, i)}
              title={`${open ? `Close ${d.label}` : `Open ${d.label}`} · drag to reorder · Alt+↑/↓ to move`}
            >
              <span aria-hidden className="codex-railemoji">{d.emoji}</span>
              <StackedLabel text={d.label} />
            </button>
          </div>
        )
      })}
      <div className="codex-acc-row codex-acc-resetrow">
        <button className="codex-railtab codex-railreset codex-acc-tab" onClick={stack.reset} title="Reset this sheet's sections to just Skills. Only affects your own view.">
          <span aria-hidden>⟲</span>
          <StackedLabel text="Reset" />
        </button>
      </div>
    </div>
  )
}

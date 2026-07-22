'use client'
// FloatingRoller — the single wrapper that turns ANY roller into a floating tool window (R-1/R-2).
//
// Every format routes its roller through this: the classic 5e Dice Core, the Codex Sigil Stack, and
// the PF2/IG roller nodes. It renders a `position: fixed` window (so the roller stays visible while
// the sheet scrolls) with a drag header, a minimize control, a resize corner, and a body that is
// `flex: 1; min-height: 0; overflow: auto` so the roller's own components reflow to the box. All of
// the behaviour + persistence lives in `useFloatingDock`; this file is just the chrome.
//
// It owns NO roll logic. The one thing it exposes back to its child is `expand()` via context, so a
// roller can pop the window open when a fresh roll arrives while minimized — a window concern, not a
// roll concern. A roller not inside a FloatingRoller gets a harmless no-op from `useRollerDock()`.
//
// Styling is TOKEN-ONLY with fallbacks (`floatingRoller.css`, class `.fld`) so the same window reads
// correctly under `.dnd-sheet` (5e) AND under `.sheet-shell` / `.igs-root` (bespoke PF2/IG), and any
// re-skin restyles it for free. Motion is gated on `prefers-reduced-motion`.
import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { useFloatingDock } from './useFloatingDock'
import { RESET_TITLE } from '../../lib/floating'
import './floatingRoller.css'

interface RollerDockCtx {
  /** Un-minimize the floating window. No-op outside a FloatingRoller. */
  expand: () => void
}
const Ctx = createContext<RollerDockCtx>({ expand: () => {} })

/** A roller reads this to pop its window open on a fresh roll (see DiceTray / SigilStack). */
export function useRollerDock(): RollerDockCtx {
  return useContext(Ctx)
}

export default function FloatingRoller({
  characterId,
  children,
  title = 'Roller',
}: {
  /** Per-character persistence key for position/size/minimized (a view preference, never synced). */
  characterId: string | null | undefined
  children: ReactNode
  /** Short label on the minimized bar; the roller keeps its own in-body title when expanded. */
  title?: string
}) {
  const dock = useFloatingDock(characterId)
  const ctx = useMemo(() => ({ expand: dock.expand }), [dock.expand])

  if (dock.minimized) {
    return (
      <Ctx.Provider value={ctx}>
        <div ref={dock.ref} className="fld fld-mini" style={dock.style} role="dialog" aria-label={`${title} (minimized)`}>
          <button
            type="button"
            className="fld-bar"
            onPointerDown={dock.onHeaderPointerDown}
            onClick={dock.toggleMinimize}
            title="Expand roller · drag to move"
          >
            <span className="fld-grip" aria-hidden>⠿</span>
            <span className="fld-bar-title">🎲 {title}</span>
            <span className="fld-bar-caret" aria-hidden>▸</span>
          </button>
        </div>
      </Ctx.Provider>
    )
  }

  return (
    <Ctx.Provider value={ctx}>
      <div
        ref={dock.ref}
        className={`fld ${dock.ready ? 'fld-ready' : ''}`}
        style={dock.style}
        role="dialog"
        aria-label={title}
      >
        <div className="fld-head" onPointerDown={dock.onHeaderPointerDown} onDoubleClick={dock.reset} title="Drag to move · double-click to reset">
          <span className="fld-grip" aria-hidden>⠿</span>
          <div className="fld-head-btns">
            <button type="button" className="fld-btn" onClick={dock.reset} title={RESET_TITLE} aria-label={RESET_TITLE}>↺</button>
            <button type="button" className="fld-btn" onClick={dock.toggleMinimize} title="Minimize" aria-label="Minimize">▾</button>
          </div>
        </div>
        <div className="fld-body">{children}</div>
        <button
          type="button"
          className="fld-resize"
          onPointerDown={dock.onResizePointerDown}
          title="Drag to resize"
          aria-label="Resize roller"
          tabIndex={-1}
        >
          <span aria-hidden>⣶</span>
        </button>
      </div>
    </Ctx.Provider>
  )
}

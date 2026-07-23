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
import { createContext, useContext, useEffect, useMemo, useRef, type ReactNode } from 'react'
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

/** Pop the floating roller open whenever a NEW roll arrives (a token the hook hasn't seen), so clicking a
 *  rollable stat shows the throw even if the roller was minimized/closed — on EVERY system and template.
 *  Every roller stage calls this with its feed token, so the auto-open behaviour lives in ONE place and
 *  can't drift between the four templates. Idempotent, and a harmless no-op outside a FloatingRoller. */
export function useExpandOnRoll(token: number | null | undefined): void {
  const { expand } = useRollerDock()
  const seen = useRef<number | null>(null)
  useEffect(() => {
    if (token == null || token === seen.current) return
    seen.current = token
    expand()
  }, [token, expand])
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

  // The children (the roller node with its animated stages) are ALWAYS mounted — when minimized the window is
  // just hidden, NOT unmounted. That is what lets a roll made while minimized still fire the stage's
  // expand-on-roll (which pops the window open) and land the throw: an unmounted stage can't react at all.
  return (
    <Ctx.Provider value={ctx}>
      {dock.minimized && (
        // The minimized roller is a single dice BUTTON pinned to the bottom-right (D-1). Click re-opens the
        // window at its remembered position; a roll auto-opens it too (the stage calls expand()).
        <button
          type="button"
          className="fld-fab"
          style={dock.minimizedStyle}
          onClick={dock.toggleMinimize}
          title={`Open ${title}`}
          aria-label={`Open ${title}`}
        >
          <span aria-hidden className="fld-fab-die">🎲</span>
        </button>
      )}
      <div
        ref={dock.ref}
        className={`fld ${dock.ready ? 'fld-ready' : ''}`}
        style={dock.minimized ? { ...dock.style, display: 'none' } : dock.style}
        role="dialog"
        aria-label={title}
        aria-hidden={dock.minimized}
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

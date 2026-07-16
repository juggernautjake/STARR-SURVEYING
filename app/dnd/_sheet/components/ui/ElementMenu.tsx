'use client'
// ElementMenu — the ⋯ affordance on every editable thing (Slice 27).
//
// "I either need to be able to click on the attack or item or spell or effect or whatever, and it
// will give me the option to edit it. Maybe we have a menu or edit button or three dots."
//
// The popup is PORTALED to document.body with fixed positioning. It used to be an absolutely-
// positioned child of the row, which meant the Attacks table's `overflow` (and every card's
// clipping) sliced the menu off — reported with screenshots showing only the first item. A portal
// escapes every ancestor's overflow and stacking context, so the menu always renders in front.
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useSheetSystem } from '../../state/sheetConfig'
import { SYSTEM_AMBIGUOUS } from '@/lib/dnd/systems'

export interface MenuAction {
  label: string
  onClick: () => void
  /** Rendered in the danger accent (delete). */
  danger?: boolean
}

/** Where the librarian lives, pre-filled and focused on this system (same target as RuleTip). */
function askUrl(system: string, subject: string): string {
  const q = `Tell me about “${subject}” on my character — what it does and when I'd use it.`
  return `/dnd/library/${encodeURIComponent(system)}?ask=${encodeURIComponent(q)}#chat`
}

export default function ElementMenu({
  label,
  actions,
  askAiAbout,
}: {
  label: string
  actions: MenuAction[]
  /** Subject for the built-in "Ask AI about this" item; defaults to `label`. Pass `null` to hide it
   *  (e.g. a generic-labelled row where "ask about trait" would be meaningless). */
  askAiAbout?: string | null
}) {
  const system = useSheetSystem()
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const popRef = useRef<HTMLDivElement>(null)

  // "Ask AI about this" (Slice 27): reuses the Slice-3 librarian, pre-filled with this element. Only
  // when the sheet has a system (no rulebook to ask against otherwise), and only when not opted out.
  const subject = askAiAbout === null ? null : (askAiAbout ?? label)
  const allActions: MenuAction[] =
    subject && system !== SYSTEM_AMBIGUOUS
      ? [...actions, { label: '✨ Ask AI about this', onClick: () => window.open(askUrl(system, subject), '_blank', 'noopener') }]
      : actions

  // Position the portaled popup under the button, flipping up / left when it would leave the
  // viewport — a menu that opens off-screen is as useless as one that's clipped.
  useLayoutEffect(() => {
    if (!open || !btnRef.current) return
    const r = btnRef.current.getBoundingClientRect()
    const W = 160
    const H = allActions.length * 34 + 8
    let left = r.left
    let top = r.bottom + 4
    if (left + W > window.innerWidth - 8) left = Math.max(8, window.innerWidth - W - 8)
    if (top + H > window.innerHeight - 8) top = Math.max(8, r.top - H - 4)
    setPos({ top, left })
  }, [open, allActions.length])

  // Close on outside click / Escape / scroll. A menu you can only close by picking something is a
  // trap; and because it's portaled with fixed coords, a scroll would leave it floating in place.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node
      if (btnRef.current?.contains(t) || popRef.current?.contains(t)) return
      setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    const onScroll = () => setOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    window.addEventListener('scroll', onScroll, true)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', onScroll, true)
    }
  }, [open])

  if (!allActions.length) return null

  return (
    <span className="el-menu">
      <button
        ref={btnRef}
        type="button"
        className="el-menu-btn"
        aria-label={`Edit ${label}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation() // rows are often click-to-roll; opening the menu must not roll
          setOpen((o) => !o)
        }}
      >
        ⋯
      </button>
      {open && pos && typeof document !== 'undefined' && createPortal(
        <div
          ref={popRef}
          className="el-menu-pop"
          role="menu"
          style={{ top: pos.top, left: pos.left }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {allActions.map((a) => (
            <button
              key={a.label}
              type="button"
              role="menuitem"
              className={`el-menu-item ${a.danger ? 'danger' : ''}`}
              onClick={(e) => {
                e.stopPropagation()
                setOpen(false)
                a.onClick()
              }}
            >
              {a.label}
            </button>
          ))}
        </div>,
        document.body,
      )}
    </span>
  )
}

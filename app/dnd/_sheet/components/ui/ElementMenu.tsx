'use client'
// ElementMenu — the ⋯ affordance on every editable thing (Slice 27).
//
// "I either need to be able to click on the attack or item or spell or effect or whatever, and it
// will give me the option to edit it. Maybe we have a menu or edit button or three dots."
//
// The rows on the sheet have always carried everything needed to edit them (Attack, InvItem, Spell
// all have their fields); what was missing was any way IN. A feature nobody can find is a feature
// that doesn't exist — so this is one control, in one place, on every kind of element, so the
// answer to "how do I change this?" is the same everywhere.
import { useEffect, useRef, useState } from 'react'

export interface MenuAction {
  label: string
  onClick: () => void
  /** Rendered in the danger accent (delete). */
  danger?: boolean
}

export default function ElementMenu({ label, actions }: { label: string; actions: MenuAction[] }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Close on outside click / Escape. A menu you can only close by picking something is a trap.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  if (!actions.length) return null

  return (
    <div className="el-menu" ref={ref}>
      <button
        type="button"
        className="el-menu-btn"
        // A real button with a real label: this has to be reachable by keyboard and readable by a
        // screen reader, not just discoverable by hovering a row on a desktop.
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
      {open && (
        <div className="el-menu-pop" role="menu">
          {actions.map((a) => (
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
        </div>
      )}
    </div>
  )
}

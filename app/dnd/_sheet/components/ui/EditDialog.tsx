'use client'
// EditDialog — the shared shell every element editor renders inside (Slice 20 / 27).
//
// One dialog, so an attack, an item and (later) a spell are edited in the same place, the same
// way, with the same keyboard behaviour. Theme-token styled, so it inherits whichever skin the
// character is on rather than dragging one palette across all of them.
import { useEffect, useRef } from 'react'

export default function EditDialog({
  title,
  onClose,
  onSave,
  saveLabel = 'Save',
  children,
}: {
  title: string
  onClose: () => void
  onSave: () => void
  saveLabel?: string
  children: React.ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    // Focus the first field so a keyboard user lands inside the dialog rather than behind it.
    ref.current?.querySelector<HTMLElement>('input,select,textarea')?.focus()
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="ed-scrim" onMouseDown={onClose} role="presentation">
      {/* Stop the backdrop handler from firing for clicks INSIDE the dialog — otherwise dragging
          a text selection out of a field closes the dialog and discards the edit. */}
      <div
        className="ed-dialog"
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="ed-dialog-head">
          <h3>{title}</h3>
          <button type="button" className="btn tiny" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="ed-dialog-body">{children}</div>
        <div className="ed-dialog-foot">
          <button type="button" className="btn tiny" onClick={onClose}>Cancel</button>
          <button type="button" className="btn tiny teal" onClick={onSave}>{saveLabel}</button>
        </div>
      </div>
    </div>
  )
}

/** A labelled field. Keeps every editor's layout identical without each one re-inventing it. */
export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="ed-field">
      <span className="ed-field-label">
        {label}
        {hint && <span className="ed-field-hint">{hint}</span>}
      </span>
      {children}
    </label>
  )
}

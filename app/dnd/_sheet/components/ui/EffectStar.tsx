'use client'
// app/dnd/_sheet/components/ui/EffectStar.tsx — the ★ marker + "why is this number what it is?"
// popover (Slice 13). ONE component so every affected value explains itself the same way, and so
// the accessibility work (keyboard, touch, focus) is done once instead of per-stat.
//
// It is a pure READ of the ledger (Slice 10). It never re-derives a number — the sheet already
// shows the effective value; this only answers "what's touching it, and from where". If nothing
// touches any of the given targets it renders its children untouched and adds no affordance, so a
// vanilla stat stays clean (a star that's always on is noise the reader learns to ignore).
//
// Inline-safe by construction: every node is a <span> (block-displayed via CSS), never a <div>/<p>,
// because a marker can sit inside a feature's <p> and HTML force-closes a paragraph at the first
// block child — the same trap RuleTip documents. We reuse RuleTip's `.ruletip-pop` chrome so the
// two popovers look and behave identically.
import { useCallback, useEffect, useRef, useState } from 'react'
import { useChar } from '../../state/store'

export default function EffectStar({
  target,
  label,
  children,
}: {
  /** The ledger target(s) whose effects explain this number. A save/skill passes its governing
   *  ability target, because that's what actually moved the roll. */
  target: string | string[]
  /** Human name for the value, shown as the popover's heading ("Strength", "Athletics"). */
  label?: string
  /** The displayed value. Wrapped in the teal "is-modified" tint when anything is active. */
  children?: React.ReactNode
}) {
  const { ledger } = useChar()
  const targets = Array.isArray(target) ? target : [target]
  const active = targets.filter((t) => ledger.isModified(t))
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLSpanElement | null>(null)

  const close = useCallback(() => setOpen(false), [])

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

  // Nothing is modifying any target → no star, no ring, just the value.
  if (!active.length) return <>{children}</>

  // A plain-text version for the native tooltip (hover) and the aria-label (screen readers), so the
  // affordance is not popover-only. The popover is the rich, keyboard/touch path on top of it.
  const summaryLines: string[] = []
  for (const t of active) {
    const entry = ledger.byTarget[t]
    const head = label && active.length === 1 ? label : t
    if (typeof entry?.base === 'number') summaryLines.push(`${head} ${entry.base} base`)
    for (const c of ledger.explain(t)) {
      summaryLines.push(`${c.suppressed ? '(no effect) ' : ''}${c.label} — ${c.source}`)
    }
    if (typeof entry?.final === 'number') summaryLines.push(`= ${entry.final}`)
  }
  const summary = summaryLines.join('\n')

  return (
    <span className="ruletip effect-star" ref={ref}>
      <span className="is-modified" title={summary}>
        {children}
      </span>
      <button
        type="button"
        className="mod-star effect-star-trigger"
        aria-label={`Effects on ${label ?? 'this value'}: ${summary.replace(/\n/g, '; ')}`}
        title={summary}
        onClick={(e) => {
          e.stopPropagation()
          setOpen((o) => !o)
        }}
      >
        ★
      </button>
      {open && (
        <span className="ruletip-pop effect-star-pop" role="dialog" aria-label={`${label ?? 'Value'} — what's modifying it`}>
          <span className="ruletip-head">
            <strong className="ruletip-term">{label ?? 'Active effects'}</strong>
            <button type="button" className="ruletip-close" onClick={close} aria-label="Close">
              ✕
            </button>
          </span>
          <span className="ruletip-body">
            {active.map((t) => {
              const entry = ledger.byTarget[t]
              const contribs = ledger.explain(t)
              return (
                <span className="es-target" key={t}>
                  {typeof entry?.base === 'number' && (
                    <span className="es-line es-base">
                      {(active.length > 1 || !label ? `${t}: ` : '')}
                      {entry.base} base
                    </span>
                  )}
                  {contribs.map((c, i) => (
                    <span className={`es-line es-contrib${c.suppressed ? ' es-suppressed' : ''}`} key={i}>
                      <span className="es-what">{c.label}</span>
                      <span className="es-source">{c.source}</span>
                    </span>
                  ))}
                  {typeof entry?.final === 'number' && <span className="es-line es-total">= {entry.final}</span>}
                </span>
              )
            })}
          </span>
        </span>
      )}
    </span>
  )
}

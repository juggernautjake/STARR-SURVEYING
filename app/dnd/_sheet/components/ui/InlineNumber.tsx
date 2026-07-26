import { useEffect, useRef, useState } from 'react'
import { useChar } from '../../state/store'
import { logManualEdit } from '../../lib/log-edit'

interface Props {
  value: number
  onCommit: (n: number) => void
  className?: string
  display?: React.ReactNode // what to show when not editing (defaults to value)
  min?: number
  max?: number
  title?: string
  stopClick?: boolean // stop single-click from bubbling (so a parent roll handler doesn't fire)
  path?: string // stable key enabling temporary-edit tracking + revert
}

/** Double-click to edit a number inline. Commits on Enter/blur, cancels on Esc.
 *  With a `path`, edits made while Temp mode is on are reversible (a ⟲ appears). */
export default function InlineNumber({ value, onCommit, className, display, min, max, title, stopClick, path }: Props) {
  const { tempMode, tempOverrides, recordOverride, clearOverride, characterId } = useChar()
  const [editing, setEditing] = useState(false)
  const [temp, setTemp] = useState(String(value))
  const ref = useRef<HTMLInputElement>(null)

  const isTemp = !!path && tempOverrides && path in tempOverrides

  useEffect(() => {
    if (editing) {
      ref.current?.focus()
      ref.current?.select()
    }
  }, [editing])

  const start = () => {
    setTemp(String(value))
    setEditing(true)
  }
  const commit = () => {
    let n = parseInt(temp, 10)
    if (Number.isNaN(n)) n = value
    if (min != null) n = Math.max(min, n)
    if (max != null) n = Math.min(max, n)
    if (path) {
      if (tempMode) recordOverride(path, value) // remember the original (once)
      else clearOverride(path) // permanent edit becomes the new baseline
      // AUDIT, here, so no caller can forget.
      //
      // This is the sheet's easiest edit — double-click a number — and it was the one edit that did not
      // reach `dnd_sheet_edits`. `DmOverridePanel` logged its own inline fields, but `Abilities` and
      // `StatRail` did not, so a player double-clicking their AC, HP or Strength on the sheet changed it
      // with no audit row and it never appeared in the DM's review queue — while the plan doc recorded
      // "every edit audits" and "every change is visible to the DM, and reversible by them".
      //
      // At the choke point rather than in each caller, which is `log-edit.ts`'s own stated rule ("one audit
      // vocabulary, not a parallel path") and the reason those two callers could diverge in the first
      // place. `logManualEdit` no-ops when nothing moved and when the sheet isn't DB-backed.
      logManualEdit(characterId, path, value, n, tempMode ? 'temp' : 'permanent')
    }
    onCommit(n)
    setEditing(false)
  }
  const revert = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (path && tempOverrides && path in tempOverrides) {
      onCommit(tempOverrides[path])
      clearOverride(path)
    }
  }

  if (editing) {
    return (
      <input
        ref={ref}
        className={`inline-edit ${className ?? ''}`}
        value={temp}
        inputMode="numeric"
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => setTemp(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit()
          else if (e.key === 'Escape') setEditing(false)
        }}
      />
    )
  }

  return (
    <span
      className={`inline-num ${isTemp ? 'is-temp' : ''} ${className ?? ''}`}
      title={title ?? (tempMode ? 'Double-click to edit (temporary)' : 'Double-click to edit')}
      onDoubleClick={(e) => {
        e.stopPropagation()
        start()
      }}
      onClick={stopClick ? (e) => e.stopPropagation() : undefined}
    >
      {display ?? value}
      {isTemp && (
        <span className="temp-revert" role="button" tabIndex={0} onClick={revert} title={`Revert to original (${tempOverrides[path!]})`}>
          ⟲
        </span>
      )}
    </span>
  )
}

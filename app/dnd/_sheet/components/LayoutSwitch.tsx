'use client'
// Layout switch (CX-1) — Classic vs Codex, beside the existing SkinSwitch.
//
// Layout is a THIRD, ORTHOGONAL axis to the two the sheet already had. `sheet_type` resolves to a
// skin (bespoke CSS) plus a module list; `skinVariant` picks a colour theme within that skin.
// Neither says anything about how the sheet is arranged. Keeping layout separate is what lets any
// layout work with any skin and any system — the alternative, a `sheet_type` per layout×skin
// combination, multiplies out and would need a new registry entry for every pairing.
//
// Persisted on `char.sheetLayout` rather than in localStorage, unlike the pane sizes. The
// distinction is deliberate: which panes you have open and how tall they are is a per-viewer view
// preference (a DM peeking must not disturb it), but which LAYOUT the sheet uses is a property of
// the sheet the owner chose — it should look the same to everyone who opens it, including the DM
// and anyone watching a stream.
import { useChar } from '../state/store'
import type { SheetLayout } from '../types'

const LAYOUTS: { key: SheetLayout; label: string; hint: string }[] = [
  { key: 'classic', label: 'Classic', hint: 'One section at a time, tabs across the top. Best on a phone.' },
  { key: 'codex', label: 'Codex', hint: 'Stats down the left, several sections open at once and resizable. Best on a wide screen.' },
]

export default function LayoutSwitch() {
  const { char, setChar, canWrite } = useChar()
  const active: SheetLayout = char.sheetLayout ?? 'classic'

  return (
    <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '12px 16px', marginBottom: 14 }}>
      <span className="sec-num">LAYOUT {'//'}</span>
      {LAYOUTS.map((l) => {
        const isActive = active === l.key
        return (
          <button
            key={l.key}
            className={`btn tiny ${isActive ? 'active' : ''}`}
            disabled={!canWrite}
            onClick={() => canWrite && setChar((ch) => ({ ...ch, sheetLayout: l.key }))}
            style={{ opacity: isActive ? 1 : 0.7 }}
            aria-pressed={isActive}
            title={l.hint}
          >
            {l.label}
          </button>
        )
      })}
      <span style={{ fontSize: 12, color: 'var(--muted)', marginLeft: 'auto' }}>
        {canWrite
          ? 'Codex keeps several sections open at once; Classic shows one at a time. Your skin and colour theme apply to both.'
          : `Layout: ${LAYOUTS.find((l) => l.key === active)?.label ?? active}`}
      </span>
    </div>
  )
}

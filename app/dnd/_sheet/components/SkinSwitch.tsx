'use client'
// Skin variant switch (§6.9) — for skins that ship more than one colorway (the
// streamer's pink/blue). The player flips it; the engine swaps the color theme, the
// `.variant-<id>` class, and the character art/token to match. Persisted on the sheet.
import { useChar } from '../state/store'

const VARIANTS = [
  { id: 'pink', label: 'Pink', glyph: '🩷' },
  { id: 'blue', label: 'Blue', glyph: '💙' },
] as const

export default function SkinSwitch() {
  const { char, setChar, canWrite } = useChar()
  const active = char.skinVariant ?? 'pink'

  return (
    <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '12px 16px', marginBottom: 14 }}>
      <span className="sec-num">STYLE {'//'}</span>
      {VARIANTS.map((v) => (
        <button
          key={v.id}
          className={`btn tiny ${active === v.id ? 'active' : ''}`}
          disabled={!canWrite}
          onClick={() => canWrite && setChar((c) => ({ ...c, skinVariant: v.id }))}
          style={{ opacity: active === v.id ? 1 : 0.7 }}
        >
          {v.glyph} {v.label}
        </button>
      ))}
      <span style={{ fontSize: 12, color: 'var(--muted)', marginLeft: 'auto' }}>
        {canWrite ? 'Switch the sheet + art between the pink and blue styles.' : `Style: ${active}`}
      </span>
    </div>
  )
}

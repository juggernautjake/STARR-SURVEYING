'use client'
// Colour-theme switch (§6.9 + Area TH) — for skins that ship more than one palette (the streamer's pink/blue,
// the default Hextech skin's Gold/Shadow-Isles/Noxus/Freljord set). The player picks one; the engine swaps the
// colour theme (and, for the streamer, the `.variant-<id>` class + character art). Persisted on the sheet as
// `char.skinVariant`. The available palettes come from `themeVariantsFor(skin)` via App.tsx.
import { useChar } from '../state/store'
import type { ThemeVariant } from '../theme'

export default function SkinSwitch({ variants }: { variants: ThemeVariant[] }) {
  const { char, setChar, canWrite } = useChar()
  const active = char.skinVariant ?? variants[0]?.key

  return (
    <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '12px 16px', marginBottom: 14 }}>
      <span className="sec-num">THEME {'//'}</span>
      {variants.map((v) => {
        // A small swatch built from the palette's own accents, so the choice reads as a colour at a glance.
        const c = v.theme.colors ?? {}
        const swatch = c.hotpink ?? c.gold ?? c.tealbright ?? 'var(--hotpink)'
        const isActive = active === v.key
        return (
          <button
            key={v.key}
            className={`btn tiny ${isActive ? 'active' : ''}`}
            disabled={!canWrite}
            onClick={() => canWrite && setChar((ch) => ({ ...ch, skinVariant: v.key }))}
            style={{ opacity: isActive ? 1 : 0.7, display: 'inline-flex', alignItems: 'center', gap: 7 }}
            aria-pressed={isActive}
            title={canWrite ? `Use the ${v.label} colour theme` : v.label}
          >
            <span aria-hidden style={{ width: 12, height: 12, borderRadius: '50%', background: swatch, border: '1px solid rgba(255,255,255,0.35)', boxShadow: isActive ? `0 0 8px ${swatch}` : 'none' }} />
            {v.label}
          </button>
        )
      })}
      <span style={{ fontSize: 12, color: 'var(--muted)', marginLeft: 'auto' }}>
        {canWrite ? 'Pick a colour theme for this sheet — every one is contrast-checked for readability.' : `Theme: ${variants.find((v) => v.key === active)?.label ?? active}`}
      </span>
    </div>
  )
}

'use client'
// Patron-influence meter (Phase J11) — sits vertically next to the streamer chat. The
// chat is the character's patron deity: the higher the influence (driven by the DM's
// viewer count + engagement dial), the higher the DC to resist chat's demands. The bar
// is always bobbing; it's a glowing rainbow until influence maxes out, then it flips to
// neon pink and shakes violently (DC at its 25 ceiling — "irresistible"). Pure math in
// lib/dnd/stream-influence; the DM controls both inputs from StreamControl.
import { useEffect, useRef, useState } from 'react'
import { computeInfluence, viewerDC, MAX_DC } from '@/lib/dnd/stream-influence'
import styles from '@/app/dnd/_ui/hextech.module.css'

export default function InfluenceMeter({ viewers, engagement }: { viewers: number; engagement: number }) {
  // The DC (and the bar's resting height) come straight from the viewer-count tier table.
  const dc = viewerDC(viewers)
  const base = (dc - 2) / (MAX_DC - 2) // 0..1 fill from the DC tier
  // Engagement (+ viewers) only drives how energetically the bar bobs — a busier, more
  // hyped chat visibly shakes harder — but it no longer changes the DC.
  const energy = computeInfluence(viewers, engagement)
  const [level, setLevel] = useState(base)
  const phaseRef = useRef(0)
  const baseRef = useRef(base)
  const energyRef = useRef(energy)
  baseRef.current = base
  energyRef.current = energy

  // Continuous bob: a couple of out-of-phase sines + a little noise around the base
  // level, so the meter is always alive even when the inputs hold steady.
  useEffect(() => {
    const t = setInterval(() => {
      phaseRef.current += 0.09
      const b = baseRef.current
      const amp = 0.02 + energyRef.current * 0.05 // livelier when chat is hyped
      const bob = Math.sin(phaseRef.current) * amp + Math.sin(phaseRef.current * 2.7) * (amp * 0.45)
      const noise = (Math.random() - 0.5) * 0.02
      setLevel(Math.max(0, Math.min(1, b + bob + noise)))
    }, 90)
    return () => clearInterval(t)
  }, [])

  // DC + the maxed state read straight from the viewer count, so the rules number holds
  // rock-steady while only the bar's fill height bobs.
  const maxed = dc >= MAX_DC

  return (
    <div data-influence-meter="" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, userSelect: 'none', flexShrink: 0 }}>
      <div style={{ fontSize: 10, letterSpacing: '0.12em', color: 'var(--muted, #9aa)' }}>RESIST</div>
      <div
        style={{
          // Colors are CSS-var driven so a sheet skin can recolor the meter; the
          // hardcoded values are the default (unskinned) look.
          fontFamily: 'var(--inf-font, "Cinzel", var(--hx-font-display, serif))',
          fontSize: 21,
          fontWeight: 800,
          color: maxed ? 'var(--inf-max, #ff10f0)' : 'var(--inf-dc, #7ab8ff)',
          textShadow: maxed ? '0 0 12px var(--inf-max, #ff10f0)' : '0 0 8px var(--inf-dc, #7ab8ff)',
        }}
      >
        DC {dc}
      </div>
      <div data-inf-track="" className={`${styles.influenceTrack} ${maxed ? styles.influenceTrackMax : ''}`}>
        <div data-inf-fill="" className={`${styles.influenceFill} ${maxed ? styles.influenceFillMax : ''}`} style={{ height: `${Math.round(level * 100)}%` }} />
      </div>
      <div style={{ fontSize: 9.5, letterSpacing: '0.06em', color: maxed ? '#ff10f0' : 'var(--muted, #9aa)', textAlign: 'center', maxWidth: 66, lineHeight: 1.25 }}>
        {maxed ? 'MAXED — IRRESISTIBLE!' : 'CHAT INFLUENCE'}
      </div>
    </div>
  )
}

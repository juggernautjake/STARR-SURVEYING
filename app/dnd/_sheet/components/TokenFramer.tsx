'use client'
// Token framer (D2) — lets an owner/DM choose exactly which part of the uploaded
// token/art image the round icon crops from. Drag the circle over the image to set
// the focus point and use the slider to zoom; the live preview matches the real
// token 1:1. Saves to char.tokenFocus (persisted with the sheet), so the icon on the
// sheet updates immediately. No server-side image processing — pure CSS framing.
import { useRef, useState } from 'react'
import { useChar } from '../state/store'

const DEFAULT = { x: 50, y: 8, zoom: 1 }

function clamp(n: number, lo = 0, hi = 100) {
  return Math.max(lo, Math.min(hi, n))
}

export default function TokenFramer() {
  const { char, setChar, canWrite, media } = useChar()
  const [open, setOpen] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)

  const src = media.tokenUrl ?? media.artUrl ?? null
  if (!canWrite || !src) return null

  const focus = char.tokenFocus ?? DEFAULT
  const setFocus = (patch: Partial<typeof focus>) =>
    setChar((c) => ({ ...c, tokenFocus: { ...DEFAULT, ...c.tokenFocus, ...patch } }))

  const onPoint = (e: React.PointerEvent) => {
    if (e.buttons === 0 && e.type === 'pointermove') return
    const box = boxRef.current
    if (!box) return
    const r = box.getBoundingClientRect()
    setFocus({ x: Math.round(clamp(((e.clientX - r.left) / r.width) * 100)), y: Math.round(clamp(((e.clientY - r.top) / r.height) * 100)) })
  }

  // The reticle is a visual guide; the preview below is the source of truth.
  const reticle = 100 / focus.zoom // diameter as a % of the box's shorter side

  const previewImg: React.CSSProperties = {
    width: '100%',
    height: '100%',
    display: 'block',
    objectFit: 'cover',
    objectPosition: `${focus.x}% ${focus.y}%`,
    transform: focus.zoom > 1 ? `scale(${focus.zoom})` : undefined,
    transformOrigin: `${focus.x}% ${focus.y}%`,
  }

  return (
    <div className="card" style={{ padding: '12px 16px', marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span className="sec-num">TOKEN {'//'}</span>
        <button className="btn tiny" onClick={() => setOpen((v) => !v)}>{open ? '✕ Close' : '◎ Frame token'}</button>
        {char.tokenFocus && <button className="btn tiny" onClick={() => setChar((c) => ({ ...c, tokenFocus: undefined }))}>⟲ Reset</button>}
        <span style={{ fontSize: 12, color: 'var(--muted)', marginLeft: 'auto' }}>Drag the circle onto the face; slider zooms.</span>
      </div>

      {open && (
        <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'flex-start', marginTop: 12 }}>
          {/* Source image with a draggable focus reticle */}
          <div
            ref={boxRef}
            onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); onPoint(e) }}
            onPointerMove={onPoint}
            style={{ position: 'relative', width: 220, maxWidth: '70vw', aspectRatio: '3 / 4', border: '1px solid var(--line)', borderRadius: 6, overflow: 'hidden', cursor: 'crosshair', touchAction: 'none', background: 'rgba(0,0,0,0.25)' }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt="token source" style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block', pointerEvents: 'none' }} />
            <div
              style={{
                position: 'absolute',
                left: `${focus.x}%`,
                top: `${focus.y}%`,
                width: `${reticle}%`,
                transform: 'translate(-50%, -50%)',
                aspectRatio: '1 / 1',
                borderRadius: '50%',
                border: '2px dashed #fff',
                boxShadow: '0 0 0 9999px rgba(0,0,0,0.35)',
                pointerEvents: 'none',
              }}
            />
          </div>

          {/* Controls + live preview (matches the real token) */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center' }}>
            <div style={{ width: 76, height: 76, borderRadius: '50%', overflow: 'hidden', border: '2px solid var(--violet-2)', boxShadow: '0 0 12px rgba(139,92,246,0.5)' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt="token preview" style={previewImg} />
            </div>
            <label style={{ fontSize: 12, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
              Zoom
              <input
                type="range"
                min={1}
                max={4}
                step={0.1}
                value={focus.zoom}
                onChange={(e) => setFocus({ zoom: Number(e.target.value) })}
              />
              {focus.zoom.toFixed(1)}×
            </label>
          </div>
        </div>
      )}
    </div>
  )
}

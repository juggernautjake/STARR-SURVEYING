'use client'
// Die3D — one die, rendered as a rotating solid.
//
// OWNER: *"I want it where it looks like the dice are actually being rolled … If there is a way to make it look
// like the actual dice with styling and formatting and animation, please do that. That would be an upgrade from
// just changing the number of sides of the boundary."*
//
// That is exactly what this is. The old die was one flat SVG polygon with the rolled number in the middle, spun
// about the screen axis — so it read as a badge on a turntable. This projects a real polyhedron every frame:
// faces come round, catch the light, turn away and vanish at the silhouette. The number is not painted on the
// middle of the die, it is painted on a FACE, and it goes away with that face.
//
// ALL THE NUMBERS ARE ON IT, which the owner asked for separately: every face turned toward the viewer carries
// its own numeral, fading out as the face turns edge-on. On a d20 mid-tumble that is eight or nine numbers
// wheeling past, which is the thing you actually see when someone rolls a die on a table.
//
// THE VALUE IS NEVER COMPUTED HERE. It is a prop. `planThrow` finds a rotation that ends with that value's face
// square-on to the camera, so the die cannot disagree with the total on the sheet — and with animation off the
// only frame drawn is the settled one (plan ground rules G2 and G5).
//
// ONE TICKER FOR EVERY DIE. A `requestAnimationFrame` loop per die means eight loops for a handful of dice; the
// module-level ticker below drives all of them from one, which is also why they stay in step.
import { useEffect, useRef, useState } from 'react'
import { solidFor, faceForValue } from '@/lib/dnd/dice/solids'
import { projectSolid, type ProjectedFace } from '@/lib/dnd/dice/project'
import { planThrow, throwSeed, type ThrowPlan } from '@/lib/dnd/dice/throw'
import { DIE_MATERIALS, type DieMaterial } from '@/lib/dnd/dice/materials'
import './die3d.css'

// ── the shared ticker ─────────────────────────────────────────────────────────
type Tick = (now: number) => void
const subscribers = new Set<Tick>()
let frame: number | null = null

function pump(now: number) {
  frame = null
  // Copied before iterating: a subscriber that unsubscribes itself mid-tick (the last frame of a throw does
  // exactly that) would otherwise mutate the set being walked.
  for (const fn of [...subscribers]) fn(now)
  if (subscribers.size) frame = requestAnimationFrame(pump)
}
function subscribe(fn: Tick) {
  subscribers.add(fn)
  if (frame === null) frame = requestAnimationFrame(pump)
  return () => {
    subscribers.delete(fn)
    if (!subscribers.size && frame !== null) {
      cancelAnimationFrame(frame)
      frame = null
    }
  }
}

export interface Die3DProps {
  /** How many faces. Any number works — see `solidFor`. */
  sides: number
  /** The rolled value. This face ends up facing the camera. */
  value: number
  /** Distinguishes dice within one throw, and keeps a re-render from re-randomising the tumble. */
  seed?: number
  /** False → render the settled pose immediately (reduced motion, or the player turned animation off). */
  animate?: boolean
  /** Rendered size in px. The geometry is a 0…100 viewBox, so this only scales. */
  size?: number
  /** Tumble length in ms. Kept in step with the roller's existing commit timing. */
  duration?: number
  /** Fires as the die strikes the table, for the audio to hit in time with the motion. */
  onImpact?: (index: number, total: number) => void
  onSettled?: () => void
  /** Extra class for crit/fumble treatments. */
  className?: string
  /**
   * What the die is made of. Sets how hard the light falls across the facets, how glossy it is, how visible the
   * seams are — never the colours, which come from the sheet's own tokens so the die follows the player's theme
   * on every system. See `materialForSkin`.
   */
  material?: DieMaterial
}

const MIN_FACING_FOR_NUMERAL = 0.34

export default function Die3D({
  sides,
  value,
  seed = 0,
  animate = true,
  size = 108,
  duration = 1080,
  onImpact,
  onSettled,
  className = '',
  material = DIE_MATERIALS.gem,
}: Die3DProps) {
  const solid = solidFor(sides)
  // A value the die cannot show (a mismatch upstream) still has to render something honest, so fall back to the
  // first face rather than throwing — a blank die in play is worse than a die showing a defensible face.
  const landing = Math.max(0, faceForValue(solid, value))

  const plan = useRef<ThrowPlan | null>(null)
  const planKey = `${sides}:${value}:${seed}`
  const keyRef = useRef(planKey)
  if (!plan.current || keyRef.current !== planKey) {
    plan.current = planThrow(throwSeed(seed, 0), solid, landing)
    keyRef.current = planKey
  }

  const [faces, setFaces] = useState<ProjectedFace[]>(() => projectSolid(solid, plan.current!.settled, { contrast: material.contrast }).faces)
  const [outline, setOutline] = useState(() => projectSolid(solid, plan.current!.settled, { contrast: material.contrast }).silhouette)
  const [tumbling, setTumbling] = useState(animate)

  const cbs = useRef({ onImpact, onSettled })
  cbs.current = { onImpact, onSettled }

  useEffect(() => {
    const p = plan.current!
    if (!animate) {
      const shot = projectSolid(solid, p.settled, { contrast: material.contrast })
      setFaces(shot.faces)
      setOutline(shot.silhouette)
      setTumbling(false)
      cbs.current.onSettled?.()
      return
    }

    setTumbling(true)
    let start: number | null = null
    let nextImpact = 0
    const unsubscribe = subscribe((now) => {
      if (start === null) start = now
      const t = Math.min(1, (now - start) / duration)
      const shot = projectSolid(solid, p.at(t), { contrast: material.contrast })
      setFaces(shot.faces)
      setOutline(shot.silhouette)
      while (nextImpact < p.impacts.length && t >= p.impacts[nextImpact]) {
        cbs.current.onImpact?.(nextImpact, p.impacts.length)
        nextImpact++
      }
      if (t >= 1) {
        unsubscribe()
        setTumbling(false)
        cbs.current.onSettled?.()
      }
    })
    return unsubscribe
    // `plan.current` is keyed on exactly these, so this is the full dependency set.
  }, [planKey, animate, duration, solid, material])

  // The material's numbers reach the stylesheet as custom properties, so `die3d.css` keeps owning the COLOURS
  // (which come from the sheet's theme) while the material owns the physical character. Neither has to know about
  // the other, which is what lets a new theme work on every material and a new material work in every theme.
  const materialVars = {
    '--d3-seam': String(material.seam),
    '--d3-edge-w': `${material.edge}`,
    '--d3-bloom': String(material.bloom),
  } as React.CSSProperties

  // One gradient per material, not one per die: several dice share a material, but two rollers on a page might
  // not, and a single hardcoded id would let the glossier one silently restyle the matte one.
  const sheenId = `d3-sheen-${material.id}`

  return (
    <div
      className={`d3-die d3-mat-${material.id} ${tumbling ? 'is-tumbling' : 'is-settled'} ${className}`}
      style={{ width: size, height: size, ...materialVars }}
    >
      <svg viewBox="0 0 100 100" className="d3-svg" aria-hidden>
        <defs>
          {/* The specular sheen. Fixed in screen space rather than per face, which is how a highlight on a real
              die behaves: the die turns under it and the bright spot stays where the light is. Its strength is the
              material's — glossy on plastic and gem, almost nothing on bone. */}
          <radialGradient id={sheenId} cx="34%" cy="26%" r="62%">
            <stop offset="0%" stopColor="#fff" stopOpacity={material.specular} />
            <stop offset="55%" stopColor="#fff" stopOpacity={material.specular * 0.15} />
            <stop offset="100%" stopColor="#fff" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Body first, so the facet light/shadow layers composite over the themed fill. */}
        <polygon className="d3-body" points={outline} />

        {faces.map((f) => (
          <polygon
            key={f.index}
            className="d3-facet"
            points={f.points}
            fill={f.shade >= 0 ? '#ffffff' : '#000000'}
            fillOpacity={Math.abs(f.shade)}
          />
        ))}

        {/* The outline last of the fills, so facet seams never cut across the die's edge. */}
        <polygon className="d3-edge" points={outline} />
        <polygon className="d3-sheen" points={outline} fill={`url(#${sheenId})`} />

        {/* EVERY visible face's numeral. Size follows the face's own projected area — which is where the d100's
            tiny digits come from with no special case — and opacity follows how square-on it is, so a numeral
            fades out as its face rolls away instead of squashing into the silhouette. */}
        {faces.map((f) =>
          f.facing < MIN_FACING_FOR_NUMERAL ? null : (
            <text
              key={`n${f.index}`}
              className={`d3-pip${f.index === landing ? ' is-landing' : ''}`}
              x={f.cx}
              y={f.cy}
              fontSize={Math.min(30, Math.max(2.6, Math.sqrt(f.area) * 0.46))}
              opacity={Math.min(1, (f.facing - MIN_FACING_FOR_NUMERAL) / 0.3)}
              textAnchor="middle"
              dominantBaseline="central"
            >
              {f.pip}
            </text>
          ),
        )}
      </svg>
    </div>
  )
}

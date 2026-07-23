'use client'
// DicePad — the manual dice roller on the roller modal (owner 2026-07-22).
//
// The 2014/2024 sheets' roller lets you roll raw dice (d4/d6/d8/d12/d20/d100) and set how many. This is that
// pad for the bespoke PF2/IG rollers, mounted in the roller NODE so it shows for EVERY template (Dice Core /
// Sigil / Board / Impact) — the chosen template just animates whatever the pad rolls. It publishes through
// the feed's `rollDice`, so the pool rolls and animates like any other roll. Token colours (var(--hx-*, …))
// so it reads on every skin; hides itself if the feed provides no `rollDice`.
import React from 'react'
import { useRollFeed } from './rollFeed'

const DICE = [4, 6, 8, 12, 20, 100] as const
const MAX_COUNT = 20

const LINE = 'var(--hx-line, var(--line, rgba(130,132,140,0.3)))'
const btn: React.CSSProperties = {
  fontSize: 12.5, fontWeight: 700, padding: '5px 9px', borderRadius: 7, cursor: 'pointer',
  border: `1px solid ${LINE}`, background: 'var(--hx-inset-strong, rgba(130,132,140,0.12))', color: 'inherit',
}

export default function DicePad() {
  const { rollDice } = useRollFeed()
  const [count, setCount] = React.useState(1)
  if (!rollDice) return null
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', justifyContent: 'center', paddingTop: 6, borderTop: `1px solid ${LINE}` }}>
      {/* How many dice */}
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        <button type="button" style={btn} onClick={() => setCount((c) => Math.max(1, c - 1))} aria-label="Fewer dice" disabled={count <= 1}>−</button>
        <strong style={{ minWidth: 30, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>{count}×</strong>
        <button type="button" style={btn} onClick={() => setCount((c) => Math.min(MAX_COUNT, c + 1))} aria-label="More dice" disabled={count >= MAX_COUNT}>+</button>
      </div>
      {/* The dice — click to roll `count` of that die */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'center' }}>
        {DICE.map((s) => (
          <button key={s} type="button" style={{ ...btn, minWidth: 42, color: 'var(--hx-gold-2, var(--gold, inherit))' }}
            onClick={() => rollDice(s, count)} title={`Roll ${count}d${s}`}>
            d{s}
          </button>
        ))}
      </div>
    </div>
  )
}

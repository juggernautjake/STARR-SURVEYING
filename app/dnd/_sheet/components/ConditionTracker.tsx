import { useState } from 'react'
import { useChar } from '../state/store'

// Concentration + conditions tracker (Phase L6 / K4 extra). Lives on every sheet; both
// persist in char.combat and autosave to the DB (C3) + sync in realtime (C11b).
const CONDITIONS = ['Blinded', 'Charmed', 'Deafened', 'Frightened', 'Grappled', 'Incapacitated', 'Invisible', 'Paralyzed', 'Petrified', 'Poisoned', 'Prone', 'Restrained', 'Stunned', 'Unconscious']

export default function ConditionTracker() {
  const { char, setChar } = useChar()
  const [adding, setAdding] = useState(false)
  const active = char.combat.conditions ?? []
  const conc = char.combat.concentration ?? ''

  const setConc = (v: string) => setChar((c) => ({ ...c, combat: { ...c.combat, concentration: v } }))
  const toggleCond = (name: string) =>
    setChar((c) => {
      const cur = c.combat.conditions ?? []
      return { ...c, combat: { ...c.combat, conditions: cur.includes(name) ? cur.filter((x) => x !== name) : [...cur, name] } }
    })

  const label: React.CSSProperties = { fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--muted, #9aa)' }
  const chip: React.CSSProperties = { fontSize: 12, padding: '3px 8px', border: '1px solid', cursor: 'pointer' }

  return (
    <section className="card" style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={label}>Concentration</span>
        {conc ? (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span style={{ color: 'var(--teal, #0ac8b9)' }}>🎯</span>
            <input
              value={conc}
              onChange={(e) => setConc(e.target.value)}
              style={{ width: 160, padding: '4px 8px', background: 'var(--panel-2)', border: '1px solid var(--line, rgba(255,255,255,0.15))', color: 'inherit', fontSize: 13 }}
            />
            <button className="btn tiny" onClick={() => setConc('')} title="Break concentration">✕</button>
          </span>
        ) : (
          <button className="btn tiny" onClick={() => setConc('a spell')}>+ Start concentrating</button>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
        <span style={label}>Conditions</span>
        {active.length === 0 && <span style={{ fontSize: 12, color: 'var(--muted, #9aa)' }}>none</span>}
        {active.map((c) => (
          <button key={c} onClick={() => toggleCond(c)} style={{ ...chip, borderColor: 'var(--danger, #ff6b6b)', color: 'var(--danger, #ff6b6b)', background: 'transparent' }} title="Remove">{c} ✕</button>
        ))}
        <button className="btn tiny" onClick={() => setAdding((a) => !a)}>+ Condition</button>
      </div>

      {adding && (
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 8 }}>
          {CONDITIONS.filter((c) => !active.includes(c)).map((c) => (
            <button key={c} onClick={() => { toggleCond(c); setAdding(false) }} style={{ ...chip, borderColor: 'var(--line, rgba(255,255,255,0.2))', color: 'inherit', background: 'var(--panel-2)' }}>{c}</button>
          ))}
        </div>
      )}
    </section>
  )
}

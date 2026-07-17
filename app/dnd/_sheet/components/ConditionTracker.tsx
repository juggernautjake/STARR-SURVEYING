import { useState } from 'react'
import { useChar } from '../state/store'
import { useSheetSystem } from '../state/sheetConfig'
import { RuleTip } from './RuleTip'
import { systemConditions } from '@/lib/dnd/system-rules'

// Concentration + conditions tracker (Phase L6 / K4 extra). Lives on every sheet; both
// persist in char.combat and autosave to the DB (C3) + sync in realtime (C11b).
//
// The condition list comes from the CHARACTER'S SYSTEM. It used to be this hardcoded 5e list for
// everyone — which offered "Paralyzed" to a Call of Cthulhu investigator and hid Pathfinder 2e's
// numeric conditions (Frightened 2, Clumsy 1) from a Pathfinder character. The list below is the
// fallback for a character with NO system, where a generic set is the honest option.
const GENERIC_CONDITIONS = ['Blinded', 'Charmed', 'Deafened', 'Frightened', 'Grappled', 'Incapacitated', 'Invisible', 'Paralyzed', 'Petrified', 'Poisoned', 'Prone', 'Restrained', 'Stunned', 'Unconscious']

export default function ConditionTracker() {
  const { char, setChar, rollConcentrationSave } = useChar()
  const system = useSheetSystem()
  const [adding, setAdding] = useState(false)
  // A concentration save is a Constitution save (DC 10, or ½ the damage taken) — a D&D 5e mechanic.
  // The concentration TRACKER is system-agnostic, but the ROLL is 5e-only, so we don't offer it to a
  // Pathfinder/CoC/IG character whose concentration works differently (no cross-system rule leak).
  const is5e = system === 'dnd5e-2024' || system === 'dnd5e-2014'
  const fromSystem = systemConditions(system)
  const CONDITIONS = fromSystem.length ? fromSystem : GENERIC_CONDITIONS
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
            {is5e && (
              <button className="btn tiny" onClick={() => rollConcentrationSave()} title="Roll a Constitution saving throw to maintain concentration (DC 10, or half the damage taken)">🎲 Save</button>
            )}
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
          <span key={c} style={{ ...chip, borderColor: 'var(--danger)', color: 'var(--danger)', background: 'transparent', display: 'inline-flex', gap: 6, alignItems: 'center', cursor: 'auto' }}>
            <RuleTip term={c} />
            <button onClick={() => toggleCond(c)} title={`Remove ${c}`} aria-label={`Remove ${c}`} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: 0, font: 'inherit' }}>✕</button>
          </span>
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

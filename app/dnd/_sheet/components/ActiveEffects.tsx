'use client'
// ActiveEffects — the Active-Effects tracker (DND_ITEM_BUILDER, Slice 6). Shows every effect
// currently applied to the character: temporary effects from consumed buffs / DM boons
// (removable by the player or DM), plus passive effects from equipped/attuned items (shown
// with their source; removed by unequipping the item). Theme-token styled → reads on all skins.
import { useChar } from '../state/store'
import type { Effect } from '../engine/effects'

function fmtEffect(e: Effect): string {
  const t = e.target.replace(/_/g, ' ')
  if (e.operation === 'add' && typeof e.value === 'number') return `${t} ${e.value >= 0 ? '+' : ''}${e.value}`
  if (e.operation === 'set' || e.operation === 'set_base') return `${t} = ${e.value}`
  return `${t}: ${e.operation}${e.value != null ? ` ${e.value}` : ''}`
}

export default function ActiveEffects() {
  const { char, removeActiveEffect } = useChar()
  const active = char.activeEffects ?? []
  const equippedWithEffects = (char.inventory ?? []).filter((i) => (i.equipped || i.attuned) && (i.effects?.length ?? 0) > 0)

  if (active.length === 0 && equippedWithEffects.length === 0) return null

  return (
    <div className="card" style={{ display: 'grid', gap: 8 }}>
      <div style={{ fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--tealbright)', fontWeight: 800 }}>
        ✦ Active Effects
      </div>

      {active.map((ae) => (
        <div key={ae.id} className="flex" style={{ gap: 8, alignItems: 'flex-start', justifyContent: 'space-between', background: 'var(--panel-2)', border: '1px solid var(--line)', borderRadius: 10, padding: '7px 10px' }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 700, color: 'var(--ink)' }}>
              {ae.label}
              {ae.duration && <span style={{ fontSize: 11, color: 'var(--muted)', marginLeft: 6 }}>· {ae.duration}</span>}
            </div>
            <div style={{ fontSize: 12, color: 'var(--hotpink)' }}>{ae.effects.map(fmtEffect).join(' · ') || 'no mechanical effect'}</div>
            {ae.source && <div style={{ fontSize: 11, color: 'var(--muted)' }}>from {ae.source}</div>}
          </div>
          <button className="btn tiny danger" title="Remove this effect" onClick={() => removeActiveEffect(ae.id)}>✕</button>
        </div>
      ))}

      {equippedWithEffects.map((it) => (
        <div key={it.id} className="flex" style={{ gap: 8, alignItems: 'center', justifyContent: 'space-between', border: '1px dashed var(--line)', borderRadius: 10, padding: '6px 10px' }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 700, color: 'var(--ink)' }}>{it.name} <span style={{ fontSize: 11, color: 'var(--muted)' }}>({it.attuned ? 'attuned' : 'equipped'})</span></div>
            <div style={{ fontSize: 12, color: 'var(--tealbright)' }}>{(it.effects ?? []).map(fmtEffect).join(' · ')}</div>
          </div>
          <span style={{ fontSize: 11, color: 'var(--muted)', whiteSpace: 'nowrap' }}>unequip to remove</span>
        </div>
      ))}
    </div>
  )
}

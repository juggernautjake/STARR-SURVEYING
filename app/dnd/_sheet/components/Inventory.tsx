import { useState } from 'react'
import { useChar } from '../state/store'
import type { InvItem } from '../types'
import SectionHead from './ui/SectionHead'
import NeoNuggetsBalance from './NeoNuggetsBalance'

function labels() {
  // "Notes" is the campaign's base currency (≈ $1 each) — the streamer converts her
  // earned NeoNuggets into these. Stored on the `credits` key for back-compat.
  return { credits: 'Notes', harmonyte: 'Harmonyte', scrip: 'Scrip' }
}

export default function Inventory() {
  const { char, setChar, editMode, rollExpr, adjustHp } = useChar()
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState<Partial<InvItem>>({ name: '', desc: '', qty: 1 })

  const curLabels = labels()

  function setQty(id: string, delta: number) {
    setChar((c) => ({
      ...c,
      inventory: c.inventory.map((it) => (it.id === id ? { ...it, qty: Math.max(0, it.qty + delta) } : it)),
    }))
  }
  function remove(id: string) {
    setChar((c) => ({ ...c, inventory: c.inventory.filter((it) => it.id !== id) }))
  }
  function setCurrency(k: keyof typeof curLabels, v: number) {
    setChar((c) => ({ ...c, currency: { ...c.currency, [k]: Math.max(0, v) } }))
  }
  function add() {
    if (!draft.name) return
    const item: InvItem = {
      id: `i-${Date.now()}`,
      name: draft.name!,
      desc: draft.desc ?? '',
      qty: draft.qty ?? 1,
      tags: ['tech'],
    }
    setChar((c) => ({ ...c, inventory: [...c.inventory, item] }))
    setDraft({ name: '', desc: '', qty: 1 })
    setAdding(false)
  }

  function useItem(it: InvItem) {
    if (!it.use) return
    if (it.use.kind === 'heal') {
      // roll and apply to HP
      const roll = evalAndHeal(it.use.expr, adjustHp)
      rollExpr(`${it.name} — ${it.use.label}`, `${roll.total}`, 'heal')
    } else if (it.use.kind === 'temp') {
      const total = rollExprValue(it.use.expr)
      setChar((c) => ({ ...c, combat: { ...c.combat, tempHp: Math.max(c.combat.tempHp, total) } }))
      rollExpr(`${it.name} — ${it.use.label} (temp HP)`, `${total}`, 'temp')
    } else {
      rollExpr(`${it.name} — ${it.use.label}`, it.use.expr, 'damage')
    }
    if (it.qty > 0) setQty(it.id, -1)
  }

  return (
    <section id="inventory">
      <SectionHead num="12" title="Inventory & Gear" />
      <p className="lead">A smooth boi’s kit — engineered biology first, salvaged space-tech second. Consumables roll their effect when used.</p>

      <div className="currency-grid">
        {(Object.keys(curLabels) as (keyof typeof curLabels)[]).map((k) => (
          <div className="cur" key={k}>
            <div className="cl">{curLabels[k]}</div>
            {editMode ? (
              <input
                className="mono"
                type="number"
                value={char.currency[k]}
                onChange={(e) => setCurrency(k, Number(e.target.value) || 0)}
                style={{ width: '100%', textAlign: 'center' }}
              />
            ) : (
              <div className="cv">{char.currency[k]}</div>
            )}
          </div>
        ))}
        {/* Every character can see their NeoNuggets (stream super-chat currency). */}
        <NeoNuggetsBalance />
      </div>

      <div className="card">
        {char.inventory.map((it) => (
          <div className="inv-row" key={it.id}>
            <div className="flex" style={{ gap: 6, flexWrap: 'wrap', maxWidth: 90 }}>
              {it.tags.slice(0, 2).map((t) => (
                <span key={t} className={`tag ${t}`}>
                  {t}
                </span>
              ))}
            </div>
            <div>
              <div className="inv-name">{it.name}</div>
              <div className="inv-desc">{it.desc}</div>
              {it.use && (
                // eslint-disable-next-line react-hooks/rules-of-hooks -- useItem is a store action, not a hook
                <button className="btn tiny gold" style={{ marginTop: 6 }} onClick={() => useItem(it)} disabled={it.qty <= 0}>
                  ⚡ {it.use.label} ({it.use.expr})
                </button>
              )}
            </div>
            {editMode ? (
              <div className="flex center gap">
                <button className="step" onClick={() => setQty(it.id, -1)}>−</button>
                <span className="inv-qty">×{it.qty}</span>
                <button className="step" onClick={() => setQty(it.id, 1)}>+</button>
              </div>
            ) : (
              <span className="inv-qty">×{it.qty}</span>
            )}
            {editMode ? (
              <button className="btn tiny danger" onClick={() => remove(it.id)}>
                ✕
              </button>
            ) : (
              <span />
            )}
          </div>
        ))}

        {editMode && !adding && (
          <button className="btn tiny teal" style={{ marginTop: 12 }} onClick={() => setAdding(true)}>
            + Add item
          </button>
        )}
        {editMode && adding && (
          <div className="mt" style={{ display: 'grid', gap: 8 }}>
            <input placeholder="Item name" value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} />
            <input placeholder="Description" value={draft.desc} onChange={(e) => setDraft((d) => ({ ...d, desc: e.target.value }))} />
            <div className="btn-row">
              <input type="number" placeholder="Qty" value={draft.qty} onChange={(e) => setDraft((d) => ({ ...d, qty: Number(e.target.value) || 1 }))} style={{ width: 80 }} />
              <button className="btn tiny teal" onClick={add}>Save</button>
              <button className="btn tiny" onClick={() => setAdding(false)}>Cancel</button>
            </div>
          </div>
        )}
      </div>
    </section>
  )
}

// Evaluate a dice expression to a number (visual heal amount) and apply healing.
function evalAndHeal(expr: string, adjustHp: (d: number) => void) {
  const total = rollExprValue(expr)
  adjustHp(total)
  return { total }
}
function rollExprValue(expr: string): number {
  const cleaned = expr.replace(/\s+/g, '').replace(/−/g, '-')
  const re = /([+-]?)(\d*)d(\d+)|([+-]?)(\d+)/gi
  let total = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(cleaned)) !== null) {
    if (m[3]) {
      const sign = m[1] === '-' ? -1 : 1
      const count = m[2] === '' ? 1 : parseInt(m[2], 10)
      const sides = parseInt(m[3], 10)
      for (let i = 0; i < count; i++) total += sign * (Math.floor(Math.random() * sides) + 1)
    } else if (m[5]) {
      const sign = m[4] === '-' ? -1 : 1
      total += sign * parseInt(m[5], 10)
    }
  }
  return total
}

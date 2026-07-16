import { useState } from 'react'
import { useChar } from '../state/store'
import type { InvItem } from '../types'
import SectionHead from './ui/SectionHead'
import NeoNuggetsBalance from './NeoNuggetsBalance'
import ItemBuilder from './ItemBuilder'
import ElementMenu from './ui/ElementMenu'
import { tagInfo } from './ui/tagInfo'

function labels() {
  // "Notes" is the campaign's base currency (≈ $1 each) — the streamer converts her
  // earned NeoNuggets into these. Stored on the `credits` key for back-compat.
  return { credits: 'Notes', harmonyte: 'Harmonyte', scrip: 'Scrip' }
}

/** Compact "2d8 slashing + 1d6 poison" summary for a weapon item's Roll button. */
function weaponDamageSummary(it: InvItem): string {
  const w = it.weapon
  if (!w) return ''
  const parts = [`${w.damage.dice} ${w.damage.type}`.trim(), ...(w.bonus ?? []).filter((b) => b?.dice?.trim()).map((b) => `${b.dice} ${b.type}`.trim())]
  return parts.join(' + ')
}

export default function Inventory() {
  const { char, setChar, characterId, editMode, rollExpr, adjustHp, rollWeaponDamage, addActiveEffect, canWrite } = useChar()
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  const curLabels = labels()

  // Add a new item or replace an existing one (by id) — the ItemBuilder emits a full InvItem.
  function upsert(item: InvItem) {
    setChar((c) => {
      const exists = c.inventory.some((x) => x.id === item.id)
      return { ...c, inventory: exists ? c.inventory.map((x) => (x.id === item.id ? item : x)) : [...c.inventory, item] }
    })
    setAdding(false)
    setEditingId(null)
  }

  function setQty(id: string, delta: number) {
    setChar((c) => ({
      ...c,
      inventory: c.inventory.map((it) => (it.id === id ? { ...it, qty: Math.max(0, it.qty + delta) } : it)),
    }))
  }
  function duplicate(it: InvItem) {
    setChar((c) => ({
      ...c,
      inventory: [...c.inventory, { ...it, id: `${it.id}-copy-${c.inventory.length}`, name: `${it.name} (copy)` }],
    }))
  }
  function confirmRemove(it: InvItem) {
    // Deleting is the one menu action with no undo, so it asks. The rest are cheap to reverse.
    if (!confirm(`Delete “${it.name}”? This cannot be undone.`)) return
    remove(it.id)
  }
  function remove(id: string) {
    setChar((c) => ({ ...c, inventory: c.inventory.filter((it) => it.id !== id) }))
  }
  function setCurrency(k: keyof typeof curLabels, v: number) {
    setChar((c) => ({ ...c, currency: { ...c.currency, [k]: Math.max(0, v) } }))
  }
  // Legacy `use` field (kept working for existing data).
  function applyUse(it: InvItem) {
    if (!it.use) return
    if (it.use.kind === 'heal') {
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

  // New consumable model — actually applies the effect on consume, then decrements qty.
  function consume(it: InvItem) {
    const eff = it.consumable?.effect
    if (!eff) return
    if (eff.kind === 'heal' && eff.dice) {
      const total = rollExprValue(eff.dice)
      adjustHp(total)
      rollExpr(`${it.name} — heal`, `${total}`, 'heal')
    } else if (eff.kind === 'temp' && eff.dice) {
      const total = rollExprValue(eff.dice)
      setChar((c) => ({ ...c, combat: { ...c.combat, tempHp: Math.max(c.combat.tempHp, total) } }))
      rollExpr(`${it.name} — temp HP`, `${total}`, 'temp')
    } else if (eff.kind === 'status' && eff.status) {
      // A timed condition (e.g. Invisible · 1 hour) — tracked in Active Effects, removable.
      addActiveEffect({ id: `ae-${Date.now()}-${Math.floor(Math.random() * 1e6)}`, label: eff.status, effects: [], duration: eff.duration, source: it.name })
    } else if (eff.kind === 'buff') {
      addActiveEffect({ id: `ae-${Date.now()}-${Math.floor(Math.random() * 1e6)}`, label: it.name, effects: eff.effects ?? [], duration: eff.duration, source: it.name })
    }
    // 'custom' = note-only (DM adjudicates); still consumes.
    if (it.qty > 0) setQty(it.id, -1)
  }

  function consumeLabel(it: InvItem): string {
    const eff = it.consumable?.effect
    if (!eff) return 'Use'
    if (eff.kind === 'heal') return `Heal ${eff.dice ?? ''}`.trim()
    if (eff.kind === 'temp') return `Temp HP ${eff.dice ?? ''}`.trim()
    if (eff.kind === 'status') return `Apply ${eff.status ?? 'effect'}`
    if (eff.kind === 'buff') return 'Apply buff'
    return 'Use'
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
              {it.tags.slice(0, 2).map((t) => {
                // These tags are terse and several are load-bearing — `weapon` is what puts a thing
                // in the Attacks table, `consumable` is what makes it usable-and-gone — but nothing
                // ever said so: "at the moment I don't know what FLAVOR means".
                const info = tagInfo(t)
                return (
                  <span key={t} className={`tag ${t} ${info ? 'tag-info' : ''}`} title={info ?? undefined}>
                    {t}
                  </span>
                )
              })}
            </div>
            <div>
              <div className="inv-name">
                {it.name}
                {canWrite && (
                  <ElementMenu
                    label={it.name}
                    actions={[
                      { label: 'Edit item', onClick: () => setEditingId(it.id) },
                      { label: 'Duplicate', onClick: () => duplicate(it) },
                      { label: 'Delete', danger: true, onClick: () => confirmRemove(it) },
                    ]}
                  />
                )}
              </div>
              <div className="inv-desc">{it.desc}</div>
              {it.weapon && (
                <div className="flex" style={{ gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                  <button className="btn tiny solid" onClick={() => rollWeaponDamage(it)} title="Roll this weapon's damage (typed breakdown in the log)">
                    🎲 Roll {weaponDamageSummary(it)}
                  </button>
                  <button className="btn tiny" onClick={() => rollWeaponDamage(it, { crit: true })} title="Roll damage as a critical hit (double the dice)">
                    ✷ Crit
                  </button>
                </div>
              )}
              {it.use && (
                <button className="btn tiny gold" style={{ marginTop: 6 }} onClick={() => applyUse(it)} disabled={it.qty <= 0}>
                  ⚡ {it.use.label} ({it.use.expr})
                </button>
              )}
              {it.consumable && (
                <button className="btn tiny gold" style={{ marginTop: 6 }} onClick={() => consume(it)} disabled={it.qty <= 0} title="Consume this item and apply its effect">
                  ⚗ {consumeLabel(it)}{it.consumable.effect.duration ? ` · ${it.consumable.effect.duration}` : ''}
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
              <div className="flex center gap">
                <button className="btn tiny" title="Edit this item" onClick={() => { setEditingId(it.id); setAdding(false) }}>✎</button>
                <button className="btn tiny danger" onClick={() => remove(it.id)}>✕</button>
              </div>
            ) : (
              <span />
            )}
          </div>
        ))}

        {editingId && (
          <ItemBuilder
            characterId={characterId ?? undefined}
            initial={char.inventory.find((x) => x.id === editingId)}
            onSave={upsert}
            onCancel={() => setEditingId(null)}
          />
        )}
        {editMode && adding && !editingId && (
          <ItemBuilder characterId={characterId ?? undefined} onSave={upsert} onCancel={() => setAdding(false)} />
        )}
        {editMode && !adding && !editingId && (
          <button className="btn tiny teal" style={{ marginTop: 12 }} onClick={() => { setAdding(true); setEditingId(null) }}>
            + Build an item
          </button>
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

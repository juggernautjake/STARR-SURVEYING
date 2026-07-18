import { useState } from 'react'
import { useChar } from '../state/store'
import type { InvItem } from '../types'
import SectionHead from './ui/SectionHead'
import NeoNuggetsBalance from './NeoNuggetsBalance'
import ItemBuilder from './ItemBuilder'
import ElementMenu from './ui/ElementMenu'
import EditMark from './ui/EditMark'
import { tagInfo } from './ui/tagInfo'
import { totalInBase, baseCurrency, totalIn, conversionTable, fmtAmount, type Currency } from '@/lib/dnd/currency'
import { carryingCapacity, encumbranceLevel } from '../engine/equipment'
import { planConsume } from '@/lib/dnd/effects/consume'
import { equipConflicts, resolveEquipSwap } from '@/lib/dnd/equip-conflicts'
import EquipConflictDialog, { type EquipConflictState } from './EquipConflictDialog'

// Kind icons for the no-art fallback token (Slice 28), matching the ItemBuilder kind labels so an
// item without uploaded art still reads as intentional rather than a hole.
const KIND_ICON: Record<string, string> = {
  weapon: '⚔', armor: '🛡', shield: '🔰', consumable: '⚗', wondrous: '✨', gear: '🎒',
}

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
  const { char, setChar, characterId, editMode, rollExpr, adjustHp, rollWeaponDamage, addActiveEffect, canWrite, ledger, preferences } = useChar()
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  // Equip-conflict popup (Area E1c) — set when a save would equip an item that conflicts with what's worn.
  const [equipConflict, setEquipConflict] = useState<EquipConflictState | null>(null)

  const curLabels = labels()

  // Add a new item or replace an existing one (by id) — the ItemBuilder emits a full InvItem. When the save
  // would EQUIP an item and the campaign enforces equip limits, check for a slot conflict first: if one
  // exists, commit the item UNEQUIPPED and raise the conflict dialog so the player resolves it deliberately
  // (swap / cancel). With equipLimits off, equipping is unrestricted.
  function upsert(item: InvItem) {
    setChar((c) => {
      const exists = c.inventory.some((x) => x.id === item.id)
      const enforce = preferences.equipLimits.value === 'enforced'
      if (enforce && item.equipped) {
        const nextInv = exists ? c.inventory.map((x) => (x.id === item.id ? item : x)) : [...c.inventory, item]
        const conflicts = equipConflicts(nextInv, item.id)
        if (conflicts.length) {
          // Save it unequipped for now; the dialog will equip-with-swap (or leave it off on cancel).
          setEquipConflict({ target: item, conflicts })
          const stored = { ...item, equipped: false }
          return { ...c, inventory: exists ? c.inventory.map((x) => (x.id === item.id ? stored : x)) : [...c.inventory, stored] }
        }
      }
      return { ...c, inventory: exists ? c.inventory.map((x) => (x.id === item.id ? item : x)) : [...c.inventory, item] }
    })
    setAdding(false)
    setEditingId(null)
  }

  // Resolve the equip conflict: unequip the chosen item(s), then equip the target.
  function resolveEquip(unequipIds: string[]) {
    const targetId = equipConflict?.target.id
    if (targetId) setChar((c) => ({ ...c, inventory: resolveEquipSwap(c.inventory, targetId, unequipIds) }))
    setEquipConflict(null)
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

  // ── flexible money model (lib/dnd/currency) — used when the sheet has a `currencies` list ──
  function patchCurrency(id: string, patch: Partial<Currency>) {
    setChar((c) => ({ ...c, currencies: (c.currencies ?? []).map((cur) => (cur.id === id ? { ...cur, ...patch } : cur)) }))
  }
  function addCurrency() {
    setChar((c) => {
      const list = c.currencies ?? []
      const id = `cur-${Date.now().toString(36)}-${list.length}`
      return { ...c, currencies: [...list, { id, name: 'New Currency', abbrev: '', amount: 0, rate: 1 }] }
    })
  }
  function removeCurrency(id: string) {
    setChar((c) => ({ ...c, currencies: (c.currencies ?? []).filter((cur) => cur.id !== id) }))
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

  // New consumable model — the DECISION of what a consumable does is the pure `planConsume`; this
  // just executes it (roll + apply the instant, snapshot the lasting effect, decrement qty).
  function consume(it: InvItem) {
    const plan = planConsume(it)
    if (plan.instant?.kind === 'heal') {
      const total = rollExprValue(plan.instant.dice)
      adjustHp(total)
      rollExpr(`${it.name} — heal`, `${total}`, 'heal')
    } else if (plan.instant?.kind === 'temp') {
      const total = rollExprValue(plan.instant.dice)
      setChar((c) => ({ ...c, combat: { ...c.combat, tempHp: Math.max(c.combat.tempHp, total) } }))
      rollExpr(`${it.name} — temp HP`, `${total}`, 'temp')
    }
    if (plan.activeEffect) {
      // A lasting effect (timed condition or buff) — snapshotted into Active Effects so it outlives
      // the consumed item and stays visible + removable next session.
      addActiveEffect({ id: `ae-${Date.now()}-${Math.floor(Math.random() * 1e6)}`, ...plan.activeEffect })
    }
    if (plan.consumes) setQty(it.id, -1)
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
      <SectionHead num="12" title="Inventory & Gear" optionsTip="Auto-attune and equipment-limit preferences govern when items apply" />
      <p className="lead">A smooth boi’s kit — engineered biology first, salvaged space-tech second. Consumables roll their effect when used.</p>

      {(() => {
        // Carrying capacity is STR×15 scaled by size (Slice 11). Read the ledger-effective STR + size so a
        // Belt of Giant Strength or a size-changing effect updates the capacity live.
        const effStr = Math.round(ledger.value('ability_str', char.abilities.str))
        const size = ledger.identity('size')?.value ?? 'Medium'
        const carried = char.inventory.reduce((s, it) => s + (it.weight ?? 0) * Math.max(0, it.qty), 0)
        // Fold a dedicated `carrying_capacity` effect on top of the STR×15×size base (STR items + size
        // already flow through effStr/size). No-op without one — makes that registered target actually work.
        const cap = carryingCapacity(effStr, size) + ledger.value('carrying_capacity', 0)
        const enc = encumbranceLevel(carried, effStr, size)
        const tone = enc === 'over' ? 'var(--danger)' : enc === 'heavily' ? 'var(--gold)' : enc === 'encumbered' ? 'var(--gold)' : 'var(--muted)'
        return (
          <div className="mono" style={{ fontSize: 12.5, color: 'var(--muted)', margin: '2px 0 10px' }}>
            Carrying <strong style={{ color: 'var(--ink)' }}>{carried}</strong> / {cap} lb
            <span style={{ color: 'var(--muted)' }}> · capacity STR {effStr}×15{size && size !== 'Medium' ? ` (${size})` : ''}</span>
            {enc !== 'none' && <span style={{ color: tone }}> · {enc === 'over' ? 'over capacity' : enc}</span>}
          </div>
        )
      })()}

      {Array.isArray(char.currencies) ? (
        <CurrencyPanel
          currencies={char.currencies}
          editMode={editMode}
          onAmount={(id, v) => patchCurrency(id, { amount: Math.max(0, v) })}
          onField={patchCurrency}
          onAdd={addCurrency}
          onRemove={removeCurrency}
        />
      ) : (
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
      )}

      <div className="card">
        {char.inventory.map((it) => (
          <div className="inv-row" key={it.id}>
            <div className="flex" style={{ gap: 6, flexWrap: 'wrap', maxWidth: 90 }}>
              {it.tags.slice(0, 2).map((t) => {
                // These tags are terse and several are load-bearing — `weapon` is what puts a thing
                // in the Attacks table, `consumable` is what makes it usable-and-gone — but nothing
                // ever said so: "at the moment I don't know what FLAVOR means". Pass the character's
                // own tags too (Slice 32), so a homebrew tag gets its tooltip in the Gear list exactly
                // as it does in the editor — not just the five built-ins.
                const info = tagInfo(t, char.customTags)
                return (
                  <span key={t} className={`tag ${t} ${info ? 'tag-info' : ''}`} title={info ?? undefined}>
                    {t}
                  </span>
                )
              })}
            </div>
            <div>
              <div className="inv-name">
                {/* An item's uploaded art (ItemBuilder already stores `image`) — the Gear list never
                    showed it (Slice 28). A thumbnail here; when there's no art, a kind icon so the row
                    reads as intentional rather than showing a hole. */}
                {it.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={it.image} alt="" className="inv-thumb" />
                ) : (
                  <span className="inv-thumb inv-thumb-icon" aria-hidden>{KIND_ICON[it.kind ?? 'gear'] ?? KIND_ICON.gear}</span>
                )}
                {it.name}
                <EditMark on={it.customized} />
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
      {equipConflict && (
        <EquipConflictDialog
          state={equipConflict}
          inventory={char.inventory}
          onResolve={resolveEquip}
          onCancel={() => setEquipConflict(null)}
        />
      )}
    </section>
  )
}

/** The flexible money panel: amounts (editable), total wealth in the base currency, and the conversion
 *  table so the player can always read "1 gp = 10 sp". In edit mode, currencies can be renamed, re-rated,
 *  added, or removed — custom currencies (Guild Marks, Dragon Shards) live right alongside the coins. */
function CurrencyPanel({
  currencies, editMode, onAmount, onField, onAdd, onRemove,
}: {
  currencies: Currency[]
  editMode: boolean
  onAmount: (id: string, v: number) => void
  onField: (id: string, patch: Partial<Currency>) => void
  onAdd: () => void
  onRemove: (id: string) => void
}) {
  const [showRates, setShowRates] = useState(false)
  const base = baseCurrency(currencies)
  const total = totalInBase(currencies)
  const cell: React.CSSProperties = { fontSize: 12, padding: '3px 6px', background: 'var(--panel-2, rgba(1,10,19,0.4))', border: '1px solid var(--line)', color: 'var(--text)', borderRadius: 5 }

  return (
    <div className="currency-panel" style={{ display: 'grid', gap: 8, margin: '6px 0 14px' }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'stretch' }}>
        {currencies.map((c) => (
          <div className="cur" key={c.id} style={{ display: 'grid', gap: 2, textAlign: 'center', minWidth: 70 }}>
            <div className="cl" title={editMode ? undefined : `1 ${c.name} = ${fmtAmount(c.rate)} ${base?.abbrev ?? base?.name ?? 'base'}`}>
              {editMode ? (
                <input value={c.name} onChange={(e) => onField(c.id, { name: e.target.value })} style={{ ...cell, width: '100%', textAlign: 'center', fontSize: 11 }} title="Currency name" />
              ) : (c.abbrev || c.name)}
            </div>
            {editMode ? (
              <input className="mono" type="number" value={c.amount} onChange={(e) => onAmount(c.id, Number(e.target.value) || 0)} style={{ ...cell, width: '100%', textAlign: 'center' }} />
            ) : (
              <div className="cv">{fmtAmount(c.amount)}</div>
            )}
            {editMode && (
              <>
                <input type="number" value={c.rate} min={0} onChange={(e) => onField(c.id, { rate: Math.max(0, Number(e.target.value) || 0) })} title="Value of one unit in base units (base = 1)" style={{ ...cell, width: '100%', textAlign: 'center', fontSize: 10.5 }} />
                <button type="button" onClick={() => onRemove(c.id)} title="Remove this currency" style={{ fontSize: 10, cursor: 'pointer', color: 'var(--danger, #c6403b)', background: 'transparent', border: '1px solid var(--line)', borderRadius: 4 }}>✕</button>
              </>
            )}
          </div>
        ))}
        {editMode && (
          <button type="button" onClick={onAdd} title="Add a custom currency" style={{ ...cell, cursor: 'pointer', minWidth: 44, fontSize: 18 }}>＋</button>
        )}
      </div>

      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', fontSize: 12, color: 'var(--muted)' }}>
        <span>Total wealth: <strong style={{ color: 'var(--gold, var(--text))' }}>{fmtAmount(total)} {base?.abbrev ?? base?.name ?? ''}</strong>
          {base && currencies.length > 1 && <> · {fmtAmount(totalIn(currencies, currencies[currencies.length - 1]))} {currencies[currencies.length - 1].abbrev ?? currencies[currencies.length - 1].name}</>}
        </span>
        {currencies.length > 1 && (
          <button type="button" onClick={() => setShowRates((s) => !s)} style={{ fontSize: 11.5, cursor: 'pointer', color: 'var(--tealbright, var(--text))', background: 'transparent', border: '1px solid var(--line)', borderRadius: 12, padding: '2px 10px' }}>
            {showRates ? 'Hide' : 'Show'} conversion rates
          </button>
        )}
      </div>

      {showRates && currencies.length > 1 && (
        <div style={{ display: 'grid', gap: 3, fontSize: 11.5, color: 'var(--muted)' }}>
          {conversionTable(currencies).map((row) => (
            <div key={row.from.id}>
              <strong style={{ color: 'var(--text)' }}>1 {row.from.abbrev ?? row.from.name}</strong>
              {' = '}
              {row.rates.map((r, i) => (
                <span key={r.to.id}>{i > 0 ? ' · ' : ''}{fmtAmount(r.rate)} {r.to.abbrev ?? r.to.name}</span>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
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

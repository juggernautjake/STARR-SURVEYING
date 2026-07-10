'use client'
// ItemBuilder — the homebrew item/equipment builder (DND_ITEM_BUILDER, Slice 4). Create or
// edit any inventory item: pick a kind, fill title/description/qty, add kind-specific stats
// (weapon damage + typed bonus dice, armor/shield AC, consumable effects, passive effects),
// and upload a per-item picture. Emits a full InvItem via onSave. Uses shared sheet classes
// + theme tokens so it reads on every skin (no hard-coded light/dark colors).
import { useRef, useState } from 'react'
import type { InvItem, ItemKind, WeaponStats, ArmorStats, ConsumableStats, TypedDamage } from '../types'
import type { Effect, EffectOperation } from '../engine/effects'
import type { AbilityKey } from '../rules/dnd'

const KINDS: { id: ItemKind; label: string }[] = [
  { id: 'weapon', label: '⚔ Weapon' },
  { id: 'armor', label: '🛡 Armor' },
  { id: 'shield', label: '🔰 Shield' },
  { id: 'consumable', label: '⚗ Consumable' },
  { id: 'wondrous', label: '✨ Wondrous / Magic' },
  { id: 'gear', label: '🎒 Gear' },
]
const ABILITIES: AbilityKey[] = ['str', 'dex', 'con', 'int', 'wis', 'cha']
const OPS: EffectOperation[] = ['add', 'set', 'set_base', 'advantage', 'disadvantage', 'resistance', 'immunity', 'vulnerability', 'grant_proficiency']
const uid = () => `i-${Date.now()}-${Math.floor(Math.random() * 1e6)}`

const fieldStyle: React.CSSProperties = { width: '100%', padding: '6px 9px', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--panel-2)', color: 'var(--ink)', fontSize: 13 }
const lab: React.CSSProperties = { fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 700, display: 'block', marginBottom: 3 }

export default function ItemBuilder({
  characterId, initial, onSave, onCancel,
}: {
  characterId?: string
  initial?: InvItem
  onSave: (item: InvItem) => void
  onCancel: () => void
}) {
  const [it, setIt] = useState<InvItem>(() => initial ?? { id: uid(), name: '', desc: '', qty: 1, tags: [], kind: 'gear' })
  const [uploading, setUploading] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const patch = (p: Partial<InvItem>) => setIt((v) => ({ ...v, ...p }))
  const patchWeapon = (p: Partial<WeaponStats>) => setIt((v) => ({ ...v, weapon: { damage: { dice: '1d6', type: 'slashing' }, ...v.weapon, ...p } }))
  const patchArmor = (p: Partial<ArmorStats>) => setIt((v) => ({ ...v, armor: { category: v.kind === 'shield' ? 'shield' : 'light', ...v.armor, ...p } }))
  const patchConsumable = (p: Partial<ConsumableStats['effect']>) => setIt((v) => ({ ...v, consumable: { effect: { kind: 'heal', ...v.consumable?.effect, ...p } } }))

  async function uploadImage(file: File) {
    if (!characterId) { setErr('Save the item first, then re-open to add a picture.'); return }
    setUploading(true); setErr(null)
    try {
      const fd = new FormData(); fd.append('kind', 'item'); fd.append('file', file)
      const r = await fetch(`/api/dnd/characters/${characterId}/media`, { method: 'POST', body: fd })
      const j = await r.json().catch(() => ({}))
      if (r.ok && j.url) patch({ image: j.url }); else setErr(j.error ?? 'Upload failed.')
    } catch { setErr('Upload failed.') } finally { setUploading(false) }
  }

  function save() {
    if (!it.name.trim()) { setErr('Give the item a name.'); return }
    const kind = it.kind ?? 'gear'
    // Keep tags in sync with kind so the existing tag chips + weapon-roll gating still work.
    const tags = [...new Set([
      ...it.tags.filter((t) => t !== 'weapon' && t !== 'consumable'),
      ...(kind === 'weapon' ? (['weapon'] as const) : []),
      ...(kind === 'consumable' ? (['consumable'] as const) : []),
    ])] as InvItem['tags']
    const clean: InvItem = { ...it, name: it.name.trim(), qty: Math.max(0, it.qty || 1), kind, tags }
    // Drop the sub-blocks that don't match the chosen kind.
    if (kind !== 'weapon') delete clean.weapon
    if (kind !== 'armor' && kind !== 'shield') delete clean.armor
    if (kind !== 'consumable') delete clean.consumable
    onSave(clean)
  }

  const kind = it.kind ?? 'gear'
  const w = it.weapon
  const bonus = w?.bonus ?? []

  return (
    <div className="card" style={{ marginTop: 12, display: 'grid', gap: 10, borderColor: 'var(--line-strong)' }}>
      <div style={{ fontSize: 12, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--tealbright)', fontWeight: 800 }}>
        {initial ? '✎ Edit item' : '＋ New item'}
      </div>

      {/* Kind picker */}
      <div className="flex" style={{ gap: 6, flexWrap: 'wrap' }}>
        {KINDS.map((k) => (
          <button key={k.id} type="button" className={`btn tiny ${kind === k.id ? 'active' : ''}`}
            onClick={() => patch({ kind: k.id, armor: (k.id === 'armor' || k.id === 'shield') ? { category: k.id === 'shield' ? 'shield' : 'light', ...it.armor } : it.armor })}>
            {k.label}
          </button>
        ))}
      </div>

      {/* Common fields */}
      <div>
        <label style={lab}>Name</label>
        <input style={fieldStyle} value={it.name} placeholder="e.g. Venomfang Blade" onChange={(e) => patch({ name: e.target.value })} />
      </div>
      <div>
        <label style={lab}>Description</label>
        <textarea style={{ ...fieldStyle, minHeight: 54, resize: 'vertical' }} value={it.desc} placeholder="What it looks like / does…" onChange={(e) => patch({ desc: e.target.value })} />
      </div>
      <div className="flex" style={{ gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div style={{ width: 90 }}>
          <label style={lab}>Quantity</label>
          <input style={fieldStyle} type="number" min={0} value={it.qty} onChange={(e) => patch({ qty: Number(e.target.value) || 0 })} />
        </div>
        <label className="flex" style={{ gap: 6, alignItems: 'center', fontSize: 13, color: 'var(--ink)' }}>
          <input type="checkbox" checked={!!it.equipped} onChange={(e) => patch({ equipped: e.target.checked })} /> Equipped
        </label>
        <label className="flex" style={{ gap: 6, alignItems: 'center', fontSize: 13, color: 'var(--ink)' }}>
          <input type="checkbox" checked={!!it.attuned} onChange={(e) => patch({ attuned: e.target.checked })} /> Attuned
        </label>
      </div>

      {/* Picture */}
      <div className="flex" style={{ gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        {it.image && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={it.image} alt="" style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--line)' }} />
        )}
        <label className={`btn tiny ${uploading ? 'active' : ''}`} style={{ cursor: 'pointer' }}>
          {uploading ? 'Uploading…' : it.image ? '⤴ Change picture' : '⤴ Add picture'}
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" style={{ position: 'absolute', width: 1, height: 1, opacity: 0 }}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadImage(f); if (fileRef.current) fileRef.current.value = '' }} />
        </label>
        {it.image && <button type="button" className="btn tiny danger" onClick={() => patch({ image: undefined })}>Remove picture</button>}
      </div>

      {/* Weapon */}
      {kind === 'weapon' && (
        <div style={{ display: 'grid', gap: 8, borderTop: '1px dashed var(--line)', paddingTop: 10 }}>
          <div className="flex" style={{ gap: 8, flexWrap: 'wrap' }}>
            <div style={{ width: 130 }}>
              <label style={lab}>Primary damage</label>
              <input style={fieldStyle} value={w?.damage.dice ?? '1d6'} placeholder="2d8" onChange={(e) => patchWeapon({ damage: { dice: e.target.value, type: w?.damage.type ?? 'slashing' } })} />
            </div>
            <div style={{ width: 130 }}>
              <label style={lab}>Damage type</label>
              <input style={fieldStyle} value={w?.damage.type ?? 'slashing'} placeholder="slashing" onChange={(e) => patchWeapon({ damage: { dice: w?.damage.dice ?? '1d6', type: e.target.value } })} />
            </div>
            <div style={{ width: 100 }}>
              <label style={lab}>Ability</label>
              <select style={fieldStyle} value={w?.ability ?? 'str'} onChange={(e) => patchWeapon({ ability: e.target.value as AbilityKey })}>
                {ABILITIES.map((a) => <option key={a} value={a}>{a.toUpperCase()}</option>)}
              </select>
            </div>
            <div style={{ width: 120 }}>
              <label style={lab}>Range</label>
              <input style={fieldStyle} value={w?.range ?? ''} placeholder="5 ft / 80/320" onChange={(e) => patchWeapon({ range: e.target.value })} />
            </div>
            <label className="flex" style={{ gap: 6, alignItems: 'center', fontSize: 13, color: 'var(--ink)', alignSelf: 'flex-end' }}>
              <input type="checkbox" checked={!!w?.proficient} onChange={(e) => patchWeapon({ proficient: e.target.checked })} /> Proficient
            </label>
          </div>
          <div>
            <label style={lab}>Bonus damage dice (e.g. +1d6 poison)</label>
            <div style={{ display: 'grid', gap: 6 }}>
              {bonus.map((b, i) => (
                <div key={i} className="flex" style={{ gap: 6 }}>
                  <input style={{ ...fieldStyle, width: 90 }} value={b.dice} placeholder="1d6" onChange={(e) => patchWeapon({ bonus: bonus.map((x, j) => (j === i ? { ...x, dice: e.target.value } : x)) })} />
                  <input style={{ ...fieldStyle, flex: 1 }} value={b.type} placeholder="poison" onChange={(e) => patchWeapon({ bonus: bonus.map((x, j) => (j === i ? { ...x, type: e.target.value } : x)) })} />
                  <button type="button" className="btn tiny danger" onClick={() => patchWeapon({ bonus: bonus.filter((_, j) => j !== i) })}>✕</button>
                </div>
              ))}
              <button type="button" className="btn tiny" onClick={() => patchWeapon({ bonus: [...bonus, { dice: '1d6', type: 'poison' } as TypedDamage] })}>+ Add bonus damage</button>
            </div>
          </div>
        </div>
      )}

      {/* Armor / shield */}
      {(kind === 'armor' || kind === 'shield') && (
        <div className="flex" style={{ gap: 8, flexWrap: 'wrap', borderTop: '1px dashed var(--line)', paddingTop: 10 }}>
          <div style={{ width: 130 }}>
            <label style={lab}>Category</label>
            <select style={fieldStyle} value={it.armor?.category ?? (kind === 'shield' ? 'shield' : 'light')} onChange={(e) => patchArmor({ category: e.target.value as ArmorStats['category'] })}>
              {(kind === 'shield' ? ['shield'] : ['light', 'medium', 'heavy']).map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div style={{ width: 130 }}>
            <label style={lab}>{kind === 'shield' ? 'AC bonus' : 'Base AC'}</label>
            <input style={fieldStyle} type="number" value={it.armor?.baseAC ?? ''} placeholder={kind === 'shield' ? '2' : '14'} onChange={(e) => patchArmor({ baseAC: Number(e.target.value) || 0 })} />
          </div>
          {kind !== 'shield' && (
            <label className="flex" style={{ gap: 6, alignItems: 'center', fontSize: 13, color: 'var(--ink)', alignSelf: 'flex-end' }}>
              <input type="checkbox" checked={!!it.armor?.stealthDisadvantage} onChange={(e) => patchArmor({ stealthDisadvantage: e.target.checked })} /> Stealth disadvantage
            </label>
          )}
        </div>
      )}

      {/* Consumable */}
      {kind === 'consumable' && (
        <div style={{ display: 'grid', gap: 8, borderTop: '1px dashed var(--line)', paddingTop: 10 }}>
          <div className="flex" style={{ gap: 8, flexWrap: 'wrap' }}>
            <div style={{ width: 130 }}>
              <label style={lab}>Effect</label>
              <select style={fieldStyle} value={it.consumable?.effect.kind ?? 'heal'} onChange={(e) => patchConsumable({ kind: e.target.value as ConsumableStats['effect']['kind'] })}>
                <option value="heal">Heal HP</option>
                <option value="temp">Temp HP</option>
                <option value="status">Grant condition</option>
                <option value="buff">Stat buff</option>
                <option value="custom">Custom (note)</option>
              </select>
            </div>
            {(it.consumable?.effect.kind === 'heal' || it.consumable?.effect.kind === 'temp') && (
              <div style={{ width: 120 }}>
                <label style={lab}>Dice</label>
                <input style={fieldStyle} value={it.consumable?.effect.dice ?? ''} placeholder="2d4+2" onChange={(e) => patchConsumable({ dice: e.target.value })} />
              </div>
            )}
            {it.consumable?.effect.kind === 'status' && (
              <div style={{ width: 150 }}>
                <label style={lab}>Condition</label>
                <input style={fieldStyle} value={it.consumable?.effect.status ?? ''} placeholder="Invisible" onChange={(e) => patchConsumable({ status: e.target.value })} />
              </div>
            )}
            {(it.consumable?.effect.kind === 'status' || it.consumable?.effect.kind === 'buff') && (
              <div style={{ width: 130 }}>
                <label style={lab}>Duration</label>
                <input style={fieldStyle} value={it.consumable?.effect.duration ?? ''} placeholder="1 hour / 3 rounds" onChange={(e) => patchConsumable({ duration: e.target.value })} />
              </div>
            )}
          </div>
          {it.consumable?.effect.kind === 'buff' && (
            <EffectRows
              effects={it.consumable.effect.effects ?? []}
              onChange={(effects) => patchConsumable({ effects })}
              hint="e.g. target 'str_score', op 'set', value 25 (Potion of Giant Strength)"
            />
          )}
          <div>
            <label style={lab}>Note (shown on use)</label>
            <input style={fieldStyle} value={it.consumable?.effect.note ?? ''} placeholder="optional flavor / rules note" onChange={(e) => patchConsumable({ note: e.target.value })} />
          </div>
        </div>
      )}

      {/* Passive effects for wondrous/gear (and any kind) while equipped/attuned */}
      {(kind === 'wondrous' || kind === 'gear' || kind === 'armor' || kind === 'shield' || kind === 'weapon') && (
        <div style={{ borderTop: '1px dashed var(--line)', paddingTop: 10 }}>
          <label style={lab}>Passive effects while equipped/attuned</label>
          <EffectRows effects={it.effects ?? []} onChange={(effects) => patch({ effects })} hint="e.g. target 'ac', op 'add', value 1" />
        </div>
      )}

      {err && <div style={{ color: 'var(--danger)', fontSize: 13 }}>{err}</div>}
      <div className="btn-row">
        <button type="button" className="btn tiny solid" onClick={save}>{initial ? 'Save changes' : 'Add item'}</button>
        <button type="button" className="btn tiny" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  )
}

// A small repeatable editor for engine Effects (target / operation / value / condition).
function EffectRows({ effects, onChange, hint }: { effects: Effect[]; onChange: (e: Effect[]) => void; hint?: string }) {
  const set = (i: number, p: Partial<Effect>) => onChange(effects.map((e, j) => (j === i ? { ...e, ...p } : e)))
  return (
    <div style={{ display: 'grid', gap: 6 }}>
      {effects.map((e, i) => (
        <div key={i} className="flex" style={{ gap: 6, flexWrap: 'wrap' }}>
          <input style={{ ...fieldStyle, width: 130 }} value={e.target} placeholder="target (ac, str_score…)" onChange={(ev) => set(i, { target: ev.target.value })} />
          <select style={{ ...fieldStyle, width: 110 }} value={e.operation} onChange={(ev) => set(i, { operation: ev.target.value as EffectOperation })}>
            {OPS.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
          <input style={{ ...fieldStyle, width: 90 }} value={e.value == null ? '' : String(e.value)} placeholder="value" onChange={(ev) => { const n = Number(ev.target.value); set(i, { value: ev.target.value === '' ? undefined : Number.isNaN(n) ? ev.target.value : n }) }} />
          <button type="button" className="btn tiny danger" onClick={() => onChange(effects.filter((_, j) => j !== i))}>✕</button>
        </div>
      ))}
      <button type="button" className="btn tiny" onClick={() => onChange([...effects, { target: 'ac', operation: 'add', value: 1 }])}>+ Add effect</button>
      {hint && <div style={{ fontSize: 11, color: 'var(--muted)' }}>{hint}</div>}
    </div>
  )
}

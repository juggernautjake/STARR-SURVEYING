'use client'
// ItemBuilder — the homebrew item/equipment builder (DND_ITEM_BUILDER, Slice 4). Create or
// edit any inventory item: pick a kind, fill title/description/qty, add kind-specific stats
// (weapon damage + typed bonus dice, armor/shield AC, consumable effects, passive effects),
// and upload a per-item picture. Emits a full InvItem via onSave. Uses shared sheet classes
// + theme tokens so it reads on every skin (no hard-coded light/dark colors).
import { useRef, useState } from 'react'
import type { InvItem, ItemKind, WeaponStats, ArmorStats, ConsumableStats, TypedDamage } from '../types'
import TagPicker from './ui/TagPicker'
import TriggerRows from './ui/TriggerRows'
import type { Effect, EffectOperation } from '../engine/effects'
import type { AbilityKey } from '../rules/dnd'
import { findTarget, targetsInGroup, describeEffect, validateEffect, TARGET_GROUP_LABELS, type TargetGroup } from '@/lib/dnd/effects/targets'
import { nextCustomized } from '../lib/customized'
import { diffFields, logManualEdits } from '../lib/log-edit'
import { cleanTriggers } from '@/lib/dnd/effects/triggers'
import { armorModBonus } from '../lib/derive-ac'
import { abilityMod } from '../rules/dnd'
import { useChar } from '../state/store'

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
  const { abilities } = useChar()

  const patch = (p: Partial<InvItem>) => setIt((v) => ({ ...v, ...p }))
  const patchWeapon = (p: Partial<WeaponStats>) => setIt((v) => ({ ...v, weapon: { damage: { dice: '1d6', type: 'slashing' }, ...v.weapon, ...p } }))
  const patchArmor = (p: Partial<ArmorStats>) => setIt((v) => ({ ...v, armor: { category: v.kind === 'shield' ? 'shield' : 'light', ...v.armor, ...p } }))

  // Live AC preview for the armor block, resolved against THIS character's effective mods
  // (the same ledger-overlaid scores the sheet uses) so the number here matches what the
  // Combat panel will show once the piece is equipped.
  const previewMods = {
    str: abilityMod(abilities.str), dex: abilityMod(abilities.dex), con: abilityMod(abilities.con),
    int: abilityMod(abilities.int), wis: abilityMod(abilities.wis), cha: abilityMod(abilities.cha),
  }
  const acPreview = (() => {
    const a: ArmorStats = it.armor ?? { category: 'light' }
    const base = a.baseAC ?? 10
    const bonus = armorModBonus(a, previewMods.dex, previewMods)
    const ability = a.modAbility ?? (a.category === 'heavy' ? 'none' : 'dex')
    const cap = a.modCap ?? a.dexCap ?? (a.category === 'medium' ? 2 : null)
    const uncapped = ability === 'none' ? 0 : previewMods[ability as keyof typeof previewMods] ?? 0
    return { total: base + bonus, base, bonus, label: ability === 'none' ? '' : ability.toUpperCase(), capped: cap != null && uncapped > cap }
  })()
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
    // Refuse a broken effect with a REASON rather than saving it (Slice 17): the picker prevents a
    // bad target/op, but a text target (a resistance, a granted proficiency) left blank would save
    // an effect the ledger can't apply, and the player would believe it works. Same validator the
    // AI path uses, so the two agree on what "valid" means.
    for (const eff of [...(it.effects ?? []), ...(it.consumable?.effect.effects ?? [])]) {
      const bad = validateEffect(eff)
      if (bad) { setErr(`Effect “${describeEffect({ target: eff.target, operation: eff.operation, value: eff.value })}”: ${bad.reason}`); return }
    }
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
    // Drop any half-formed reaction (empty label, etc.) — the same validator the AI path uses.
    if (clean.triggers?.length) clean.triggers = cleanTriggers(clean.triggers)
    // ✎ (Slice 20): mark an item hand-tuned when EDITING an existing one changed it. A brand-new
    // item (no `initial`) isn't "customized from a source" — it just is what it is.
    if (initial) {
      clean.customized = nextCustomized(initial, clean)
      // Audit the edit to the same log the AI + DM overrides use (a new item isn't an "edit").
      logManualEdits(characterId, diffFields(initial, clean, `item.${initial.name}`, ['name', 'desc', 'qty', 'kind']))
    }
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
        <div style={{ width: 90 }}>
          <label style={lab}>Weight (lb)</label>
          <input style={fieldStyle} type="number" min={0} step="0.1" value={it.weight ?? ''} placeholder="—"
            onChange={(e) => patch({ weight: e.target.value === '' ? undefined : Math.max(0, Number(e.target.value) || 0) })} />
        </div>
        <label className="flex" style={{ gap: 6, alignItems: 'center', fontSize: 13, color: 'var(--ink)' }}>
          <input type="checkbox" checked={!!it.equipped} onChange={(e) => patch({ equipped: e.target.checked })} /> Equipped
        </label>
        <label className="flex" style={{ gap: 6, alignItems: 'center', fontSize: 13, color: 'var(--ink)' }}>
          <input type="checkbox" checked={!!it.attuned} onChange={(e) => patch({ attuned: e.target.checked })} /> Attuned
        </label>
      </div>

      {/* Tags (Slice 32): add existing ones, or mint a new one WITH a definition. weapon/consumable
          are derived from `kind` below and equipped from the checkbox above, so the picker disables
          those rather than offer a control that gets overwritten on save. */}
      <div>
        <label style={lab}>Tags</label>
        <TagPicker value={it.tags as string[]} onChange={(tags) => patch({ tags: tags as InvItem['tags'] })} />
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
            <>
              <div style={{ width: 130 }}>
                <label style={lab}>Modifier</label>
                <select
                  style={fieldStyle}
                  value={it.armor?.modAbility ?? (it.armor?.category === 'heavy' ? 'none' : 'dex')}
                  onChange={(e) => patchArmor({ modAbility: e.target.value as NonNullable<ArmorStats['modAbility']> })}
                >
                  <option value="none">none</option>
                  {(['str', 'dex', 'con', 'int', 'wis', 'cha'] as const).map((a) => <option key={a} value={a}>{a.toUpperCase()}</option>)}
                </select>
              </div>
              <div style={{ width: 110 }}>
                <label style={lab}>Max modifier</label>
                <input
                  style={fieldStyle} type="number"
                  value={it.armor?.modCap ?? it.armor?.dexCap ?? ''}
                  placeholder={it.armor?.category === 'medium' ? '2' : 'none'}
                  onChange={(e) => patchArmor({ modCap: e.target.value === '' ? null : Number(e.target.value) })}
                />
              </div>
              <label className="flex" style={{ gap: 6, alignItems: 'center', fontSize: 13, color: 'var(--ink)', alignSelf: 'flex-end' }}>
                <input type="checkbox" checked={!!it.armor?.stealthDisadvantage} onChange={(e) => patchArmor({ stealthDisadvantage: e.target.checked })} /> Stealth disadvantage
              </label>
            </>
          )}
          {/* Live total, using THIS character's current mods — so you can see what the piece
              will actually give you before saving, and that it only counts when equipped. */}
          <div style={{ width: '100%', fontSize: 12, color: 'var(--muted, #9aa)', paddingTop: 2 }}>
            {kind === 'shield'
              ? <>Adds <b style={{ color: 'var(--ink)' }}>+{it.armor?.baseAC ?? 2}</b> to AC while equipped.</>
              : <>
                  AC while equipped: <b style={{ color: 'var(--ink)' }}>{acPreview.total}</b>
                  {' '}= {acPreview.base} base{acPreview.bonus !== 0 ? ` ${acPreview.bonus > 0 ? '+' : '−'} ${Math.abs(acPreview.bonus)} ${acPreview.label}` : ''}
                  {acPreview.capped ? ' (capped)' : ''}
                </>}
          </div>
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
              hint="e.g. Strength · set · 25 (Potion of Giant Strength)"
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
          <EffectRows effects={it.effects ?? []} onChange={(effects) => patch({ effects })} hint="e.g. Armor Class · add · 1" />
        </div>
      )}

      {/* Reactions / triggers (Slice 15) — event-driven, not passive. Spiked armour that hits back,
          a shield that frightens. Surfaced as a prompt when the event fires. */}
      {(kind === 'wondrous' || kind === 'gear' || kind === 'armor' || kind === 'shield' || kind === 'weapon') && (
        <div style={{ borderTop: '1px dashed var(--line)', paddingTop: 10 }}>
          <label style={lab}>Reactions when an event happens (optional)</label>
          <TriggerRows triggers={it.triggers ?? []} onChange={(triggers) => patch({ triggers })} />
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

// Groups in the order they read in the picker (abilities first, meta last).
const GROUP_ORDER = Object.keys(TARGET_GROUP_LABELS) as TargetGroup[]

/** A sensible default value when a target is picked, by its value type. */
function defaultValueFor(targetKey: string): Effect['value'] | undefined {
  const t = findTarget(targetKey)
  if (!t) return undefined
  if (t.valueType === 'flag') return undefined
  return t.valueType === 'number' ? 1 : ''
}

/**
 * The manual effect builder (Slice 17): "Add effect → pick a target → define the value". This is
 * the SAME `Effect[]` the AI emits (Slice 14) — one shape, so the two paths can't diverge. The
 * target is a REGISTRY picker (not free text: a typo like `str_score` used to produce an effect the
 * ledger silently rejected), the operation is constrained to what that target allows, and the value
 * control matches the target's value type (number vs text vs none-for-a-flag).
 */
export function EffectRows({ effects, onChange, hint }: { effects: Effect[]; onChange: (e: Effect[]) => void; hint?: string }) {
  const set = (i: number, p: Partial<Effect>) => onChange(effects.map((e, j) => (j === i ? { ...e, ...p } : e)))
  // Picking a new target resets the operation to one it allows and the value to a sane default —
  // otherwise a leftover op/value from the previous target would fail validation on save.
  const pickTarget = (i: number, key: string) => {
    const t = findTarget(key)
    set(i, { target: key, operation: (t?.ops[0] ?? 'add') as EffectOperation, value: defaultValueFor(key) })
  }
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {effects.map((e, i) => {
        const def = findTarget(e.target)
        const ops = def?.ops ?? OPS
        const vt = def?.valueType
        const noValue = vt === 'flag' || e.operation === 'advantage' || e.operation === 'disadvantage'
        const numeric = vt === 'number'
        return (
          <div key={i} style={{ display: 'grid', gap: 3 }}>
            <div className="flex" style={{ gap: 6, flexWrap: 'wrap' }}>
              <select style={{ ...fieldStyle, width: 170 }} value={def ? e.target : '__custom'} onChange={(ev) => pickTarget(i, ev.target.value)}>
                {!def && <option value="__custom">{e.target ? `(custom) ${e.target}` : '— pick a target —'}</option>}
                {GROUP_ORDER.map((g) => {
                  const inGroup = targetsInGroup(g)
                  if (!inGroup.length) return null
                  return (
                    <optgroup key={g} label={TARGET_GROUP_LABELS[g]}>
                      {inGroup.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
                    </optgroup>
                  )
                })}
              </select>
              <select style={{ ...fieldStyle, width: 120 }} value={e.operation} onChange={(ev) => set(i, { operation: ev.target.value as EffectOperation })}>
                {ops.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
              {!noValue && (
                numeric ? (
                  <input style={{ ...fieldStyle, width: 80 }} type="number" value={typeof e.value === 'number' ? e.value : ''} placeholder="0"
                    onChange={(ev) => set(i, { value: ev.target.value === '' ? undefined : Number(ev.target.value) })} />
                ) : (
                  <input style={{ ...fieldStyle, width: 120 }} value={e.value == null ? '' : String(e.value)} placeholder={vt ?? 'value'}
                    onChange={(ev) => set(i, { value: ev.target.value })} />
                )
              )}
              {/* Optional condition gate (Slice 17): the engine's `condition` field. Blank = always
                  on (while equipped). A named condition (raging, bloodied) applies only when active. */}
              <input style={{ ...fieldStyle, width: 110 }} value={e.condition ?? ''} placeholder="if… (raging)"
                title="Optional: only apply while this condition is active (blank = always, while equipped)"
                onChange={(ev) => set(i, { condition: ev.target.value.trim() || undefined })} />
              <button type="button" className="btn tiny danger" onClick={() => onChange(effects.filter((_, j) => j !== i))}>✕</button>
            </div>
            {def && (
              <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                {/* Plain-English preview from the SAME renderer as the ★ tooltip — build it and read
                    it in one place, so what you author is what the sheet will say. */}
                <strong style={{ color: 'var(--tealbright)' }}>{describeEffect({ target: e.target, operation: e.operation, value: e.value, condition: e.condition })}</strong>
                {' · '}{def.help} · <em>renders at {def.rendersAt}</em>
              </div>
            )}
          </div>
        )
      })}
      <button type="button" className="btn tiny" onClick={() => onChange([...effects, { target: 'ac', operation: 'add', value: 1 }])}>+ Add effect</button>
      {hint && <div style={{ fontSize: 11, color: 'var(--muted)' }}>{hint}</div>}
    </div>
  )
}

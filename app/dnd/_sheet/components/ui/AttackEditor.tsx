'use client'
// AttackEditor — rename an attack and edit its numbers (Slice 20).
//
// The literal, repeatedly-reported ask: rename "Backless Park Bench", change its damage die, its
// to-hit, its range. The Attacks table has always rendered this data as read-only prose — the only
// interactive things on the row were the roll buttons.
//
// Edits go through the store's setChar like every other sheet write, so autosave, the DM edit log
// and realtime propagation all come along for free.
import { useState } from 'react'
import { useChar } from '../../state/store'
import { ABILITIES, type AbilityKey } from '../../rules/dnd'
import type { Attack } from '../../types'
import EditDialog, { Field } from './EditDialog'
import ImageUpload from './ImageUpload'
import { nextCustomized } from '../../lib/customized'

const DAMAGE_TYPES = [
  'bludgeoning', 'piercing', 'slashing', 'fire', 'cold', 'lightning', 'thunder',
  'acid', 'poison', 'necrotic', 'radiant', 'force', 'psychic',
]

export default function AttackEditor({ attack, onClose }: { attack: Attack; onClose: () => void }) {
  const { setChar } = useChar()
  const [draft, setDraft] = useState<Attack>({ ...attack })
  const set = <K extends keyof Attack>(k: K, v: Attack[K]) => setDraft((d) => ({ ...d, [k]: v }))

  function save() {
    const name = draft.name.trim() || attack.name // never let a rename blank the row out
    const customized = nextCustomized(attack, draft) // ✎ once hand-tuned (Slice 20)
    setChar((c) => ({
      ...c,
      attacks: c.attacks.map((a) => (a.id === attack.id ? { ...draft, name, customized } : a)),
    }))
    onClose()
  }

  return (
    <EditDialog title={`Edit — ${attack.name}`} onClose={onClose} onSave={save}>
      <Field label="Name">
        <input className="ed-input" value={draft.name} onChange={(e) => set('name', e.target.value)} />
      </Field>

      <Field label="Art" hint="optional thumbnail for this attack">
        <ImageUpload value={draft.image} onChange={(url) => set('image', url)} />
      </Field>

      <div className="ed-row">
        <Field label="Damage" hint="dice, e.g. 1d8">
          <input className="ed-input" value={draft.damage} onChange={(e) => set('damage', e.target.value)} />
        </Field>
        <Field label="Damage type">
          <select className="ed-input" value={draft.damageType} onChange={(e) => set('damageType', e.target.value)}>
            {/* The character's own type may be homebrew and not in the list — keep it rather than
                silently snapping it to the nearest official one. */}
            {!DAMAGE_TYPES.includes(draft.damageType) && draft.damageType && (
              <option value={draft.damageType}>{draft.damageType}</option>
            )}
            {DAMAGE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </Field>
      </div>

      <div className="ed-row">
        <Field label="Ability" hint="drives to-hit + damage">
          <select className="ed-input" value={draft.ability} onChange={(e) => set('ability', e.target.value as AbilityKey)}>
            {ABILITIES.map((a) => <option key={a.key} value={a.key}>{a.full}</option>)}
          </select>
        </Field>
        <Field label="Range">
          <input className="ed-input" value={draft.range} onChange={(e) => set('range', e.target.value)} />
        </Field>
      </div>

      <div className="ed-row">
        <Field label="Bonus to hit" hint="beyond ability + prof">
          <input
            className="ed-input" type="number" value={draft.bonusToHit ?? 0}
            onChange={(e) => set('bonusToHit', Number(e.target.value) || 0)}
          />
        </Field>
        <Field label="Bonus damage" hint="beyond ability">
          <input
            className="ed-input" type="number" value={draft.bonusDamage ?? 0}
            onChange={(e) => set('bonusDamage', Number(e.target.value) || 0)}
          />
        </Field>
      </div>

      <label className="ed-check">
        <input type="checkbox" checked={!!draft.proficient} onChange={(e) => set('proficient', e.target.checked)} />
        Proficient (adds your proficiency bonus to hit)
      </label>

      {/* Save-based attacks (AOE spells, breath weapons): targets roll a save vs YOUR DC rather than
          you rolling to hit. This is where the "control the hit DC" ask lives (Slice 33). */}
      <label className="ed-check">
        <input type="checkbox" checked={!!draft.saveBased} onChange={(e) => set('saveBased', e.target.checked)} />
        Save-based (targets roll a save vs your DC, instead of you rolling to hit)
      </label>
      {draft.saveBased && (
        <>
          <div className="ed-row">
            <Field label="Save the target rolls">
              <select className="ed-input" value={draft.saveAbility ?? 'dex'} onChange={(e) => set('saveAbility', e.target.value as AbilityKey)}>
                {ABILITIES.map((a) => <option key={a.key} value={a.key}>{a.full}</option>)}
              </select>
            </Field>
            <Field label="Area" hint='e.g. "60-ft line"'>
              <input className="ed-input" value={draft.aoe ?? ''} onChange={(e) => set('aoe', e.target.value)} />
            </Field>
          </div>
          <div className="ed-row">
            <Field label="DC ability" hint="powers 8 + PB + mod">
              <select className="ed-input" value={draft.saveDcAbility ?? 'str'} onChange={(e) => set('saveDcAbility', e.target.value as AbilityKey)}>
                {ABILITIES.map((a) => <option key={a.key} value={a.key}>{a.full}</option>)}
              </select>
            </Field>
            <Field label="DC override" hint="blank = computed">
              <input
                className="ed-input" type="number" min={0}
                value={draft.saveDcOverride ?? ''}
                onChange={(e) => set('saveDcOverride', e.target.value === '' ? undefined : Number(e.target.value))}
              />
            </Field>
          </div>
        </>
      )}

      <Field label="Notes" hint="shown under the attack's name">
        <textarea
          className="ed-input" rows={3} value={draft.notes ?? ''}
          onChange={(e) => set('notes', e.target.value)}
        />
      </Field>

      {/* Say plainly when something else is driving the damage, rather than letting the player edit
          a field that will be ignored on the next render. */}
      {(draft.usesFormStrikeDie || draft.damageByLevel?.length) && (
        <p className="ed-note">
          This attack&apos;s damage die is overridden{draft.usesFormStrikeDie ? ' by your active form' : ' by a per-level ladder'} —
          the Damage field above is only used as a fallback.
        </p>
      )}
    </EditDialog>
  )
}

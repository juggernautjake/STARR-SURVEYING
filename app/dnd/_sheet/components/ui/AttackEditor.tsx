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
    setChar((c) => ({
      ...c,
      attacks: c.attacks.map((a) => (a.id === attack.id ? { ...draft, name } : a)),
    }))
    onClose()
  }

  return (
    <EditDialog title={`Edit — ${attack.name}`} onClose={onClose} onSave={save}>
      <Field label="Name">
        <input className="ed-input" value={draft.name} onChange={(e) => set('name', e.target.value)} />
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

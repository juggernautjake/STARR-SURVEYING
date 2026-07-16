'use client'
// SpellEditor — edit a spell in place (Slices 20 / 27 / 33). Reaches the Spells tab, which — like
// attacks, items and features before it — rendered every spell as read-only prose with no way to
// rename or retune it.
//
// This is also where the "control the hit DC for spells" ask (Slice 33) lands: a spell can declare
// a save (which ability, what it does) that the sheet resolves against the spell save DC.
import { useState } from 'react'
import { useChar } from '../../state/store'
import { ABILITIES, type AbilityKey } from '../../rules/dnd'
import type { Spell, SpellLevel } from '../../types'
import EditDialog, { Field } from './EditDialog'
import { EffectRows } from '../ItemBuilder'
import { validateEffect } from '@/lib/dnd/effects/targets'
import { nextCustomized } from '../../lib/customized'

const LEVELS: SpellLevel[] = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]

export default function SpellEditor({ spell, onClose }: { spell: Spell; onClose: () => void }) {
  const { setChar } = useChar()
  const [draft, setDraft] = useState<Spell>({ ...spell })
  const set = <K extends keyof Spell>(k: K, v: Spell[K]) => setDraft((d) => ({ ...d, [k]: v }))

  const [err, setErr] = useState<string | null>(null)

  function save() {
    const name = draft.name.trim() || spell.name // a blank name would erase the row heading
    // Same validator as the item builder: refuse a broken lasting-effect with a reason.
    for (const eff of draft.effects ?? []) {
      const bad = validateEffect(eff)
      if (bad) { setErr(bad.reason); return }
    }
    const customized = nextCustomized(spell, draft) // ✎ once hand-tuned (Slice 20)
    setChar((c) => ({
      ...c,
      spells: (c.spells ?? []).map((s) => (s.id === spell.id ? { ...draft, name, customized } : s)),
    }))
    onClose()
  }

  return (
    <EditDialog title={`Edit — ${spell.name}`} onClose={onClose} onSave={save}>
      <Field label="Name">
        <input className="ed-input" value={draft.name} onChange={(e) => set('name', e.target.value)} />
      </Field>

      <div className="ed-row">
        <Field label="Level" hint="0 = cantrip">
          <select className="ed-input" value={draft.level} onChange={(e) => set('level', Number(e.target.value) as SpellLevel)}>
            {LEVELS.map((l) => <option key={l} value={l}>{l === 0 ? 'Cantrip' : `Level ${l}`}</option>)}
          </select>
        </Field>
        <Field label="School">
          <input className="ed-input" value={draft.school ?? ''} onChange={(e) => set('school', e.target.value)} />
        </Field>
      </div>

      <div className="ed-row">
        <Field label="Cast time">
          <input className="ed-input" value={draft.castTime ?? ''} onChange={(e) => set('castTime', e.target.value)} />
        </Field>
        <Field label="Range">
          <input className="ed-input" value={draft.range ?? ''} onChange={(e) => set('range', e.target.value)} />
        </Field>
      </div>

      <div className="ed-row">
        <Field label="Components" hint="V, S, M…">
          <input className="ed-input" value={draft.components ?? ''} onChange={(e) => set('components', e.target.value)} />
        </Field>
        <Field label="Duration">
          <input className="ed-input" value={draft.duration ?? ''} onChange={(e) => set('duration', e.target.value)} />
        </Field>
      </div>

      <Field label="Description">
        <textarea className="ed-input" rows={4} value={draft.description ?? ''} onChange={(e) => set('description', e.target.value)} />
      </Field>

      <div className="ed-row">
        <label className="ed-check">
          <input type="checkbox" checked={!!draft.concentration} onChange={(e) => set('concentration', e.target.checked)} />
          Concentration
        </label>
        <label className="ed-check">
          <input type="checkbox" checked={!!draft.ritual} onChange={(e) => set('ritual', e.target.checked)} />
          Ritual
        </label>
      </div>

      {/* How the spell resolves — a to-hit spell attack, OR a save against your spell DC (Slice 33). */}
      <label className="ed-check">
        <input type="checkbox" checked={!!draft.attack} onChange={(e) => set('attack', e.target.checked)} />
        Spell attack roll (uses your spell attack bonus)
      </label>
      <label className="ed-check">
        <input
          type="checkbox"
          checked={!!draft.save}
          // Toggling on seeds a DEX save; off clears it. A spell is one or the other, usually.
          onChange={(e) => set('save', e.target.checked ? { ability: 'dex', effect: 'half on a success' } : undefined)}
        />
        Targets roll a save vs your spell DC
      </label>
      {draft.save && (
        <div className="ed-row">
          <Field label="Save ability">
            <select
              className="ed-input"
              value={draft.save.ability}
              onChange={(e) => set('save', { ...draft.save!, ability: e.target.value as AbilityKey })}
            >
              {ABILITIES.map((a) => <option key={a.key} value={a.key}>{a.full}</option>)}
            </select>
          </Field>
          <Field label="On a save" hint='e.g. "half damage"'>
            <input
              className="ed-input"
              value={draft.save.effect}
              onChange={(e) => set('save', { ...draft.save!, effect: e.target.value })}
            />
          </Field>
        </div>
      )}
      <p className="ed-note">
        The spell save DC and attack bonus come from your spellcasting stat on the sheet — this sets
        whether a target rolls a save or you roll to hit.
      </p>

      <Field label="At higher levels" hint="scaling text (optional)">
        <input className="ed-input" value={draft.higher ?? ''} onChange={(e) => set('higher', e.target.value)} />
      </Field>

      {/* Lasting effects the spell applies when cast (Slice 15/17) — a buff like Bless (+1d4 is
          flavour text, but a flat +1 to hit, advantage on a save, temp fly speed all live here).
          Snapshotted into an ActiveEffect on cast, so the ledger resolves them like a potion. */}
      <Field label="Effects on cast" hint="a lasting buff this spell grants (optional)">
        <EffectRows effects={draft.effects ?? []} onChange={(effects) => set('effects', effects)} hint="e.g. Attack rolls · add · 1 (Bless-style)" />
      </Field>
      {(draft.effects?.length ?? 0) > 0 && (
        <Field label="Effect duration" hint='shown on the active buff, e.g. "1 minute"'>
          <input className="ed-input" value={draft.effectDuration ?? ''} onChange={(e) => set('effectDuration', e.target.value)} />
        </Field>
      )}
      {err && <p className="ed-note" style={{ color: 'var(--danger)' }}>{err}</p>}
    </EditDialog>
  )
}

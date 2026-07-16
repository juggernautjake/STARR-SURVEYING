'use client'
// FeatureEditor — rename a feature/ability and edit its text (Slice 20).
//
// Same story as attacks and items: the Features tab rendered everything as read-only prose, so a
// homebrewed ability could never be reworded or retitled by hand — only by asking the AI.
import { useState } from 'react'
import { useChar } from '../../state/store'
import type { FeatureBlock } from '../../types'
import EditDialog, { Field } from './EditDialog'
import { EffectRows } from '../ItemBuilder'

export default function FeatureEditor({ feature, onClose }: { feature: FeatureBlock; onClose: () => void }) {
  const { setChar } = useChar()
  const [draft, setDraft] = useState<FeatureBlock>({ ...feature })
  const set = <K extends keyof FeatureBlock>(k: K, v: FeatureBlock[K]) => setDraft((d) => ({ ...d, [k]: v }))

  function save() {
    const name = draft.name.trim() || feature.name // a blank name would erase the card's heading
    setChar((c) => ({
      ...c,
      features: (c.features ?? []).map((f) => (f.id === feature.id ? { ...draft, name } : f)),
    }))
    onClose()
  }

  return (
    <EditDialog title={`Edit — ${feature.name}`} onClose={onClose} onSave={save}>
      <Field label="Name">
        <input className="ed-input" value={draft.name} onChange={(e) => set('name', e.target.value)} />
      </Field>

      <div className="ed-row">
        <Field label="Source" hint="Class, Species, Feat…">
          <input className="ed-input" value={draft.source ?? ''} onChange={(e) => set('source', e.target.value)} />
        </Field>
        <Field label="Unlocks at level">
          <input
            className="ed-input" type="number" min={1} max={20} value={draft.unlockLevel ?? 1}
            onChange={(e) => set('unlockLevel', Math.max(1, Number(e.target.value) || 1))}
          />
        </Field>
      </div>

      <Field label="Text" hint="one paragraph per line">
        <textarea
          className="ed-input"
          rows={7}
          // The model stores paragraphs as an array; the editor is a plain textarea because that is
          // how people write. Split on blank-ish lines going in, join going out — the round-trip is
          // lossless for anything anyone would actually type.
          value={(draft.body ?? []).join('\n\n')}
          onChange={(e) => set('body', e.target.value.split(/\n{2,}/).map((s) => s.trim()).filter(Boolean))}
        />
      </Field>

      <Field label="Flavor" hint="italic line under the text (optional)">
        <input className="ed-input" value={draft.flavor ?? ''} onChange={(e) => set('flavor', e.target.value)} />
      </Field>

      {/* Real, ledger-resolved effects the feature applies (Slice 17) — the SAME builder as items,
          so a class feature that grants +1 AC or a fly speed changes the sheet just like an item. */}
      <Field label="Effects" hint="what this feature does to the sheet (optional)">
        <EffectRows effects={draft.effects ?? []} onChange={(effects) => set('effects', effects)} hint="e.g. Armor Class · add · 1" />
      </Field>

      <p className="ed-note">
        Rule names in the text are auto-linked to this character&apos;s system glossary — you do not
        need to mark them up.
      </p>
    </EditDialog>
  )
}

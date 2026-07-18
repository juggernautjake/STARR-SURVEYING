'use client'
// ResourceEditor — edit a usage-pool resource (Slices 20 / 27). Rage charges, Bardic Inspiration,
// Ki, Superiority dice, a homebrew "focus" counter — all rendered as read-only pip rows before this.
import { useState } from 'react'
import { useChar } from '../../state/store'
import { diffFields, logManualEdits } from '../../lib/log-edit'
import type { Resource } from '../../types'
import EditDialog, { Field } from './EditDialog'

const COLORS: Resource['color'][] = ['pink', 'teal', 'gold']
const RESETS: Resource['resetOn'][] = ['short', 'long']
// Scalar fields whose hand-edit becomes an audit row (Slice 20).
const AUDITED: (keyof Resource)[] = ['name', 'max', 'current', 'resetOn', 'color', 'unlockLevel', 'note']

export default function ResourceEditor({ resource, onClose }: { resource: Resource; onClose: () => void }) {
  const { setChar, characterId } = useChar()
  const [draft, setDraft] = useState<Resource>({ ...resource })
  const set = <K extends keyof Resource>(k: K, v: Resource[K]) => setDraft((d) => ({ ...d, [k]: v }))

  function save() {
    const name = draft.name.trim() || resource.name
    const max = Math.max(0, Math.round(draft.max || 0))
    // Never leave `current` above the new max, or the pip row renders more filled than exist.
    const current = Math.min(draft.current, max)
    const next = { ...draft, name, max, current }
    logManualEdits(characterId, diffFields(resource, next, `resource.${resource.name}`, AUDITED))
    setChar((c) => ({
      ...c,
      resources: (c.resources ?? []).map((r) => (r.id === resource.id ? next : r)),
    }))
    onClose()
  }

  return (
    <EditDialog title={`Edit — ${resource.name}`} onClose={onClose} onSave={save}>
      <Field label="Name">
        <input className="ed-input" value={draft.name} onChange={(e) => set('name', e.target.value)} />
      </Field>

      <div className="ed-row">
        <Field label="Max uses">
          <input className="ed-input" type="number" min={0} value={draft.max} onChange={(e) => set('max', Math.max(0, Number(e.target.value) || 0))} />
        </Field>
        <Field label="Resets on">
          <select className="ed-input" value={draft.resetOn} onChange={(e) => set('resetOn', e.target.value as Resource['resetOn'])}>
            {RESETS.map((r) => <option key={r} value={r}>{r} rest</option>)}
          </select>
        </Field>
      </div>

      <div className="ed-row">
        <Field label="Colour">
          <select className="ed-input" value={draft.color} onChange={(e) => set('color', e.target.value as Resource['color'])}>
            {COLORS.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </Field>
        <Field label="Unlocks at level">
          <input className="ed-input" type="number" min={1} max={20} value={draft.unlockLevel ?? 1} onChange={(e) => set('unlockLevel', Math.max(1, Number(e.target.value) || 1))} />
        </Field>
      </div>

      <Field label="Note" hint="shown under the pips (optional)">
        <input className="ed-input" value={draft.note ?? ''} onChange={(e) => set('note', e.target.value)} />
      </Field>
    </EditDialog>
  )
}

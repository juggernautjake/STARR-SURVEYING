'use client'
// TraitEditor — edit one species/class trait (Slices 20 / 27). Traits are plain strings on
// `char.traits`, so they're addressed BY INDEX rather than by id. Markdown-lite is honoured on the
// sheet (**bold**, rule links), so the editor is a plain textarea and the render side does the rest.
import { useState } from 'react'
import { useChar } from '../../state/store'
import EditDialog, { Field } from './EditDialog'

export default function TraitEditor({ index, text, onClose }: { index: number; text: string; onClose: () => void }) {
  const { setChar } = useChar()
  const [draft, setDraft] = useState(text)

  function save() {
    const v = draft.trim()
    setChar((c) => {
      const traits = [...(c.traits ?? [])]
      if (index < 0 || index >= traits.length) return c
      // A blank trait is a delete — an empty <li> is just noise on the sheet.
      if (!v) traits.splice(index, 1)
      else traits[index] = v
      return { ...c, traits }
    })
    onClose()
  }

  return (
    <EditDialog title="Edit trait" onClose={onClose} onSave={save}>
      <Field label="Trait" hint="**bold** and rule names auto-link; clear it to delete">
        <textarea className="ed-input" rows={4} value={draft} onChange={(e) => setDraft(e.target.value)} />
      </Field>
    </EditDialog>
  )
}

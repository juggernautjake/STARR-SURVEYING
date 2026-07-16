'use client'
// TagPicker — add tags to an item, and mint new ones (Slice 32).
//
// "I need to be able to add flags and create flags and define them."
//
// Slice 27 gave the five built-in tags tooltips. This opens the vocabulary: a table can invent its
// own words, and every one of them explains itself the same way `flavor` does — because the
// description is REQUIRED. A tag nobody defined is exactly the "what does FLAVOR mean?" problem we
// just fixed, recreated by hand.
import { useState } from 'react'
import { useChar } from '../../state/store'
import type { CustomTag } from '../../types'
import { availableTags, tagInfo, validateCustomTag, RESERVED_TAGS } from './tagInfo'

export default function TagPicker({
  value,
  onChange,
}: {
  value: string[]
  onChange: (tags: string[]) => void
}) {
  const { char, setChar } = useChar()
  const custom = char.customTags ?? []
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [desc, setDesc] = useState('')
  const [err, setErr] = useState<string | null>(null)

  const toggle = (t: string) => onChange(value.includes(t) ? value.filter((x) => x !== t) : [...value, t])

  function create() {
    const problem = validateCustomTag(name, desc, custom)
    if (problem) {
      // Refuse with a reason rather than silently dropping it — the same rule the effect validator
      // follows. A tag that quietly didn't save is worse than one that visibly wouldn't.
      setErr(problem.reason)
      return
    }
    const tag: CustomTag = { name: name.trim(), description: desc.trim() }
    // Lives on the CHARACTER, so a campaign's vocabulary travels with its sheets.
    setChar((c) => ({ ...c, customTags: [...(c.customTags ?? []), tag] }))
    onChange([...value, tag.name]) // creating a tag on an item means you want it on that item
    setName('')
    setDesc('')
    setErr(null)
    setCreating(false)
  }

  return (
    <div className="tp">
      <div className="ed-tags">
        {availableTags(custom).map((t) => {
          // `weapon`/`consumable` are derived from the item's KIND by the builder, and `equipped`
          // by the equip control — toggling them here would be overwritten on save, so say so
          // instead of offering a control that lies.
          const managed = RESERVED_TAGS.includes(t)
          const on = value.includes(t)
          return (
            <button
              key={t}
              type="button"
              className={`tag ${on ? 'on' : ''} ${managed ? 'tag-managed' : ''}`}
              title={managed ? `${tagInfo(t, custom)}\n\n(Set automatically — this one follows the item's kind.)` : tagInfo(t, custom) ?? t}
              disabled={managed}
              onClick={() => toggle(t)}
            >
              {t}
            </button>
          )
        })}
        {!creating && (
          <button type="button" className="tag tag-new" onClick={() => setCreating(true)}>＋ new tag</button>
        )}
      </div>

      {creating && (
        <div className="tp-new">
          <input
            className="ed-input"
            placeholder="Tag name (e.g. cursed)"
            value={name}
            onChange={(e) => { setName(e.target.value); setErr(null) }}
          />
          <input
            className="ed-input"
            placeholder="What does it mean? This becomes its tooltip."
            value={desc}
            onChange={(e) => { setDesc(e.target.value); setErr(null) }}
            onKeyDown={(e) => e.key === 'Enter' && create()}
          />
          {err && <p className="tp-err">{err}</p>}
          <div className="btn-row">
            <button type="button" className="btn tiny" onClick={() => { setCreating(false); setErr(null) }}>Cancel</button>
            <button type="button" className="btn tiny teal" onClick={create}>Create tag</button>
          </div>
        </div>
      )}
    </div>
  )
}

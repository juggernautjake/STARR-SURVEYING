import { useRef } from 'react'
import { useChar } from '../state/store'
import type { Character } from '../types'

export default function Hero() {
  const { char, setChar, editMode, setEditMode, tempMode, setTempMode, clearAllOverrides, reset, importChar } = useChar()
  const fileRef = useRef<HTMLInputElement>(null)
  const tempCount = Object.keys(char.tempOverrides ?? {}).length

  function exportJson() {
    const blob = new Blob([JSON.stringify(char, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${char.meta.name.replace(/\s+/g, '-').toLowerCase()}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  function onImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result)) as Character
        if (parsed?.meta && parsed?.abilities) importChar(parsed)
        else alert('That file does not look like a character export.')
      } catch {
        alert('Could not read that JSON file.')
      }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  const toggleInspiration = () =>
    setChar((c) => ({ ...c, inspiration: !c.inspiration }))

  return (
    <div className="hero">
      <div className="hero-top">
        <div>
          <p className="kicker">{char.meta.kicker}</p>
          {editMode ? (
            <input
              className="mono"
              style={{ fontSize: 26, width: 'min(420px, 80vw)' }}
              value={char.meta.name}
              onChange={(e) => setChar((c) => ({ ...c, meta: { ...c.meta, name: e.target.value } }))}
            />
          ) : (
            <h1 className="name">{renderName(char.meta.name)}</h1>
          )}
        </div>
        <div className="btn-row" style={{ justifyContent: 'flex-end' }}>
          <button
            className={`btn gold ${char.inspiration ? 'active' : ''}`}
            onClick={toggleInspiration}
            title="Heroic Inspiration — reroll any d20"
          >
            {char.inspiration ? '✦ INSPIRED' : '✧ Inspiration'}
          </button>
          <button
            className={`btn ${tempMode ? 'active' : ''}`}
            onClick={() => setTempMode(!tempMode)}
            title="Temp mode: number edits become reversible (a ⟲ appears next to changed values)"
          >
            {tempMode ? '⏲ TEMP ON' : '⏲ Temp'}
          </button>
          {tempCount > 0 && (
            <button className="btn danger" onClick={clearAllOverrides} title="Revert every temporary change to its original value">
              ⟲ Revert {tempCount}
            </button>
          )}
          <button className={`btn ${editMode ? 'active' : ''}`} onClick={() => setEditMode(!editMode)}>
            {editMode ? '✓ Done' : '✎ Edit'}
          </button>
        </div>
      </div>

      <p className="role">
        {char.meta.species} · {char.meta.className} {char.meta.level} · {char.meta.subclass}
      </p>

      <div className="tagchips">
        {char.meta.chips.map((c, i) => (
          <span key={i} className={`chip ${c.tone ?? ''}`}>
            {c.text}
          </span>
        ))}
      </div>

      <div className="btn-row" style={{ marginTop: 16 }}>
        <button className="btn tiny teal" onClick={exportJson}>
          ⬇ Export
        </button>
        <button className="btn tiny" onClick={() => fileRef.current?.click()}>
          ⬆ Import
        </button>
        <button
          className="btn tiny danger"
          onClick={() => {
            if (confirm('Reset Lazzuh to the original build? This wipes your saved changes.')) reset()
          }}
        >
          ⟲ Reset
        </button>
        <input ref={fileRef} type="file" accept="application/json" className="hidden" onChange={onImport} />
      </div>
    </div>
  )
}

function renderName(name: string) {
  // put a break between first and last word for the big stacked look
  const parts = name.trim().split(/\s+/)
  if (parts.length < 2) return name
  const last = parts.pop()
  return (
    <>
      {parts.join(' ')}
      <br />
      {last}
    </>
  )
}

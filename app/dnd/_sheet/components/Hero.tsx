import { useEffect, useRef } from 'react'
import { useChar } from '../state/store'
import { useSheetSystem } from '../state/sheetConfig'
import { SYSTEM_AMBIGUOUS, systemLabel } from '@/lib/dnd/systems'
import type { Character } from '../types'
import EffectStar from './ui/EffectStar'

export default function Hero() {
  const { char, setChar, editMode, setEditMode, tempMode, setTempMode, clearAllOverrides, reset, importChar, isDM, ledger } = useChar()
  const system = useSheetSystem()
  const systemName = systemLabel(system)
  const fileRef = useRef<HTMLInputElement>(null)
  const nameRef = useRef<HTMLHeadingElement>(null)

  // Identity OVERLAY (Slice 11): an effect can impose a different name/species/class while active —
  // a pendant that makes you "Zul the Barbarian". Like every effect it's an overlay: the DISPLAY
  // shows the imposed value, editing still writes the base (char.meta.*), and dropping the source
  // gives you back exactly who you were. Base stands when nothing imposes an identity.
  const displayName = ledger.identity('name')?.value ?? char.meta.name
  const displaySpecies = ledger.identity('species')?.value ?? char.meta.species
  const displayClass = ledger.identity('class')?.value ?? char.meta.className
  const displaySubclass = ledger.identity('subclass')?.value ?? char.meta.subclass

  // Shrink the display name to fit its column on one line rather than overflow — so
  // a long single-word handle (e.g. the streamer's username) or a big name in the
  // narrower portrait column never spills. Only shrinks when it would overflow;
  // re-runs on resize, name change, and once web fonts finish loading.
  useEffect(() => {
    const el = nameRef.current
    const parent = el?.parentElement
    if (!el || !parent) return
    const singleWord = !/\s/.test(displayName.trim())
    const fit = () => {
      el.style.whiteSpace = singleWord ? 'nowrap' : ''
      el.style.fontSize = ''
      let size = parseFloat(getComputedStyle(el).fontSize) || 40
      let guard = 0
      while (el.scrollWidth > parent.clientWidth + 1 && size > 12 && guard++ < 90) {
        size -= 1
        el.style.fontSize = `${size}px`
      }
    }
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(parent)
    // Re-fit after the display font loads (metrics change once it swaps in).
    ;(document as Document & { fonts?: { ready: Promise<unknown> } }).fonts?.ready.then(fit).catch(() => {})
    return () => ro.disconnect()
    // Re-fit on the DISPLAYED name (which an identity effect may change), not just the base.
  }, [displayName])
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
            <h1 className="name" ref={nameRef}>
              {renderName(displayName)}
              {ledger.isModified('name') && (
                <EffectStar target="name" label="Name" />
              )}
            </h1>
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
          {/* Temp-stat control is a DM tool: only the DM can toggle Temp mode or revert
              temporary changes. Players (incl. the streamer, Susie) don't get it. */}
          {isDM && (
            <button
              className={`btn ${tempMode ? 'active' : ''}`}
              onClick={() => setTempMode(!tempMode)}
              title="Temp mode: number edits become reversible (a ⟲ appears next to changed values)"
            >
              {tempMode ? '⏲ TEMP ON' : '⏲ Temp'}
            </button>
          )}
          {isDM && tempCount > 0 && (
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
        <EffectStar target="species" label="Species">{displaySpecies}</EffectStar> ·{' '}
        <EffectStar target="class" label="Class">{displayClass}</EffectStar> {char.meta.level} ·{' '}
        <EffectStar target="subclass" label="Subclass">{displaySubclass}</EffectStar>
      </p>

      <div className="tagchips">
        {/* The system designation (Slice 21). You could not previously tell what GAME a sheet was
            for by looking at it — and the system is what decides which rulebook the AI adjudicates
            with and which glossary its terms link to, so it belongs on the face of the sheet.
            Homebrew does not weaken it: a sheet is "D&D 5e (2024)" AND customized. The system says
            which rules apply; provenance says which parts are house-ruled. */}
        {system !== SYSTEM_AMBIGUOUS && (
          <span className="chip system-chip" title={`This sheet is adjudicated with ${systemName} rules. Homebrew content on it is still this character's own.`}>
            {systemName}
          </span>
        )}
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
            if (confirm(`Reset ${char.meta.name} to the original build? This wipes your saved changes.`)) reset()
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

'use client'
// SpellPicker — add a spell to the sheet FROM THE RULES LIBRARY.
//
// The 2024 catalog (lib/dnd/spells) was reachable by the AI but not by the player: adding a
// spell still meant hand-typing its level, school, casting time, range, components and
// duration, which is both tedious and how a sheet ends up with a Fireball that has the wrong
// range. This picker searches the catalog and drops in a fully-populated spell (owner
// 2026-07-19). Hand-authoring is untouched — the editor is still there for homebrew.
//
// Scoped to the sheet's own system through `spellsForSystem`, so a 2014 or PF2 sheet gets an
// empty catalog and an honest message rather than another edition's numbers.
import { useMemo, useState } from 'react'
import { useChar } from '../../state/store'
import { useSheetSystem } from '../../state/sheetConfig'
import { spellsForSystem, spellCatalog, type SpellDef, type SpellClass } from '@/lib/dnd/spells'
import type { Spell, SpellLevel } from '../../types'

/** Turn a catalog entry into a sheet spell. The catalog holds the MECHANICS; the sheet copy is
 *  the player's own (they can then edit it freely without touching the library). */
export function spellFromCatalog(def: SpellDef, existingCount: number): Spell {
  return {
    id: `${def.key}-${existingCount}`,
    name: def.name,
    level: def.level as SpellLevel,
    school: def.school,
    castTime: def.castTime,
    range: def.range,
    components: def.components + (def.material ? ` (${def.material})` : ''),
    duration: def.duration,
    concentration: def.concentration,
    ritual: def.ritual,
    description: def.summary,
    higher: def.higher,
    prepared: false,
    // Structured resolution — this is what lets the sheet ROLL the spell rather than only
    // display it. The attack bonus and save DC are NOT copied: the sheet derives those from
    // the character (proficiency + spellcasting ability, ledger-overlaid), so a catalogued
    // spell automatically uses whoever is holding it.
    attack: def.attack,
    save: def.save,
    damage: def.damage,
    heal: def.heal,
  }
}

export default function SpellPicker({ onClose }: { onClose: () => void }) {
  const { char, setChar, isDM } = useChar()
  const system = useSheetSystem()
  const [q, setQ] = useState('')
  const [level, setLevel] = useState<number | 'all'>('all')

  const catalog = useMemo(() => spellsForSystem(system), [system])
  const status = useMemo(() => spellCatalog(system), [system])
  // Names already on the sheet — so the list can mark them rather than silently adding a second copy.
  const have = useMemo(
    () => new Set((char.spells ?? []).map((s) => s.name.trim().toLowerCase())),
    [char.spells],
  )

  // The character's class, matched against the catalog's class lists. Defaults the picker to
  // spells this character can actually learn, which is the difference between a usable list
  // and 357 undifferentiated rows.
  const charClass = useMemo(() => {
    const raw = (char.meta.className ?? '').trim().toLowerCase()
    return (['Bard', 'Cleric', 'Druid', 'Paladin', 'Ranger', 'Sorcerer', 'Warlock', 'Wizard'] as SpellClass[])
      .find((c) => c.toLowerCase() === raw) ?? null
  }, [char.meta.className])
  const [onlyMyClass, setOnlyMyClass] = useState(true)

  // The highest spell level this character can currently cast, from their own slot table.
  // Spells above it are still ADDABLE — a subclass, a feat, a scroll or the DM can legitimately
  // grant something off-curve — but they are flagged so nobody adds a 9th-level spell to a
  // 3rd-level caster by accident.
  const maxCastable = useMemo(() => {
    const slots = char.spellcasting?.slots ?? {}
    const levels = Object.entries(slots)
      .filter(([, v]) => (v?.max ?? 0) > 0)
      .map(([k]) => Number(k))
    return levels.length ? Math.max(...levels) : 0
  }, [char.spellcasting])

  const results = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return catalog
      .filter((s) => (level === 'all' || s.level === level))
      .filter((s) => !onlyMyClass || !charClass || s.classes.includes(charClass))
      .filter((s) => !needle || s.name.toLowerCase().includes(needle) || s.school.toLowerCase().includes(needle))
      .slice(0, 80)
  }, [catalog, q, level, onlyMyClass, charClass])

  const add = (def: SpellDef) => {
    setChar((c) => ({ ...c, spells: [...(c.spells ?? []), spellFromCatalog(def, (c.spells ?? []).length)] }))
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 100000, background: 'rgba(2,4,10,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: 'min(720px, 100%)', maxHeight: '86vh', display: 'flex', flexDirection: 'column', background: 'var(--panel)', border: '1px solid var(--line-strong)', borderRadius: 12, overflow: 'hidden' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderBottom: '1px solid var(--line)' }}>
          {/* The DM holds write access on a player's sheet, so this same picker is how they hand
              out a spell — the wording just says so, rather than leaving them to guess. */}
          <strong style={{ flex: 1 }}>
            {isDM ? `Grant a spell to ${char.meta.name || 'this character'}` : 'Add a spell from the library'}
          </strong>
          <button className="btn tiny" onClick={onClose} aria-label="Close">✕</button>
        </div>
        {isDM && (
          <div style={{ padding: '6px 14px', fontSize: 11.5, color: 'var(--muted)', borderBottom: '1px solid var(--line)' }}>
            Anything you add lands on their sheet immediately — off-list and above-slot spells are
            allowed on purpose, so you can hand out something they could not normally learn.
          </div>
        )}

        {catalog.length === 0 ? (
          // Honest empty state: this system has no catalogued spells, which is NOT the same as
          // "this system has no spells". Never show another edition's list here.
          <div style={{ padding: 20, color: 'var(--muted)', fontSize: 14 }}>
            No spell library for this game system yet. You can still add a spell by hand with the
            spell editor.
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', gap: 8, padding: '10px 14px', borderBottom: '1px solid var(--line)', flexWrap: 'wrap' }}>
              <input
                autoFocus value={q} onChange={(e) => setQ(e.target.value)}
                placeholder="Search by name or school…"
                style={{ flex: 1, minWidth: 180, padding: '6px 10px', fontSize: 13, background: 'var(--panel-2)', border: '1px solid var(--line)', borderRadius: 8, color: 'inherit' }}
              />
              <select
                value={String(level)} onChange={(e) => setLevel(e.target.value === 'all' ? 'all' : Number(e.target.value))}
                aria-label="Filter by level"
                style={{ padding: '6px 8px', fontSize: 13, background: 'var(--panel-2)', border: '1px solid var(--line)', borderRadius: 8, color: 'inherit' }}
              >
                <option value="all">All levels</option>
                <option value="0">Cantrips</option>
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((l) => <option key={l} value={l}>Level {l}</option>)}
              </select>
              {charClass && (
                <label className="flex" style={{ gap: 6, alignItems: 'center', fontSize: 12.5, color: 'var(--ink)' }}>
                  <input type="checkbox" checked={onlyMyClass} onChange={(e) => setOnlyMyClass(e.target.checked)} />
                  {charClass} list only
                </label>
              )}
            </div>

            <div style={{ overflowY: 'auto', padding: '8px 14px 14px' }}>
              {results.length === 0 && (
                <p style={{ color: 'var(--muted)', fontSize: 13, margin: '12px 0' }}>
                  Nothing matches. The library holds the commonly-played spells — if yours isn’t here yet,
                  add it by hand and it will work exactly the same.
                </p>
              )}
              {results.map((s) => {
                const already = have.has(s.name.toLowerCase())
                const offList = !!charClass && !s.classes.includes(charClass)
                const tooHigh = s.level > 0 && maxCastable > 0 && s.level > maxCastable
                return (
                  <div key={s.key} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '8px 0', borderBottom: '1px solid var(--line)' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 13.5 }}>
                        {s.name}{' '}
                        <span style={{ fontWeight: 400, color: 'var(--muted)', fontSize: 12 }}>
                          {s.level === 0 ? 'cantrip' : `level ${s.level}`} · {s.school}
                          {s.concentration ? ' · concentration' : ''}{s.ritual ? ' · ritual' : ''}
                        </span>
                        {/* Warnings, not blocks: a subclass, feat, scroll or the DM can all
                            legitimately hand you something off your list or above your level. */}
                        {offList && (
                          <span className="tag" style={{ marginLeft: 6, color: '#e0a020' }} title={`Not on the ${charClass} spell list`}>off-list</span>
                        )}
                        {tooHigh && (
                          <span className="tag" style={{ marginLeft: 6, color: '#e0a020' }} title={`You have no level-${s.level} slots yet (highest: ${maxCastable})`}>above your slots</span>
                        )}
                      </div>
                      <div style={{ fontSize: 11.5, color: 'var(--muted)', margin: '1px 0 3px' }}>
                        {s.castTime} · {s.range} · {s.components} · {s.duration}
                      </div>
                      <div style={{ fontSize: 12.5 }}>{s.summary}</div>
                    </div>
                    <button
                      className={`btn tiny ${already ? '' : 'solid'}`} onClick={() => add(s)}
                      title={already ? `${s.name} is already on this sheet — adding again makes a second copy` : `Add ${s.name}`}
                    >
                      {already ? '＋ again' : '＋ Add'}
                    </button>
                  </div>
                )
              })}
            </div>

            {/* The catalog knows it is partial; say so here rather than letting a missing spell
                read as "this spell does not exist". */}
            {!status.complete && (
              <div style={{ padding: '8px 14px', borderTop: '1px solid var(--line)', fontSize: 11.5, color: 'var(--muted)' }}>
                {catalog.length} spells catalogued so far — not the full list yet. Anything missing can be added by hand.
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

import { useEffect, useState } from 'react'
import { useChar } from '../state/store'
import { md } from '../lib/inline'
import SectionHead from './ui/SectionHead'
import type { ProgressionRow } from '../types'

/** The class-data table + its two bespoke column labels, from /levels (Slice 7). */
interface ClassTable { progression: ProgressionRow[]; progressionColumns?: { col3Label: string; col4Label: string } }

export default function Progression() {
  const { char, characterId } = useChar()
  // Prefer the class-DATA table (progressionRows on the server) over the hand-authored per-character
  // array, so any class — official or homebrew — gets a correct 1→20 table. Falls back to the stored
  // `char.progression` when the character has no class the rulebook knows (custom/ambiguous sheets).
  const [table, setTable] = useState<ClassTable | null>(null)
  useEffect(() => {
    if (!characterId) return
    let cancelled = false
    fetch(`/api/dnd/characters/${characterId}/levels`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (!cancelled && j && Array.isArray(j.progression) && j.progression.length) setTable({ progression: j.progression, progressionColumns: j.progressionColumns }) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [characterId])

  const meta = char.progressionMeta
  const rows: ProgressionRow[] = table?.progression ?? char.progression ?? []
  if (rows.length === 0) return null

  const col3Label = table?.progressionColumns?.col3Label ?? meta?.col3 ?? '—'
  const col4Label = table?.progressionColumns?.col4Label ?? meta?.col4 ?? '—'
  const title = table ? `Progression · Levels 1–${rows.length}` : (meta?.title ?? 'Progression · Levels 1–7')

  return (
    <section id="progression">
      <SectionHead num="11" title={title} />
      <p className="lead">{meta?.lead ?? `Everything ${char.meta.name} gains as levels rise. The highlighted row is your current level; rows above it are still ahead.`}</p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Lvl</th>
              <th>Prof</th>
              <th>{col3Label}</th>
              <th>{col4Label}</th>
              <th>Features Gained</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const here = r.level === char.meta.level
              return (
                <tr key={r.level} className={here ? 'here' : undefined} style={{ opacity: r.level > char.meta.level ? 0.6 : 1 }}>
                  <td className="mono">{r.level}</td>
                  <td className="mono">{r.prof}</td>
                  <td className="mono">{r.col3}</td>
                  <td className="mono">{r.col4}</td>
                  <td>
                    {md(r.features)}
                    {here && <span style={{ color: 'var(--hotpink)', fontFamily: 'var(--font-mono)', fontSize: 12 }}> ← YOU ARE HERE</span>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}

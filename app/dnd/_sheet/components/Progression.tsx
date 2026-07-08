import { useChar } from '../state/store'
import { md } from '../lib/inline'
import SectionHead from './ui/SectionHead'

export default function Progression() {
  const { char } = useChar()
  // Hide entirely when the character has no progression rows (keeps non-barbarian
  // sheets from showing an empty, Lazzuh-flavored table).
  if (!char.progression || char.progression.length === 0) return null
  const meta = char.progressionMeta
  return (
    <section id="progression">
      <SectionHead num="11" title={meta?.title ?? 'Progression · Levels 1–7'} />
      <p className="lead">{meta?.lead ?? 'Everything Lazzuh gains from level 1 through 7. The highlighted row is your current level; rows above it are still ahead.'}</p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Lvl</th>
              <th>Prof</th>
              <th>{meta?.col3 ?? 'Rages'}</th>
              <th>{meta?.col4 ?? 'Rage Dmg'}</th>
              <th>Features Gained</th>
            </tr>
          </thead>
          <tbody>
            {char.progression.map((r) => {
              const here = r.level === char.meta.level
              return (
                <tr key={r.level} className={here ? 'here' : undefined} style={{ opacity: r.level > char.meta.level ? 0.6 : 1 }}>
                  <td className="mono">{r.level}</td>
                  <td className="mono">{r.prof}</td>
                  <td className="mono">{r.rages}</td>
                  <td className="mono">{r.rageDmg}</td>
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

import { useChar } from '../state/store'
import SectionHead from './ui/SectionHead'

export default function Resources() {
  const { char, setResource } = useChar()

  return (
    <section id="resources">
      <SectionHead num="06" title="Resources & Uses" />
      <p className="lead">Click a pip to spend or restore. These refresh on the matching rest (see Vitals for the Rest buttons).</p>
      <div className="card">
        {char.resources.filter((r) => (r.unlockLevel ?? 1) <= char.meta.level).map((r) => (
          <div className="res-block" key={r.id}>
            <div className="res-head">
              <span className="rn">{r.name}</span>
              <span className="rc">
                {r.current}/{r.max} · resets on {r.resetOn} rest
              </span>
            </div>
            <div className="pips">
              {Array.from({ length: r.max }).map((_, i) => {
                const filled = i < r.current
                return (
                  <button
                    key={i}
                    className={`pip ${r.color} ${filled ? 'filled' : ''}`}
                    title={filled ? 'Spend' : 'Restore'}
                    onClick={() => setResource(r.id, filled ? i : i + 1)}
                  />
                )
              })}
            </div>
            {r.note && <p className="muted" style={{ fontSize: 14, margin: '8px 0 0' }}>{r.note}</p>}
          </div>
        ))}
      </div>
    </section>
  )
}

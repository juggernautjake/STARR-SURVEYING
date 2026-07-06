import { useChar } from '../state/store'
import { md } from '../lib/inline'
import SectionHead from './ui/SectionHead'

const SOURCE_TONE: Record<string, string> = {
  Signature: 'pink',
  Species: 'teal',
  Subclass: 'gold',
}

function sourceColor(source: string) {
  const t = SOURCE_TONE[source]
  return t === 'pink' ? 'var(--pink)' : t === 'teal' ? 'var(--tealbright)' : t === 'gold' ? 'var(--gold)' : 'var(--muted)'
}

export default function Features() {
  const { char } = useChar()
  const level = char.meta.level

  const sorted = [...char.features].sort((a, b) => (a.unlockLevel ?? 1) - (b.unlockLevel ?? 1))

  return (
    <section id="features">
      <SectionHead num="08" title="Features, Traits & Powers" />
      <p className="lead">
        The signature powers that make him <em className="term">him</em>, plus the Barbarian chassis and Jenovan biology.
        Anything above your current level (<strong>{level}</strong>) is <span className="rage-only">locked</span> until you
        level up.
      </p>
      {sorted.map((f) => {
        const req = f.unlockLevel ?? 1
        const locked = req > level
        if (locked) {
          return (
            <div className="card feature-locked" key={f.id}>
              <h3>
                <span className="lock-badge">🔒 Lv {req}</span>
                {f.name}
                <span className="tag" style={{ marginLeft: 'auto', color: sourceColor(f.source) }}>
                  {f.source}
                </span>
              </h3>
              <p className="muted" style={{ margin: 0 }}>
                Unlocks at <strong>Level {req}</strong>. Level up to reveal this feature.
              </p>
            </div>
          )
        }
        return (
          <div className="card" key={f.id}>
            <h3>
              {f.level && <span className="lvl">{f.level}</span>}
              {f.name}
              <span className="tag" style={{ marginLeft: 'auto', color: sourceColor(f.source) }}>
                {f.source}
              </span>
            </h3>
            {f.body.map((p, i) => (
              <p key={i}>{md(p)}</p>
            ))}
            {f.flavor && (
              <p className="muted" style={{ fontStyle: 'italic', fontSize: 15 }}>
                {f.flavor}
              </p>
            )}
          </div>
        )
      })}
    </section>
  )
}

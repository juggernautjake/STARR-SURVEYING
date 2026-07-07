import { useChar } from '../state/store'
import { md } from '../lib/inline'
import SectionHead from './ui/SectionHead'

export default function Balance() {
  const { char } = useChar()
  return (
    <section id="balance">
      <SectionHead num="10" title="Class Balance — Synergies & Weaknesses" />
      <p className="lead">
        A good class, but a fair one. The <em className="term">Rage economy</em> is the balancing lever: almost every
        strong option spends the same limited pool, so power comes with real trade-offs.
      </p>
      <div className="two">
        <div className="card callout" style={{ borderLeftColor: 'var(--good)', background: 'rgba(74,222,128,0.06)' }}>
          <h3 style={{ color: 'var(--good)' }}>Synergies</h3>
          <ul className="clean">
            {char.balance.synergies.map((s, i) => (
              <li key={i}>{md(s)}</li>
            ))}
          </ul>
        </div>
        <div className="card callout" style={{ borderLeftColor: 'var(--danger)', background: 'rgba(255,82,82,0.06)' }}>
          <h3 style={{ color: 'var(--danger)' }}>Weaknesses</h3>
          <ul className="clean">
            {char.balance.weaknesses.map((w, i) => (
              <li key={i}>{md(w)}</li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  )
}

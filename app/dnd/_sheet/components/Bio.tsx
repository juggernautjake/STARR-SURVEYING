import { useChar } from '../state/store'
import { md } from '../lib/inline'
import SectionHead from './ui/SectionHead'

export default function Bio() {
  const { char } = useChar()
  const { bio } = char

  return (
    <section id="story">
      <SectionHead num="13" title="Story & Roleplay" />
      <div className="card">
        <h3>Who Is {char.meta.name}?</h3>
        {bio.intro.map((p, i) => (
          <p key={i}>{md(p)}</p>
        ))}
      </div>

      <div className="two">
        <div className="card">
          <h3>Appearance</h3>
          <ul className="clean">
            {bio.appearance.map((b, i) => (
              <li key={i}>{md(b)}</li>
            ))}
          </ul>
        </div>
        <div className="card">
          <h3>Personality &amp; Hooks</h3>
          <ul className="clean">
            {bio.personality.map((b, i) => (
              <li key={i}>{md(b)}</li>
            ))}
          </ul>
        </div>
      </div>

      <div className="two">
        <div className="card">
          <h3>Background</h3>
          <p>{md(bio.background)}</p>
        </div>
        <div className="card">
          <h3>Playing {char.meta.name.split(' ')[0]}</h3>
          <ul className="clean">
            {bio.playTips.map((b, i) => (
              <li key={i}>{md(b)}</li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  )
}

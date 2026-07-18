import { useChar } from '../state/store'
import { md } from '../lib/inline'
import SectionHead from './ui/SectionHead'

export default function Forms() {
  const { char, setChar, activeFormId } = useChar()
  const level = char.meta.level
  const setActive = (id: string) => setChar((c) => ({ ...c, activeFormId: id }))

  // The newest unlocked non-Base form is "Surged" (Rage-gated); older unlocked
  // forms (and Base) are "Held" (at-will). At level 20 (Perfected Rampager) every
  // form becomes Held. Forms above your level are Locked.
  const unlockedNonBase = char.forms.filter((f) => f.id !== 'base' && f.unlockLevel <= level)
  const surgedId = level >= 20 ? null : unlockedNonBase.length ? unlockedNonBase[unlockedNonBase.length - 1].id : null

  const gatingOf = (id: string, unlocked: boolean): 'locked' | 'surged' | 'held' => {
    if (!unlocked) return 'locked'
    return id === surgedId ? 'surged' : 'held'
  }

  const unlockedForms = char.forms.filter((f) => f.unlockLevel <= level)
  const heldTop = [...unlockedForms].reverse().find((f) => gatingOf(f.id, true) === 'held')

  return (
    <section id="forms">
      <SectionHead num="07" title="The Form Ladder — Rampager" optionsTip="How a form changes your ability scores is set by the shape-shift preference (full / partial / none)" />
      <p className="lead">
        Your <strong>newest</strong> form is Rage-gated (<span className="badge timed">Surged</span>); every{' '}
        <strong>older</strong> form is at-will (<span className="badge at-will">Held</span>).
        {level >= 20 ? (
          <> At level 20, <em className="term">Perfected Rampager</em> makes every form Held.</>
        ) : (
          <> At level {level}, your Held forms go up to <strong>{heldTop ? heldTop.name.split('—')[0].trim() : 'Base'}</strong>.</>
        )}{' '}
        Set your active form — attacks that need a form unlock when it&apos;s active.
      </p>

      {char.forms.map((f) => {
        const unlocked = f.unlockLevel <= level
        const gating = gatingOf(f.id, unlocked)
        const active = activeFormId === f.id
        return (
          <div key={f.id} className={`form ${f.cls} ${active ? 'activeform' : ''} ${unlocked ? '' : 'locked'}`}>
            <div className="form-bar" />
            <div className="form-body">
              <div className="form-top">
                <h3 className="form-name">{f.name}</h3>
                <div className="form-meta">
                  {gating === 'held' && <span className="badge at-will">Held</span>}
                  {gating === 'surged' && <span className="badge timed">Surged</span>}
                  {gating === 'locked' && <span className="badge lv">🔒 Lv {f.unlockLevel}</span>}
                  {active && <span className="badge now">Active</span>}
                  {unlocked && !active && (
                    <button className="btn tiny" onClick={() => setActive(f.id)}>
                      Set Active
                    </button>
                  )}
                </div>
              </div>
              <p className="form-flavor">{f.flavor}</p>
              <ul className="clean">
                {f.bullets.map((b, i) => (
                  <li key={i}>{md(b)}</li>
                ))}
              </ul>
              {f.note && (
                <div className="callout" style={{ margin: '12px 0 0' }}>
                  <h4>{f.note.title}</h4>
                  <p>{md(f.note.body)}</p>
                </div>
              )}
            </div>
          </div>
        )
      })}
    </section>
  )
}

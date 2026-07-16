import { useState } from 'react'
import { useChar } from '../state/store'
import { md } from '../lib/inline'
import { RichRules } from './RuleTip'
import SectionHead from './ui/SectionHead'
import ElementMenu from './ui/ElementMenu'
import EditMark from './ui/EditMark'
import FeatureEditor from './ui/FeatureEditor'
import type { FeatureBlock } from '../types'

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
  const { char, activateFeature, canWrite, setChar, ledger } = useChar()
  const [editing, setEditing] = useState<FeatureBlock | null>(null)
  const level = char.meta.level

  // Features GRANTED by an active effect (Slice 11 grant-half): the pendant that gives you a
  // Barbarian feature from another class entirely. Rendered read-only and badged with the item they
  // came from — they're on loan, so there's no ⋯ menu, and they vanish when the source comes off.
  // The mechanics (if any) live in the item's other effects; this is the human-readable card.
  const grantedFeatures = ledger
    .explain('grant_feature')
    .filter((c) => !c.suppressed && typeof c.effect.value === 'string' && c.effect.value.trim())
    .map((c) => ({ name: String(c.effect.value), source: c.source, sourceId: c.sourceId }))

  const duplicate = (f: FeatureBlock) =>
    setChar((c) => ({
      ...c,
      features: [...(c.features ?? []), { ...f, id: `${f.id}-copy-${(c.features ?? []).length}`, name: `${f.name} (copy)` }],
    }))
  const remove = (f: FeatureBlock) => {
    if (!confirm(`Delete “${f.name}”? This cannot be undone.`)) return
    setChar((c) => ({ ...c, features: (c.features ?? []).filter((x) => x.id !== f.id) }))
  }
  const resourceLeft = (id?: string) => (id ? (char.resources.find((r) => r.id === id)?.current ?? 0) : 1)

  const sorted = [...char.features].sort((a, b) => (a.unlockLevel ?? 1) - (b.unlockLevel ?? 1))

  return (
    <section id="features">
      <SectionHead num="08" title="Features, Traits & Powers" />
      <p className="lead">
        The signature powers that make him <em className="term">him</em>, plus the Barbarian chassis and Jenovan biology.
        Anything above your current level (<strong>{level}</strong>) is <span className="hl-note">locked</span> until you
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
              {f.image && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={f.image} alt="" className="inv-thumb" />
              )}
              {f.name}
              <EditMark on={f.customized} />
              {canWrite && (
                <ElementMenu
                  label={f.name}
                  actions={[
                    { label: 'Edit feature', onClick: () => setEditing(f) },
                    { label: 'Duplicate', onClick: () => duplicate(f) },
                    { label: 'Delete', danger: true, onClick: () => remove(f) },
                  ]}
                />
              )}
              <span className="tag" style={{ marginLeft: 'auto', color: sourceColor(f.source) }}>
                {f.source}
              </span>
            </h3>
            {/* Auto-links every rule named in the body to THIS system's glossary article. */}
            {f.body.map((p, i) => (
              <p key={i}><RichRules text={p} /></p>
            ))}
            {f.flavor && (
              <p className="muted" style={{ fontStyle: 'italic', fontSize: 15 }}>
                {f.flavor}
              </p>
            )}
            {f.use && (
              <button
                className="btn tiny solid"
                style={{ marginTop: 4 }}
                disabled={!!f.use.resourceId && resourceLeft(f.use.resourceId) <= 0}
                onClick={() => activateFeature(f)}
                title={f.use.resourceId ? `Uses 1 — ${resourceLeft(f.use.resourceId)} left` : 'Use this feature'}
              >
                ✦ {f.use.label}{f.use.resourceId ? ` (${resourceLeft(f.use.resourceId)})` : ''}
              </button>
            )}
          </div>
        )
      })}

      {grantedFeatures.map((g, i) => (
        <div className="card" key={`granted-${g.sourceId ?? i}-${i}`} style={{ borderColor: 'var(--tealbright)' }}>
          <h3>
            {g.name}
            <span className="tag" style={{ marginLeft: 'auto', color: 'var(--tealbright)' }}>
              granted
            </span>
          </h3>
          <p className="muted" style={{ margin: 0 }}>
            Granted by <strong>{g.source}</strong> — active while equipped. Its mechanics apply through the item&apos;s own effects.
          </p>
        </div>
      ))}

      {canWrite && (
        <div className="btn-row" style={{ marginTop: 10 }}>
          <button
            className="btn tiny teal"
            onClick={() => {
              const f: FeatureBlock = {
                id: `feat-${Date.now().toString(36)}`,
                name: 'New feature',
                source: 'Homebrew',
                body: [''],
                unlockLevel: level,
              }
              setChar((c) => ({ ...c, features: [...(c.features ?? []), f] }))
              setEditing(f)
            }}
          >
            ＋ Add feature
          </button>
        </div>
      )}

      {editing && <FeatureEditor feature={editing} onClose={() => setEditing(null)} />}
    </section>
  )
}

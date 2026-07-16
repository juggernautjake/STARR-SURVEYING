import { useState } from 'react'
import { useChar } from '../state/store'
import { isItemActive } from '@/lib/dnd/effects/ledger'
import type { Resource } from '../types'
import SectionHead from './ui/SectionHead'
import ElementMenu from './ui/ElementMenu'
import ResourceEditor from './ui/ResourceEditor'

export default function Resources() {
  const { char, setResource, canWrite, setChar } = useChar()
  const [editing, setEditing] = useState<Resource | null>(null)

  // Usage pools GRANTED by an equipped item (Slice 11 grant-half). Read-only and badged to the
  // item — on loan, so no ⋯ menu and no editing; gone when the item comes off. The mechanics of a
  // resource are stateful (spend + rest-reset), so this shows the pool without in-panel spend.
  const grantedResources = (char.inventory ?? [])
    .filter((i) => isItemActive(i) && i.grantsResource)
    .map((i) => ({ res: i.grantsResource as Resource, source: i.name }))

  const duplicate = (r: Resource) =>
    setChar((c) => ({ ...c, resources: [...(c.resources ?? []), { ...r, id: `${r.id}-copy-${(c.resources ?? []).length}`, name: `${r.name} (copy)` }] }))
  const remove = (r: Resource) => {
    if (!confirm(`Delete “${r.name}”? This cannot be undone.`)) return
    setChar((c) => ({ ...c, resources: (c.resources ?? []).filter((x) => x.id !== r.id) }))
  }

  return (
    <section id="resources">
      <SectionHead num="06" title="Resources & Uses" />
      <p className="lead">Click a pip to spend or restore. These refresh on the matching rest (see Vitals for the Rest buttons).</p>
      <div className="card">
        {char.resources.filter((r) => (r.unlockLevel ?? 1) <= char.meta.level).map((r) => (
          <div className="res-block" key={r.id}>
            <div className="res-head">
              <span className="rn">
                {r.name}
                {canWrite && (
                  <ElementMenu
                    label={r.name}
                    actions={[
                      { label: 'Edit resource', onClick: () => setEditing(r) },
                      { label: 'Duplicate', onClick: () => duplicate(r) },
                      { label: 'Delete', danger: true, onClick: () => remove(r) },
                    ]}
                  />
                )}
              </span>
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

        {grantedResources.map(({ res, source }, gi) => (
          <div className="res-block" key={`granted-${source}-${res.id}-${gi}`} style={{ borderLeft: '2px solid var(--tealbright)', paddingLeft: 10 }}>
            <div className="res-head">
              <span className="rn">
                {res.name}
                <span className="tag" style={{ marginLeft: 8, color: 'var(--tealbright)' }}>granted</span>
              </span>
              <span className="rc">
                {res.current}/{res.max} · resets on {res.resetOn} rest
              </span>
            </div>
            {/* Static pips — this pool is on loan; it renders but isn't spent from here. */}
            <div className="pips">
              {Array.from({ length: res.max }).map((_, i) => (
                <span key={i} className={`pip ${res.color} ${i < res.current ? 'filled' : ''}`} aria-hidden />
              ))}
            </div>
            <p className="muted" style={{ fontSize: 14, margin: '8px 0 0' }}>
              Granted by <strong>{source}</strong>{res.note ? ` — ${res.note}` : ''}
            </p>
          </div>
        ))}

        {canWrite && (
          <div className="btn-row" style={{ marginTop: 10 }}>
            <button
              className="btn tiny teal"
              onClick={() => {
                const r: Resource = { id: `res-${Date.now().toString(36)}`, name: 'New resource', max: 3, current: 3, color: 'teal', resetOn: 'long' }
                setChar((c) => ({ ...c, resources: [...(c.resources ?? []), r] }))
                setEditing(r)
              }}
            >
              ＋ Add resource
            </button>
          </div>
        )}
      </div>

      {editing && <ResourceEditor resource={editing} onClose={() => setEditing(null)} />}
    </section>
  )
}

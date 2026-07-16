import { useState } from 'react'
import { useChar } from '../state/store'
import type { Resource } from '../types'
import SectionHead from './ui/SectionHead'
import ElementMenu from './ui/ElementMenu'
import ResourceEditor from './ui/ResourceEditor'

export default function Resources() {
  const { char, setResource, canWrite, setChar } = useChar()
  const [editing, setEditing] = useState<Resource | null>(null)

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

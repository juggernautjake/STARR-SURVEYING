'use client'
import { useState } from 'react'
import { useChar } from '../state/store'
import { md } from '../lib/inline'
import SectionHead from './ui/SectionHead'

// Story & Roleplay — the character's premade story sections (intro, appearance, personality,
// background, play tips). Each section has its own ✎ Edit button so the DM or the owning
// player can rewrite the text; edits save to char.bio and persist via the sheet autosave.

type StoryKind = 'paragraphs' | 'list' | 'text'

/** How a bio value serialises into a single editable textarea, and back. */
function toText(value: string | string[], kind: StoryKind): string {
  if (kind === 'text') return value as string
  return (value as string[]).join(kind === 'paragraphs' ? '\n\n' : '\n')
}
function fromText(text: string, kind: StoryKind): string | string[] {
  if (kind === 'text') return text
  const sep = kind === 'paragraphs' ? /\n{2,}/ : /\n+/
  return text.split(sep).map((s) => s.trim()).filter(Boolean)
}

function StoryCard({
  title, value, kind, canEdit, onSave,
}: {
  title: React.ReactNode
  value: string | string[]
  kind: StoryKind
  canEdit: boolean
  onSave: (v: string | string[]) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')

  const start = () => { setDraft(toText(value, kind)); setEditing(true) }
  const save = () => { onSave(fromText(draft, kind)); setEditing(false) }

  return (
    <div className="card">
      <div className="flex" style={{ justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <h3 style={{ margin: 0 }}>{title}</h3>
        {canEdit && !editing && (
          <button className="btn tiny" onClick={start} title="Edit this section">✎ Edit</button>
        )}
      </div>

      {editing ? (
        <div style={{ display: 'grid', gap: 8, marginTop: 8 }}>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={kind === 'text' ? 5 : 6}
            style={{ width: '100%', boxSizing: 'border-box', padding: '9px 11px', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--panel-2)', color: 'var(--ink)', fontFamily: 'var(--font-body)', fontSize: 14, resize: 'vertical' }}
          />
          <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>
            {kind === 'list' ? 'One bullet per line.' : kind === 'paragraphs' ? 'Separate paragraphs with a blank line.' : 'Markdown-lite: **bold**, *italics*.'}
          </div>
          <div className="btn-row">
            <button className="btn tiny solid" onClick={save}>Save</button>
            <button className="btn tiny" onClick={() => setEditing(false)}>Cancel</button>
          </div>
        </div>
      ) : kind === 'text' ? (
        <p style={{ marginTop: 8 }}>{md(value as string)}</p>
      ) : kind === 'paragraphs' ? (
        <div style={{ marginTop: 8 }}>{(value as string[]).map((p, i) => <p key={i}>{md(p)}</p>)}</div>
      ) : (
        <ul className="clean" style={{ marginTop: 8 }}>{(value as string[]).map((b, i) => <li key={i}>{md(b)}</li>)}</ul>
      )}
    </div>
  )
}

export default function Bio() {
  const { char, setChar, canWrite, ledger } = useChar()
  const { bio } = char
  const setBio = (patch: Partial<typeof bio>) => setChar((c) => ({ ...c, bio: { ...c.bio, ...patch } }))
  // Use the imposed name (Slice 11) in the card titles too, so a transformed character's story
  // reads as who they currently are — consistent with the Hero header. Base stands when nothing
  // imposes an identity.
  const displayName = ledger.identity('name')?.value ?? char.meta.name

  // Descriptive identity fields (Slice 11): the render home for gender/pronouns/profession. Each is
  // overlayable by an identity effect (a potion that changes your recorded profession), base stands
  // otherwise. Edit them by hand below (canWrite), or the AI sets them via set_meta.
  const detail = (field: 'gender' | 'pronouns' | 'profession') => ledger.identity(field)?.value ?? char.meta[field] ?? ''
  const details: { key: 'gender' | 'pronouns' | 'profession'; label: string }[] = [
    { key: 'gender', label: 'Gender' },
    { key: 'pronouns', label: 'Pronouns' },
    { key: 'profession', label: 'Profession' },
  ]
  const setMeta = (k: 'gender' | 'pronouns' | 'profession', v: string) =>
    setChar((c) => ({ ...c, meta: { ...c.meta, [k]: v } }))

  return (
    <section id="story">
      <SectionHead num="13" title="Story & Roleplay" />

      {/* Details line — gender · pronouns · profession, each overlayable by an identity effect. */}
      {(details.some((d) => detail(d.key)) || canWrite) && (
        <div className="card" style={{ display: 'flex', gap: 18, flexWrap: 'wrap', marginBottom: 12 }}>
          {details.map((d) => (
            <div key={d.key}>
              <div style={{ fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--muted)' }}>{d.label}</div>
              {canWrite ? (
                <input
                  className="mono"
                  style={{ background: 'var(--panel-2)', border: '1px solid var(--line)', borderRadius: 6, padding: '4px 8px', color: 'var(--ink)', fontSize: 14, minWidth: 120 }}
                  value={char.meta[d.key] ?? ''}
                  placeholder="—"
                  onChange={(e) => setMeta(d.key, e.target.value)}
                />
              ) : (
                <div style={{ fontSize: 15, color: 'var(--ink)' }}>{detail(d.key) || '—'}</div>
              )}
            </div>
          ))}
        </div>
      )}

      <StoryCard title={`Who Is ${displayName}?`} value={bio.intro} kind="paragraphs" canEdit={canWrite} onSave={(v) => setBio({ intro: v as string[] })} />

      <div className="two">
        <StoryCard title="Appearance" value={bio.appearance} kind="list" canEdit={canWrite} onSave={(v) => setBio({ appearance: v as string[] })} />
        <StoryCard title="Personality & Hooks" value={bio.personality} kind="list" canEdit={canWrite} onSave={(v) => setBio({ personality: v as string[] })} />
      </div>

      <div className="two">
        <StoryCard title="Background" value={bio.background} kind="text" canEdit={canWrite} onSave={(v) => setBio({ background: v as string })} />
        <StoryCard title={`Playing ${displayName.split(' ')[0]}`} value={bio.playTips} kind="list" canEdit={canWrite} onSave={(v) => setBio({ playTips: v as string[] })} />
      </div>
    </section>
  )
}

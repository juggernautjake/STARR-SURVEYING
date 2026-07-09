'use client'
// CharacterBuildKit (Phase M6) — the owner/DM panel above a character sheet for feeding
// the character with materials and (re)building it with AI. Make a basic character, then
// keep adding source files, PDFs, screenshots, reference art, and comments here; when
// you're ready, "Build with AI" reads everything and fills out the sheet. Always available
// to whoever can edit the character (not just freshly-imported ones).
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import styles from './hextech.module.css'

const SOURCE_ACCEPT = '.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.md,.json,image/png,image/jpeg,image/webp'
const ART_ACCEPT = 'image/png,image/jpeg,image/webp,image/gif'

interface Upload { id: string; url: string; filename: string | null; mime: string | null; kind: string }

export default function CharacterBuildKit({ characterId, characterName, aiConfigured }: { characterId: string; characterName: string; aiConfigured: boolean }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [uploads, setUploads] = useState<Upload[]>([])
  const [styleNotes, setStyleNotes] = useState('')
  const [importNotes, setImportNotes] = useState<string | null>(null)
  const [comment, setComment] = useState('')
  const [sources, setSources] = useState<File[]>([])
  const [art, setArt] = useState<File[]>([])
  const [saving, setSaving] = useState(false)
  const [building, setBuilding] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [msgKind, setMsgKind] = useState<'ok' | 'error'>('ok')
  const sourceRef = useRef<HTMLInputElement>(null)
  const artRef = useRef<HTMLInputElement>(null)

  const load = () =>
    fetch(`/api/dnd/characters/${characterId}/uploads`)
      .then((r) => (r.ok ? r.json() : { uploads: [] }))
      .then((j) => {
        setUploads((j.uploads ?? []) as Upload[])
        setStyleNotes(j.styleNotes ?? '')
        setImportNotes(j.importNotes ?? null)
      })
      .catch(() => {})

  useEffect(() => { load() }, [characterId]) // eslint-disable-line react-hooks/exhaustive-deps

  const sourceUploads = uploads.filter((u) => u.kind === 'source')
  const artUploads = uploads.filter((u) => u.kind === 'art')
  const hasMaterials = uploads.length > 0 || !!styleNotes.trim()

  function flash(kind: 'ok' | 'error', text: string) { setMsgKind(kind); setMsg(text) }

  async function addMaterials() {
    if (saving) return
    if (!comment.trim() && sources.length === 0 && art.length === 0) { flash('error', 'Add a file, some art, or a comment first.'); return }
    setSaving(true); setMsg(null)
    try {
      const fd = new FormData()
      if (comment.trim()) fd.append('comment', comment.trim())
      sources.forEach((f) => fd.append('sources', f))
      art.forEach((f) => fd.append('art', f))
      const r = await fetch(`/api/dnd/characters/${characterId}/uploads`, { method: 'POST', body: fd })
      const j = await r.json().catch(() => ({}))
      if (r.ok) {
        setComment(''); setSources([]); setArt([])
        await load()
        flash('ok', 'Added! Add more, or hit “Build with AI” when you’re ready.')
      } else flash('error', j.error || 'Could not add those materials.')
    } catch { flash('error', 'Upload failed.') } finally { setSaving(false) }
  }

  async function removeUpload(id: string) {
    if (!window.confirm('Remove this material?')) return
    setUploads((u) => u.filter((x) => x.id !== id))
    await fetch(`/api/dnd/characters/${characterId}/uploads?uploadId=${encodeURIComponent(id)}`, { method: 'DELETE' }).catch(() => {})
  }

  async function build() {
    if (building) return
    if (!aiConfigured) { flash('error', 'AI isn’t configured on this server, so auto-build is unavailable. Your materials are saved for a manual build.'); return }
    if (!window.confirm(`Build ${characterName}'s sheet from all the materials above? This fills in stats/features from what you uploaded — you can still edit afterward.`)) return
    setBuilding(true); setMsg(null)
    try {
      const r = await fetch(`/api/dnd/characters/${characterId}/ingest`, { method: 'POST' })
      const j = await r.json().catch(() => ({}))
      if (r.ok) {
        const extra = Array.isArray(j.unmapped) && j.unmapped.length ? ` ${j.unmapped.length} note(s) couldn’t be auto-placed — see below.` : ''
        flash('ok', `Built! Applied ${j.editCount ?? 0} update(s) to the sheet.${extra}`)
        await load()
        router.refresh()
      } else flash('error', j.error || 'AI build failed.')
    } catch { flash('error', 'AI build failed.') } finally { setBuilding(false) }
  }

  const label: React.CSSProperties = { fontSize: 10.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--hx-gold-2)' }
  const input: React.CSSProperties = { width: '100%', boxSizing: 'border-box', padding: '9px 11px', background: 'rgba(1,10,19,0.5)', border: '1px solid var(--hx-line)', color: 'var(--hx-text)', fontSize: 13.5 }

  const pickFiles = (accept: string, ref: React.RefObject<HTMLInputElement>, set: React.Dispatch<React.SetStateAction<File[]>>, addLabel: string) => (
    <label className={styles.hexBtn} style={{ justifySelf: 'start', padding: '5px 12px', fontSize: 12 }}>
      {addLabel}
      <input ref={ref} type="file" multiple accept={accept} style={{ position: 'absolute', width: 1, height: 1, opacity: 0 }}
        onChange={(e) => { set((s) => [...s, ...Array.from(e.target.files ?? [])]); if (ref.current) ref.current.value = '' }} />
    </label>
  )

  const stagedList = (files: File[], onRemove: (i: number) => void) =>
    files.length > 0 && (
      <ul style={{ listStyle: 'none', padding: 0, margin: '6px 0 0', display: 'grid', gap: 3 }}>
        {files.map((f, i) => (
          <li key={i} style={{ fontSize: 12, color: 'var(--hx-muted)', display: 'flex', justifyContent: 'space-between', gap: 8 }}>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name} <span style={{ opacity: 0.6 }}>({Math.ceil(f.size / 1024)} KB)</span></span>
            <button type="button" onClick={() => onRemove(i)} style={{ background: 'none', border: 'none', color: '#ff8080', cursor: 'pointer' }}>✕</button>
          </li>
        ))}
      </ul>
    )

  return (
    <div style={{ maxWidth: 960, margin: '12px auto 0', padding: '0 12px' }}>
      <div className={styles.framedPanel} style={{ borderColor: 'var(--hx-gold-1)', background: 'rgba(200,155,60,0.06)' }}>
        <button onClick={() => setOpen((o) => !o)} title="Add files, art, and comments to this character, then build the sheet out with AI." style={{ width: '100%', background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: 0 }}>
          <span style={{ fontFamily: 'var(--hx-font-display)', color: 'var(--hx-gold-2)', letterSpacing: '0.05em', fontSize: 15 }}>
            🛠️ Build Kit — add files &amp; art, then build with AI
            {hasMaterials && <span style={{ color: 'var(--hx-muted)', fontSize: 12, marginLeft: 8 }}>({sourceUploads.length} file{sourceUploads.length === 1 ? '' : 's'}, {artUploads.length} art)</span>}
          </span>
          <span style={{ color: 'var(--hx-muted)', fontSize: 13 }}>{open ? '▲' : '▼'}</span>
        </button>

        {open && (
          <div style={{ marginTop: 14, display: 'grid', gap: 16 }}>
            <p style={{ margin: 0, fontSize: 12.5, color: 'var(--hx-muted)', lineHeight: 1.55 }}>
              Drop in everything about {characterName} — an exported sheet, a PDF, screenshots, character art, and any comments about their build, feats, backstory, or the styling you want. When you&apos;ve added enough, hit <strong style={{ color: 'var(--hx-gold-2)' }}>Build with AI</strong> and it fills the sheet out. You can keep adding and rebuild any time.
            </p>

            {/* Add materials */}
            <div style={{ display: 'grid', gap: 10, border: '1px solid var(--hx-line)', background: 'rgba(1,10,19,0.35)', padding: 12, borderRadius: 4 }}>
              <div style={{ display: 'grid', gap: 4 }}>
                <span style={label}>Comment / what you want</span>
                <textarea style={{ ...input, resize: 'vertical' }} rows={3} value={comment} onChange={(e) => { setComment(e.target.value); setMsg(null) }}
                  placeholder="e.g. “She's a homebrew warlock — fire theme, gold/black styling. Feats and stats are in the PDF. Give her a signature flame-strike move.”" />
              </div>
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                <div style={{ display: 'grid', gap: 4 }}>
                  <span style={label}>Files (sheets, PDF, screenshots)</span>
                  {pickFiles(SOURCE_ACCEPT, sourceRef, setSources, '+ Add files')}
                  {stagedList(sources, (i) => setSources((s) => s.filter((_, x) => x !== i)))}
                </div>
                <div style={{ display: 'grid', gap: 4 }}>
                  <span style={label}>Reference art</span>
                  {pickFiles(ART_ACCEPT, artRef, setArt, '+ Add art')}
                  {stagedList(art, (i) => setArt((s) => s.filter((_, x) => x !== i)))}
                </div>
              </div>
              <button className={styles.hexBtn} style={{ justifySelf: 'start', padding: '8px 16px' }} onClick={addMaterials} disabled={saving}>
                {saving ? 'Adding…' : '＋ Add to character'}
              </button>
            </div>

            {/* Saved materials */}
            {(sourceUploads.length > 0 || artUploads.length > 0) && (
              <div style={{ display: 'grid', gap: 10 }}>
                {sourceUploads.length > 0 && (
                  <div>
                    <div style={{ ...label, marginBottom: 5 }}>Saved files ({sourceUploads.length})</div>
                    <div style={{ display: 'grid', gap: 4 }}>
                      {sourceUploads.map((u) => (
                        <div key={u.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, fontSize: 12.5 }}>
                          <a href={u.url} target="_blank" rel="noreferrer" style={{ color: 'var(--hx-teal-1)', textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.filename ?? 'file'}</a>
                          <button onClick={() => removeUpload(u.id)} title="Remove this file" style={{ background: 'none', border: 'none', color: '#ff8080', cursor: 'pointer', fontSize: 13 }}>✕</button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {artUploads.length > 0 && (
                  <div>
                    <div style={{ ...label, marginBottom: 5 }}>Saved art ({artUploads.length})</div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {artUploads.map((u) => (
                        <div key={u.id} style={{ position: 'relative' }}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <a href={u.url} target="_blank" rel="noreferrer"><img src={u.url} alt="" style={{ width: 52, height: 52, objectFit: 'cover', border: '1px solid var(--hx-line)', borderRadius: 3 }} /></a>
                          <button onClick={() => removeUpload(u.id)} title="Remove this art" style={{ position: 'absolute', top: -6, right: -6, width: 18, height: 18, lineHeight: '16px', textAlign: 'center', borderRadius: '50%', background: '#2a0f0f', color: '#ff8080', border: '1px solid var(--hx-line)', cursor: 'pointer', fontSize: 11, padding: 0 }}>✕</button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {styleNotes.trim() && (
              <div>
                <div style={{ ...label, marginBottom: 5 }}>Your notes so far</div>
                <div style={{ whiteSpace: 'pre-wrap', fontSize: 12.5, color: 'var(--hx-muted)', border: '1px solid var(--hx-line)', background: 'rgba(1,10,19,0.4)', padding: '8px 10px', maxHeight: 160, overflowY: 'auto' }}>{styleNotes}</div>
              </div>
            )}

            {importNotes && (
              <div>
                <div style={{ ...label, marginBottom: 5 }}>Couldn&apos;t auto-place last build</div>
                <div style={{ whiteSpace: 'pre-wrap', fontSize: 12.5, color: 'var(--hx-text)', border: '1px solid var(--hx-line)', background: 'rgba(1,10,19,0.4)', padding: '8px 10px' }}>{importNotes}</div>
              </div>
            )}

            <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', borderTop: '1px solid var(--hx-line)', paddingTop: 14 }}>
              <button className={`${styles.hexBtn} ${styles.hexBtnPrimary}`} style={{ padding: '11px 20px', fontSize: 14.5 }} onClick={build} disabled={building || !hasMaterials}
                title={hasMaterials ? 'Read all the materials above and fill out the character sheet.' : 'Add at least one file, art, or comment first.'}>
                {building ? '✨ Building the sheet…' : '✨ Build with AI'}
              </button>
              {!aiConfigured && <span style={{ fontSize: 12, color: 'var(--hx-muted)' }}>AI auto-build is off on this server — materials are saved for a manual build.</span>}
            </div>

            {msg && <div style={{ fontSize: 13, color: msgKind === 'error' ? '#ff8080' : 'var(--hx-teal-1)' }}>{msg}</div>}
          </div>
        )}
      </div>
    </div>
  )
}

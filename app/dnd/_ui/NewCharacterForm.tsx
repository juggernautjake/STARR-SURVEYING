'use client'
// New-Character import form (Phase M2). The user uploads whatever they built elsewhere
// (D&D Beyond PDF, Word/Excel sheets, screenshots) plus free-text notes, optional
// reference art, and a style/mechanics description. On submit it POSTs everything to
// the import endpoint (M3), which saves the files + creates the character; the AI
// ingestion (M4) then populates the generic sheet. Renders the LoL-style generic sheet
// immediately, flagged "under construction".
import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import styles from './hextech.module.css'
import { GAME_SYSTEMS, SYSTEM_AMBIGUOUS } from '@/lib/dnd/systems'
import { BUILD_MODES, type BuildMode } from '@/lib/dnd/build-modes'

const SOURCE_ACCEPT = '.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.md,.json,image/png,image/jpeg,image/webp'

export default function NewCharacterForm({ campaignId = '' }: { campaignId?: string }) {
  const router = useRouter()
  const [name, setName] = useState('')
  const [system, setSystem] = useState<string>(SYSTEM_AMBIGUOUS)
  const [mode, setMode] = useState<BuildMode>('questioning')
  const [notes, setNotes] = useState('')
  const [style, setStyle] = useState('')
  const [sources, setSources] = useState<File[]>([])
  const [art, setArt] = useState<File[]>([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const sourceRef = useRef<HTMLInputElement>(null)
  const artRef = useRef<HTMLInputElement>(null)

  async function submit() {
    if (!name.trim() || busy) return
    setBusy(true)
    setErr(null)
    try {
      const fd = new FormData()
      if (campaignId) fd.append('campaignId', campaignId) // empty → a personal (no-campaign) character
      fd.append('name', name.trim())
      fd.append('system', system)
      fd.append('mode', mode)
      fd.append('notes', notes)
      fd.append('styleNotes', style)
      sources.forEach((f) => fd.append('sources', f))
      art.forEach((f) => fd.append('art', f))
      const r = await fetch('/api/dnd/characters/import', { method: 'POST', body: fd })
      const j = await r.json().catch(() => ({}))
      if (r.ok && j.characterId) {
        // Kick off AI ingestion (populates the sheet from the uploads), then open it.
        await fetch(`/api/dnd/characters/${j.characterId}/ingest`, { method: 'POST' }).catch(() => {})
        router.push(`/dnd/characters/${j.characterId}`)
      } else {
        setErr(j.error ?? 'Could not create the character.')
      }
    } catch {
      setErr('Upload failed.')
    } finally {
      setBusy(false)
    }
  }

  const fileList = (files: File[], onRemove: (i: number) => void) =>
    files.length > 0 && (
      <ul style={{ listStyle: 'none', padding: 0, margin: '6px 0 0', display: 'grid', gap: 3 }}>
        {files.map((f, i) => (
          <li key={i} style={{ fontSize: 12, color: 'var(--hx-muted)', display: 'flex', justifyContent: 'space-between', gap: 8 }}>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name} <span style={{ opacity: 0.6 }}>({Math.ceil(f.size / 1024)} KB)</span></span>
            <button type="button" onClick={() => onRemove(i)} style={{ background: 'none', border: 'none', color: 'var(--hx-danger)', cursor: 'pointer' }}>✕</button>
          </li>
        ))}
      </ul>
    )

  const label: React.CSSProperties = { fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--hx-gold-2)' }
  const input: React.CSSProperties = { width: '100%', boxSizing: 'border-box', padding: '10px 12px', background: 'rgba(1,10,19,0.5)', border: '1px solid var(--hx-line)', color: 'var(--hx-text)', fontSize: 14 }

  return (
    <div className={styles.root}>
      <div className={styles.screen} style={{ alignItems: 'flex-start' }}>
        <div style={{ width: '100%', maxWidth: 640, margin: '0 auto', display: 'grid', gap: 16 }}>
          <a className={styles.hexBtn} href="/dnd" style={{ justifySelf: 'start' }}>← Lobby</a>
          <div>
            <p className={styles.brand}>New Character</p>
            <h1 className={styles.title} style={{ textAlign: 'left' }}>Import Your Character</h1>
            <p className={styles.subtitle} style={{ textAlign: 'left' }}>Upload what you built elsewhere (D&D Beyond PDF, sheets, screenshots) + notes. The AI builds your sheet; anything it can&apos;t map is saved for reference. Your character starts on the generic sheet, flagged <em>under construction</em>.</p>
            {!campaignId && (
              <p style={{ margin: '6px 0 0', fontSize: 12.5, color: 'var(--hx-muted)' }}>
                This will be a <strong>personal character</strong> — no campaign required. You can build it fully now and add it to a campaign later.
              </p>
            )}
          </div>

          <section className={styles.framedPanel} style={{ display: 'grid', gap: 14 }}>
            <div style={{ display: 'grid', gap: 4 }}>
              <span style={label}>Character Name *</span>
              <input style={input} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Kaelen Duskbane" />
            </div>

            <div style={{ display: 'grid', gap: 4 }}>
              <span style={label}>Game System</span>
              <span style={{ fontSize: 12, color: 'var(--hx-muted)' }}>Pick a ruleset so the AI grounds the build in that system only — or leave it system-ambiguous.</span>
              <select style={input} value={system} onChange={(e) => setSystem(e.target.value)}>
                <option value={SYSTEM_AMBIGUOUS}>System-ambiguous (no specific ruleset)</option>
                {GAME_SYSTEMS.map((s) => (<option key={s.key} value={s.key}>{s.name}</option>))}
              </select>
            </div>

            <div style={{ display: 'grid', gap: 4 }}>
              <span style={label}>Build Mode</span>
              <div style={{ display: 'grid', gap: 6 }}>
                {BUILD_MODES.map((m) => (
                  <label key={m.key} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', cursor: 'pointer', padding: '8px 10px', border: `1px solid ${mode === m.key ? 'var(--hx-gold-2)' : 'var(--hx-line)'}`, background: mode === m.key ? 'rgba(200,155,60,0.08)' : 'transparent' }}>
                    <input type="radio" name="buildmode" checked={mode === m.key} onChange={() => setMode(m.key)} style={{ marginTop: 3 }} />
                    <span>
                      <strong style={{ fontSize: 13, color: 'var(--hx-text)' }}>{m.name}</strong>
                      <span style={{ display: 'block', fontSize: 12, color: 'var(--hx-muted)', lineHeight: 1.45 }}>{m.blurb}</span>
                    </span>
                  </label>
                ))}
              </div>
            </div>

            <div style={{ display: 'grid', gap: 4 }}>
              <span style={label}>Source Files</span>
              <span style={{ fontSize: 12, color: 'var(--hx-muted)' }}>PDF, Word, Excel/CSV, text, or screenshots of your sheet.</span>
              <label className={styles.hexBtn} style={{ justifySelf: 'start' }}>
                + Add files
                <input ref={sourceRef} type="file" multiple accept={SOURCE_ACCEPT} style={{ position: 'absolute', width: 1, height: 1, opacity: 0 }} onChange={(e) => { setSources((s) => [...s, ...Array.from(e.target.files ?? [])]); if (sourceRef.current) sourceRef.current.value = '' }} />
              </label>
              {fileList(sources, (i) => setSources((s) => s.filter((_, x) => x !== i)))}
            </div>

            <div style={{ display: 'grid', gap: 4 }}>
              <span style={label}>Notes</span>
              <textarea style={{ ...input, resize: 'vertical' }} rows={5} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Anything the files don't cover — backstory, homebrew rules, how abilities work, personality…" />
            </div>

            <div style={{ display: 'grid', gap: 4 }}>
              <span style={label}>Reference Art</span>
              <span style={{ fontSize: 12, color: 'var(--hx-muted)' }}>Character art + style references (saved for your custom sheet later).</span>
              <label className={styles.hexBtn} style={{ justifySelf: 'start' }}>
                + Add art
                <input ref={artRef} type="file" multiple accept="image/png,image/jpeg,image/webp,image/gif" style={{ position: 'absolute', width: 1, height: 1, opacity: 0 }} onChange={(e) => { setArt((s) => [...s, ...Array.from(e.target.files ?? [])]); if (artRef.current) artRef.current.value = '' }} />
              </label>
              {fileList(art, (i) => setArt((s) => s.filter((_, x) => x !== i)))}
            </div>

            <div style={{ display: 'grid', gap: 4 }}>
              <span style={label}>Style &amp; Mechanics (for the custom build)</span>
              <textarea style={{ ...input, resize: 'vertical' }} rows={4} value={style} onChange={(e) => setStyle(e.target.value)} placeholder="Describe the vibe/theme you want and any special mechanics (transformations, unique resources, signature moves)…" />
            </div>

            {err && <p style={{ color: 'var(--hx-danger)', fontSize: 13, margin: 0 }}>✕ {err}</p>}
            <button className={`${styles.hexBtn} ${styles.hexBtnPrimary}`} style={{ padding: '12px', fontSize: 15 }} onClick={submit} disabled={busy || !name.trim()}>
              {busy ? 'Building your sheet…' : '✨ Create & Build Sheet'}
            </button>
          </section>
        </div>
      </div>
    </div>
  )
}

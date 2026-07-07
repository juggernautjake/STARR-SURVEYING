'use client'
// Sheet art / token uploader (owner-DM). Sets the character's hero art and round
// token from the sheet itself — posts to the D1/D2 media endpoint (which uploads to
// storage and points art_url / token_url at it), then updates the in-memory pointers
// so the new image shows immediately (with whatever skin frame the sheet uses).
import { useRef, useState } from 'react'
import { useChar } from '../state/store'

type Kind = 'art' | 'token'

export default function SheetArtUploader() {
  const { characterId, canWrite, media, setMedia } = useChar()
  const [busy, setBusy] = useState<Kind | null>(null)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const artRef = useRef<HTMLInputElement>(null)
  const tokenRef = useRef<HTMLInputElement>(null)

  // Anyone who can edit this character (its owner or the DM) can set the art/token
  // — mirrors the media endpoint's own permission check.
  if (!canWrite || !characterId) return null

  async function upload(kind: Kind, file: File) {
    setBusy(kind)
    setMsg(null)
    try {
      const fd = new FormData()
      fd.append('kind', kind)
      fd.append('file', file)
      const r = await fetch(`/api/dnd/characters/${characterId}/media`, { method: 'POST', body: fd })
      const j = await r.json().catch(() => ({}))
      if (r.ok && j.url) {
        setMedia({
          artUrl: kind === 'art' ? j.url : media.artUrl,
          tokenUrl: kind === 'token' ? j.url : media.tokenUrl,
        })
        setMsg({ ok: true, text: `${kind === 'art' ? 'Art' : 'Token'} updated.` })
      } else {
        setMsg({ ok: false, text: j.error ?? 'Upload failed.' })
      }
    } catch {
      setMsg({ ok: false, text: 'Upload failed.' })
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '12px 16px' }}>
      <span className="sec-num">ART {'//'}</span>
      <label className={`btn tiny ${busy === 'art' ? 'active' : ''}`} style={{ cursor: 'pointer' }}>
        {busy === 'art' ? 'Uploading…' : media.artUrl ? '⤴ Replace Art' : '⤴ Set Art'}
        <input
          ref={artRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          style={{ position: 'absolute', width: 1, height: 1, opacity: 0 }}
          disabled={busy !== null}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) upload('art', f); if (artRef.current) artRef.current.value = '' }}
        />
      </label>
      <label className={`btn tiny ${busy === 'token' ? 'active' : ''}`} style={{ cursor: 'pointer' }}>
        {busy === 'token' ? 'Uploading…' : media.tokenUrl ? '⤴ Replace Token' : '⤴ Set Token'}
        <input
          ref={tokenRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          style={{ position: 'absolute', width: 1, height: 1, opacity: 0 }}
          disabled={busy !== null}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) upload('token', f); if (tokenRef.current) tokenRef.current.value = '' }}
        />
      </label>
      {msg && <span style={{ fontSize: 13, color: msg.ok ? 'var(--good)' : 'var(--danger)' }}>{msg.text}</span>}
      <span style={{ fontSize: 12, color: 'var(--muted)', marginLeft: 'auto' }}>PNG/JPG/WEBP/GIF · ≤8&nbsp;MB</span>
    </div>
  )
}

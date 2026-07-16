'use client'
// ImageUpload — one art-upload control shared by every element editor (Slice 28).
//
// The ItemBuilder had its own inline uploader; attacks/spells/features had none. Rather than copy
// that logic three more times (the drift this codebase keeps paying for), this is the single control:
// it POSTs to the same media endpoint with kind='item' (a non-column upload that just joins the
// character's media), shows the current art with a change/remove affordance, and reports its own
// errors. A compact variant fits inside the EditDialog rows.
import { useRef, useState } from 'react'
import { useChar } from '../../state/store'

export default function ImageUpload({
  value,
  onChange,
  label = 'Add art',
}: {
  value?: string
  onChange: (url: string | undefined) => void
  label?: string
}) {
  const { characterId } = useChar()
  const [uploading, setUploading] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const ref = useRef<HTMLInputElement>(null)

  async function upload(file: File) {
    if (!characterId) { setErr('Save this first, then add art.'); return }
    setUploading(true)
    setErr(null)
    try {
      const fd = new FormData()
      fd.append('kind', 'item') // non-column media — just joins the character's gallery
      fd.append('file', file)
      const r = await fetch(`/api/dnd/characters/${characterId}/media`, { method: 'POST', body: fd })
      const j = await r.json().catch(() => ({}))
      if (r.ok && j.url) onChange(j.url as string)
      else setErr((j as { error?: string }).error ?? 'Upload failed.')
    } catch {
      setErr('Upload failed.')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="flex" style={{ gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
      {value && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={value} alt="" style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 6, border: '1px solid var(--line)' }} />
      )}
      <label className={`btn tiny ${uploading ? 'active' : ''}`} style={{ cursor: 'pointer' }}>
        {uploading ? 'Uploading…' : value ? '⤴ Change art' : `⤴ ${label}`}
        <input
          ref={ref}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          style={{ position: 'absolute', width: 1, height: 1, opacity: 0 }}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); if (ref.current) ref.current.value = '' }}
        />
      </label>
      {value && <button type="button" className="btn tiny danger" onClick={() => onChange(undefined)}>Remove</button>}
      {err && <span style={{ color: 'var(--danger)', fontSize: 12 }}>{err}</span>}
    </div>
  )
}

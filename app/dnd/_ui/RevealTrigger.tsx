'use client'
// DM reveal trigger (Phase H1) — pick a map/handout, choose the audience (everyone /
// a specific player), and broadcast it full-screen to the recipients via useReveals.
import { useEffect, useRef, useState } from 'react'
import styles from './hextech.module.css'
import { useReveals } from './useReveals'

interface Member { userId: string; displayName: string; role: string }
interface Img { url: string; label?: string | null }

export default function RevealTrigger({ campaignId, maps, selfId, initialMembers, initialHandouts }: { campaignId: string; maps: Img[]; selfId?: string | null; initialMembers?: Member[]; initialHandouts?: Img[] }) {
  const [members, setMembers] = useState<Member[]>(initialMembers ?? [])
  const [handouts, setHandouts] = useState<Img[]>(initialHandouts ?? [])
  const [selected, setSelected] = useState<string | null>(null)
  // Empty = everyone; otherwise the specific recipient user-ids (H2 group multi-select).
  const [groupIds, setGroupIds] = useState<string[]>([])
  const [caption, setCaption] = useState('')
  const [flash, setFlash] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const { broadcastReveal } = useReveals(campaignId, selfId ?? null, () => {})

  useEffect(() => {
    if (initialMembers) return
    fetch(`/api/dnd/campaigns/${campaignId}`).then((r) => (r.ok ? r.json() : { members: [] })).then((j) => setMembers(j.members ?? [])).catch(() => {})
  }, [campaignId, initialMembers])

  const loadHandouts = () => {
    fetch(`/api/dnd/handouts?campaignId=${campaignId}`).then((r) => (r.ok ? r.json() : { handouts: [] })).then((j) => setHandouts(j.handouts ?? [])).catch(() => {})
  }
  useEffect(() => {
    if (initialHandouts) return
    loadHandouts()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignId, initialHandouts])

  async function uploadHandout(file: File) {
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('campaignId', campaignId)
      fd.append('file', file)
      const r = await fetch('/api/dnd/handouts', { method: 'POST', body: fd })
      const j = await r.json()
      if (r.ok && j.handout) setHandouts((h) => [j.handout, ...h])
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  // Reusable handouts first, then this session's maps — deduped by URL.
  const seen = new Set<string>()
  const images: Img[] = [...handouts, ...maps].filter((m) => (seen.has(m.url) ? false : (seen.add(m.url), true)))

  const toggleMember = (id: string) => setGroupIds((g) => (g.includes(id) ? g.filter((x) => x !== id) : [...g, id]))

  function reveal() {
    if (!selected) return
    const toEveryone = groupIds.length === 0
    const recipientIds = toEveryone ? null : groupIds
    broadcastReveal({ imageUrl: selected, caption: caption || null, recipientIds, fromName: 'DM' })
    // Save into the relevant chat (H2) so it's re-viewable later: everyone → party, one
    // recipient → the DM↔player direct thread, several → a group thread.
    const channel = toEveryone ? 'party' : groupIds.length === 1 ? 'direct' : 'group'
    fetch('/api/dnd/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        campaignId,
        channel,
        body: caption || null,
        imageUrl: selected,
        toUserIds: recipientIds ?? undefined,
        isReveal: true,
      }),
    }).catch(() => {})
    const who = toEveryone
      ? 'everyone'
      : groupIds.length === 1
        ? members.find((m) => m.userId === groupIds[0])?.displayName ?? 'a player'
        : `${groupIds.length} players`
    setFlash(`Revealed to ${who} · saved to chat.`)
    setTimeout(() => setFlash(null), 2600)
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <p style={{ color: 'var(--hx-muted)', margin: 0, fontSize: 13 }}>
          Pick an image, choose who sees it, and reveal — full-screen for the audience. Handouts reuse across sessions.
        </p>
        <label className={styles.hexBtn} style={{ whiteSpace: 'nowrap' }}>
          {uploading ? 'Uploading…' : '+ Handout'}
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            style={{ position: 'absolute', width: 1, height: 1, opacity: 0 }}
            disabled={uploading}
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) uploadHandout(f)
            }}
          />
        </label>
      </div>

      {images.length === 0 ? (
        <p style={{ color: 'var(--hx-muted)' }}>No handouts yet — upload one above (or add a map in the Maps tab), then reveal it.</p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))', gap: 8, marginBottom: 12 }}>
          {images.map((m) => (
            <button
              key={m.url}
              onClick={() => setSelected(m.url)}
              style={{ padding: 0, border: '2px solid', borderColor: selected === m.url ? 'var(--hx-teal-1)' : 'var(--hx-line)', background: 'transparent', cursor: 'pointer', aspectRatio: '1', overflow: 'hidden' }}
              title={m.label ?? undefined}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={m.url} alt={m.label ?? ''} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </button>
          ))}
        </div>
      )}

      <input className={styles.input} style={{ padding: '8px 10px', marginBottom: 8 }} placeholder="Caption (optional) — shown on the reveal + saved to chat" value={caption} onChange={(e) => setCaption(e.target.value)} />

      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 }}>
        <span style={{ fontSize: 12, color: 'var(--hx-muted)' }}>Audience:</span>
        <button
          onClick={() => setGroupIds([])}
          className={`${styles.hexBtn} ${groupIds.length === 0 ? styles.hexBtnPrimary : ''}`}
          style={{ fontSize: 12 }}
        >
          Everyone
        </button>
        {members.filter((m) => m.userId !== selfId).map((m) => (
          <button
            key={m.userId}
            onClick={() => toggleMember(m.userId)}
            className={`${styles.hexBtn} ${groupIds.includes(m.userId) ? styles.hexBtnPrimary : ''}`}
            style={{ fontSize: 12 }}
          >
            {groupIds.includes(m.userId) ? '✓ ' : ''}{m.displayName}{m.role === 'dm' ? ' (DM)' : ''}
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <button className={`${styles.hexBtn} ${styles.hexBtnPrimary}`} disabled={!selected} onClick={reveal}>
          ✨ Reveal{groupIds.length > 1 ? ` to ${groupIds.length}` : ''}
        </button>
        {flash && <span style={{ fontSize: 13, color: 'var(--hx-teal-1)' }}>{flash}</span>}
      </div>
    </div>
  )
}

'use client'
// Campaign chat (Phase F3 party + F4 direct/group). A channel switcher — Party /
// Direct / Group — over the F1 message API + F2 realtime. Direct = one recipient,
// Group = several (chosen members); the F1 API filters direct/group to the sender +
// recipients, so targeted messages stay private. Mobile-first.
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import styles from './hextech.module.css'
import { useCampaignChannel } from './useCampaignChannel'
import { useCampaignPresence } from './useCampaignPresence'

type ChannelKind = 'party' | 'direct' | 'group'

interface Msg {
  id: string
  from_user_id: string | null
  to_user_ids?: string[] | null
  body: string | null
  image_url?: string | null
  created_at: string
}

const CHANNELS: { id: ChannelKind; label: string }[] = [
  { id: 'party', label: 'Party' },
  { id: 'direct', label: 'Direct' },
  { id: 'group', label: 'Group' },
]

export default function Chat({ campaignId, initialMembers, selfId }: { campaignId: string; initialMembers?: { id: string; name: string }[]; selfId?: string }) {
  const [channel, setChannel] = useState<ChannelKind>('party')
  const [recipients, setRecipients] = useState<string[]>([])
  const [messages, setMessages] = useState<Msg[]>([])
  const [names, setNames] = useState<Record<string, string>>(initialMembers ? Object.fromEntries(initialMembers.map((m) => [m.id, m.name])) : {})
  const [members, setMembers] = useState<{ id: string; name: string }[]>(initialMembers ?? [])
  const [me, setMe] = useState<string | null>(selfId ?? null)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [uploading, setUploading] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const load = useCallback(() => {
    fetch(`/api/dnd/messages?campaignId=${campaignId}&channel=${channel}`)
      .then((r) => (r.ok ? r.json() : { messages: [] }))
      .then((j) => setMessages(j.messages ?? []))
      .catch(() => {})
  }, [campaignId, channel])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    if (initialMembers) return // testability: skip fetches when seeded
    fetch('/api/dnd/auth/session').then((r) => r.json()).then((j) => setMe(j.user?.id ?? null)).catch(() => {})
    fetch(`/api/dnd/campaigns/${campaignId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!j?.members) return
        const ms = (j.members as { userId: string; displayName: string }[]).map((m) => ({ id: m.userId, name: m.displayName }))
        setMembers(ms)
        setNames(Object.fromEntries(ms.map((m) => [m.id, m.name])))
      })
      .catch(() => {})
  }, [campaignId, initialMembers])

  // Presence (F6): who's online in the campaign.
  const online = useCampaignPresence(campaignId, me)

  // Unread badges (F6): subscribe to all three channels; a ping on the ACTIVE
  // channel refetches, a ping on another bumps that channel's unread count.
  const [unread, setUnread] = useState<Record<string, number>>({})
  const activeRef = useRef(channel)
  activeRef.current = channel
  const loadRef = useRef(load)
  loadRef.current = load
  const onPing = useCallback((ch: ChannelKind) => {
    if (ch === activeRef.current) loadRef.current()
    else setUnread((u) => ({ ...u, [ch]: (u[ch] ?? 0) + 1 }))
  }, [])
  const party = useCampaignChannel(campaignId, 'party', () => onPing('party'))
  const direct = useCampaignChannel(campaignId, 'direct', () => onPing('direct'))
  const group = useCampaignChannel(campaignId, 'group', () => onPing('group'))
  const ping = channel === 'party' ? party.ping : channel === 'direct' ? direct.ping : group.ping

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  function pickRecipient(id: string) {
    if (channel === 'direct') setRecipients([id])
    else setRecipients((r) => (r.includes(id) ? r.filter((x) => x !== id) : [...r, id]))
  }

  async function postMessage(body: string, imageUrl?: string) {
    if (channel !== 'party' && recipients.length === 0) return
    const res = await fetch('/api/dnd/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ campaignId, channel, body: body || null, imageUrl, toUserIds: channel === 'party' ? undefined : recipients }),
    })
    const j = await res.json()
    if (res.ok && j.message) {
      setMessages((m) => [...m, j.message])
      ping()
    }
  }

  async function send(e: FormEvent) {
    e.preventDefault()
    if (!text.trim()) return
    setSending(true)
    try {
      await postMessage(text)
      setText('')
    } finally {
      setSending(false)
    }
  }

  async function attachImage(file: File) {
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('campaignId', campaignId)
      fd.append('file', file)
      const up = await fetch('/api/dnd/messages/image', { method: 'POST', body: fd })
      const uj = await up.json()
      if (up.ok && uj.url) {
        await postMessage(text, uj.url)
        setText('')
      }
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const others = members.filter((m) => m.id !== me)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'min(62vh, 500px)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
        <div className={styles.tabbar} style={{ flex: 1 }}>
          {CHANNELS.map((c) => (
            <button key={c.id} className={`${styles.tabItem} ${channel === c.id ? styles.tabItemActive : ''}`} onClick={() => { setChannel(c.id); setRecipients([]); setUnread((u) => ({ ...u, [c.id]: 0 })) }}>
              {c.label}
              {unread[c.id] ? <span style={{ marginLeft: 5, fontSize: 10, background: 'var(--hx-hotpink, #ff2d8b)', color: '#fff', borderRadius: 8, padding: '0 5px' }}>{unread[c.id]}</span> : null}
            </button>
          ))}
        </div>
        <span style={{ fontSize: 11, color: 'var(--hx-teal-1)', whiteSpace: 'nowrap' }}>● {online.size} online</span>
      </div>

      {channel !== 'party' && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
          {others.length === 0 && <span style={{ color: 'var(--hx-muted)', fontSize: 12 }}>No one else in the campaign yet.</span>}
          {others.map((m) => (
            <button
              key={m.id}
              onClick={() => pickRecipient(m.id)}
              style={{
                fontSize: 12,
                padding: '4px 9px',
                cursor: 'pointer',
                border: '1px solid',
                borderColor: recipients.includes(m.id) ? 'var(--hx-teal-1)' : 'var(--hx-line)',
                color: recipients.includes(m.id) ? 'var(--hx-teal-1)' : 'var(--hx-muted)',
                background: 'transparent',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
              }}
            >
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: online.has(m.id) ? '#4ade80' : 'var(--hx-line)' }} />
              {m.name}
            </button>
          ))}
        </div>
      )}

      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8, paddingRight: 4 }}>
        {messages.length === 0 ? (
          <p style={{ color: 'var(--hx-muted)', fontSize: 14 }}>{channel === 'party' ? 'No messages yet — say hello to the party.' : 'No messages in this channel yet.'}</p>
        ) : (
          messages.map((m) => {
            const mine = !!me && m.from_user_id === me
            const to = (m.to_user_ids ?? []).map((id) => names[id] ?? 'Player').join(', ')
            return (
              <div key={m.id} style={{ alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '82%' }}>
                <div style={{ fontSize: 10, color: 'var(--hx-muted)', margin: '0 0 2px', textAlign: mine ? 'right' : 'left' }}>
                  {names[m.from_user_id ?? ''] ?? 'Player'}
                  {channel !== 'party' && to && <span> → {to}</span>}
                </div>
                <div style={{ background: mine ? 'rgba(200,155,60,0.14)' : 'rgba(1,10,19,0.5)', border: '1px solid var(--hx-line)', padding: '8px 11px', color: 'var(--hx-text)', fontSize: 14, wordBreak: 'break-word' }}>
                  {m.body}
                  {m.image_url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={m.image_url} alt="" style={{ display: 'block', maxWidth: '100%', marginTop: 6, borderRadius: 4 }} />
                  )}
                </div>
              </div>
            )
          })
        )}
        <div ref={endRef} />
      </div>

      <form onSubmit={send} style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <label className={styles.hexBtn} style={{ cursor: (channel !== 'party' && recipients.length === 0) ? 'default' : 'pointer', opacity: uploading ? 0.6 : 1 }} title="Attach an image">
          {uploading ? '…' : '📎'}
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            style={{ position: 'absolute', width: 1, height: 1, opacity: 0 }}
            disabled={uploading || (channel !== 'party' && recipients.length === 0)}
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) attachImage(f)
            }}
          />
        </label>
        <input
          className={styles.input}
          style={{ flex: 1, padding: '10px 12px' }}
          placeholder={channel === 'party' ? 'Message the party…' : recipients.length ? 'Message…' : 'Pick recipient(s) above…'}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <button className={`${styles.hexBtn} ${styles.hexBtnPrimary}`} type="submit" disabled={sending || (channel !== 'party' && recipients.length === 0)}>Send</button>
      </form>
    </div>
  )
}

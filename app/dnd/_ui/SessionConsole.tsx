'use client'
// Session console shell (Phase E4) — the DM's live control surface: a Hextech
// tabbed layout with a status flow (prep → live → done). The panels are shells
// filled in by later phases (Notes E5, Maps E6, Chat F, Initiative/NPCs G,
// Reveals H). "Console opens per session" is this slice's bar.
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import styles from './hextech.module.css'
import Gallery, { type GalleryItem } from '../_sheet/components/Gallery'
import Chat from './Chat'
import InitiativeTracker from './InitiativeTracker'
import RollFeed from './RollFeed'
import NpcLibrary from './NpcLibrary'
import RevealOverlay from './RevealOverlay'
import RevealTrigger from './RevealTrigger'
import DmHotbar from './DmHotbar'
import AiNotesBox from './AiNotesBox'
import RecapPanel from './RecapPanel'
import Soundboard from './Soundboard'
import PartyAudio from './PartyAudio'

export interface SessionInfo {
  id: string
  title: string
  status: 'prep' | 'live' | 'done' | string
  dm_notes?: string | null
  role?: string
}

const TABS = [
  { id: 'overview', label: 'Overview', phase: null },
  { id: 'initiative', label: 'Initiative', phase: 'Phase G' },
  { id: 'npcs', label: 'NPCs', phase: 'Phase G' },
  { id: 'chat', label: 'Chat', phase: 'Phase F' },
  { id: 'reveals', label: 'Reveals', phase: 'Phase H' },
  { id: 'notes', label: 'Notes', phase: 'Phase E5' },
  { id: 'maps', label: 'Maps', phase: 'Phase E6' },
  { id: 'sound', label: 'Sound', phase: 'Phase H' },
] as const

type TabId = (typeof TABS)[number]['id']

const STATUS_COLOR: Record<string, string> = { prep: 'var(--hx-muted)', live: 'var(--hx-teal-1)', done: 'var(--hx-gold-2)' }

export default function SessionConsole({ campaignId, sessionId, selfId, initialSession }: { campaignId: string; sessionId: string; selfId?: string; initialSession?: SessionInfo }) {
  const router = useRouter()
  const [session, setSession] = useState<SessionInfo | null>(initialSession ?? null)
  const [tab, setTab] = useState<TabId>('overview')
  const [busy, setBusy] = useState(false)
  const [maps, setMaps] = useState<GalleryItem[]>([])
  const [mapsLoaded, setMapsLoaded] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/dnd/media?sessionId=${sessionId}`)
      .then((r) => (r.ok ? r.json() : { media: [] }))
      .then((j) => {
        if (cancelled) return
        setMaps(((j.media ?? []) as { url: string; thumb_url?: string | null; label?: string | null }[]).map((m) => ({ url: m.url, thumb_url: m.thumb_url, label: m.label, caption: m.label })))
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setMapsLoaded(true)
      })
    return () => {
      cancelled = true
    }
  }, [sessionId])

  async function uploadMap(file: File) {
    setUploading(true)
    try {
      const body = new FormData()
      body.append('file', file)
      body.append('kind', 'map')
      const res = await fetch(`/api/dnd/sessions/${sessionId}/media`, { method: 'POST', body })
      const j = await res.json()
      if (res.ok && j.media) setMaps((m) => [{ url: j.media.url, label: j.media.label, caption: j.media.label }, ...m])
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  useEffect(() => {
    if (initialSession) return
    let cancelled = false
    fetch(`/api/dnd/sessions/${sessionId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!cancelled && j?.session) setSession(j.session)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [sessionId, initialSession])

  async function saveNotes(dm_notes: string) {
    await fetch(`/api/dnd/sessions/${sessionId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dm_notes }),
    }).catch(() => {})
    setSession((s) => (s ? { ...s, dm_notes } : s))
  }

  async function setStatus(status: 'prep' | 'live' | 'done') {
    setBusy(true)
    try {
      const res = await fetch(`/api/dnd/sessions/${sessionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      const j = await res.json()
      if (res.ok && j.session) setSession((s) => (s ? { ...s, status: j.session.status } : s))
    } finally {
      setBusy(false)
    }
  }

  async function resetSession() {
    if (busy) return
    if (!window.confirm('Reset this session? This clears its initiative/encounters, AI recaps, roll log, and DM notes, and sets it back to Prep. The session itself stays.')) return
    setBusy(true)
    try {
      const res = await fetch(`/api/dnd/sessions/${sessionId}/reset`, { method: 'POST' })
      const j = await res.json().catch(() => ({}))
      if (res.ok && j.session) {
        setSession((s) => (s ? { ...s, status: j.session.status, dm_notes: null } : s))
        setTab('overview')
      }
    } finally {
      setBusy(false)
    }
  }

  async function deleteSession() {
    if (busy) return
    if (!window.confirm('Delete this session permanently? This removes it and all its data. This cannot be undone.')) return
    setBusy(true)
    try {
      const res = await fetch(`/api/dnd/sessions/${sessionId}`, { method: 'DELETE' })
      if (res.ok) router.push(`/dnd/campaigns/${campaignId}`)
      else setBusy(false)
    } catch {
      setBusy(false)
    }
  }

  // The NPC viewer is DM-only (Slice 5): NPCs must not appear anywhere for players, so the
  // tab itself is hidden from non-DMs (the list API also returns nothing for them, and the
  // content below only renders for a DM).
  const isDM = session?.role === 'dm'
  const visibleTabs = TABS.filter((t) => t.id !== 'npcs' || isDM)
  const active = TABS.find((t) => t.id === tab)!

  return (
    <div className={styles.root}>
      <RevealOverlay campaignId={campaignId} selfId={selfId ?? null} />
      <div className={styles.screen} style={{ alignItems: 'flex-start' }}>
        <div style={{ width: '100%', maxWidth: 960, display: 'grid', gap: 14 }}>
          <a className={styles.hexBtn} href={`/dnd/campaigns/${campaignId}`} style={{ justifySelf: 'start' }}>← Campaign</a>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div>
              <h1 className={styles.title} style={{ textAlign: 'left', margin: '0 0 6px' }}>{session?.title ?? '…'}</h1>
              {session && (
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  {(['prep', 'live', 'done'] as const).map((st, i) => (
                    <span key={st} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {i > 0 && <span style={{ color: 'var(--hx-line)' }}>→</span>}
                      <span
                        style={{
                          fontSize: 10.5,
                          letterSpacing: '0.14em',
                          textTransform: 'uppercase',
                          padding: '2px 8px',
                          border: '1px solid',
                          borderColor: session.status === st ? (STATUS_COLOR[st] ?? 'var(--hx-gold-2)') : 'var(--hx-line)',
                          color: session.status === st ? (STATUS_COLOR[st] ?? 'var(--hx-gold-2)') : 'var(--hx-muted)',
                          opacity: session.status === st ? 1 : 0.6,
                        }}
                      >
                        {st}
                      </span>
                    </span>
                  ))}
                </div>
              )}
            </div>
            {session && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {session.status === 'prep' && (
                  <button className={`${styles.hexBtn} ${styles.hexBtnPrimary}`} disabled={busy} onClick={() => setStatus('live')}>Go Live</button>
                )}
                {session.status === 'live' && (
                  <button className={styles.hexBtn} disabled={busy} onClick={() => setStatus('done')}>End Session</button>
                )}
                {session.status === 'done' && (
                  <button className={styles.hexBtn} disabled={busy} onClick={() => setStatus('prep')}>Reopen</button>
                )}
                {session.role === 'dm' && (
                  <>
                    <button className={styles.hexBtn} disabled={busy} onClick={resetSession} title="Clear this session's data and set it back to Prep">↺ Reset</button>
                    <button className={styles.hexBtn} disabled={busy} onClick={deleteSession} title="Delete this session permanently" style={{ color: 'var(--hx-danger)', borderColor: 'var(--hx-danger)' }}>🗑 Delete</button>
                  </>
                )}
              </div>
            )}
          </div>

          {session?.role === 'dm' && <DmHotbar campaignId={campaignId} selfId={selfId} />}

          {/* Party audio receiver (H8) — every role mounts it so the DM soundboard can
              reach the table; needs a one-tap enable for autoplay. */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', margin: '4px 0 8px' }}>
            <PartyAudio campaignId={campaignId} />
          </div>

          <nav className={styles.tabbar}>
            {visibleTabs.map((t) => (
              <button key={t.id} className={`${styles.tabItem} ${tab === t.id ? styles.tabItemActive : ''}`} onClick={() => setTab(t.id)}>
                {t.label}
              </button>
            ))}
          </nav>

          <section className={styles.framedPanel}>
            <div className={styles.framedPanelTop} />
            <h2 className={styles.panelTitle}>{active.label}</h2>
            {tab === 'overview' && (
              <>
                <p style={{ color: 'var(--hx-muted)', margin: '0 0 12px' }}>
                  The live control surface. Use the tabs for initiative, NPCs, chat, reveals, notes, and maps.
                </p>
                <h3 className={styles.panelTitle} style={{ fontSize: 13 }}>Roll Feed</h3>
                <RollFeed campaignId={campaignId} sessionId={sessionId} />
                <RecapPanel sessionId={sessionId} campaignId={campaignId} isDM={session?.role === 'dm'} />
              </>
            )}
            {tab === 'notes' &&
              (session?.role === 'dm' ? (
                <>
                  <p style={{ color: 'var(--hx-muted)', margin: '0 0 8px' }}>Private DM prep notes — saved automatically on blur.</p>
                  <AiNotesBox
                    sessionId={sessionId}
                    onInsert={(text) => {
                      const cur = session?.dm_notes ?? ''
                      const next = cur.trim() ? `${cur}\n\n${text}` : text
                      saveNotes(next)
                    }}
                  />
                  <textarea
                    key={session.dm_notes ?? ''}
                    defaultValue={session.dm_notes ?? ''}
                    placeholder="Prep notes, secrets, reminders…"
                    rows={12}
                    onBlur={(e) => {
                      if (e.target.value !== (session.dm_notes ?? '')) saveNotes(e.target.value)
                    }}
                    style={{ width: '100%', boxSizing: 'border-box', background: 'rgba(1,10,19,0.5)', border: '1px solid var(--hx-line)', color: 'var(--hx-text)', fontFamily: 'var(--hx-font-body)', fontSize: 15, padding: '10px 12px', resize: 'vertical' }}
                  />
                </>
              ) : (
                <p style={{ color: 'var(--hx-muted)', margin: 0 }}>The DM&apos;s notes are private.</p>
              ))}
            {tab === 'initiative' && <InitiativeTracker sessionId={sessionId} campaignId={campaignId} isDM={session?.role === 'dm'} />}
            {tab === 'npcs' && isDM && <NpcLibrary campaignId={campaignId} isDM />}
            {tab === 'reveals' &&
              (session?.role === 'dm' ? (
                <RevealTrigger campaignId={campaignId} maps={maps.map((m) => ({ url: m.url, label: m.label }))} selfId={selfId} />
              ) : (
                <p style={{ color: 'var(--hx-muted)', margin: 0 }}>The DM reveals images here — they&apos;ll appear full-screen when shared with you.</p>
              ))}
            {tab === 'chat' && <Chat campaignId={campaignId} />}
            {tab === 'maps' && (
              <>
                {session?.role === 'dm' && (
                  <label className={styles.hexBtn} style={{ marginBottom: 12 }}>
                    {uploading ? 'Uploading…' : '+ Upload Map'}
                    <input
                      ref={fileRef}
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/gif"
                      style={{ position: 'absolute', width: 1, height: 1, opacity: 0 }}
                      disabled={uploading}
                      onChange={(e) => {
                        const f = e.target.files?.[0]
                        if (f) uploadMap(f)
                      }}
                    />
                  </label>
                )}
                <Gallery items={maps} emptyText={mapsLoaded ? 'No maps attached yet.' : 'Loading…'} />
              </>
            )}
            {tab !== 'overview' && tab !== 'notes' && tab !== 'maps' && tab !== 'chat' && tab !== 'initiative' && tab !== 'npcs' && tab !== 'reveals' && (
              <p style={{ color: 'var(--hx-muted)', margin: 0 }}>
                <span className={styles.spinner} style={{ display: 'inline-block', verticalAlign: 'middle', marginRight: 8, width: 16, height: 16 }} />
                {active.label} panel — arrives in {active.phase}.
              </p>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}

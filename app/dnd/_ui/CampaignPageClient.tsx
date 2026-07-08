'use client'
// Campaign page (Phase E3) — members, characters, and sessions in Hextech framed
// panels. The B5b invite UI mounts here next; the D5/D6 galleries mount here once
// restyled for the DM (Hextech) context (they're currently `.dnd-sheet`-scoped).
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import styles from './hextech.module.css'
import InvitesPanel from './InvitesPanel'
import Chat from './Chat'
import Soundboard from './Soundboard'
import CampaignArtControl from './CampaignArtControl'
import CampaignGalleryDm from './CampaignGalleryDm'
import CampaignNotesDm from './CampaignNotesDm'

export interface CampaignDetail {
  campaign: { id: string; name: string; blurb?: string | null; role: string; theme?: { artUrl?: string | null; notes?: string | null; dmNotes?: string | null } | null }
  members: { userId: string; role: string; displayName: string; avatarUrl?: string | null }[]
  characters: { id: string; name: string; token_url?: string | null; is_npc: boolean; sheet_type?: string; claimable?: boolean }[]
  sessions: { id: string; title: string; status: string; sort_order: number }[]
}

const STATUS_COLOR: Record<string, string> = { prep: 'var(--hx-muted)', live: 'var(--hx-teal-1)', done: 'var(--hx-gold-2)' }

function Avatar({ url, name, size = 40 }: { url?: string | null; name: string; size?: number }) {
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img className={styles.portrait} src={url} alt={name} style={{ width: size, height: size }} />
  }
  return (
    <div className={styles.portrait} style={{ width: size, height: size, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--hx-font-display)', color: 'var(--hx-gold-2)', fontSize: size * 0.42 }}>
      {name.trim().charAt(0).toUpperCase() || '?'}
    </div>
  )
}

function RoleBadge({ role }: { role: string }) {
  const color = role === 'dm' ? 'var(--hx-gold-2)' : 'var(--hx-teal-1)'
  return <span style={{ fontSize: 10, letterSpacing: '0.12em', color, border: '1px solid currentColor', padding: '1px 5px' }}>{role.toUpperCase()}</span>
}

export default function CampaignPageClient({ campaignId, initialData }: { campaignId: string; initialData?: CampaignDetail }) {
  const router = useRouter()
  const [data, setData] = useState<CampaignDetail | null>(initialData ?? null)
  const [error, setError] = useState<string | null>(null)
  const [newSession, setNewSession] = useState('')
  const [newChar, setNewChar] = useState<{ name: string; sheetType: string; isNpc: boolean; ownerUserId: string }>({ name: '', sheetType: 'generic', isNpc: false, ownerUserId: '' })

  async function createCharacter() {
    if (!newChar.name.trim() || !data) return
    try {
      const res = await fetch('/api/dnd/characters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaignId: data.campaign.id,
          name: newChar.name,
          sheetType: newChar.sheetType,
          isNpc: newChar.isNpc,
          ownerUserId: newChar.ownerUserId || undefined,
        }),
      })
      const j = await res.json()
      if (res.ok && j.character) {
        setData((d) => (d ? { ...d, characters: [...d.characters, j.character] } : d))
        setNewChar({ name: '', sheetType: 'generic', isNpc: false, ownerUserId: '' })
      }
    } catch {
      /* ignore */
    }
  }

  // Toggle whether a character (even an NPC you built) may be claimed by a player.
  async function toggleClaimable(id: string, next: boolean) {
    setData((d) => (d ? { ...d, characters: d.characters.map((c) => (c.id === id ? { ...c, claimable: next } : c)) } : d))
    await fetch(`/api/dnd/characters/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ claimable: next }),
    }).catch(() => {})
  }

  async function createSession() {
    if (!newSession.trim() || !data) return
    try {
      const res = await fetch('/api/dnd/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaignId: data.campaign.id, title: newSession }),
      })
      const j = await res.json()
      if (res.ok && j.session) {
        setData((d) => (d ? { ...d, sessions: [...d.sessions, j.session] } : d))
        setNewSession('')
      }
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    if (initialData) return
    let cancelled = false
    fetch(`/api/dnd/campaigns/${campaignId}`)
      .then(async (r) => (r.ok ? r.json() : Promise.reject(new Error((await r.json()).error || String(r.status)))))
      .then((j) => {
        if (!cancelled) setData(j as CampaignDetail)
      })
      .catch((e) => {
        if (!cancelled) setError(e.message || 'Could not load campaign.')
      })
    return () => {
      cancelled = true
    }
  }, [campaignId, initialData])

  return (
    <div className={styles.root}>
      <div className={styles.screen} style={{ alignItems: 'flex-start' }}>
        <div style={{ width: '100%', maxWidth: 900, display: 'grid', gap: 16 }}>
          <div>
            <a className={styles.hexBtn} href={`/dnd/campaigns/${campaignId}`} style={{ marginBottom: 10 }}>← Lobby (switch role)</a>
            <h1 className={styles.title} style={{ textAlign: 'left', margin: '8px 0 0' }}>{data?.campaign.name ?? '…'}</h1>
            {data?.campaign.blurb && <p style={{ color: 'var(--hx-muted)', margin: '4px 0 0' }}>{data.campaign.blurb}</p>}
          </div>

          {error && <div className={styles.error}>{error}</div>}
          {!data && !error && (
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', color: 'var(--hx-muted)' }}>
              <span className={styles.spinner} /> Loading campaign…
            </div>
          )}

          {data && (
            <>
              <section className={styles.framedPanel}>
                <div className={styles.framedPanelTop} />
                <h2 className={styles.panelTitle}>Members</h2>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
                  {data.members.map((m) => (
                    <div key={m.userId} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Avatar url={m.avatarUrl} name={m.displayName} />
                      <div>
                        <div style={{ color: 'var(--hx-text)', fontSize: 14 }}>{m.displayName}</div>
                        <RoleBadge role={m.role} />
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              {/* Invite UI — DM only (B5b). */}
              {data.campaign.role === 'dm' && <InvitesPanel campaignId={campaignId} />}

              {/* Campaign builder — DM only (Phase P): art banner, gallery/maps with
                  per-image player visibility, and player-visible + private notes. */}
              {data.campaign.role === 'dm' && (
                <>
                  <CampaignArtControl campaignId={campaignId} initialArtUrl={data.campaign.theme?.artUrl ?? null} />
                  <CampaignGalleryDm campaignId={campaignId} />
                  <CampaignNotesDm campaignId={campaignId} initialNotes={data.campaign.theme?.notes ?? ''} initialDmNotes={data.campaign.theme?.dmNotes ?? ''} />
                </>
              )}

              <section className={styles.framedPanel}>
                <div className={styles.framedPanelTop} />
                <h2 className={styles.panelTitle}>Characters</h2>
                {data.campaign.role === 'dm' && (
                  <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                    <input
                      className={styles.input}
                      style={{ width: 'auto', flex: 1, minWidth: 140, padding: '8px 10px' }}
                      placeholder="Character name…"
                      value={newChar.name}
                      onChange={(e) => setNewChar((c) => ({ ...c, name: e.target.value }))}
                    />
                    <select className={styles.input} style={{ width: 'auto', padding: '8px 10px' }} value={newChar.sheetType} onChange={(e) => setNewChar((c) => ({ ...c, sheetType: e.target.value }))}>
                      <option value="generic">Generic</option>
                      <option value="lazzuh">Lazzuh</option>
                      <option value="streamer">Streamer</option>
                    </select>
                    <select className={styles.input} style={{ width: 'auto', padding: '8px 10px' }} value={newChar.isNpc ? 'npc' : 'pc'} onChange={(e) => setNewChar((c) => ({ ...c, isNpc: e.target.value === 'npc' }))}>
                      <option value="pc">PC</option>
                      <option value="npc">NPC</option>
                    </select>
                    <select className={styles.input} style={{ width: 'auto', padding: '8px 10px' }} value={newChar.ownerUserId} onChange={(e) => setNewChar((c) => ({ ...c, ownerUserId: e.target.value }))}>
                      <option value="">Unassigned</option>
                      {data.members.filter((m) => m.role !== 'dm').map((m) => (
                        <option key={m.userId} value={m.userId}>{m.displayName}</option>
                      ))}
                    </select>
                    <button className={`${styles.hexBtn} ${styles.hexBtnPrimary}`} onClick={createCharacter}>+ Add</button>
                  </div>
                )}
                {data.characters.length === 0 ? (
                  <p style={{ color: 'var(--hx-muted)' }}>No characters yet.</p>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 12 }}>
                    {data.characters.map((c) => (
                      <div key={c.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                        <button
                          onClick={() => router.push(`/dnd/characters/${c.id}`)}
                          title={`Open ${c.name}'s sheet (DM controls)`}
                          style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 0, background: 'transparent', border: '1px solid transparent', borderRadius: 6, padding: '8px 4px', cursor: 'pointer', color: 'inherit' }}
                        >
                          <Avatar url={c.token_url} name={c.name} size={56} />
                          <div style={{ marginTop: 6, fontSize: 13, color: 'var(--hx-text)' }}>{c.name}</div>
                          <span style={{ fontSize: 9.5, letterSpacing: '0.1em', color: c.is_npc ? 'var(--hx-gold-2)' : 'var(--hx-teal-1)' }}>{c.is_npc ? 'NPC' : 'PC'}</span>
                        </button>
                        <button
                          onClick={() => toggleClaimable(c.id, !c.claimable)}
                          title={c.claimable ? 'Players can claim this character — click to lock it' : 'Let a player claim this character to play as it'}
                          style={{ fontSize: 9.5, letterSpacing: '0.08em', padding: '2px 6px', cursor: 'pointer', color: c.claimable ? 'var(--hx-gold-2)' : 'var(--hx-muted)', background: c.claimable ? 'rgba(200,155,60,0.12)' : 'transparent', border: `1px solid ${c.claimable ? 'var(--hx-gold-1)' : 'var(--hx-line)'}`, borderRadius: 4 }}
                        >
                          {c.claimable ? '⭐ CLAIMABLE' : 'CLAIM: OFF'}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <section className={styles.framedPanel}>
                <div className={styles.framedPanelTop} />
                <h2 className={styles.panelTitle}>Sessions</h2>
                {data.campaign.role === 'dm' && (
                  <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
                    <input
                      className={styles.input}
                      style={{ width: 'auto', flex: 1, minWidth: 160, padding: '8px 10px' }}
                      placeholder="New session title…"
                      value={newSession}
                      onChange={(e) => setNewSession(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && createSession()}
                    />
                    <button className={`${styles.hexBtn} ${styles.hexBtnPrimary}`} onClick={createSession}>+ Add Session</button>
                  </div>
                )}
                {data.sessions.length === 0 ? (
                  <p style={{ color: 'var(--hx-muted)' }}>No sessions yet.</p>
                ) : (
                  <div style={{ display: 'grid', gap: 6 }}>
                    {data.sessions.map((s) => (
                      <button
                        key={s.id}
                        onClick={() => router.push(`/dnd/campaigns/${campaignId}/sessions/${s.id}`)}
                        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: '9px 12px', background: 'rgba(1,10,19,0.4)', border: '1px solid var(--hx-line)', color: 'var(--hx-text)', cursor: 'pointer', textAlign: 'left' }}
                      >
                        <span>{s.title}</span>
                        <span style={{ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: STATUS_COLOR[s.status] ?? 'var(--hx-muted)' }}>{s.status}</span>
                      </button>
                    ))}
                  </div>
                )}
              </section>

              {/* Party chat + private whispers to individual players — DM only surface
                  here (players use their own hub). Direct channel = private message. */}
              <section className={styles.framedPanel}>
                <div className={styles.framedPanelTop} />
                <h2 className={styles.panelTitle}>Chat &amp; Private Messages</h2>
                <Chat campaignId={campaignId} initialMembers={data.members.map((m) => ({ id: m.userId, name: m.displayName }))} />
              </section>

              {/* Soundboard — a DM-only mechanic (ambience/SFX) players can't see. */}
              <section className={styles.framedPanel}>
                <div className={styles.framedPanelTop} />
                <h2 className={styles.panelTitle}>Soundboard</h2>
                <Soundboard campaignId={campaignId} />
              </section>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

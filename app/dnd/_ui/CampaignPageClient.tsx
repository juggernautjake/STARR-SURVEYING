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
import CampaignMapsDm from './CampaignMapsDm'

export interface CampaignDetail {
  campaign: { id: string; name: string; blurb?: string | null; role: string; theme?: { artUrl?: string | null; notes?: string | null; dmNotes?: string | null } | null }
  members: { userId: string; role: string; displayName: string; avatarUrl?: string | null }[]
  characters: {
    id: string; name: string; token_url?: string | null; is_npc: boolean; sheet_type?: string;
    rosterRole?: string; // 'pc' | 'special_npc' | 'generic_npc' (Slice 30)
    ownerUserId?: string | null; ownerName?: string | null; playedByUserId?: string | null; playedByName?: string | null;
  }[]
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
  const [newPlayer, setNewPlayer] = useState('')
  const [memberErr, setMemberErr] = useState<string | null>(null)
  // "Add an existing character I own" picker (my characters not already in this campaign).
  const [myChars, setMyChars] = useState<{ id: string; name: string }[]>([])
  const [addPick, setAddPick] = useState('')

  const [search, setSearch] = useState('')

  // "+ Character" opens the builder in this campaign — AI quick-build (like the stream-chatter→NPC
  // flow) or the full manual builder. Routing there, rather than quietly POSTing a blank character,
  // is what the report asked for ("reroute us to the character creation page or something").
  function createCharacter() {
    if (!data) return
    router.push(`/dnd/characters/new?campaignId=${data.campaign.id}`)
  }

  // Add a player to the campaign by their sign-in name.
  async function addPlayer() {
    const name = newPlayer.trim()
    if (!name || !data) return
    setMemberErr(null)
    const res = await fetch(`/api/dnd/campaigns/${data.campaign.id}/members`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }),
    })
    const j = await res.json().catch(() => ({}))
    if (res.ok && j.member) {
      setData((d) => (d ? { ...d, members: [...d.members, { userId: j.member.userId, role: 'player', displayName: j.member.displayName }] } : d))
      setNewPlayer('')
    } else setMemberErr(j.error || 'Could not add that player.')
  }

  // Remove a player from the campaign (their characters stay for the DM to reassign).
  async function removePlayer(userId: string, name: string) {
    if (!data || !window.confirm(`Remove ${name} from this campaign?`)) return
    const res = await fetch(`/api/dnd/campaigns/${data.campaign.id}/members/${userId}`, { method: 'DELETE' })
    if (res.ok) setData((d) => (d ? { ...d, members: d.members.filter((m) => m.userId !== userId) } : d))
    else { const j = await res.json().catch(() => ({})); setMemberErr(j.error || 'Could not remove that player.') }
  }

  // Move a character between roster categories (Slice 30). Editorial only — the sheet is untouched;
  // the server keeps is_npc in sync. Optimistic local update so the card jumps groups immediately.
  async function setRosterRole(id: string, rosterRole: string) {
    setData((d) => (d ? { ...d, characters: d.characters.map((c) => (c.id === id ? { ...c, rosterRole, is_npc: rosterRole !== 'pc' } : c)) } : d))
    await fetch(`/api/dnd/characters/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ roster_role: rosterRole }),
    }).catch(() => {})
  }

  // Assign who plays a character (ownership never changes). '' = the owner plays it.
  async function assignPlayer(id: string, userId: string) {
    const player = data?.members.find((m) => m.userId === userId)
    setData((d) => (d ? { ...d, characters: d.characters.map((c) => (c.id === id ? { ...c, playedByUserId: userId || null, playedByName: player?.displayName ?? null } : c)) } : d))
    await fetch(`/api/dnd/characters/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ played_by_user_id: userId || null }),
    }).catch(() => {})
  }

  // Remove a character from THIS campaign (it stays with its owner; ownership untouched).
  async function removeFromCampaign(id: string, name: string) {
    if (!data || !window.confirm(`Remove "${name}" from this campaign? The owner keeps the character — it just leaves this table.`)) return
    const res = await fetch(`/api/dnd/campaigns/${data.campaign.id}/characters/${id}`, { method: 'DELETE' })
    if (res.ok) setData((d) => (d ? { ...d, characters: d.characters.filter((c) => c.id !== id) } : d))
  }

  // Add one of the DM's own existing characters into this campaign (multi-campaign).
  async function addExistingCharacter() {
    if (!addPick || !data) return
    const res = await fetch(`/api/dnd/campaigns/${data.campaign.id}/characters`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ characterId: addPick }),
    })
    if (res.ok) { setAddPick(''); router.refresh() }
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

  // Load the DM's own characters (owned by them) so they can add existing ones that
  // aren't already in this campaign into the roster.
  useEffect(() => {
    if (!data || data.campaign.role !== 'dm') return
    let cancelled = false
    fetch('/api/dnd/characters')
      .then((r) => (r.ok ? r.json() : { characters: [] }))
      .then((j) => {
        if (cancelled) return
        const here = new Set(data.characters.map((c) => c.id))
        setMyChars(((j.characters ?? []) as { id: string; name: string }[]).filter((c) => !here.has(c.id)).map((c) => ({ id: c.id, name: c.name })))
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [data])

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
            <a className={styles.hexBtn} href="/dnd" style={{ marginBottom: 10 }}>← Lobby (sign out / switch)</a>
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
                      {data.campaign.role === 'dm' && m.role !== 'dm' && (
                        <button
                          onClick={() => removePlayer(m.userId, m.displayName)}
                          title={`Remove ${m.displayName} from the campaign`}
                          style={{ fontSize: 11, padding: '2px 6px', cursor: 'pointer', color: '#ff6b6b', background: 'transparent', border: '1px solid var(--hx-line)', borderRadius: 4 }}
                        >
                          ✕ remove
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                {data.campaign.role === 'dm' && (
                  <div style={{ marginTop: 14 }}>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                      <input
                        className={styles.input}
                        style={{ width: 'auto', flex: '1 1 200px', padding: '8px 10px' }}
                        placeholder="Add player by their sign-in name…"
                        value={newPlayer}
                        onChange={(e) => { setNewPlayer(e.target.value); setMemberErr(null) }}
                        onKeyDown={(e) => e.key === 'Enter' && addPlayer()}
                      />
                      <button className={styles.hexBtn} style={{ padding: '8px 16px' }} onClick={addPlayer} disabled={!newPlayer.trim()}>＋ Add player</button>
                    </div>
                    {memberErr && <div className={styles.error} style={{ marginTop: 8 }}>{memberErr}</div>}
                    <p style={{ margin: '6px 0 0', fontSize: 11.5, color: 'var(--hx-muted)' }}>
                      They need to have signed in at least once (so their name exists). To invite someone new, use the invite panel below.
                    </p>
                  </div>
                )}
              </section>

              {/* Invite UI — DM only (B5b). */}
              {data.campaign.role === 'dm' && <InvitesPanel campaignId={campaignId} />}

              {/* Campaign builder — DM only (Phase P): art banner, gallery/maps with
                  per-image player visibility, and player-visible + private notes. */}
              {data.campaign.role === 'dm' && (
                <>
                  <CampaignArtControl campaignId={campaignId} initialArtUrl={data.campaign.theme?.artUrl ?? null} />
                  <CampaignGalleryDm campaignId={campaignId} />
                  <CampaignMapsDm campaignId={campaignId} />
                  <CampaignNotesDm campaignId={campaignId} initialNotes={data.campaign.theme?.notes ?? ''} initialDmNotes={data.campaign.theme?.dmNotes ?? ''} />
                </>
              )}

              <section className={styles.framedPanel}>
                <div className={styles.framedPanelTop} />
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <h2 className={styles.panelTitle} style={{ margin: 0, flex: 1 }}>Characters</h2>
                  {/* Build a new character. This is the CREATE entry (the search box below does not
                      create anything). Routes to the builder page — AI quick-build like the
                      stream-chatter→NPC flow, or the full manual builder. */}
                  {data.campaign.role === 'dm' && (
                    <button className={`${styles.hexBtn} ${styles.hexBtnPrimary}`} style={{ padding: '8px 16px' }} onClick={createCharacter} title="Build a new character in this campaign — quick AI build or the full builder.">
                      ＋ Character
                    </button>
                  )}
                </div>
                {/* Search the roster by name. Just filters the cards below — it never creates. */}
                <div style={{ display: 'flex', gap: 8, margin: '12px 0', alignItems: 'center' }}>
                  <input
                    className={styles.input}
                    style={{ width: 'auto', flex: 1, minWidth: 140, padding: '8px 10px' }}
                    placeholder="Search characters by name…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    aria-label="Search characters"
                  />
                  {search && (
                    <button className={styles.hexBtn} style={{ padding: '8px 14px' }} onClick={() => setSearch('')} title="Clear the search">Clear</button>
                  )}
                </div>
                {/* Bring in a character you already own that isn't in this campaign yet. */}
                {data.campaign.role === 'dm' && myChars.length > 0 && (
                  <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                    <select
                      className={styles.input}
                      style={{ width: 'auto', flex: '1 1 200px', padding: '8px 10px' }}
                      value={addPick}
                      onChange={(e) => setAddPick(e.target.value)}
                      title="Add one of your existing characters into this campaign. Characters can be in several campaigns at once — this just links it here without changing who owns it."
                    >
                      <option value="">Add an existing character you own…</option>
                      {myChars.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                    <button
                      className={styles.hexBtn}
                      style={{ padding: '8px 16px' }}
                      onClick={addExistingCharacter}
                      disabled={!addPick}
                      title="Link the selected character to this campaign."
                    >
                      ＋ Add existing
                    </button>
                  </div>
                )}
                {(() => {
                  const q = search.trim().toLowerCase()
                  const shown = q ? data.characters.filter((c) => c.name.toLowerCase().includes(q)) : data.characters
                  if (data.characters.length === 0) return <p style={{ color: 'var(--hx-muted)' }}>No characters yet.</p>
                  if (shown.length === 0) return <p style={{ color: 'var(--hx-muted)' }}>No characters match “{search.trim()}”.</p>
                  // Group by roster category (Slice 30): PCs, special NPCs, generic NPCs. Editorial
                  // buckets over the same Character — moving between them is a field change.
                  const roleOf = (c: (typeof shown)[number]) => c.rosterRole ?? (c.is_npc ? 'generic_npc' : 'pc')
                  const GROUPS: { key: string; label: string }[] = [
                    { key: 'pc', label: 'Player Characters' },
                    { key: 'special_npc', label: 'Special NPCs' },
                    { key: 'generic_npc', label: 'Generic NPCs' },
                  ]
                  return (
                  <div style={{ display: 'grid', gap: 16 }}>
                    {GROUPS.map((g) => {
                      const inGroup = shown.filter((c) => roleOf(c) === g.key)
                      if (inGroup.length === 0) return null
                      return (
                  <div key={g.key} style={{ display: 'grid', gap: 8 }}>
                    <h3 style={{ margin: 0, fontSize: 12, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--hx-gold-2)' }}>{g.label} <span style={{ color: 'var(--hx-muted)' }}>· {inGroup.length}</span></h3>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 12 }}>
                    {inGroup.map((c) => {
                      const players = data.members.filter((m) => m.role !== 'dm')
                      const playedBy = c.playedByUserId && c.playedByUserId !== c.ownerUserId ? c.playedByName : null
                      return (
                        <div key={c.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: '10px 6px', border: '1px solid var(--hx-line)', borderRadius: 6, background: 'rgba(1,10,19,0.4)' }}>
                          <button
                            onClick={() => router.push(`/dnd/characters/${c.id}`)}
                            title={`Open ${c.name}'s sheet (DM controls)`}
                            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 0, background: 'transparent', border: '1px solid transparent', borderRadius: 6, padding: '2px 4px', cursor: 'pointer', color: 'inherit' }}
                          >
                            <Avatar url={c.token_url} name={c.name} size={56} />
                            <div style={{ marginTop: 6, fontSize: 13, color: 'var(--hx-text)', wordBreak: 'break-word' }}>{c.name}</div>
                            <span style={{ fontSize: 9, letterSpacing: '0.1em', color: c.is_npc ? 'var(--hx-gold-2)' : 'var(--hx-teal-1)' }}>{c.is_npc ? 'NPC' : 'PC'}</span>
                          </button>
                          <div style={{ fontSize: 10, color: 'var(--hx-muted)', textAlign: 'center', lineHeight: 1.4 }} title="Ownership never changes — it belongs to whoever created it. You can pick who plays it below.">
                            Owner: <span style={{ color: 'var(--hx-text)' }}>{c.ownerName ?? (c.ownerUserId ? 'Player' : 'You (DM)')}</span>
                            {playedBy && <><br />Played by: <span style={{ color: 'var(--hx-teal-1)' }}>{playedBy}</span></>}
                          </div>
                          {/* Assign who plays this character (owner-owned; play only). */}
                          <select
                            className={styles.input}
                            style={{ width: '100%', padding: '4px 8px', fontSize: 11 }}
                            value={c.playedByUserId ?? ''}
                            onChange={(e) => assignPlayer(c.id, e.target.value)}
                            title="Choose who plays this character in this campaign. This does NOT transfer ownership — it just lets that player open and run the character. Leave blank for the owner to play it."
                          >
                            <option value="">Played by owner</option>
                            {players.map((m) => <option key={m.userId} value={m.userId}>Played by {m.displayName}</option>)}
                          </select>
                          {/* Move between roster categories (Slice 30) — editorial, not mechanical. */}
                          <select
                            className={styles.input}
                            style={{ width: '100%', padding: '4px 8px', fontSize: 11 }}
                            value={c.rosterRole ?? (c.is_npc ? 'generic_npc' : 'pc')}
                            onChange={(e) => setRosterRole(c.id, e.target.value)}
                            title="Categorise this character: a player character, a special (named/recurring) NPC, or a generic NPC. This is editorial only — it never changes the sheet."
                          >
                            <option value="pc">Player Character</option>
                            <option value="special_npc">Special NPC</option>
                            <option value="generic_npc">Generic NPC</option>
                          </select>
                          <button
                            onClick={() => removeFromCampaign(c.id, c.name)}
                            title="Remove this character from THIS campaign only. The owner keeps it — it just leaves this table. (A character can be in several campaigns.)"
                            style={{ fontSize: 10, letterSpacing: '0.06em', padding: '2px 8px', cursor: 'pointer', color: '#ff6b6b', background: 'transparent', border: '1px solid var(--hx-line)', borderRadius: 4 }}
                          >
                            ✕ remove from campaign
                          </button>
                        </div>
                      )
                    })}
                  </div>
                  </div>
                      )
                    })}
                  </div>
                  )
                })()}
              </section>

              <section className={styles.framedPanel}>
                <div className={styles.framedPanelTop} />
                <h2 className={styles.panelTitle}>Sessions</h2>
                {data.campaign.role === 'dm' && (
                  <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap', alignItems: 'center' }}>
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

'use client'
// CampaignHub (Phase P) — the campaign hub a signed-in *player* sees when they open a
// campaign they're in. Shows the campaign art + setting, the full roster (all characters
// + the DM), the party chat with a one-click "Message the DM" (private whisper), and the
// read-only session summaries. Their own character is highlighted and opens their sheet.
// (The DM gets the richer control panel instead — see the campaign route.)
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import styles from './hextech.module.css'
import Chat from './Chat'
import Lightbox from './Lightbox'
import type { CampaignHubData } from '@/lib/dnd/campaign-summary'
import { systemLabel, normalizeSystem, SYSTEM_AMBIGUOUS } from '@/lib/dnd/systems'

function Portrait({ url, name, size }: { url: string | null; name: string; size: number }) {
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img className={styles.portrait} src={url} alt="" style={{ width: size, height: size }} />
  }
  return (
    <span className={styles.portrait} style={{ width: size, height: size, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.4, fontFamily: 'var(--hx-font-display)', color: 'var(--hx-gold-2)' }}>
      {(name || '?').charAt(0).toUpperCase()}
    </span>
  )
}

type MyCharacter = { id: string; name: string }

export default function CampaignHub({ data, selfId }: { data: CampaignHubData; selfId: string }) {
  const router = useRouter()
  const [messagingDm, setMessagingDm] = useState(false)
  const [lightbox, setLightbox] = useState<string | null>(null)
  // "Bring one of my characters" picker: the viewer's own characters not already here.
  const [myChars, setMyChars] = useState<MyCharacter[] | null>(null)
  const [addPick, setAddPick] = useState('')
  const [adding, setAdding] = useState(false)
  const [addErr, setAddErr] = useState<string | null>(null)
  const chatRef = useRef<HTMLDivElement>(null)
  const members = data.members.map((m) => ({ id: m.userId, name: m.name }))

  // Load the characters this player OWNS but hasn't brought into this campaign yet.
  useEffect(() => {
    let cancelled = false
    fetch('/api/dnd/characters')
      .then((r) => (r.ok ? r.json() : { characters: [] }))
      .then((j) => {
        if (cancelled) return
        const here = new Set(data.characters.map((c) => c.id))
        const mine = ((j.characters ?? []) as { id: string; name: string; owner_user_id?: string | null }[])
          .filter((c) => !here.has(c.id))
          .map((c) => ({ id: c.id, name: c.name }))
        setMyChars(mine)
      })
      .catch(() => { if (!cancelled) setMyChars([]) })
    return () => { cancelled = true }
  }, [data.characters])

  // Bring one of your own characters into this campaign (you keep ownership).
  async function addMyCharacter() {
    if (!addPick || adding) return
    setAdding(true); setAddErr(null)
    try {
      const r = await fetch(`/api/dnd/campaigns/${data.id}/characters`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ characterId: addPick }),
      })
      const j = await r.json().catch(() => ({}))
      if (r.ok) { setAddPick(''); router.refresh() }
      else setAddErr(j.error || 'Could not add that character.')
    } catch { setAddErr('Could not add that character.') } finally { setAdding(false) }
  }

  // Cross-system port (38d): the campaign's own characters of MINE that are built for a different
  // system than this campaign runs. The transpose endpoint already exists (non-destructive — it
  // installs a new system-variant and keeps the source), so this just offers to call it.
  const [translating, setTranslating] = useState<string | null>(null)
  const [translateErr, setTranslateErr] = useState<string | null>(null)
  const campSys = data.system ? normalizeSystem(data.system) : SYSTEM_AMBIGUOUS
  const mismatched =
    campSys === SYSTEM_AMBIGUOUS
      ? []
      : data.characters.filter((c) => c.mine && c.system && normalizeSystem(c.system) !== SYSTEM_AMBIGUOUS && normalizeSystem(c.system) !== campSys)

  async function translate(charId: string) {
    if (!data.system || translating) return
    setTranslating(charId); setTranslateErr(null)
    try {
      const r = await fetch(`/api/dnd/characters/${charId}/system`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ system: data.system }),
      })
      const j = await r.json().catch(() => ({}))
      if (r.ok) router.refresh()
      else setTranslateErr(j.error || 'Could not translate — try again.')
    } catch { setTranslateErr('Could not translate — try again.') } finally { setTranslating(null) }
  }

  function messageDm() {
    setMessagingDm(true)
    // remount Chat focused on the DM whisper, then scroll it into view
    requestAnimationFrame(() => chatRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }

  return (
    <div className={styles.root}>
      <div className={styles.screen} style={{ alignItems: 'flex-start' }}>
        <div style={{ width: '100%', maxWidth: 960, display: 'grid', gap: 18, margin: '0 auto' }}>
          <div>
            <a className={styles.hexBtn} href="/dnd" style={{ marginBottom: 10 }}>← Campaigns</a>
            <h1 className={styles.title} style={{ textAlign: 'left', margin: '8px 0 0' }}>{data.name}</h1>
            {data.setting && <p style={{ color: 'var(--hx-muted)', margin: '4px 0 0' }}>{data.setting}</p>}
          </div>

          {/* Campaign art */}
          {data.artUrl && (
            <div className={styles.framedPanel} style={{ padding: 6, overflow: 'hidden' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={data.artUrl} alt={`${data.name} — campaign art`} style={{ display: 'block', width: '100%', height: 'auto', maxHeight: 360, objectFit: 'cover', borderRadius: 4 }} />
            </div>
          )}

          {/* Campaign info the DM shared with players */}
          {data.notes && (
            <section className={styles.framedPanel}>
              <div className={styles.framedPanelTop} />
              <h2 className={styles.panelTitle}>Campaign Info</h2>
              <div style={{ whiteSpace: 'pre-wrap', fontSize: 14, lineHeight: 1.55, color: 'var(--hx-text)' }}>{data.notes}</div>
            </section>
          )}

          {/* Player-visible gallery (maps, setting art, item art, handouts) */}
          {data.gallery.length > 0 && (
            <section className={styles.framedPanel}>
              <div className={styles.framedPanelTop} />
              <h2 className={styles.panelTitle}>Gallery &amp; Maps</h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 12 }}>
                {data.gallery.map((m) => (
                  <button key={m.id} onClick={() => setLightbox(m.url)} title="Click to expand" style={{ border: '1px solid var(--hx-line)', background: 'rgba(1,10,19,0.4)', padding: 6, display: 'grid', gap: 4, textAlign: 'left', cursor: 'zoom-in', color: 'inherit' }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={m.url} alt={m.label ?? ''} style={{ width: '100%', height: 100, objectFit: 'cover', borderRadius: 3 }} />
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6, fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--hx-muted)' }}>
                      <span>{m.kind}</span>
                    </div>
                    {m.label && <div style={{ fontSize: 12, color: 'var(--hx-text)', wordBreak: 'break-word' }}>{m.label}</div>}
                  </button>
                ))}
              </div>
            </section>
          )}

          {/* The campaign's published map (image maps show inline; interactive maps get a button) */}
          {data.publishedMap && (data.publishedMap.kind === 'image' ? data.publishedMap.imageUrl : true) && (
            <section className={styles.framedPanel}>
              <div className={styles.framedPanelTop} />
              <h2 className={styles.panelTitle}>Galaxy Map — {data.publishedMap.name}</h2>
              {data.publishedMap.kind === 'image' && data.publishedMap.imageUrl ? (
                <button onClick={() => setLightbox(data.publishedMap!.imageUrl)} title="Click to expand" style={{ display: 'block', width: '100%', border: '1px solid var(--hx-line)', background: '#010a13', padding: 4, cursor: 'zoom-in', borderRadius: 4 }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={data.publishedMap.imageUrl} alt={data.publishedMap.name} style={{ display: 'block', width: '100%', height: 'auto', maxHeight: 460, objectFit: 'contain', borderRadius: 3 }} />
                </button>
              ) : (
                <a href={`/dnd/campaigns/${data.id}/console?map=${data.publishedMap.id}`} className={`${styles.hexBtn} ${styles.hexBtnPrimary}`} style={{ justifyContent: 'center', padding: '12px', textDecoration: 'none' }}>
                  ✦ Open the interactive map
                </a>
              )}
            </section>
          )}

          {/* Your character — open it, or create one if you haven't yet (onboarding) */}
          {data.myCharacterId ? (
            <a
              href={`/dnd/characters/${data.myCharacterId}`}
              className={`${styles.hexBtn} ${styles.hexBtnPrimary}`}
              style={{ justifyContent: 'center', padding: '12px', fontSize: 15, textDecoration: 'none' }}
            >
              ▶ Open your character sheet
            </a>
          ) : (
            <div className={styles.framedPanel} style={{ display: 'grid', gap: 8, padding: '16px 18px', borderColor: 'var(--hx-gold-1)' }}>
              <h2 className={styles.panelTitle} style={{ margin: 0, fontSize: 15 }}>Join this table with a character</h2>
              <p style={{ margin: 0, fontSize: 12.5, color: 'var(--hx-muted)', lineHeight: 1.5 }}>
                Two ways in (38c): <strong>bring a character you already have</strong>, or <strong>make a new one</strong> —
                upload a sheet, PDF, or art for the AI to build it out, or start blank.
              </p>
              {/* Bring an existing character — only shown when you own one not already at this table. */}
              {(myChars?.length ?? 0) > 0 && (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <select className={styles.input} style={{ width: 'auto', flex: 1, minWidth: 150, padding: '9px 10px' }} value={addPick} onChange={(e) => setAddPick(e.target.value)}>
                    <option value="">Bring an existing character…</option>
                    {(myChars ?? []).map((mc) => <option key={mc.id} value={mc.id}>{mc.name}</option>)}
                  </select>
                  <button className={styles.hexBtn} onClick={addMyCharacter} disabled={!addPick || adding}>
                    {adding ? 'Bringing…' : 'Bring'}
                  </button>
                </div>
              )}
              {addErr && <p style={{ color: 'var(--hx-danger)', fontSize: 12, margin: 0 }}>{addErr}</p>}
              <a
                href={`/dnd/characters/new?campaignId=${data.id}`}
                className={`${styles.hexBtn} ${styles.hexBtnPrimary}`}
                style={{ justifyContent: 'center', padding: '12px', fontSize: 15, textDecoration: 'none' }}
              >
                ＋ Make a new character
              </a>
            </div>
          )}

          {/* 38d — a character of yours built for another system, offered a translate into this
              campaign's rulebook. The port is non-destructive: your original sheet stays a variant. */}
          {mismatched.map((c) => (
            <div key={`xlate-${c.id}`} className={styles.framedPanel} style={{ display: 'grid', gap: 6, padding: '12px 16px', borderColor: 'var(--hx-gold-1)' }}>
              <p style={{ margin: 0, fontSize: 12.5, color: 'var(--hx-text)', lineHeight: 1.5 }}>
                <strong>{c.name}</strong> is built for <strong>{systemLabel(normalizeSystem(c.system!))}</strong>, but this
                campaign runs <strong>{systemLabel(campSys)}</strong>. Translate it? The AI transposes a new
                {' '}{systemLabel(campSys)} sheet — your original stays intact.
              </p>
              <div>
                <button className={`${styles.hexBtn} ${styles.hexBtnPrimary}`} onClick={() => translate(c.id)} disabled={translating === c.id}>
                  {translating === c.id ? 'Translating…' : `⇄ Translate ${c.name} to ${systemLabel(campSys)}`}
                </button>
              </div>
              {translateErr && translating === null && <p style={{ color: 'var(--hx-danger)', fontSize: 12, margin: 0 }}>{translateErr}</p>}
            </div>
          ))}

          {/* Roster: DM + all characters */}
          <section className={styles.framedPanel}>
            <div className={styles.framedPanelTop} />
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
              <h2 className={styles.panelTitle} style={{ margin: 0 }}>The Table</h2>
              {data.dm && (
                <button className={styles.hexBtn} style={{ padding: '6px 12px', fontSize: 12 }} onClick={messageDm}>
                  ✉ Message the DM
                </button>
              )}
            </div>

            {data.dm && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '12px 0', padding: '10px 12px', border: '1px solid var(--hx-gold-1)', background: 'rgba(200,155,60,0.06)' }}>
                <Portrait url={null} name={data.dm.name} size={44} />
                <div>
                  <div style={{ color: 'var(--hx-gold-2)', fontFamily: 'var(--hx-font-display)', fontSize: 15 }}>{data.dm.name}</div>
                  <span style={{ fontSize: 10, letterSpacing: '0.12em', color: 'var(--hx-gold-2)', border: '1px solid currentColor', padding: '1px 5px' }}>DUNGEON MASTER</span>
                </div>
              </div>
            )}

            {data.characters.length === 0 ? (
              <p style={{ color: 'var(--hx-muted)' }}>No characters yet.</p>
            ) : (
              (() => {
                // Group the roster into the DM's three editorial buckets so players read the
                // table the way the DM organised it: the party first, then named/recurring
                // NPCs, then the walk-on generics. A card's own logic (label/tint) is unchanged.
                const renderCard = (c: (typeof data.characters)[number]) => {
                  const watchStream = c.sheetType === 'streamer' && !c.mine
                  // Who plays it: label the player when someone other than the owner runs it.
                  const playedBy = c.playedByName && c.playedByUserId !== c.ownerUserId ? c.playedByName : null
                  const label = c.mine
                    ? 'YOUR CHARACTER'
                    : watchStream
                      ? '🔴 WATCH STREAM'
                      : c.isNpc
                        ? 'NPC'
                        : (playedBy ?? c.ownerName ?? 'PC').toUpperCase()
                  const tip = c.mine
                    ? `Open ${c.name}'s sheet — you play this character`
                    : watchStream
                      ? `Watch ${c.name}'s live stream`
                      : `${c.name} — owned by ${c.ownerName ?? 'someone'}${playedBy ? `, played by ${playedBy}` : ''}. Open to view.`
                  return (
                    <button
                      key={c.id}
                      onClick={() => (watchStream ? router.push(`/dnd/stream/${c.id}`) : router.push(`/dnd/characters/${c.id}`))}
                      title={tip}
                      style={{
                        display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 6,
                        padding: '14px 8px', cursor: 'pointer', color: 'inherit',
                        background: c.mine ? 'rgba(45,193,167,0.08)' : 'rgba(1,10,19,0.4)',
                        border: `1px solid ${c.mine ? 'var(--hx-teal-1)' : 'var(--hx-line)'}`,
                      }}
                    >
                      <Portrait url={c.portrait} name={c.name} size={64} />
                      <span style={{ fontSize: 13.5, color: 'var(--hx-text)', wordBreak: 'break-word' }}>{c.name}</span>
                      <span style={{ fontSize: 9.5, letterSpacing: '0.1em', color: watchStream ? '#ff4d4d' : c.mine ? 'var(--hx-teal-1)' : c.isNpc ? 'var(--hx-gold-2)' : 'var(--hx-muted)' }}>
                        {label}
                      </span>
                    </button>
                  )
                }
                const groups: { key: string; title: string; chars: typeof data.characters }[] = [
                  { key: 'pc', title: 'Player Characters', chars: data.characters.filter((c) => c.rosterRole === 'pc') },
                  { key: 'special_npc', title: 'Notable NPCs', chars: data.characters.filter((c) => c.rosterRole === 'special_npc') },
                  { key: 'generic_npc', title: 'NPCs', chars: data.characters.filter((c) => c.rosterRole === 'generic_npc') },
                ].filter((g) => g.chars.length > 0)
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    {groups.map((g) => (
                      <div key={g.key}>
                        {groups.length > 1 && (
                          <h3 style={{ margin: '0 0 8px', fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--hx-muted)' }}>
                            {g.title} <span style={{ opacity: 0.6 }}>({g.chars.length})</span>
                          </h3>
                        )}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 12 }}>
                          {g.chars.map(renderCard)}
                        </div>
                      </div>
                    ))}
                  </div>
                )
              })()
            )}

            {/* Bring one of your own characters into this campaign — you keep ownership,
                the character just joins this table too (it can be in many campaigns). */}
            {myChars && myChars.length > 0 && (
              <div style={{ marginTop: 14, borderTop: '1px solid var(--hx-line)', paddingTop: 12 }}>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  <select
                    className={styles.input}
                    style={{ width: 'auto', flex: '1 1 200px', padding: '8px 10px' }}
                    value={addPick}
                    onChange={(e) => { setAddPick(e.target.value); setAddErr(null) }}
                    title="Pick one of your own characters to bring into this campaign. You stay the owner — the character simply joins this table as well, and a character can be in several campaigns at once."
                  >
                    <option value="">Bring one of your characters…</option>
                    {myChars.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  <button
                    className={styles.hexBtn}
                    style={{ padding: '8px 16px' }}
                    onClick={addMyCharacter}
                    disabled={!addPick || adding}
                    title="Add the selected character to this campaign. You keep ownership; you can remove it again anytime."
                  >
                    {adding ? 'Adding…' : '＋ Add to campaign'}
                  </button>
                </div>
                {addErr && <div className={styles.error} style={{ marginTop: 8 }}>{addErr}</div>}
                <p style={{ margin: '6px 0 0', fontSize: 11.5, color: 'var(--hx-muted)' }}>
                  You own your characters. Bringing one here lets you play it in this campaign too — the same character can live in several campaigns.
                </p>
              </div>
            )}
          </section>

          {/* Campaign chat (party + private whispers to the DM) */}
          <section className={styles.framedPanel} ref={chatRef}>
            <div className={styles.framedPanelTop} />
            <h2 className={styles.panelTitle}>Campaign Chat</h2>
            <Chat
              key={messagingDm ? 'dm' : 'party'}
              campaignId={data.id}
              selfId={selfId}
              initialMembers={members}
              initialChannel={messagingDm ? 'direct' : 'party'}
              initialRecipients={messagingDm && data.dm ? [data.dm.userId] : undefined}
            />
          </section>

          {/* Read-only session summaries / notes */}
          <section className={styles.framedPanel}>
            <div className={styles.framedPanelTop} />
            <h2 className={styles.panelTitle}>Session Notes &amp; Summaries</h2>
            {data.recaps.length === 0 ? (
              <p style={{ color: 'var(--hx-muted)' }}>No session summaries yet. The DM posts recaps here after each game.</p>
            ) : (
              <div style={{ display: 'grid', gap: 12 }}>
                {data.recaps.map((r) => (
                  <details key={r.sessionId} style={{ border: '1px solid var(--hx-line)', background: 'rgba(1,10,19,0.4)' }}>
                    <summary style={{ cursor: 'pointer', padding: '10px 12px', color: 'var(--hx-gold-2)', fontFamily: 'var(--hx-font-display)', fontSize: 14, display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                      <span>{r.sessionTitle}</span>
                      <span style={{ fontSize: 10, letterSpacing: '0.12em', color: r.status === 'final' ? 'var(--hx-teal-1)' : 'var(--hx-muted)' }}>{r.status === 'final' ? 'FINAL' : 'DRAFT'}</span>
                    </summary>
                    <div style={{ whiteSpace: 'pre-wrap', fontSize: 14, lineHeight: 1.55, color: 'var(--hx-text)', padding: '0 12px 12px', maxHeight: 320, overflowY: 'auto' }}>{r.markdown}</div>
                  </details>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
      {lightbox && <Lightbox src={lightbox} onClose={() => setLightbox(null)} />}
    </div>
  )
}

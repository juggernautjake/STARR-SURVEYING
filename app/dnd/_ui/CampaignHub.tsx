'use client'
// CampaignHub (Phase P) — the campaign hub a signed-in *player* sees when they open a
// campaign they're in. Shows the campaign art + setting, the full roster (all characters
// + the DM), the party chat with a one-click "Message the DM" (private whisper), and the
// read-only session summaries. Their own character is highlighted and opens their sheet.
// (The DM gets the richer control panel instead — see the campaign route.)
import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import styles from './hextech.module.css'
import Chat from './Chat'
import type { CampaignHubData } from '@/lib/dnd/campaign-summary'

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

export default function CampaignHub({ data, selfId }: { data: CampaignHubData; selfId: string }) {
  const router = useRouter()
  const [messagingDm, setMessagingDm] = useState(false)
  const [claiming, setClaiming] = useState<string | null>(null)
  const chatRef = useRef<HTMLDivElement>(null)
  const members = data.members.map((m) => ({ id: m.userId, name: m.name }))

  // Claim an available character (DM-permitted or ownerless) → it becomes your private PC.
  async function claim(id: string, name: string) {
    if (claiming) return
    if (!window.confirm(`Claim "${name}" as your character?`)) return
    setClaiming(id)
    try {
      const r = await fetch(`/api/dnd/characters/${id}/claim`, { method: 'POST' })
      const j = await r.json().catch(() => ({}))
      if (r.ok) { router.push(`/dnd/characters/${id}`); router.refresh() }
      else { window.alert(j.error || 'Could not claim this character.'); setClaiming(null) }
    } catch { setClaiming(null) }
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
                  <a key={m.id} href={m.url} target="_blank" rel="noreferrer" style={{ border: '1px solid var(--hx-line)', background: 'rgba(1,10,19,0.4)', padding: 6, display: 'grid', gap: 4, textDecoration: 'none' }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={m.url} alt={m.label ?? ''} style={{ width: '100%', height: 100, objectFit: 'cover', borderRadius: 3 }} />
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6, fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--hx-muted)' }}>
                      <span>{m.kind}</span>
                    </div>
                    {m.label && <div style={{ fontSize: 12, color: 'var(--hx-text)', wordBreak: 'break-word' }}>{m.label}</div>}
                  </a>
                ))}
              </div>
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
              <h2 className={styles.panelTitle} style={{ margin: 0, fontSize: 15 }}>Create your character</h2>
              <p style={{ margin: 0, fontSize: 12.5, color: 'var(--hx-muted)', lineHeight: 1.5 }}>
                Review the campaign details above, then build your character — upload a sheet, PDF, or art for the AI to
                build it out, or start blank and fill it in yourself.
              </p>
              <a
                href={`/dnd/characters/new?campaignId=${data.id}`}
                className={`${styles.hexBtn} ${styles.hexBtnPrimary}`}
                style={{ justifyContent: 'center', padding: '12px', fontSize: 15, textDecoration: 'none' }}
              >
                ＋ Create your character
              </a>
            </div>
          )}

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
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 12 }}>
                {data.characters.map((c) => {
                  const canClaim = c.claimable && !c.mine
                  return (
                    <button
                      key={c.id}
                      onClick={() => (canClaim ? claim(c.id, c.name) : router.push(`/dnd/characters/${c.id}`))}
                      disabled={claiming === c.id}
                      title={canClaim ? `Claim ${c.name} as your character` : `Open ${c.name}'s sheet`}
                      style={{
                        display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 6,
                        padding: '14px 8px', cursor: 'pointer', color: 'inherit',
                        background: canClaim ? 'rgba(200,155,60,0.1)' : c.mine ? 'rgba(45,193,167,0.08)' : 'rgba(1,10,19,0.4)',
                        border: `1px solid ${canClaim ? 'var(--hx-gold-1)' : c.mine ? 'var(--hx-teal-1)' : 'var(--hx-line)'}`,
                      }}
                    >
                      <Portrait url={c.portrait} name={c.name} size={64} />
                      <span style={{ fontSize: 13.5, color: 'var(--hx-text)', wordBreak: 'break-word' }}>{c.name}</span>
                      <span style={{ fontSize: 9.5, letterSpacing: '0.1em', color: canClaim ? 'var(--hx-gold-2)' : c.isNpc ? 'var(--hx-gold-2)' : 'var(--hx-teal-1)' }}>
                        {claiming === c.id ? 'CLAIMING…' : canClaim ? '⭐ CLAIM THIS' : c.mine ? 'YOUR CHARACTER' : c.isNpc ? 'NPC' : c.ownerName ? c.ownerName.toUpperCase() : 'PC'}
                      </span>
                    </button>
                  )
                })}
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
    </div>
  )
}

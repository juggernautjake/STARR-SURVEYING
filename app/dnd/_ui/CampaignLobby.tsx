'use client'
// Per-campaign lobby — the "enter as" picker for one campaign. Players click their
// character to enter as themselves and open their sheet; the DM enters and lands on the
// control panel (the campaign management page, which now renders because the session is
// the DM). Uses the open-access /api/dnd/dev/enter to set the session (no password).
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import styles from './hextech.module.css'
import type { CampaignLobbyData } from '@/lib/dnd/campaign-summary'

export default function CampaignLobby({ data, currentName }: { data: CampaignLobbyData; currentName?: string | null }) {
  const router = useRouter()
  const [entering, setEntering] = useState<string | null>(null)
  const [acting, setActing] = useState<string | null>(currentName ?? null)
  const [error, setError] = useState<string | null>(null)

  async function enter(userId: string, target: string) {
    if (entering) return
    setEntering(userId)
    setError(null)
    try {
      const r = await fetch('/api/dnd/dev/enter', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId }) })
      if (r.ok) {
        router.push(target)
        router.refresh()
      } else {
        // Was a silent failure — the click just reverted with no explanation. Surface why (e.g. open
        // access is off / this isn't your character to enter) so the picker isn't a dead button.
        const j = await r.json().catch(() => ({}))
        setEntering(null)
        setError(j.error || "Couldn't open that character — you may only be able to enter your own, or open access is off.")
      }
    } catch {
      setEntering(null)
      setError('Network error — please try again.')
    }
  }

  async function logout() {
    await fetch('/api/dnd/auth/logout', { method: 'POST' }).catch(() => {})
    setActing(null)
    router.refresh()
  }

  const initial = (s: string) => (s || '?').charAt(0).toUpperCase()

  return (
    <div className={styles.root}>
      <div className={styles.screen} style={{ alignItems: 'flex-start' }}>
        <div style={{ width: '100%', maxWidth: 900, display: 'grid', gap: 20, margin: '0 auto' }}>
          <div style={{ textAlign: 'center' }}>
            <a className={styles.hexBtn} href="/dnd" style={{ float: 'left' }}>← Campaigns</a>
            {acting && (
              <button className={styles.hexBtn} onClick={logout} style={{ float: 'right' }} title="Clear who you're acting as">
                Log out{acting ? ` (${acting})` : ''}
              </button>
            )}
            <p className={styles.brand}>Choose who you&apos;re playing</p>
            <h1 className={styles.title}>{data.name}</h1>
            {data.setting && <p className={styles.subtitle}>{data.setting}</p>}
            <p style={{ color: 'var(--hx-muted)', fontSize: 13, marginTop: 6 }}>
              {acting ? <>Currently acting as <span style={{ color: 'var(--hx-gold-2)' }}>{acting}</span> — pick again to switch.</> : 'Pick your character to open its sheet, or enter as the Dungeon Master.'}
            </p>
            {error && (
              <p role="alert" style={{ color: '#ff8080', fontSize: 13, marginTop: 8 }}>{error}</p>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 14 }}>
            {data.players.map((p) => (
              <button
                key={p.userId}
                className={styles.framedPanel}
                onClick={() => (p.characterId ? enter(p.userId, `/dnd/characters/${p.characterId}`) : undefined)}
                disabled={!!entering || !p.characterId}
                style={{ cursor: p.characterId ? 'pointer' : 'default', textAlign: 'center', padding: '18px 12px', opacity: entering && entering !== p.userId ? 0.5 : 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, minWidth: 0 }}
              >
                {p.portrait ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img className={`${styles.portrait} ${styles.portraitActive}`} src={p.portrait} alt="" style={{ width: 84, height: 84 }} />
                ) : (
                  <span className={`${styles.portrait} ${styles.portraitActive}`} style={{ width: 84, height: 84, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 34, fontFamily: 'var(--hx-font-display)', color: 'var(--hx-gold-2)' }}>{initial(p.characterName ?? p.playerName)}</span>
                )}
                <span style={{ width: '100%', maxWidth: '100%', overflowWrap: 'anywhere', wordBreak: 'break-word', lineHeight: 1.15, fontFamily: 'var(--hx-font-display)', fontSize: 15, color: 'var(--hx-gold-2)', letterSpacing: '0.02em' }}>{entering === p.userId ? 'Entering…' : (p.characterName ?? 'No character')}</span>
                <span style={{ width: '100%', overflowWrap: 'anywhere', fontSize: 12, color: 'var(--hx-muted)' }}>{p.playerName}</span>
              </button>
            ))}

            {/* Any DM-run NPCs — open their sheet by entering as the DM. (The streamer is a
                player character, so she appears above with the players, not here.) */}
            {data.dm && data.npcs.map((n) => (
              <button
                key={n.characterId}
                className={styles.framedPanel}
                onClick={() => enter(data.dm!.userId, `/dnd/characters/${n.characterId}`)}
                disabled={!!entering}
                style={{ cursor: 'pointer', textAlign: 'center', padding: '18px 12px', opacity: entering && entering !== data.dm!.userId ? 0.5 : 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, minWidth: 0 }}
              >
                {n.portrait ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img className={styles.portrait} src={n.portrait} alt="" style={{ width: 84, height: 84 }} />
                ) : (
                  <span className={styles.portrait} style={{ width: 84, height: 84, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 34, fontFamily: 'var(--hx-font-display)', color: 'var(--hx-gold-2)' }}>{initial(n.name)}</span>
                )}
                <span style={{ width: '100%', maxWidth: '100%', overflowWrap: 'anywhere', wordBreak: 'break-word', lineHeight: 1.15, fontFamily: 'var(--hx-font-display)', fontSize: 15, color: 'var(--hx-gold-2)', letterSpacing: '0.02em' }}>{n.name}</span>
                <span style={{ fontSize: 11, letterSpacing: '0.1em', color: 'var(--hx-teal-1)' }}>NPC · DM-RUN</span>
              </button>
            ))}

            {data.guestUserId && (
              <button
                className={styles.framedPanel}
                onClick={() => enter(data.guestUserId!, '/dnd/characters/new')}
                disabled={!!entering}
                style={{ cursor: 'pointer', textAlign: 'center', padding: '18px 12px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, borderStyle: 'dashed' }}
              >
                <span style={{ width: 84, height: 84, borderRadius: '50%', border: '2px dashed var(--hx-gold-1)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 40, color: 'var(--hx-gold-2)' }}>＋</span>
                <span style={{ fontFamily: 'var(--hx-font-display)', fontSize: 17, color: 'var(--hx-gold-2)' }}>{entering === data.guestUserId ? 'Loading…' : 'New Character'}</span>
                <span style={{ fontSize: 12, color: 'var(--hx-muted)' }}>upload &amp; AI-build</span>
              </button>
            )}
          </div>

          {data.dm && (
            <div style={{ display: 'flex', justifyContent: 'center', marginTop: 4 }}>
              <button
                className={`${styles.hexBtn} ${styles.hexBtnPrimary}`}
                style={{ padding: '12px 26px', fontSize: 15 }}
                onClick={() => (data.dm!.locked ? router.push('/dnd') : enter(data.dm!.userId, `/dnd/campaigns/${data.id}/manage`))}
                disabled={!!entering}
              >
                {entering === data.dm.userId ? 'Entering…' : data.dm.locked ? `🔒 Sign in as ${data.dm.name} (DM)` : `⚔️ Enter as ${data.dm.name} (DM)`}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

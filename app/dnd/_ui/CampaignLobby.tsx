'use client'
// Per-campaign lobby — the "enter as" picker for one campaign. Players click their
// character to enter as themselves and open their sheet; the DM enters and lands on the
// control panel (the campaign management page, which now renders because the session is
// the DM). Uses the open-access /api/dnd/dev/enter to set the session (no password).
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import styles from './hextech.module.css'
import type { CampaignLobbyData } from '@/lib/dnd/campaign-summary'

export default function CampaignLobby({ data }: { data: CampaignLobbyData }) {
  const router = useRouter()
  const [entering, setEntering] = useState<string | null>(null)

  async function enter(userId: string, target: string) {
    if (entering) return
    setEntering(userId)
    try {
      const r = await fetch('/api/dnd/dev/enter', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId }) })
      if (r.ok) {
        router.push(target)
        router.refresh()
      } else setEntering(null)
    } catch {
      setEntering(null)
    }
  }

  const initial = (s: string) => (s || '?').charAt(0).toUpperCase()

  return (
    <div className={styles.root}>
      <div className={styles.screen} style={{ alignItems: 'flex-start' }}>
        <div style={{ width: '100%', maxWidth: 900, display: 'grid', gap: 20, margin: '0 auto' }}>
          <div style={{ textAlign: 'center' }}>
            <a className={styles.hexBtn} href="/dnd" style={{ float: 'left' }}>← Campaigns</a>
            <p className={styles.brand}>{data.setting ? 'Campaign' : 'Neon Odyssey'}</p>
            <h1 className={styles.title}>{data.name}</h1>
            {data.setting && <p className={styles.subtitle}>{data.setting}</p>}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 14 }}>
            {data.players.map((p) => (
              <button
                key={p.userId}
                className={styles.framedPanel}
                onClick={() => (p.characterId ? enter(p.userId, `/dnd/characters/${p.characterId}`) : undefined)}
                disabled={!!entering || !p.characterId}
                style={{ cursor: p.characterId ? 'pointer' : 'default', textAlign: 'center', padding: '18px 12px', opacity: entering && entering !== p.userId ? 0.5 : 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}
              >
                {p.portrait ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img className={`${styles.portrait} ${styles.portraitActive}`} src={p.portrait} alt="" style={{ width: 84, height: 84 }} />
                ) : (
                  <span className={`${styles.portrait} ${styles.portraitActive}`} style={{ width: 84, height: 84, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 34, fontFamily: 'var(--hx-font-display)', color: 'var(--hx-gold-2)' }}>{initial(p.characterName ?? p.playerName)}</span>
                )}
                <span style={{ fontFamily: 'var(--hx-font-display)', fontSize: 17, color: 'var(--hx-gold-2)', letterSpacing: '0.03em' }}>{entering === p.userId ? 'Entering…' : (p.characterName ?? 'No character')}</span>
                <span style={{ fontSize: 12, color: 'var(--hx-muted)' }}>{p.playerName}</span>
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
                onClick={() => enter(data.dm!.userId, `/dnd/campaigns/${data.id}`)}
                disabled={!!entering}
              >
                {entering === data.dm.userId ? 'Entering…' : `⚔️ Enter as ${data.dm.name} (DM)`}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

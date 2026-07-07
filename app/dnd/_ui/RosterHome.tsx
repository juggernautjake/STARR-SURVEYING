'use client'
// Open-access roster lobby (Phase L3) — a League-of-Legends-style "pick your champion"
// screen for the demo campaign. Clicking a character card enters as that player and
// opens their sheet; the DM card enters as the DM and opens the campaign panel. No
// login — clicking POSTs to /api/dnd/dev/enter, which sets the session.
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import styles from './hextech.module.css'

export interface RosterPlayer { userId: string; playerName: string; characterId: string; characterName: string; portrait: string | null; sheetType?: string; underConstruction?: boolean }
export interface Roster { dm: { userId: string; name: string }; players: RosterPlayer[]; campaignId: string; guestUserId?: string }

export default function RosterHome({ roster }: { roster: Roster }) {
  const router = useRouter()
  const [entering, setEntering] = useState<string | null>(null)

  async function enter(userId: string, target: string) {
    if (entering) return
    setEntering(userId)
    try {
      const r = await fetch('/api/dnd/dev/enter', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId }) })
      if (r.ok) router.push(target)
      else setEntering(null)
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
            <p className={styles.brand}>Neon Odyssey</p>
            <h1 className={styles.title}>Select Your Character</h1>
            <p className={styles.subtitle}>Open lobby — pick a character to jump into their sheet, or enter as the Dungeon Master.</p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 14 }}>
            {roster.players.map((p) => (
              <button
                key={p.userId}
                className={styles.framedPanel}
                onClick={() => enter(p.userId, `/dnd/characters/${p.characterId}`)}
                disabled={!!entering}
                style={{ cursor: 'pointer', textAlign: 'center', padding: '18px 12px', opacity: entering && entering !== p.userId ? 0.5 : 1, display: 'grid', gap: 8, justifyItems: 'center', position: 'relative' }}
              >
                {p.underConstruction && <span title="Under construction" style={{ position: 'absolute', top: 6, right: 6, fontSize: 11 }}>🚧</span>}
                {p.portrait ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img className={`${styles.portrait} ${styles.portraitActive}`} src={p.portrait} alt="" style={{ width: 84, height: 84 }} />
                ) : (
                  <span className={`${styles.portrait} ${styles.portraitActive}`} style={{ width: 84, height: 84, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 34, fontFamily: 'var(--hx-font-display)', color: 'var(--hx-gold-2)' }}>{initial(p.characterName)}</span>
                )}
                <span style={{ fontFamily: 'var(--hx-font-display)', fontSize: 17, color: 'var(--hx-gold-2)', letterSpacing: '0.03em' }}>{entering === p.userId ? 'Entering…' : p.characterName}</span>
                <span style={{ fontSize: 12, color: 'var(--hx-muted)' }}>{p.playerName}</span>
              </button>
            ))}

            {roster.guestUserId && (
              <button
                className={styles.framedPanel}
                onClick={() => enter(roster.guestUserId!, '/dnd/characters/new')}
                disabled={!!entering}
                style={{ cursor: 'pointer', textAlign: 'center', padding: '18px 12px', opacity: entering && entering !== roster.guestUserId ? 0.5 : 1, display: 'grid', gap: 8, justifyItems: 'center', borderStyle: 'dashed' }}
              >
                <span style={{ width: 84, height: 84, borderRadius: '50%', border: '2px dashed var(--hx-gold-1)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 40, color: 'var(--hx-gold-2)' }}>＋</span>
                <span style={{ fontFamily: 'var(--hx-font-display)', fontSize: 17, color: 'var(--hx-gold-2)' }}>{entering === roster.guestUserId ? 'Loading…' : 'New Character'}</span>
                <span style={{ fontSize: 12, color: 'var(--hx-muted)' }}>upload &amp; AI-build</span>
              </button>
            )}
          </div>

          <div style={{ display: 'flex', justifyContent: 'center', marginTop: 4 }}>
            <button
              className={`${styles.hexBtn} ${styles.hexBtnPrimary}`}
              style={{ padding: '12px 26px', fontSize: 15 }}
              onClick={() => enter(roster.dm.userId, `/dnd/campaigns/${roster.campaignId}`)}
              disabled={!!entering}
            >
              {entering === roster.dm.userId ? 'Entering…' : `⚔️ Enter as Dungeon Master`}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

'use client'
// StreamWatchClient (Phase R) — lets a campaign member WATCH a streamer character's live
// chat without access to the private sheet. Mounts the shared chat overlay inside a
// minimal character context (the private sheet load 403s and falls back to a placeholder,
// which is fine — a viewer never sees stats/controls). `viewerCanChat` gives them the
// chat box so they can post as a PLAYER (highlighted for the streamer).
import { CharacterProvider } from '@/app/dnd/_sheet/state/store'
import StreamChat from '@/app/dnd/_sheet/components/StreamChat'
import styles from './hextech.module.css'
import '@/app/dnd/_sheet/styles/theme.css'

export default function StreamWatchClient({
  characterId, campaignId, sheetType, name,
}: {
  characterId: string
  campaignId: string
  sheetType: string
  name: string
}) {
  return (
    <div className={`dnd-sheet skin-${sheetType}`} style={{ minHeight: '100vh', padding: '20px 18px' }}>
      <a href="/dnd" className={styles.hexBtn} style={{ display: 'inline-block' }}>← Campaigns</a>
      <div style={{ maxWidth: 720, margin: '18px auto 0', textAlign: 'center' }}>
        <div style={{ fontSize: 12, letterSpacing: '0.14em', color: '#ff4d4d', fontWeight: 800 }}>● LIVE</div>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 26, margin: '4px 0 0' }}>Watching {name}’s stream</h1>
        <p style={{ color: 'var(--muted, #9aa)', fontSize: 13, marginTop: 6 }}>
          Chat along like any viewer — your messages show up highlighted so {name} knows they’re from a fellow player.
          Open the chat dock (bottom corner) to jump in.
        </p>
      </div>
      <CharacterProvider characterId={characterId} campaignId={campaignId} isDM={false} canWrite={false}>
        <StreamChat characterId={characterId} campaignId={campaignId} viewerCanChat />
      </CharacterProvider>
    </div>
  )
}

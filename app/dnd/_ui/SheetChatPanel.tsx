'use client'
// Party & whispers on the character sheet (Phase L8) + reaction emotes (Phase L9).
// Mounts the F4 Chat (Party / Direct / Group channels) so a player can whisper the DM
// (Direct channel) — and vice versa — straight from their sheet, and a ReactionBar so
// the party can fire ephemeral emote reactions to rolls/moments. Collapsible so it stays
// out of the way. Reuses the verified F1 message model + F2 realtime; the "direct"
// channel is the private whisper.
import { useState } from 'react'
import Chat from './Chat'
import ReactionBar from './ReactionBar'
import styles from './hextech.module.css'

export default function SheetChatPanel({ campaignId, actorName }: { campaignId: string; actorName?: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className={styles.root} style={{ padding: 0 }}>
      <div style={{ maxWidth: 960, margin: '0 auto 24px', padding: '0 12px' }}>
        <ReactionBar campaignId={campaignId} from={actorName} />
        <button
          className={`${styles.hexBtn} ${open ? styles.hexBtnPrimary : ''}`}
          onClick={() => setOpen((o) => !o)}
          style={{ width: '100%', padding: '10px', justifyContent: 'center', marginTop: 6 }}
        >
          💬 Party &amp; Whispers {open ? '▲' : '▼'}
        </button>
        {open && (
          <div className={styles.framedPanel} style={{ marginTop: 8 }}>
            <Chat campaignId={campaignId} />
          </div>
        )}
      </div>
    </div>
  )
}

// app/dnd/_ui/AddToDemoButton.tsx — lets an owner attach a personal character to the open
// Neon Odyssey demo campaign (posts to /api/dnd/campaigns/[demo]/join-character).
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from './hextech.module.css';

export default function AddToDemoButton({ characterId, campaignId }: { characterId: string; campaignId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div style={{ margin: '10px 0', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
      <button
        className={styles.hexBtn}
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setMsg(null);
          try {
            const r = await fetch(`/api/dnd/campaigns/${campaignId}/join-character`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ characterId }),
            });
            const j = await r.json().catch(() => ({}));
            if (r.ok) {
              setMsg('✓ Added to Neon Odyssey.');
              router.refresh();
            } else {
              setMsg(j.error ?? 'Could not add to the campaign.');
            }
          } catch {
            setMsg('Network error — please try again.');
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? 'Adding…' : '＋ Add to Neon Odyssey (demo)'}
      </button>
      {msg && <span style={{ fontSize: 12.5, color: 'var(--hx-muted)' }}>{msg}</span>}
    </div>
  );
}

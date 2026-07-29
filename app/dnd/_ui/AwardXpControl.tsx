'use client';
// app/dnd/_ui/AwardXpControl.tsx — "the party gets 450 XP" (P3-4b).
//
// One action instead of eight edits. The response drives everything shown here, because the server is the
// only thing that knows what actually happened per character — a mixed table can contain systems that do
// not use XP at all, and the honest report names them.
//
// THE DEEP LINK IS THE POINT of the level-up list. Telling a DM "Vex levelled up" and leaving them to find
// Vex's sheet is most of the work still undone; each name links straight into that character's level walker,
// which is where the choices the new level unlocks get made.
import { useState } from 'react';
import styles from './hextech.module.css';

interface LevelUp { id: string; name: string; level: number }

export default function AwardXpControl({ campaignId }: { campaignId: string }) {
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const [levelUps, setLevelUps] = useState<LevelUp[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function award() {
    const n = Math.round(Number(amount) || 0);
    if (!n || busy) return;
    setBusy(true); setError(null); setSummary(null); setLevelUps([]);
    try {
      const r = await fetch(`/api/dnd/campaigns/${campaignId}/award-xp`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ amount: n }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setError(j.error ?? 'Could not award XP.'); return; }
      setSummary(j.summary as string);
      setLevelUps((j.levelUps ?? []) as LevelUp[]);
      setAmount('');
    } catch { setError('Network error — please try again.'); } finally { setBusy(false); }
  }

  const input = { padding: '7px 9px', fontSize: 13, background: 'rgba(1,10,19,0.55)', border: '1px solid var(--hx-line)', color: 'var(--hx-text)', borderRadius: 6, width: 110 } as const;

  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          type="number" value={amount} onChange={(e) => setAmount(e.target.value)}
          placeholder="XP" style={input} disabled={busy}
          onKeyDown={(e) => { if (e.key === 'Enter') award(); }}
        />
        <button type="button" className={styles.hexBtn} onClick={award} disabled={busy || !amount}>
          {busy ? 'Awarding…' : 'Award to the party'}
        </button>
        {/* Negative is allowed on purpose — correcting an over-award is a real thing, and the server floors
            each character's XP at 0 rather than going negative. */}
        <span style={{ fontSize: 11, color: 'var(--hx-muted)' }}>A negative amount takes XP back.</span>
      </div>

      {error && <div style={{ fontSize: 12.5, color: 'var(--hx-danger)' }}>{error}</div>}
      {summary && <div style={{ fontSize: 12.5, color: 'var(--hx-muted)', lineHeight: 1.5 }}>{summary}</div>}

      {levelUps.length > 0 && (
        <div style={{ display: 'grid', gap: 4 }}>
          {levelUps.map((l) => (
            <a key={l.id} href={`/dnd/characters/${l.id}/builder`}
              style={{ fontSize: 12.5, color: 'var(--hx-gold-2)' }}>
              {l.name} reached level {l.level} — open their level-up →
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

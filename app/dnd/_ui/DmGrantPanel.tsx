// app/dnd/_ui/DmGrantPanel.tsx — the DM's "grant custom content" panel (IG builder Slice 6).
//
// DM-only. Lets the DM hand this character a custom feat / ability / item / spell / weapon with
// DM-authored mechanics. Anything granted is flagged DM-GRANTED (always allowed, even in a vanilla-only
// campaign) and appears on the sheet as "granted by the DM". Existing grants are listed with a revoke.
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from './hextech.module.css';
import { GRANTABLE_KINDS, type DmGrant } from '@/lib/dnd/dm-grant';

export default function DmGrantPanel({ characterId, initialGrants }: { characterId: string; initialGrants: DmGrant[] }) {
  const router = useRouter();
  const [grants, setGrants] = useState<DmGrant[]>(initialGrants);
  const [kind, setKind] = useState<string>('feat');
  const [name, setName] = useState('');
  const [mechanics, setMechanics] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function grant() {
    if (!name.trim() || !mechanics.trim()) { setMsg('A grant needs a name and its mechanics.'); return; }
    setBusy(true); setMsg(null);
    try {
      const r = await fetch(`/api/dnd/characters/${characterId}/grant`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind, name, mechanics }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setMsg(j.error ?? 'Could not grant.'); return; }
      setGrants(j.grants ?? []); setName(''); setMechanics(''); setMsg('Granted — flagged as DM-granted on the sheet.');
      router.refresh();
    } catch { setMsg('Network error — please try again.'); } finally { setBusy(false); }
  }
  async function revoke(id: string) {
    setBusy(true); setMsg(null);
    try {
      const r = await fetch(`/api/dnd/characters/${characterId}/grant?grantId=${encodeURIComponent(id)}`, { method: 'DELETE' });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setMsg(j.error ?? 'Could not revoke.'); return; }
      setGrants(j.grants ?? []); router.refresh();
    } catch { setMsg('Network error — please try again.'); } finally { setBusy(false); }
  }

  const input = { padding: '8px 10px', fontSize: 13, background: 'rgba(1,10,19,0.55)', border: '1px solid var(--hx-line)', color: 'var(--hx-text)', borderRadius: 6 } as const;

  return (
    <div className={styles.framedPanel} style={{ margin: '10px 0', padding: '12px 14px', display: 'grid', gap: 10 }}>
      <strong style={{ fontFamily: 'var(--hx-font-display)', color: 'var(--hx-gold-2)' }}>◆ Grant custom content</strong>
      <div style={{ fontSize: 12, color: 'var(--hx-muted)' }}>
        Give this character a custom element with your own mechanics. It&apos;s flagged <span style={{ color: 'var(--hx-gold-2)' }}>DM-granted</span> and always allowed — even in a vanilla-only campaign.
      </div>

      {grants.length > 0 && (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 6 }}>
          {grants.map((g) => (
            <li key={g.id} style={{ display: 'grid', gap: 2, padding: '8px 10px', border: '1px solid var(--hx-line)', borderRadius: 6, background: 'rgba(200,170,110,0.06)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <span style={{ fontSize: 13, color: 'var(--hx-text)' }}>
                  <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '0.06em', color: 'var(--hx-gold-2)', border: '1px solid var(--hx-gold-2)', borderRadius: 4, padding: '1px 5px', marginRight: 6 }}>DM-GRANTED</span>
                  <span style={{ opacity: 0.7 }}>{g.kind}:</span> {g.name}
                </span>
                <button type="button" className={styles.hexBtn} disabled={busy} onClick={() => revoke(g.id)} style={{ fontSize: 11, padding: '3px 8px' }}>Revoke</button>
              </div>
              {g.mechanics && <div style={{ fontSize: 12, color: 'var(--hx-muted)', whiteSpace: 'pre-wrap' }}>{g.mechanics}</div>}
              <div style={{ fontSize: 10.5, color: 'var(--hx-muted)' }}>granted by {g.grantedBy}</div>
            </li>
          ))}
        </ul>
      )}

      <div style={{ display: 'grid', gap: 6 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <select value={kind} onChange={(e) => setKind(e.target.value)} style={{ ...input, minWidth: 110 }}>
            {GRANTABLE_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name (e.g. Ember Ward)" style={{ ...input, flex: 1, minWidth: 160 }} maxLength={120} />
        </div>
        <textarea value={mechanics} onChange={(e) => setMechanics(e.target.value)} rows={2} placeholder="Mechanics — what does it do? (shown to the player)" style={{ ...input }} maxLength={2000} />
        <button type="button" className={`${styles.hexBtn} ${styles.hexBtnPrimary}`} disabled={busy} onClick={grant} style={{ justifySelf: 'start' }}>
          {busy ? 'Granting…' : '＋ Grant to character'}
        </button>
      </div>
      {msg && <div style={{ fontSize: 12.5, color: 'var(--hx-muted)' }}>{msg}</div>}
    </div>
  );
}

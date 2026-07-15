// app/dnd/_ui/SystemLibrary.tsx — browse/search ONE game system's rules store (Phase V, Slice 2).
// Always scoped to `systemKey`, so results can never come from another system. Used by the builder
// so a DM/player can see what rules the AI will ground a build in.
'use client';

import { useCallback, useEffect, useState } from 'react';
import styles from './hextech.module.css';

interface Entry { id: string; kind: string; name: string; body: string; source: string | null }

export default function SystemLibrary({ systemKey, systemName }: { systemKey: string; systemName?: string }) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (query: string) => {
    setBusy(true);
    try {
      const u = new URL(`/api/dnd/systems/${encodeURIComponent(systemKey)}/entries`, window.location.origin);
      if (query.trim()) u.searchParams.set('q', query.trim());
      const r = await fetch(u.toString());
      const j = await r.json().catch(() => ({}));
      setEntries(Array.isArray(j.entries) ? j.entries : []);
    } catch {
      setEntries([]);
    } finally {
      setBusy(false);
    }
  }, [systemKey]);

  useEffect(() => { void load(''); }, [load]);

  return (
    <div className={styles.framedPanel} style={{ display: 'grid', gap: 10, padding: '14px 16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <strong style={{ fontFamily: 'var(--hx-font-display)', color: 'var(--hx-gold-2)' }}>{systemName || systemKey} — rules library</strong>
        <span style={{ fontSize: 11.5, color: 'var(--hx-muted)' }}>{entries.length} entries · scoped to this system</span>
      </div>
      <form
        onSubmit={(e) => { e.preventDefault(); void load(q); }}
        style={{ display: 'flex', gap: 8 }}
      >
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search this system's rules, feats, abilities…"
          style={{ flex: 1, padding: '8px 10px', background: 'rgba(1,10,19,0.5)', border: '1px solid var(--hx-line)', color: 'var(--hx-text)' }}
        />
        <button className={styles.hexBtn} type="submit" disabled={busy}>{busy ? '…' : 'Search'}</button>
      </form>
      <div style={{ display: 'grid', gap: 8, maxHeight: 340, overflowY: 'auto' }}>
        {entries.map((e) => (
          <div key={e.id} style={{ borderBottom: '1px solid var(--hx-line)', paddingBottom: 8 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
              <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--hx-gold-2)' }}>{e.kind}</span>
              <strong style={{ fontSize: 14, color: 'var(--hx-text)' }}>{e.name}</strong>
              {e.source && <span style={{ fontSize: 11, color: 'var(--hx-muted)', marginLeft: 'auto' }}>{e.source}</span>}
            </div>
            {e.body && <div style={{ fontSize: 12.5, color: 'var(--hx-muted)', lineHeight: 1.5, marginTop: 2 }}>{e.body}</div>}
          </div>
        ))}
        {!entries.length && !busy && <div style={{ fontSize: 12.5, color: 'var(--hx-muted)' }}>No entries yet — this system&apos;s rules are still being curated.</div>}
      </div>
    </div>
  );
}

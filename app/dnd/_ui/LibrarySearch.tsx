'use client';
// app/dnd/_ui/LibrarySearch.tsx — the library's search box.
//
// Searches terms, rules, feats, classes, skills, species and conditions across every system (or
// one, when scoped). Hits are grouped by system so it's always obvious WHICH game a rule is from —
// the whole point of a multi-system library.
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import styles from './hextech.module.css';
import { GAME_SYSTEMS } from '@/lib/dnd/systems';

interface Hit {
  system: string;
  systemName: string;
  kind: string;
  name: string;
  body: string;
  score: number;
}

const KIND_COLOR: Record<string, string> = {
  rule: 'var(--hx-teal-1)',
  class: 'var(--hx-gold-2)',
  skill: 'var(--hx-teal-2)',
  species: 'var(--hx-gold-3)',
  condition: 'var(--hx-danger)',
  feat: 'var(--hx-gold-1)',
};

export default function LibrarySearch({ system, systemName }: { system?: string; systemName?: string }) {
  const [q, setQ] = useState('');
  const [scope, setScope] = useState<string>(system ?? '');
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const seq = useRef(0);

  const run = useCallback(async (query: string, sys: string) => {
    const mine = ++seq.current;
    if (!query.trim()) { setHits(null); setErr(null); return; }
    setBusy(true);
    try {
      const u = new URL('/api/dnd/library/search', window.location.origin);
      u.searchParams.set('q', query.trim());
      if (sys) u.searchParams.set('system', sys);
      const r = await fetch(u.toString());
      const j = await r.json().catch(() => ({}));
      if (mine !== seq.current) return; // a newer keystroke already won
      if (!r.ok) { setErr(j?.error || 'Search failed.'); setHits([]); return; }
      setErr(null);
      setHits((j.hits ?? []) as Hit[]);
    } catch {
      if (mine === seq.current) { setErr('Search failed.'); setHits([]); }
    } finally {
      if (mine === seq.current) setBusy(false);
    }
  }, []);

  // Debounced live search — feels like a filter rather than a form.
  useEffect(() => {
    const t = setTimeout(() => void run(q, scope), 180);
    return () => clearTimeout(t);
  }, [q, scope, run]);

  const grouped = (hits ?? []).reduce<Record<string, Hit[]>>((acc, h) => {
    (acc[h.systemName] ||= []).push(h);
    return acc;
  }, {});

  return (
    <section className={styles.framedPanel} style={{ padding: '14px 16px', display: 'grid', gap: 10 }}>
      <div className={styles.framedPanelTop} />
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={system ? `Search ${systemName ?? 'this system'}’s rules, feats, classes…` : 'Search every system — rules, feats, classes, skills, conditions…'}
          aria-label="Search the rules library"
          style={{ flex: '1 1 320px', padding: '9px 11px', background: 'rgba(1,10,19,0.5)', border: '1px solid var(--hx-line)', color: 'var(--hx-text)', fontSize: 14 }}
        />
        {!system && (
          <select
            value={scope}
            onChange={(e) => setScope(e.target.value)}
            aria-label="Limit search to one system"
            style={{ padding: '9px 11px', background: 'rgba(1,10,19,0.5)', border: '1px solid var(--hx-line)', color: 'var(--hx-text)', fontSize: 13 }}
          >
            <option value="">All systems</option>
            {GAME_SYSTEMS.map((s) => (
              <option key={s.key} value={s.key}>{s.name}</option>
            ))}
          </select>
        )}
        {busy && <span className={styles.spinner} aria-label="Searching" />}
      </div>

      {err && <div className={styles.error}>{err}</div>}

      {hits !== null && !busy && (
        <div style={{ fontSize: 11.5, color: 'var(--hx-muted)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
          {hits.length === 0 ? 'No matches' : `${hits.length} match${hits.length === 1 ? '' : 'es'}`}
          {scope && !system ? ` · ${GAME_SYSTEMS.find((s) => s.key === scope)?.name}` : ''}
        </div>
      )}

      {hits !== null && hits.length === 0 && !busy && !err && (
        <p style={{ fontSize: 13, color: 'var(--hx-muted)', margin: 0 }}>
          Nothing matched “{q}”. Every word has to appear in an entry — try fewer words, or a rule/class/condition name.
        </p>
      )}

      {hits !== null && hits.length > 0 && (
        <div style={{ display: 'grid', gap: 14, maxHeight: 460, overflowY: 'auto' }}>
          {Object.entries(grouped).map(([sysName, list]) => (
            <div key={sysName} style={{ display: 'grid', gap: 6 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, borderBottom: '1px solid var(--hx-line)', paddingBottom: 4 }}>
                <Link
                  href={`/dnd/library/${list[0].system}`}
                  style={{ fontFamily: 'var(--hx-font-display)', color: 'var(--hx-gold-2)', fontSize: 14, textDecoration: 'none' }}
                >
                  {sysName} →
                </Link>
                <span style={{ fontSize: 11, color: 'var(--hx-muted)' }}>{list.length}</span>
              </div>
              {list.map((h, i) => (
                <div key={`${h.system}-${h.kind}-${h.name}-${i}`} style={{ display: 'grid', gap: 2, padding: '4px 0' }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 9.5, textTransform: 'uppercase', letterSpacing: '0.12em', color: KIND_COLOR[h.kind] ?? 'var(--hx-muted)' }}>{h.kind}</span>
                    <strong style={{ fontSize: 13.5, color: 'var(--hx-text)' }}>{h.name}</strong>
                  </div>
                  <div style={{ fontSize: 12.5, color: 'var(--hx-muted)', lineHeight: 1.55 }}>{h.body}</div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

// app/dnd/_ui/IGVanillaLibrary.tsx — the on-sheet Intuitive Games vanilla reference (IG builder Slice 7).
//
// Renders the vanilla content library (igCatalog) grouped, with a VANILLA badge on every entry, so a
// player or DM can always see exactly what's "from the system". This is the read side of the custom-vs-
// vanilla guarantee and the picker source the builder draws from. Collapsible + filterable so it stays out
// of the way on a full sheet.
'use client';

import { useMemo, useState } from 'react';
import styles from './hextech.module.css';
import { igCatalog } from '@/lib/dnd/systems/intuitive-games/catalog';

// Kinds whose entries normally carry rules text. For these, a MISSING effect means the site hasn't
// published it yet (a roster power/feat pending Brendan's verbatim text) — Ground Rule 2 says show that
// honestly rather than render a bare name that reads as "this has no effect". Name-only kinds
// (ancestry, class, weapon-type, skill, action…) are not "missing" anything, so they get no marker.
const EFFECT_BEARING = new Set(['stance', 'power', 'feat', 'defensive-power', 'condition']);

export default function IGVanillaLibrary() {
  const catalog = useMemo(() => igCatalog(), []);
  const total = useMemo(() => catalog.reduce((n, g) => n + g.entries.length, 0), [catalog]);
  const [q, setQ] = useState('');

  const needle = q.trim().toLowerCase();
  const groups = needle
    ? catalog
        .map((g) => ({ ...g, entries: g.entries.filter((e) => e.name.toLowerCase().includes(needle) || (e.effect ?? '').toLowerCase().includes(needle)) }))
        .filter((g) => g.entries.length > 0)
    : catalog;

  return (
    <details className={styles.framedPanel} style={{ margin: '10px 0', padding: '10px 14px' }}>
      <summary style={{ cursor: 'pointer', fontFamily: 'var(--hx-font-display)', color: 'var(--hx-gold-2)', display: 'flex', alignItems: 'center', gap: 8 }}>
        ◆ Vanilla library
        <span style={{ fontSize: 11.5, fontWeight: 400, color: 'var(--hx-muted)' }}>· {total} elements from the Intuitive Games system</span>
      </summary>

      <div style={{ marginTop: 10, display: 'grid', gap: 10 }}>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Filter stances, powers, feats, weapon types…"
          style={{ padding: '8px 10px', fontSize: 13, background: 'rgba(1,10,19,0.55)', border: '1px solid var(--hx-line)', color: 'var(--hx-text)', borderRadius: 6 }}
        />
        {groups.length === 0 && <div style={{ fontSize: 12.5, color: 'var(--hx-muted)' }}>No vanilla elements match “{q}”.</div>}
        {groups.map((g) => (
          <div key={g.title} style={{ display: 'grid', gap: 5 }}>
            <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '0.05em', color: 'var(--hx-teal-1)', textTransform: 'uppercase' }}>{g.title}</div>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 4 }}>
              {g.entries.map((e) => (
                <li key={e.name} style={{ display: 'grid', gap: 1, fontSize: 12.5, color: 'var(--hx-text)' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                    <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', color: 'var(--hx-teal-1)', border: '1px solid var(--hx-teal-1)', background: 'rgba(10,200,185,0.12)', borderRadius: 4, padding: '1px 4px' }}>VANILLA</span>
                    {e.name}
                  </span>
                  {e.effect
                    ? <span style={{ fontSize: 11.5, color: 'var(--hx-muted)', paddingLeft: 2 }}>{e.effect}</span>
                    : EFFECT_BEARING.has(e.kind) && <span style={{ fontSize: 11, fontStyle: 'italic', color: 'var(--hx-gold-2)', paddingLeft: 2 }}>Effect text not yet published — work in progress.</span>}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </details>
  );
}

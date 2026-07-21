'use client';
// PF2BuildPicks — searchable, eligibility-aware feat/spell selection inside the PF2 builder (S16).
//
// The builder could not offer feats or spells at all, so a PF2 character could only gain them
// AFTER the fact, from the sheet or the AI. This closes that, and does it with the same greying
// treatment as the sheet's picker and the IG builder: an ineligible entry is shown, struck through
// and disabled, WITH its reason.
//
// Why show rather than hide: the server refuses an illegal build either way (gatePf2Picks), so the
// only thing at stake here is WHEN the player finds out. Hiding entries would make the list look
// arbitrary and leave "why can't I take this?" unanswered.
//
// The catalog is large (800+ feats), so this is search-first rather than a wall of chips — the IG
// builder can render every option because IG has a few dozen.
import { useMemo, useState } from 'react';
import { PF2_ALL_FEATS, PF2_ALL_SPELLS, PF2_CATALOG_STATUS } from '@/lib/dnd/systems/pathfinder2e/data';
import { pf2FeatEligibility, pf2SpellEligibility } from '@/lib/dnd/systems/pathfinder2e/eligibility';

export default function PF2BuildPicks({
  kind, className, ancestry, level, tradition, selected, onToggle,
}: {
  kind: 'feat' | 'spell';
  className: string;
  ancestry: string;
  level: number;
  tradition?: string;
  selected: string[];
  onToggle: (name: string) => void;
}) {
  const [q, setQ] = useState('');

  const ctx = useMemo(() => ({
    className, ancestry, level,
    // Picks under review do NOT satisfy each other's prerequisites — matching the server gate, or
    // the builder would show a chain as legal that the save then refuses.
    featNames: [],
    ...(tradition ? { tradition } : {}),
  }), [className, ancestry, level, tradition]);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    // Below two characters the list is thousands of rows; showing only what is already selected
    // keeps the control usable and makes the current choices reviewable at a glance.
    if (needle.length < 2) {
      const chosen = new Set(selected.map((s) => s.toLowerCase()));
      const pool = kind === 'feat' ? PF2_ALL_FEATS : PF2_ALL_SPELLS;
      return pool.filter((e) => chosen.has(e.name.toLowerCase())).slice(0, 40).map(toRow);
    }
    const pool = kind === 'feat' ? PF2_ALL_FEATS : PF2_ALL_SPELLS;
    return pool
      .filter((e) => e.name.toLowerCase().includes(needle))
      .slice(0, 40)
      .map(toRow)
      .sort((a, b) => Number(b.ok) - Number(a.ok) || a.name.localeCompare(b.name));

    function toRow(e: (typeof PF2_ALL_FEATS)[number] | (typeof PF2_ALL_SPELLS)[number]) {
      if (kind === 'feat') {
        const f = e as (typeof PF2_ALL_FEATS)[number];
        const v = pf2FeatEligibility(f, ctx);
        return { name: f.name, meta: `L${f.level} ${f.track}${f.className ? ` · ${f.className}` : ''}`, ok: v.ok, reason: v.reason };
      }
      const s = e as (typeof PF2_ALL_SPELLS)[number];
      const v = pf2SpellEligibility(s, ctx);
      return { name: s.name, meta: s.rank === 0 ? 'cantrip' : `rank ${s.rank}${s.focus ? ' · focus' : ''}`, ok: v.ok, reason: v.reason };
    }
  }, [kind, q, ctx, selected]);

  const status = kind === 'feat' ? PF2_CATALOG_STATUS.feats : PF2_CATALOG_STATUS.spells;
  const input = { padding: '6px 9px', fontSize: 12.5, background: 'rgba(1,10,19,0.55)', border: '1px solid var(--hx-line)', color: 'var(--hx-text)', borderRadius: 6 } as const;

  return (
    <div style={{ display: 'grid', gap: 6 }}>
      <input
        value={q} onChange={(e) => setQ(e.target.value)}
        placeholder={`Search ${status.count} ${kind}s…`}
        style={input}
      />
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
        {rows.map((r) => {
          const active = selected.some((s) => s.toLowerCase() === r.name.toLowerCase());
          // Already-selected entries are never blocked, so a pick made before the class was chosen
          // can still be removed rather than stranded.
          const blocked = !r.ok && !active;
          return (
            <button
              key={r.name} type="button"
              onClick={() => { if (!blocked) onToggle(r.name); }}
              disabled={blocked}
              title={blocked ? `${r.reason} — pick a different class or level, or build a custom character.` : `${r.name} · ${r.meta}`}
              style={{
                fontSize: 11.5, padding: '3px 8px', borderRadius: 12,
                cursor: blocked ? 'not-allowed' : 'pointer',
                border: `1px solid ${active ? 'var(--hx-teal-1)' : 'var(--hx-line)'}`,
                background: active ? 'rgba(10,200,185,0.15)' : 'transparent',
                color: active ? 'var(--hx-teal-1)' : 'var(--hx-muted)',
                opacity: blocked ? 0.4 : 1,
                textDecoration: blocked ? 'line-through' : 'none',
              }}
            >{r.name} <span style={{ fontSize: 9.5, opacity: 0.7 }}>{r.meta}</span></button>
          );
        })}
      </div>
      {q.trim().length < 2 && (
        <div style={{ fontSize: 11, color: 'var(--hx-muted)' }}>
          Type at least two characters to search. {!status.complete && `${status.count} ${kind}s catalogued so far — not the full list yet.`}
        </div>
      )}
    </div>
  );
}

'use client';
// app/dnd/_ui/PartyOverview.tsx — the DM's at-a-glance party table (P3-7).
//
// "The single most-used DM screen in every comparable tool", per the slice, and the reason is that these
// numbers are asked for constantly and out loud: what's your AC, what's your passive Perception, who's
// still up. Having them on one screen is the difference between answering and opening five sheets.
//
// THE COLUMNS ARE NOT FIXED, because the systems are not the same. A 5e character has six saves and an AC;
// a PF2 character has three saves and a derived AC; an IG character has three saves and **no AC at all** —
// it has damage reduction. So the defence column prints its own label per row, and the save columns are the
// union across the party rather than an intersection, or a lone 5e character would lose four of theirs to
// the presence of a PF2 one.
import { useEffect, useState } from 'react';
import styles from './hextech.module.css';
import type { PartyMember } from '@/lib/dnd/party-overview';

export default function PartyOverview({ campaignId }: { campaignId: string }) {
  const [members, setMembers] = useState<PartyMember[] | null>(null);
  const [saveKeys, setSaveKeys] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/dnd/campaigns/${campaignId}/party`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (cancelled || !j) return;
        setMembers(j.members ?? []);
        setSaveKeys(j.saveKeys ?? []);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [campaignId]);

  if (!members?.length) return null;

  const th = { textAlign: 'left', fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--hx-muted)', padding: '4px 8px 4px 0', fontWeight: 700 } as const;
  const td = { fontSize: 12.5, padding: '5px 8px 5px 0', borderTop: '1px solid var(--hx-line)', color: 'var(--hx-text)', whiteSpace: 'nowrap' } as const;

  return (
    <section className={styles.framedPanel} style={{ padding: '12px 16px', display: 'grid', gap: 8 }}>
      <div className={styles.framedPanelTop} />
      <h2 className={styles.panelTitle} style={{ margin: 0 }}>Party at a glance</h2>

      {/* Wide tables must scroll inside their own container rather than pushing the page sideways. */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 420 }}>
          <thead>
            <tr>
              <th style={th}>Character</th>
              <th style={th}>HP</th>
              {/* No "AC" header — each row names its own defence, because IG has no AC. */}
              <th style={th}>Def</th>
              <th style={th}>Perc</th>
              {saveKeys.map((k) => <th key={k} style={th}>{k}</th>)}
              <th style={th}>Conditions</th>
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.id}>
                <td style={{ ...td, whiteSpace: 'normal' }}>
                  <a href={`/dnd/characters/${m.id}`} style={{ color: 'var(--hx-text)' }}>{m.name}</a>
                </td>
                <td style={td}>
                  {m.maxHp == null
                    ? <span style={{ color: 'var(--hx-muted)' }}>—</span>
                    : <><strong style={{ color: m.currentHp != null && m.currentHp <= m.maxHp / 2 ? 'var(--hx-gold-2)' : 'var(--hx-text)' }}>{m.currentHp ?? '—'}</strong>
                        <span style={{ color: 'var(--hx-muted)' }}>/{m.maxHp}</span></>}
                </td>
                <td style={td}>
                  {m.defense
                    ? <><span style={{ color: 'var(--hx-muted)', fontSize: 10.5 }}>{m.defense.label} </span>{m.defense.value}</>
                    : <span style={{ color: 'var(--hx-muted)' }}>—</span>}
                </td>
                <td style={td}>
                  {/* Null for IG, which has no Perception proficiency — an em dash, not a fabricated number. */}
                  {m.perception ? m.perception.value : <span style={{ color: 'var(--hx-muted)' }}>—</span>}
                </td>
                {saveKeys.map((k) => (
                  <td key={k} style={td}>
                    {m.saves[k] == null
                      // Blank rather than 0: this character's system does not HAVE that save.
                      ? <span style={{ color: 'var(--hx-line)' }}>·</span>
                      : (m.saves[k] >= 0 ? `+${m.saves[k]}` : `${m.saves[k]}`)}
                  </td>
                ))}
                <td style={{ ...td, whiteSpace: 'normal', color: m.conditions.length ? 'var(--hx-gold-2)' : 'var(--hx-muted)' }}>
                  {m.conditions.length ? m.conditions.join(', ') : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

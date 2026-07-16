// app/dnd/_ui/IGSheet.tsx — the bespoke Intuitive Games character sheet (full-sheet Slices 4+).
//
// Renders the IGCharacter model (character.data.ig) tab-for-tab like the Character Sheet Template, with a
// VANILLA / CUSTOM / DM-GRANTED badge on every mechanical element and all derived numbers computed by the
// pure rules engine (never guessed). Slice 4 ships Identity + Ability Scores/Saves + Summary; later slices
// add Skills / Combat / Reference / Equipment / Companion into this same component. Styleable: it uses the
// platform design tokens and lives inside the character page, so custom layout/CSS apply.
'use client';

import { useMemo } from 'react';
import styles from './hextech.module.css';
import type { IGCharacter } from '@/lib/dnd/systems/intuitive-games/model';
import { IG_ABILITIES, IG_SAVES } from '@/lib/dnd/systems/intuitive-games/model';
import { igAbilityMod, igDerived } from '@/lib/dnd/systems/intuitive-games/rules';

type Source = 'vanilla' | 'custom' | 'dm-granted';
interface Tagged { kind: string; name: string; source: Source }

const BADGE: Record<Source, { t: string; c: string; b: string }> = {
  vanilla: { t: 'VANILLA', c: 'var(--hx-teal-1)', b: 'rgba(10,200,185,0.12)' },
  custom: { t: 'CUSTOM', c: 'var(--hx-danger)', b: 'rgba(198,64,59,0.14)' },
  'dm-granted': { t: 'DM-GRANTED', c: 'var(--hx-gold-2)', b: 'rgba(200,170,110,0.14)' },
};
function Badge({ source }: { source: Source }) {
  const m = BADGE[source];
  return <span style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: '0.06em', color: m.c, background: m.b, border: `1px solid ${m.c}`, borderRadius: 4, padding: '0 4px', whiteSpace: 'nowrap' }}>{m.t}</span>;
}

const fmt = (n: number) => (n >= 0 ? `+${n}` : `${n}`);

export default function IGSheet({ ig, elements }: { ig: IGCharacter; elements: Tagged[] }) {
  const derived = useMemo(() => igDerived(ig), [ig]);
  const srcByName = useMemo(() => {
    const m = new Map<string, Source>();
    for (const e of elements ?? []) m.set(e.name.trim().toLowerCase(), e.source);
    return m;
  }, [elements]);
  const badgeFor = (name?: string) => {
    const s = name ? srcByName.get(name.trim().toLowerCase()) : undefined;
    return s ? <Badge source={s} /> : null;
  };

  const id = ig.identity;
  const idRows = ([
    ['Ancestry', id.ancestry], ['Alignment', id.alignment], ['Culture', id.culture], ['Religion', id.religion],
    ['Values', id.values], ['Age', id.age], ['Age Category', id.ageCategory], ['Height', id.height],
    ['Weight', id.weight], ['Eyes', id.eyes], ['Hair', id.hair], ['Games', id.games],
  ] as [string, string][]).filter(([, v]) => v && v.trim());
  const langLines = ([
    ['Common Languages', id.commonLanguages], ['Uncommon Languages', id.uncommonLanguages],
    ['Tools', id.tools], ['Vehicles', id.vehicles],
  ] as [string, string[]][]).filter(([, v]) => v && v.length);

  const label = { fontSize: 10.5, color: 'var(--hx-muted)', letterSpacing: '0.04em', textTransform: 'uppercase' as const };
  const value = { fontSize: 13, color: 'var(--hx-text)' };

  return (
    <div className={styles.framedPanel} style={{ margin: '10px 0', padding: '14px 16px', display: 'grid', gap: 16 }}>
      {/* Header + summary top-line */}
      <div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
          <strong style={{ fontFamily: 'var(--hx-font-display)', fontSize: 19, color: 'var(--hx-gold-2)' }}>{id.name || 'Unnamed'}</strong>
          <span style={{ fontSize: 12.5, color: 'var(--hx-muted)' }}>Intuitive Games · Level {derived.level}</span>
        </div>
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 4, fontSize: 13, color: 'var(--hx-text)', alignItems: 'center' }}>
          {id.className && <span>{id.className} {badgeFor(id.className)}</span>}
          {id.subclass && <span style={{ color: 'var(--hx-muted)' }}>· {id.subclass} {badgeFor(id.subclass)}</span>}
          {id.specialization && <span style={{ color: 'var(--hx-muted)' }}>· {id.specialization}</span>}
          {id.background && <span style={{ color: 'var(--hx-muted)' }}>· {id.background}</span>}
        </div>
      </div>

      {/* Ability scores + modifiers */}
      <div>
        <div style={{ ...label, marginBottom: 6 }}>Ability Scores</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, minmax(60px, 1fr))', gap: 8 }}>
          {IG_ABILITIES.map((k) => (
            <div key={k} style={{ textAlign: 'center', border: '1px solid var(--hx-line)', borderRadius: 8, padding: '8px 4px', background: 'rgba(1,10,19,0.4)' }}>
              <div style={{ fontSize: 10.5, color: 'var(--hx-muted)', letterSpacing: '0.06em' }}>{k}</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--hx-text)', lineHeight: 1.1 }}>{ig.abilities[k]}</div>
              <div style={{ fontSize: 12.5, color: 'var(--hx-gold-2)' }}>{fmt(igAbilityMod(ig.abilities[k]))}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Saves + top-line stats */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {IG_SAVES.map((s) => (
          <div key={s} style={{ flex: 1, minWidth: 90, textAlign: 'center', border: '1px solid var(--hx-line)', borderRadius: 8, padding: '8px 6px' }}>
            <div style={{ fontSize: 10.5, color: 'var(--hx-muted)' }}>{s}</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--hx-teal-1)' }}>{fmt(derived.saves[s])}</div>
          </div>
        ))}
        <div style={{ flex: 1, minWidth: 90, textAlign: 'center', border: '1px solid var(--hx-line)', borderRadius: 8, padding: '8px 6px' }}>
          <div style={{ fontSize: 10.5, color: 'var(--hx-muted)' }}>Hit Points</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--hx-text)' }}>{derived.currentHp}<span style={{ fontSize: 12, color: 'var(--hx-muted)' }}> / {derived.maxHp}</span></div>
        </div>
        <div style={{ flex: 1, minWidth: 90, textAlign: 'center', border: '1px solid var(--hx-line)', borderRadius: 8, padding: '8px 6px' }}>
          <div style={{ fontSize: 10.5, color: 'var(--hx-muted)' }}>Proficiency</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--hx-text)' }}>{fmt(derived.proficiency)}</div>
        </div>
      </div>

      {/* Identity details */}
      {(idRows.length > 0 || langLines.length > 0 || id.bio) && (
        <div style={{ display: 'grid', gap: 8 }}>
          <div style={label}>Character Introduction</div>
          {idRows.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '4px 14px' }}>
              {idRows.map(([k, v]) => (
                <div key={k} style={{ display: 'flex', gap: 6, alignItems: 'baseline' }}>
                  <span style={label}>{k}</span><span style={value}>{v}</span>
                </div>
              ))}
            </div>
          )}
          {langLines.map(([k, v]) => (
            <div key={k} style={{ display: 'flex', gap: 6, alignItems: 'baseline' }}><span style={label}>{k}</span><span style={value}>{v.join(', ')}</span></div>
          ))}
          {id.bio && <p style={{ ...value, whiteSpace: 'pre-wrap', margin: 0, color: 'var(--hx-muted)' }}>{id.bio}</p>}
        </div>
      )}
    </div>
  );
}

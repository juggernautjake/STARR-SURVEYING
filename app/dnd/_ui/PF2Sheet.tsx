// app/dnd/_ui/PF2Sheet.tsx — the bespoke Pathfinder 2e character sheet (Remaster).
//
// Renders the PF2Character sidecar (character.data.pf2e) with every derived number computed by the pure
// rules engine (never guessed): AC, HP, Perception, the three saves, class/spell DC, skill and Strike
// totals — all showing proficiency = rank bonus + level. Attributes are PF2 modifiers. Styleable: it uses
// the platform design tokens and lives inside the character page, so custom layout/CSS apply.
'use client';

import { useMemo } from 'react';
import styles from './hextech.module.css';
import type { PF2Character } from '@/lib/dnd/systems/pathfinder2e/model';
import { PF2_ATTRIBUTES, PF2_SAVES } from '@/lib/dnd/systems/pathfinder2e/model';
import {
  pf2Derived, pf2SkillTotal, pf2SaveTotal, pf2PerceptionTotal, pf2AttackBonus, pf2Proficiency,
} from '@/lib/dnd/systems/pathfinder2e/rules';

const fmt = (n: number) => (n >= 0 ? `+${n}` : `${n}`);
const RANK_ABBR: Record<string, string> = { untrained: 'U', trained: 'T', expert: 'E', master: 'M', legendary: 'L' };

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div style={{ display: 'grid', gap: 2, textAlign: 'center', padding: '8px 6px', border: '1px solid var(--hx-line)', borderRadius: 8, background: 'rgba(1,10,19,0.4)', minWidth: 72 }}>
      <span style={{ fontSize: 9.5, color: 'var(--hx-muted)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>{label}</span>
      <strong style={{ fontFamily: 'var(--hx-font-display)', fontSize: 20, color: 'var(--hx-gold-2)' }}>{value}</strong>
      {sub && <span style={{ fontSize: 9.5, color: 'var(--hx-muted)' }}>{sub}</span>}
    </div>
  );
}

function RankPill({ rank }: { rank: string }) {
  const trained = rank !== 'untrained';
  return <span title={rank} style={{ fontSize: 9, fontWeight: 700, color: trained ? 'var(--hx-teal-1)' : 'var(--hx-muted)', border: `1px solid ${trained ? 'var(--hx-teal-1)' : 'var(--hx-line)'}`, borderRadius: 4, padding: '0 4px' }}>{RANK_ABBR[rank] ?? '?'}</span>;
}

export default function PF2Sheet({ pf2 }: { pf2: PF2Character }) {
  const d = useMemo(() => pf2Derived(pf2), [pf2]);
  const id = pf2.identity;
  const label = { fontSize: 11, color: 'var(--hx-teal-1)', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase' as const };

  const idBits = [id.ancestry && `${id.heritage ? id.heritage + ' ' : ''}${id.ancestry}`, id.background, id.className && `${id.className}${id.subclass ? ` (${id.subclass})` : ''}`, id.deity].filter(Boolean);

  return (
    <div className={styles.framedPanel} style={{ margin: '10px 0', padding: '14px 16px', display: 'grid', gap: 16 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <strong style={{ fontFamily: 'var(--hx-font-display)', fontSize: 19, color: 'var(--hx-gold-2)' }}>{id.name || 'Unnamed'}</strong>
        <span style={{ fontSize: 12, color: 'var(--hx-muted)' }}>Level {id.level} · {id.size}</span>
        <span style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: '0.06em', color: 'var(--hx-teal-1)', border: '1px solid var(--hx-teal-1)', borderRadius: 4, padding: '0 5px' }}>PATHFINDER 2e</span>
      </div>
      {idBits.length > 0 && <div style={{ fontSize: 12.5, color: 'var(--hx-text)', marginTop: -8 }}>{idBits.join(' · ')}</div>}

      {/* Attributes */}
      <div>
        <div style={label}>Attributes</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 6, marginTop: 6 }}>
          {PF2_ATTRIBUTES.map((k) => (
            <div key={k} style={{ textAlign: 'center', padding: '6px 2px', border: '1px solid var(--hx-line)', borderRadius: 8 }}>
              <div style={{ fontSize: 10, color: 'var(--hx-muted)' }}>{k}</div>
              <strong style={{ fontSize: 17, color: 'var(--hx-text)' }}>{fmt(pf2.attributes[k])}</strong>
            </div>
          ))}
        </div>
      </div>

      {/* Headline defenses */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <Stat label="AC" value={`${d.ac}`} />
        <Stat label="HP" value={`${pf2.combat.currentHp || d.maxHp}/${d.maxHp}`} sub={pf2.combat.tempHp ? `+${pf2.combat.tempHp} temp` : undefined} />
        <Stat label="Perception" value={fmt(pf2PerceptionTotal(pf2))} sub={pf2.perception.rank} />
        <Stat label="Speed" value={`${pf2.combat.speed} ft`} />
        <Stat label="Class DC" value={`${d.classDc}`} sub={pf2.combat.classDcAttribute} />
        {d.spellDc != null && <Stat label="Spell DC" value={`${d.spellDc}`} sub={`atk ${fmt(d.spellAttack ?? 0)} · ${pf2.spellcasting.tradition}`} />}
      </div>

      {/* Saves */}
      <div>
        <div style={label}>Saving Throws</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
          {PF2_SAVES.map((s) => (
            <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px', border: '1px solid var(--hx-line)', borderRadius: 8 }}>
              <span style={{ fontSize: 12, color: 'var(--hx-muted)' }}>{s}</span>
              <strong style={{ fontSize: 15, color: 'var(--hx-gold-2)' }}>{fmt(pf2SaveTotal(s, pf2))}</strong>
              <RankPill rank={pf2.saves[s].rank} />
            </div>
          ))}
        </div>
      </div>

      {/* Skills */}
      <div>
        <div style={label}>Skills</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 4, marginTop: 6 }}>
          {pf2.skills.map((sk) => (
            <div key={sk.name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, padding: '3px 8px', border: '1px solid var(--hx-line)', borderRadius: 6, opacity: sk.rank === 'untrained' ? 0.55 : 1 }}>
              <span style={{ fontSize: 11.5, color: 'var(--hx-text)' }}>{sk.name} <span style={{ color: 'var(--hx-muted)', fontSize: 9.5 }}>{sk.attribute}</span></span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <strong style={{ fontSize: 12.5, color: 'var(--hx-teal-1)' }}>{fmt(pf2SkillTotal(sk, id.level, pf2.attributes))}</strong>
                <RankPill rank={sk.rank} />
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Strikes */}
      {pf2.attacks.length > 0 && (
        <div>
          <div style={label}>Strikes</div>
          <div style={{ display: 'grid', gap: 4, marginTop: 6 }}>
            {pf2.attacks.map((a) => (
              <div key={a.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '5px 10px', border: '1px solid var(--hx-line)', borderRadius: 6 }}>
                <span style={{ fontSize: 12.5, color: 'var(--hx-text)' }}>{a.name}{a.traits.length ? <span style={{ color: 'var(--hx-muted)', fontSize: 10 }}> · {a.traits.join(', ')}</span> : null}</span>
                <span style={{ fontSize: 12, color: 'var(--hx-muted)' }}><strong style={{ color: 'var(--hx-gold-2)' }}>{fmt(pf2AttackBonus(a, id.level, pf2.attributes))}</strong> · {a.damage}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Spellcasting summary + slots per rank */}
      {pf2.spellcasting.kind !== 'none' && (
        <div style={{ display: 'grid', gap: 6 }}>
          <div style={{ fontSize: 12, color: 'var(--hx-muted)' }}>
            <span style={label}>Spellcasting</span> — {pf2.spellcasting.tradition} {pf2.spellcasting.kind}, {pf2.spellcasting.attribute} · proficiency {fmt(pf2Proficiency(pf2.spellcasting.rank, id.level))} ({pf2.spellcasting.rank}).
          </div>
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
            {pf2.spellcasting.slots.map((n, r) => (n > 0 ? (
              <span key={r} style={{ fontSize: 11, color: 'var(--hx-text)', border: '1px solid var(--hx-line)', borderRadius: 6, padding: '2px 7px' }}>
                {r === 0 ? 'Cantrips' : `Rank ${r}`}: <strong style={{ color: 'var(--hx-teal-1)' }}>{n}</strong>
              </span>
            ) : null))}
          </div>
        </div>
      )}

      {/* Feats & features */}
      {pf2.feats.length > 0 && (
        <div>
          <div style={label}>Feats &amp; Features</div>
          <div style={{ display: 'grid', gap: 5, marginTop: 6 }}>
            {pf2.feats.map((f) => (
              <div key={f.id} style={{ padding: '6px 10px', border: '1px solid var(--hx-line)', borderRadius: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <strong style={{ fontSize: 12.5, color: 'var(--hx-text)' }}>{f.name}</strong>
                  <span style={{ fontSize: 9, color: 'var(--hx-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{f.track}{f.level ? ` · L${f.level}` : ''}</span>
                </div>
                {f.body && <div style={{ fontSize: 11.5, color: 'var(--hx-muted)', marginTop: 2 }}>{f.body}</div>}
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ fontSize: 10.5, color: 'var(--hx-muted)' }}>Languages: {pf2.languages.join(', ') || '—'}. All numbers derived by the PF2 rules engine (proficiency = rank bonus + level when trained).</div>
    </div>
  );
}

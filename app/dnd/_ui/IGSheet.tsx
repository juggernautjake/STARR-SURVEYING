// app/dnd/_ui/IGSheet.tsx — the bespoke Intuitive Games character sheet (full-sheet Slices 4+).
//
// Renders the IGCharacter model (character.data.ig) tab-for-tab like the Character Sheet Template, with a
// VANILLA / CUSTOM / DM-GRANTED badge on every mechanical element and all derived numbers computed by the
// pure rules engine (never guessed). Slice 4 ships Identity + Ability Scores/Saves + Summary; later slices
// add Skills / Combat / Reference / Equipment / Companion into this same component. Styleable: it uses the
// platform design tokens and lives inside the character page, so custom layout/CSS apply.
'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from './hextech.module.css';
import type { IGCharacter } from '@/lib/dnd/systems/intuitive-games/model';
import { IG_ABILITIES, IG_SAVES } from '@/lib/dnd/systems/intuitive-games/model';
import { igAbilityMod, igDerived, igSkillTotal, igRanksSpent, igResolveAttack } from '@/lib/dnd/systems/intuitive-games/rules';
import { IG_STANCES, IG_STANCE_DEFS, IG_POWERS, IG_CONDITIONS, IG_ACTION_ECONOMIES, igActionsByEconomy, findIGAncestry } from '@/lib/dnd/systems/intuitive-games/content';
import { igStanceInPlay, igConditionInPlay } from '@/lib/dnd/systems/intuitive-games/inPlay';
import { igConditionSummary } from '@/lib/dnd/systems/intuitive-games/modifiers';
import type { IGEdit } from '@/lib/dnd/systems/intuitive-games/edit';
import { findIGFeat } from '@/lib/dnd/systems/intuitive-games/feats';
import { igAncestryArt, IG_ART_CREDIT } from '@/lib/dnd/systems/intuitive-games/art';

const effectMap = (() => {
  const m = new Map<string, string>();
  for (const e of [...IG_STANCES, ...IG_POWERS]) if (e.effect) m.set(e.name.trim().toLowerCase(), e.effect);
  return m;
})();
const effectOf = (name: string) => effectMap.get(name.trim().toLowerCase()) ?? '';

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

export default function IGSheet({ ig, elements, canEdit, characterId }: { ig: IGCharacter; elements: Tagged[]; canEdit?: boolean; characterId?: string }) {
  const derived = useMemo(() => igDerived(ig), [ig]);
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  // Incremental edit (enter/leave a stance, add/remove a condition) via the write-gated ig-edit route.
  // Available only to a viewer who can write this character; refreshes the sheet on success.
  const canDoEdit = !!(canEdit && characterId);
  const postEdit = async (edit: IGEdit) => {
    if (!characterId || editing) return;
    setEditing(true);
    try {
      await fetch(`/api/dnd/characters/${characterId}/ig-edit`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(edit),
      });
      router.refresh();
    } catch {
      /* surfaced by the unchanged sheet; a retry is a re-tap */
    } finally {
      setEditing(false);
    }
  };
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

      {/* Ancestry traits (B1): the full traits of the character's IG ancestry, each with its rules text.
          A known ancestry gets its blurb + both ancestry traits; an unknown one just shows the name row. */}
      {(() => {
        const anc = findIGAncestry(id.ancestry);
        if (!anc) return null;
        const art = igAncestryArt(anc.name);
        return (
          <div style={{ display: 'grid', gap: 6 }}>
            <div style={{ ...label }}>Ancestry — {anc.name} {badgeFor(id.ancestry)}</div>
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-start' }}>
              {art && (
                // Brendan's hand-drawn race art (ink on white); a light card keeps it legible on the dark sheet.
                <figure style={{ margin: 0, flex: '0 0 auto', display: 'grid', gap: 3, justifyItems: 'center' }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={art} alt={`${anc.name} — Intuitive Games race art`} title={IG_ART_CREDIT} loading="lazy" style={{ width: 132, height: 'auto', borderRadius: 8, background: '#f4f1ea', border: '1px solid var(--hx-line)', padding: 4 }} />
                  <figcaption style={{ fontSize: 9, color: 'var(--hx-muted)', letterSpacing: '0.02em' }}>Art · Brendan (Intuitive Games)</figcaption>
                </figure>
              )}
              <div style={{ flex: '1 1 260px', display: 'grid', gap: 6, minWidth: 220 }}>
                <div style={{ fontSize: 12, color: 'var(--hx-muted)', lineHeight: 1.4 }}>{anc.blurb}</div>
                <div style={{ display: 'grid', gap: 5 }}>
                  {anc.traits.map((t) => (
                    <div key={t.name} title={t.text} style={{ fontSize: 12.5, color: 'var(--hx-text)', lineHeight: 1.4, cursor: 'help' }}>
                      <span style={{ color: 'var(--hx-gold-2)', fontWeight: 600 }}>{t.name}.</span> {t.text}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        );
      })()}

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

      {/* Combat — attacks (to-hit + damage from the rules engine), HP/DR, stances, defensive power, conditions. */}
      {(() => {
        const cb = ig.combat;
        const chip = (name: string) => (
          <span key={name} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12.5, color: 'var(--hx-text)', border: '1px solid var(--hx-line)', borderRadius: 12, padding: '2px 9px' }}>
            {name} {badgeFor(name)}
          </span>
        );
        const has = cb.attacks.length || cb.stances.length || cb.defensivePower || cb.conditions.length || cb.situationalBonuses.length || cb.hitPoints.classBackgroundHp || cb.damageReduction;
        if (!has) return null;
        return (
          <div style={{ display: 'grid', gap: 10 }}>
            <div style={label}>Combat</div>
            {cb.attacks.length > 0 && (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                  <thead>
                    <tr style={{ color: 'var(--hx-muted)', textAlign: 'left' }}>
                      {['Weapon', 'Type', 'Attack', 'Damage', 'Properties'].map((h) => <th key={h} style={{ padding: '2px 8px 4px 0', fontWeight: 600, borderBottom: '1px solid var(--hx-line)' }}>{h}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {cb.attacks.map((a) => {
                      const r = igResolveAttack(ig, a);
                      return (
                        <tr key={a.id} style={{ color: 'var(--hx-text)' }}>
                          <td style={{ padding: '3px 8px 3px 0' }}>{a.name}{a.weaponFocus ? <span title="Weapon Focus" style={{ color: 'var(--hx-gold-2)', fontSize: 10 }}> ✦</span> : null}{a.weaponSpecialization ? <span title="Weapon Specialization" style={{ color: 'var(--hx-gold-2)', fontSize: 10 }}>✦</span> : null}</td>
                          <td style={{ padding: '3px 8px 3px 0', color: 'var(--hx-muted)' }}>{a.weaponType} {badgeFor(a.weaponType)}</td>
                          <td style={{ padding: '3px 8px 3px 0', color: 'var(--hx-gold-2)', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{fmt(r.toHit)}</td>
                          <td style={{ padding: '3px 8px 3px 0', fontVariantNumeric: 'tabular-nums' }}>{r.damage}</td>
                          <td style={{ padding: '3px 8px 3px 0', color: 'var(--hx-muted)' }}>{a.properties}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <div style={{ border: '1px solid var(--hx-line)', borderRadius: 8, padding: '6px 10px', fontSize: 12.5 }}>
                <span style={{ color: 'var(--hx-muted)' }}>HP </span>{cb.hitPoints.classBackgroundHp} class+bg
                {cb.hitPoints.lethal ? <span style={{ color: 'var(--hx-danger)' }}> · {cb.hitPoints.lethal} lethal</span> : null}
                {cb.hitPoints.nonlethal ? <span style={{ color: 'var(--hx-muted)' }}> · {cb.hitPoints.nonlethal} nonlethal</span> : null}
              </div>
              {cb.damageReduction > 0 && <div style={{ border: '1px solid var(--hx-line)', borderRadius: 8, padding: '6px 10px', fontSize: 12.5 }}><span style={{ color: 'var(--hx-muted)' }}>DR </span>{cb.damageReduction}</div>}
            </div>
            {(cb.stances.length > 0 || canDoEdit) && (
              <div style={{ display: 'grid', gap: 4 }}>
                <span style={label}>Stances <span style={{ textTransform: 'none', letterSpacing: 0 }}>(one active at a time — hover for the full rules)</span></span>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                  {cb.stances.map((name) => {
                    const e = igStanceInPlay(name, derived.level);
                    return (
                      <span key={name} title={e?.tooltip ?? name} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12.5, color: 'var(--hx-text)', border: '1px solid var(--hx-line)', borderRadius: 12, padding: '2px 9px', cursor: 'help' }}>
                        {e?.name ?? name} {badgeFor(name)}
                        {e?.summary ? <span style={{ color: 'var(--hx-muted)', fontSize: 11 }}>· {e.summary}</span> : null}
                      </span>
                    );
                  })}
                  {canDoEdit && (
                    // Enter a stance (one active at a time — the route replaces the current one) or clear it.
                    <select
                      aria-label="Active stance"
                      value={cb.stances[0] ?? ''}
                      disabled={editing}
                      onChange={(ev) => postEdit(ev.target.value ? { op: 'set_active_stance', name: ev.target.value } : { op: 'clear_stance' })}
                      style={{ fontSize: 12, background: 'var(--hx-bg-2, #0b1622)', color: 'var(--hx-text)', border: '1px solid var(--hx-line)', borderRadius: 8, padding: '2px 6px' }}
                    >
                      <option value="">— no stance —</option>
                      {IG_STANCE_DEFS.map((s) => <option key={s.name} value={s.name}>{s.name} Stance</option>)}
                    </select>
                  )}
                </div>
              </div>
            )}
            {cb.defensivePower && <div style={{ display: 'grid', gap: 4 }}><span style={label}>Defensive Power</span><div>{chip(cb.defensivePower)}</div></div>}
            {cb.situationalBonuses.length > 0 && <div style={{ display: 'grid', gap: 4 }}><span style={label}>Situational Bonuses</span><div style={{ fontSize: 12.5, color: 'var(--hx-text)' }}>{cb.situationalBonuses.join(' · ')}</div></div>}
            {(cb.conditions.length > 0 || canDoEdit) && (
              <div style={{ display: 'grid', gap: 4 }}>
                <span style={label}>Conditions <span style={{ textTransform: 'none', letterSpacing: 0 }}>(hover for the full rules)</span></span>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                  {cb.conditions.map((c) => {
                    const e = igConditionInPlay(c);
                    return (
                      <span key={c} title={e?.tooltip ?? c} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--hx-danger)', border: '1px solid var(--hx-danger)', borderRadius: 12, padding: '1px 8px', cursor: 'help' }}>
                        {c}
                        {canDoEdit && (
                          <button type="button" aria-label={`Remove ${c}`} disabled={editing} onClick={() => postEdit({ op: 'remove_condition', name: c })} style={{ background: 'none', border: 'none', color: 'var(--hx-danger)', cursor: 'pointer', fontSize: 13, lineHeight: 1, padding: 0 }}>×</button>
                        )}
                      </span>
                    );
                  })}
                  {canDoEdit && (
                    // Apply a condition — the route de-dupes, so re-applying an active one is a no-op.
                    <select
                      aria-label="Add condition"
                      value=""
                      disabled={editing}
                      onChange={(ev) => { if (ev.target.value) postEdit({ op: 'add_condition', name: ev.target.value }); }}
                      style={{ fontSize: 12, background: 'var(--hx-bg-2, #0b1622)', color: 'var(--hx-text)', border: '1px solid var(--hx-line)', borderRadius: 8, padding: '2px 6px' }}
                    >
                      <option value="">+ add condition…</option>
                      {IG_CONDITIONS.filter((c) => !cb.conditions.some((x) => x.toLowerCase() === c.name.toLowerCase())).map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
                    </select>
                  )}
                </div>
                {(() => {
                  // Legible "what's actually applied" note — the stacking flat penalty + any disadvantages,
                  // straight from the IG condition rules (shown, not silently folded into the base numbers).
                  const sum = igConditionSummary(cb.conditions);
                  if (sum.flatD20 === 0 && sum.disadvantages.length === 0) return null;
                  return (
                    <div style={{ fontSize: 11.5, color: 'var(--hx-muted)', lineHeight: 1.4 }}>
                      {sum.flatD20 !== 0 && (
                        <div><span style={{ color: 'var(--hx-danger)', fontWeight: 600 }}>{sum.flatD20} to attacks, saves &amp; skill checks</span> ({sum.flatSources.join(', ')})</div>
                      )}
                      {sum.disadvantages.map((d) => <div key={d}>{d}</div>)}
                    </div>
                  );
                })()}
              </div>
            )}
          </div>
        );
      })()}

      {/* Skills — general grouped by ability, combat skills separate; totals from the rules engine. */}
      {ig.skills.length > 0 && (() => {
        const general = ig.skills.filter((s) => !s.combat);
        const combat = ig.skills.filter((s) => s.combat);
        const byAbility = IG_ABILITIES.map((ab) => ({ ab, list: general.filter((s) => s.ability === ab) })).filter((g) => g.list.length);
        const Row = ({ s }: { s: (typeof ig.skills)[number] }) => {
          const total = igSkillTotal(s, derived.level, igAbilityMod(ig.abilities[s.ability]));
          return (
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12.5, padding: '1px 0' }}>
              <span style={{ color: 'var(--hx-text)' }}>{s.name}{s.proficient ? <span style={{ color: 'var(--hx-teal-1)', fontSize: 9.5 }}> ●</span> : null}</span>
              <span style={{ color: 'var(--hx-gold-2)', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{fmt(total)}</span>
            </div>
          );
        };
        return (
          <div style={{ display: 'grid', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
              <div style={label}>Skills</div>
              <div style={{ fontSize: 11.5, color: 'var(--hx-muted)' }}>Ranks: {igRanksSpent(ig)} spent / {ig.skillRanksAvailable} available · trained ●</div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '10px 18px' }}>
              {byAbility.map(({ ab, list }) => (
                <div key={ab}>
                  <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--hx-teal-1)', letterSpacing: '0.05em', marginBottom: 2 }}>{ab}-BASED</div>
                  {list.map((s) => <Row key={s.name} s={s} />)}
                </div>
              ))}
              {combat.length > 0 && (
                <div>
                  <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--hx-danger)', letterSpacing: '0.05em', marginBottom: 2 }}>COMBAT SKILLS</div>
                  {combat.map((s) => <Row key={s.name} s={s} />)}
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* Reference — powers + feats + stance descriptions + the action economy. */}
      {(ig.powers.length > 0 || ig.feats.general.length > 0 || ig.feats.combat.length > 0 || ig.stances.length > 0) && (
        <div style={{ display: 'grid', gap: 12 }}>
          <div style={label}>Reference — powers, feats &amp; stances</div>
          {ig.powers.length > 0 && (
            <div style={{ display: 'grid', gap: 6 }}>
              <span style={{ ...label, color: 'var(--hx-pink-1, #d98cc0)' }}>Powers</span>
              {ig.powers.map((p) => (
                <div key={p} style={{ display: 'grid', gap: 1 }}>
                  <span style={{ fontSize: 13, color: 'var(--hx-text)', display: 'flex', alignItems: 'center', gap: 6 }}>{p} {badgeFor(p)}</span>
                  {effectOf(p) && <span style={{ fontSize: 11.5, color: 'var(--hx-muted)' }}>{effectOf(p)}</span>}
                </div>
              ))}
            </div>
          )}
          {(ig.feats.general.length > 0 || ig.feats.combat.length > 0) && (
            <div style={{ display: 'grid', gap: 4 }}>
              <span style={label}>Feats <span style={{ textTransform: 'none', letterSpacing: 0 }}>(hover for the full rules)</span></span>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {[...ig.feats.general, ...ig.feats.combat].map((f) => {
                  const def = findIGFeat(f);
                  const tip = def ? `${def.name} — ${def.category} feat${def.prerequisites ? ` (Prereq: ${def.prerequisites})` : ''}: ${def.effect}` : undefined;
                  return (
                    <span key={f} title={tip} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12.5, color: 'var(--hx-text)', border: '1px solid var(--hx-line)', borderRadius: 12, padding: '2px 9px', cursor: def ? 'help' : 'default' }}>{f} {badgeFor(f)}</span>
                  );
                })}
              </div>
            </div>
          )}
          {ig.stances.length > 0 && (
            <div style={{ display: 'grid', gap: 6 }}>
              <span style={{ ...label, color: 'var(--hx-teal-1)' }}>Stance descriptions</span>
              {ig.stances.map((s) => (
                <div key={s} style={{ display: 'grid', gap: 1 }}>
                  <span style={{ fontSize: 13, color: 'var(--hx-text)', display: 'flex', alignItems: 'center', gap: 6 }}>{s} {badgeFor(s)}</span>
                  {effectOf(s) && <span style={{ fontSize: 11.5, color: 'var(--hx-muted)' }}>{effectOf(s)}</span>}
                </div>
              ))}
            </div>
          )}
          <details style={{ fontSize: 12 }}>
            <summary style={{ cursor: 'pointer', ...label }}>Action economy (reference)</summary>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '8px 14px', marginTop: 6 }}>
              {IG_ACTION_ECONOMIES.map((e) => {
                const list = igActionsByEconomy()[e];
                return (
                  <div key={e}>
                    <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--hx-gold-2)', letterSpacing: '0.05em' }}>{e.toUpperCase()}</div>
                    {list.map((a) => <div key={a.name} style={{ fontSize: 12, color: 'var(--hx-muted)' }}>{a.name}{a.note ? ` (${a.note})` : ''}</div>)}
                  </div>
                );
              })}
            </div>
          </details>
        </div>
      )}

      {/* Equipment — worn slots + other possessions. */}
      {(() => {
        const eq = ig.equipment;
        const slots = ([['Arms', eq.arms], ['Head', eq.head], ['Torso', eq.torso], ['Legs', eq.legs], ['Hands', eq.hands]] as [string, string][]).filter(([, v]) => v && v.trim());
        if (!slots.length && !eq.other.length) return null;
        return (
          <div style={{ display: 'grid', gap: 6 }}>
            <div style={label}>Equipment</div>
            {slots.length > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '4px 14px' }}>
                {slots.map(([k, v]) => <div key={k} style={{ display: 'flex', gap: 6, alignItems: 'baseline' }}><span style={label}>{k}</span><span style={value}>{v}</span></div>)}
              </div>
            )}
            {eq.other.length > 0 && <div style={{ fontSize: 12.5, color: 'var(--hx-text)' }}><span style={label}>Other </span>{eq.other.join(', ')}</div>}
          </div>
        );
      })()}

      {/* Companion Creature (Sheet 7) — its own scores, saves, HP, DR, movement, attacks, powers. */}
      {ig.companion && (() => {
        const co = ig.companion!;
        const saveTotal = (k: (typeof IG_SAVES)[number]) => {
          const abil = k === 'Fortitude' ? 'CON' : k === 'Reflex' ? 'DEX' : 'WIS';
          return co.saves[k].rank + Math.max(1, derived.level) + igAbilityMod(co.abilities[abil]) + co.saves[k].misc;
        };
        return (
          <div className={styles.framedPanel} style={{ padding: '10px 12px', display: 'grid', gap: 10, background: 'rgba(10,200,185,0.04)' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
              <strong style={{ fontFamily: 'var(--hx-font-display)', color: 'var(--hx-teal-1)' }}>◆ Companion</strong>
              <span style={{ fontSize: 13, color: 'var(--hx-text)' }}>{co.name}</span>
              {co.creatureType && <span style={{ fontSize: 12.5, color: 'var(--hx-muted)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>· {co.creatureType} {badgeFor(co.creatureType)}</span>}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, minmax(48px, 1fr))', gap: 6 }}>
              {IG_ABILITIES.map((k) => (
                <div key={k} style={{ textAlign: 'center', border: '1px solid var(--hx-line)', borderRadius: 6, padding: '4px 2px' }}>
                  <div style={{ fontSize: 9.5, color: 'var(--hx-muted)' }}>{k}</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--hx-text)' }}>{co.abilities[k]}</div>
                  <div style={{ fontSize: 10.5, color: 'var(--hx-gold-2)' }}>{fmt(igAbilityMod(co.abilities[k]))}</div>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', fontSize: 12.5 }}>
              <span style={{ border: '1px solid var(--hx-line)', borderRadius: 8, padding: '4px 9px' }}><span style={{ color: 'var(--hx-muted)' }}>HP </span>{co.hitPoints}</span>
              {IG_SAVES.map((s) => <span key={s} style={{ border: '1px solid var(--hx-line)', borderRadius: 8, padding: '4px 9px' }}><span style={{ color: 'var(--hx-muted)' }}>{s.slice(0, 4)} </span>{fmt(saveTotal(s))}</span>)}
              {co.damageReduction > 0 && <span style={{ border: '1px solid var(--hx-line)', borderRadius: 8, padding: '4px 9px' }}><span style={{ color: 'var(--hx-muted)' }}>DR </span>{co.damageReduction}</span>}
            </div>
            {(co.movement || co.resistances || co.vulnerabilities) && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '2px 14px', fontSize: 12.5 }}>
                {co.movement && <div><span style={label}>Movement </span><span style={value}>{co.movement}</span></div>}
                {co.resistances && <div><span style={label}>Resistances </span><span style={value}>{co.resistances}</span></div>}
                {co.vulnerabilities && <div><span style={label}>Vulnerabilities </span><span style={value}>{co.vulnerabilities}</span></div>}
              </div>
            )}
            {co.attacks.length > 0 && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {co.attacks.map((a) => { const r = igResolveAttack({ ...ig, abilities: co.abilities }, a); return <span key={a.id} style={{ fontSize: 12.5, border: '1px solid var(--hx-line)', borderRadius: 8, padding: '4px 9px' }}>{a.name} <span style={{ color: 'var(--hx-gold-2)' }}>{fmt(r.toHit)}</span> · {r.damage}</span>; })}
              </div>
            )}
            {co.powers.length > 0 && <div style={{ fontSize: 12.5 }}><span style={label}>Powers </span><span style={value}>{co.powers.join(', ')}</span></div>}
            {co.notes && <p style={{ ...value, whiteSpace: 'pre-wrap', margin: 0, color: 'var(--hx-muted)' }}>{co.notes}</p>}
          </div>
        );
      })()}

      {/* Notes */}
      {ig.notes && ig.notes.trim() && (
        <div style={{ display: 'grid', gap: 4 }}>
          <div style={label}>Notes</div>
          <p style={{ ...value, whiteSpace: 'pre-wrap', margin: 0, color: 'var(--hx-muted)' }}>{ig.notes}</p>
        </div>
      )}

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

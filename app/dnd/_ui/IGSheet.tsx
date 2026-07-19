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
import { resolveD20Roll, rollNaturalD20, rollDiceExpr, degreeLabel } from '@/lib/dnd/roll';
import { IG_STANCES, IG_STANCE_DEFS, IG_POWERS, IG_SPELL_ROSTER, IG_DEFENSIVE_POWERS, IG_CONDITIONS, IG_ACTION_ECONOMIES, igActionsByEconomy, findIGAncestry } from '@/lib/dnd/systems/intuitive-games/content';
import { igStanceInPlay, igConditionInPlay } from '@/lib/dnd/systems/intuitive-games/inPlay';
import { igConditionSummary, igStanceMechanicNote } from '@/lib/dnd/systems/intuitive-games/modifiers';
import { igConditionRollEffect, type IgRollKind } from '@/lib/dnd/conditions/intuitive-games';
import { igStanceRollEffect } from '@/lib/dnd/stances/intuitive-games';
import { igCompanionHp, igCompanionAbility } from '@/lib/dnd/systems/intuitive-games/companions';
import type { IGEdit } from '@/lib/dnd/systems/intuitive-games/edit';
import { findIGFeat, igAllFeats } from '@/lib/dnd/systems/intuitive-games/feats';
import { igAncestryArt, IG_ART_CREDIT } from '@/lib/dnd/systems/intuitive-games/art';

const effectMap = (() => {
  const m = new Map<string, string>();
  // Include defensive powers so their chip can hover-explain itself like every other in-play effect
  // (owner: "hovering over any effect in play shows a tooltip explaining how it works").
  for (const e of [...IG_STANCES, ...IG_POWERS, ...IG_DEFENSIVE_POWERS]) if (e.effect) m.set(e.name.trim().toLowerCase(), e.effect);
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
  // In-app roller (Area R1b) — tap a save/skill/attack to roll a d20 + its modifier, or an attack's damage
  // to roll its dice, through the shared engine; the result shows in the banner below. RNG here (auto mode);
  // manual-entry + record-IRL + a target DC (degrees) come in R2/R3/R5.
  const [lastRoll, setLastRoll] = useState<{ label: string; total: number; detail: string; tone: 'crit' | 'fumble' | 'normal' } | null>(null);
  // Optional target DC — when set, a roll resolves the four-step degree of success (IG's ladder).
  const [targetDc, setTargetDc] = useState('');
  // Quick in-play HP adjust (Area SQ4) — the apply_damage/heal ig-edit ops exist for the AI; this wires a manual
  // control so a player can take damage / heal without entering full edit mode.
  const [hpAmt, setHpAmt] = useState('');
  const rollLine = (label: string, modifier: number, kind: IgRollKind = 'ability_check') => {
    const dcNum = targetDc.trim() === '' ? undefined : Number(targetDc);
    const dc = Number.isFinite(dcNum) ? dcNum : undefined;
    // Auto-fold the character's active IG conditions AND active stance into the roll (Area R2 / B4-B5 — IG):
    // Shaken/Sickened's flat −2 and disadvantage from Blind/Prone/Deaf/etc. on the matching category, PLUS the
    // active stance's advantage/disadvantage for this kind (Offensive → advantage on attacks / disadvantage on
    // Reflex saves, etc.). Opposing advantage + disadvantage cancel to a straight roll (the 5e rule the platform
    // uses); advantage rolls two d20 and keeps the higher, disadvantage the lower. Every source is named on the
    // result so the player sees WHY.
    const cond = igConditionRollEffect((ig.combat?.conditions ?? []) as string[], kind);
    const stanceEff = igStanceRollEffect(ig.combat?.stances?.[0] ?? null, derived.level, kind);
    let advantage = stanceEff.advantage;
    let disadvantage = cond.disadvantage || stanceEff.disadvantage;
    if (advantage && disadvantage) { advantage = false; disadvantage = false; } // cancel to a straight roll
    const natural = advantage
      ? Math.max(rollNaturalD20(), rollNaturalD20())
      : disadvantage
        ? Math.min(rollNaturalD20(), rollNaturalD20())
        : rollNaturalD20();
    const r = resolveD20Roll({ natural, modifier: modifier + cond.penalty, dc, system: 'intuitive-games' });
    const sign = r.modifier >= 0 ? `+ ${r.modifier}` : `− ${Math.abs(r.modifier)}`;
    let detail = `d20 [${r.natural}] ${sign}`;
    let tone: 'crit' | 'fumble' | 'normal' = r.critical ? 'crit' : r.fumble ? 'fumble' : 'normal';
    if (r.degree && r.dc != null) {
      detail += ` · vs DC ${r.dc} → ${degreeLabel(r.degree)}`;
      if (r.degree === 'critical-success') tone = 'crit';
      else if (r.degree === 'critical-failure') tone = 'fumble';
    }
    detail += `${r.critical ? ' · NAT 20' : ''}${r.fumble ? ' · NAT 1' : ''}`;
    const sources = [...cond.sources, ...stanceEff.sources];
    if (sources.length) detail += ` · ⚠ ${advantage ? 'ADV ' : ''}${disadvantage ? 'DIS ' : ''}${cond.penalty ? `${cond.penalty} ` : ''}from ${sources.join(', ')}`;
    setLastRoll({ label, total: r.total, detail, tone });
  };
  const rollDamage = (label: string, expr: string) => {
    const r = rollDiceExpr(expr);
    setLastRoll({ label, total: r.total, detail: r.breakdown, tone: 'normal' });
  };
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
            // Tap an ability to roll an ability check (R1b): d20 + its modifier.
            <button key={k} type="button" onClick={() => rollLine(`${k} check`, igAbilityMod(ig.abilities[k]), (k === 'STR' || k === 'DEX') ? 'str_dex_check' : 'ability_check')} title={`Roll ${k} check (d20 ${fmt(igAbilityMod(ig.abilities[k]))})`}
              style={{ textAlign: 'center', border: '1px solid var(--hx-line)', borderRadius: 8, padding: '8px 4px', background: 'rgba(1,10,19,0.4)', cursor: 'pointer', width: '100%' }}>
              <div style={{ fontSize: 10.5, color: 'var(--hx-muted)', letterSpacing: '0.06em' }}>{k} 🎲</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--hx-text)', lineHeight: 1.1 }}>{ig.abilities[k]}</div>
              <div style={{ fontSize: 12.5, color: 'var(--hx-gold-2)' }}>{fmt(igAbilityMod(ig.abilities[k]))}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Roller controls + result banner (Area R1b) — tap a save/skill/attack/ability below to roll; set a
          target DC to see the degree of success. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <label style={{ fontSize: 11, color: 'var(--hx-muted)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          🎲 Target DC
          <input type="number" value={targetDc} onChange={(e) => setTargetDc(e.target.value)} placeholder="—"
            style={{ width: 56, fontSize: 12, padding: '3px 6px', background: 'rgba(1,10,19,0.6)', color: 'var(--hx-text)', border: '1px solid var(--hx-line)', borderRadius: 4 }} />
        </label>
        {lastRoll && (
          <div style={{ flex: 1, minWidth: 200, border: '1px solid var(--hx-gold-1)', borderRadius: 8, padding: '8px 12px', display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', background: 'rgba(212,175,55,0.06)' }}>
            <span style={{ fontSize: 12, color: 'var(--hx-muted)' }}>{lastRoll.label}</span>
            <strong style={{ fontSize: 20, color: lastRoll.tone === 'crit' ? 'var(--hx-teal-1)' : lastRoll.tone === 'fumble' ? 'var(--hx-danger)' : 'var(--hx-gold-2)' }}>{lastRoll.total}</strong>
            <span style={{ fontSize: 11.5, color: 'var(--hx-muted)' }}>{lastRoll.detail}</span>
          </div>
        )}
      </div>

      {/* Saves + top-line stats — tap a save to roll it in-app (R1b). */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {IG_SAVES.map((s) => (
          <button key={s} type="button" onClick={() => rollLine(`${s} save`, derived.saves[s], s === 'Reflex' ? 'reflex_save' : s === 'Fortitude' ? 'fortitude_save' : 'will_save')} title={`Roll ${s} (d20 ${fmt(derived.saves[s])})`}
            style={{ flex: 1, minWidth: 90, textAlign: 'center', border: '1px solid var(--hx-line)', borderRadius: 8, padding: '8px 6px', background: 'none', cursor: 'pointer' }}>
            <div style={{ fontSize: 10.5, color: 'var(--hx-muted)' }}>{s} 🎲</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--hx-teal-1)' }}>{fmt(derived.saves[s])}</div>
          </button>
        ))}
        <div style={{ flex: 1, minWidth: 90, textAlign: 'center', border: '1px solid var(--hx-line)', borderRadius: 8, padding: '8px 6px' }}>
          <div style={{ fontSize: 10.5, color: 'var(--hx-muted)' }}>Hit Points</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--hx-text)' }}>{derived.currentHp}<span style={{ fontSize: 12, color: 'var(--hx-muted)' }}> / {derived.maxHp}</span></div>
          {canDoEdit && (
            // Quick damage / heal — posts apply_damage / heal to the ig-edit route (SQ4).
            <div style={{ display: 'flex', gap: 3, marginTop: 6, alignItems: 'center', justifyContent: 'center' }}>
              <input type="number" min={1} value={hpAmt} onChange={(e) => setHpAmt(e.target.value)} placeholder="±" aria-label="HP amount"
                style={{ width: 42, fontSize: 12, padding: '2px 4px', textAlign: 'center', background: 'var(--hx-bg-2, #0b1622)', color: 'var(--hx-text)', border: '1px solid var(--hx-line)', borderRadius: 6 }} />
              <button type="button" disabled={editing || !hpAmt.trim()} title="Take damage"
                onClick={() => { const n = parseInt(hpAmt, 10); if (n > 0) { postEdit({ op: 'apply_damage', amount: n }); setHpAmt(''); } }}
                style={{ fontSize: 11, padding: '2px 6px', background: 'none', border: '1px solid var(--hx-danger)', color: 'var(--hx-danger)', borderRadius: 6, cursor: 'pointer' }}>−</button>
              <button type="button" disabled={editing || !hpAmt.trim()} title="Heal"
                onClick={() => { const n = parseInt(hpAmt, 10); if (n > 0) { postEdit({ op: 'heal', amount: n }); setHpAmt(''); } }}
                style={{ fontSize: 11, padding: '2px 6px', background: 'none', border: '1px solid var(--hx-teal-1)', color: 'var(--hx-teal-1)', borderRadius: 6, cursor: 'pointer' }}>＋</button>
            </div>
          )}
        </div>
        <div style={{ flex: 1, minWidth: 90, textAlign: 'center', border: '1px solid var(--hx-line)', borderRadius: 8, padding: '8px 6px' }}>
          <div style={{ fontSize: 10.5, color: 'var(--hx-muted)' }}>Proficiency</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--hx-text)' }}>{fmt(derived.proficiency)}</div>
        </div>
      </div>

      {/* Combat — attacks (to-hit + damage from the rules engine), HP/DR, stances, defensive power, conditions. */}
      {(() => {
        const cb = ig.combat;
        const chip = (name: string) => {
          const tip = effectOf(name); // the rules text, so the chip hover-explains itself
          return (
            <span key={name} title={tip || undefined} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12.5, color: 'var(--hx-text)', border: '1px solid var(--hx-line)', borderRadius: 12, padding: '2px 9px', cursor: tip ? 'help' : 'default' }}>
              {name} {badgeFor(name)}
            </span>
          );
        };
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
                          <td style={{ padding: '3px 8px 3px 0', fontVariantNumeric: 'tabular-nums' }}>
                            {/* Tap the to-hit to roll the attack (R1b): d20 + to-hit through the shared engine. */}
                            <button type="button" onClick={() => rollLine(`${a.name} attack`, r.toHit, 'attack')} title={`Roll ${a.name} attack (d20 ${fmt(r.toHit)})`}
                              style={{ background: 'none', border: 'none', color: 'var(--hx-gold-2)', fontWeight: 600, cursor: 'pointer', padding: 0, fontVariantNumeric: 'tabular-nums' }}>
                              {fmt(r.toHit)} 🎲
                            </button>
                          </td>
                          <td style={{ padding: '3px 8px 3px 0', fontVariantNumeric: 'tabular-nums' }}>
                            {/* Tap the damage to roll the dice expression (R1b). */}
                            <button type="button" onClick={() => rollDamage(`${a.name} damage`, r.damage)} title={`Roll ${a.name} damage (${r.damage})`}
                              style={{ background: 'none', border: 'none', color: 'var(--hx-text)', cursor: 'pointer', padding: 0, fontVariantNumeric: 'tabular-nums' }}>
                              {r.damage} 🎲
                            </button>
                          </td>
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
                {(() => {
                  // The active stance's precise mechanical effect at this level (adv/disadv/DR/bonus) — shown,
                  // per the same legibility pattern as the condition penalty (not folded into base numbers).
                  const note = cb.stances[0] ? igStanceMechanicNote(cb.stances[0], derived.level) : null;
                  return note ? <div style={{ fontSize: 11.5, color: 'var(--hx-teal-1)', lineHeight: 1.4 }}>{note}</div> : null;
                })()}
              </div>
            )}
            {(cb.defensivePower || canDoEdit) && (
              <div style={{ display: 'grid', gap: 4 }}>
                <span style={label}>Defensive Power</span>
                {cb.defensivePower && <div>{chip(cb.defensivePower)}</div>}
                {canDoEdit && (
                  // One defensive power (a reaction); set/replace/clear it — parity with the AI's
                  // set_defensive_power. Offers the full IG_DEFENSIVE_POWERS list.
                  <select aria-label="Defensive power" value={cb.defensivePower} disabled={editing} onChange={(ev) => postEdit({ op: 'set_defensive_power', name: ev.target.value })} style={{ fontSize: 12, background: 'var(--hx-bg-2, #0b1622)', color: 'var(--hx-text)', border: '1px solid var(--hx-line)', borderRadius: 8, padding: '2px 6px', justifySelf: 'start' }}>
                    <option value="">— no defensive power —</option>
                    {IG_DEFENSIVE_POWERS.map((d) => <option key={d.name} value={d.name}>{d.name}</option>)}
                  </select>
                )}
              </div>
            )}
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
          // Tap a skill to roll it (R1b): d20 + total through the shared engine, result in the banner.
          return (
            <button type="button" onClick={() => rollLine(`${s.name} (${s.ability})`, total)} title={`Roll ${s.name} (d20 ${fmt(total)})`}
              style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12.5, padding: '2px 4px', width: '100%', background: 'none', border: 'none', borderRadius: 4, cursor: 'pointer', textAlign: 'left' }}>
              <span style={{ color: 'var(--hx-text)' }}>{s.name}{s.proficient ? <span style={{ color: 'var(--hx-teal-1)', fontSize: 9.5 }}> ●</span> : null}</span>
              <span style={{ color: 'var(--hx-gold-2)', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{fmt(total)} 🎲</span>
            </button>
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
      {(ig.powers.length > 0 || ig.feats.general.length > 0 || ig.feats.combat.length > 0 || ig.stances.length > 0 || canDoEdit) && (
        <div style={{ display: 'grid', gap: 12 }}>
          <div style={label}>Reference — powers, feats &amp; stances</div>
          {(ig.powers.length > 0 || canDoEdit) && (
            <div style={{ display: 'grid', gap: 6 }}>
              <span style={{ ...label, color: 'var(--hx-pink-1, #d98cc0)' }}>Powers</span>
              {ig.powers.map((p) => (
                <div key={p} style={{ display: 'grid', gap: 1 }}>
                  <span style={{ fontSize: 13, color: 'var(--hx-text)', display: 'flex', alignItems: 'center', gap: 6 }}>
                    {p} {badgeFor(p)}
                    {canDoEdit && (
                      <button type="button" aria-label={`Remove ${p}`} disabled={editing} onClick={() => postEdit({ op: 'remove_power', name: p })} style={{ background: 'none', border: 'none', color: 'var(--hx-muted)', cursor: 'pointer', fontSize: 13, lineHeight: 1, padding: 0 }}>×</button>
                    )}
                  </span>
                  {effectOf(p)
                    ? <span style={{ fontSize: 11.5, color: 'var(--hx-muted)' }}>{effectOf(p)}</span>
                    // A recognized (non-custom) power with no effect text is a roster power pending
                    // Brendan's rules — say so (Ground Rule 2) rather than leaving a bare name that reads
                    // as "no effect". A custom power gets no note (its effect simply isn't authored here).
                    : srcByName.get(p.trim().toLowerCase()) && srcByName.get(p.trim().toLowerCase()) !== 'custom'
                      ? <span style={{ fontSize: 11, fontStyle: 'italic', color: 'var(--hx-gold-2)' }}>Effect text not yet published — work in progress.</span>
                      : null}
                </div>
              ))}
              {canDoEdit && (() => {
                // Add a power — offered from the FULL IG spell-list roster grouped by school, so the sheet
                // has parity with the AI's add_power (which grounds on igAllSpellNames). Drawing only from
                // IG_POWERS would hide roster powers whose effect text is still pending Brendan (e.g. Gate,
                // Portal). Excludes powers already known; the route de-dupes, so a repeat pick is a no-op.
                const have = new Set(ig.powers.map((p) => p.toLowerCase()));
                const schools = Object.entries(IG_SPELL_ROSTER)
                  .map(([school, names]) => [school, names.filter((n) => !have.has(n.toLowerCase()))] as const)
                  .filter(([, names]) => names.length > 0);
                return (
                  <select aria-label="Add power" value="" disabled={editing} onChange={(ev) => { if (ev.target.value) postEdit({ op: 'add_power', name: ev.target.value }); }} style={{ fontSize: 12, background: 'var(--hx-bg-2, #0b1622)', color: 'var(--hx-text)', border: '1px solid var(--hx-line)', borderRadius: 8, padding: '2px 6px', justifySelf: 'start' }}>
                    <option value="">+ add power…</option>
                    {schools.map(([school, names]) => <optgroup key={school} label={school}>{names.map((n) => <option key={n} value={n}>{n}</option>)}</optgroup>)}
                  </select>
                );
              })()}
            </div>
          )}
          {(ig.feats.general.length > 0 || ig.feats.combat.length > 0 || canDoEdit) && (
            <div style={{ display: 'grid', gap: 4 }}>
              <span style={label}>Feats <span style={{ textTransform: 'none', letterSpacing: 0 }}>(hover for the full rules)</span></span>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                {[...ig.feats.general, ...ig.feats.combat].map((f) => {
                  const def = findIGFeat(f);
                  const tip = def ? `${def.name} — ${def.category} feat${def.prerequisites ? ` (Prereq: ${def.prerequisites})` : ''}: ${def.effect}` : undefined;
                  return (
                    <span key={f} title={tip} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12.5, color: 'var(--hx-text)', border: '1px solid var(--hx-line)', borderRadius: 12, padding: '2px 9px', cursor: def ? 'help' : 'default' }}>
                      {f} {badgeFor(f)}
                      {canDoEdit && (
                        <button type="button" aria-label={`Remove ${f}`} disabled={editing} onClick={() => postEdit({ op: 'remove_feat', name: f })} style={{ background: 'none', border: 'none', color: 'var(--hx-muted)', cursor: 'pointer', fontSize: 13, lineHeight: 1, padding: 0 }}>×</button>
                      )}
                    </span>
                  );
                })}
                {canDoEdit && (() => {
                  // Add a feat — grouped by General/Combat; excludes feats the character already has. The
                  // route routes it to the right list + de-dupes, so a stray pick is harmless.
                  const have = new Set([...ig.feats.general, ...ig.feats.combat].map((f) => f.toLowerCase()));
                  const opts = igAllFeats().filter((f) => !have.has(f.name.toLowerCase()));
                  return (
                    <select aria-label="Add feat" value="" disabled={editing} onChange={(ev) => { if (ev.target.value) postEdit({ op: 'add_feat', name: ev.target.value }); }} style={{ fontSize: 12, background: 'var(--hx-bg-2, #0b1622)', color: 'var(--hx-text)', border: '1px solid var(--hx-line)', borderRadius: 8, padding: '2px 6px' }}>
                      <option value="">+ add feat…</option>
                      <optgroup label="General">{opts.filter((f) => f.category === 'General').map((f) => <option key={`g-${f.name}`} value={f.name}>{f.name}</option>)}</optgroup>
                      <optgroup label="Combat">{opts.filter((f) => f.category === 'Combat').map((f) => <option key={`c-${f.name}`} value={f.name}>{f.name}</option>)}</optgroup>
                    </select>
                  );
                })()}
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
              <span title={`Rules HP for CON ${co.abilities.CON} at level ${Math.max(1, derived.level)}: ${igCompanionHp(co.abilities.CON, Math.max(1, derived.level))} (CON score at level 1, then +2 + CON mod per level).`} style={{ border: '1px solid var(--hx-line)', borderRadius: 8, padding: '4px 9px', cursor: 'help' }}><span style={{ color: 'var(--hx-muted)' }}>HP </span>{co.hitPoints}</span>
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
            {co.powers.length > 0 && (
              <div style={{ fontSize: 12.5 }}>
                <span style={label}>Features / Aspects </span>
                {/* Each companion feature/aspect shows its scraped effect text on hover (Area companions),
                    so the companion sheet is legible in full, not just a list of names. */}
                {co.powers.map((p, i) => {
                  const eff = igCompanionAbility(p);
                  return <span key={p}>{i > 0 ? ', ' : ''}<span title={eff ?? ''} style={{ ...value, cursor: eff ? 'help' : 'default', borderBottom: eff ? '1px dotted var(--hx-line)' : 'none' }}>{p}</span></span>;
                })}
              </div>
            )}
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

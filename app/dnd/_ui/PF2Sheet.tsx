// app/dnd/_ui/PF2Sheet.tsx — the bespoke Pathfinder 2e character sheet (Remaster).
//
// Renders the PF2Character sidecar (character.data.pf2e) with every derived number computed by the pure
// rules engine (never guessed): AC, HP, Perception, the three saves, class/spell DC, skill and Strike
// totals — all showing proficiency = rank bonus + level. Attributes are PF2 modifiers. Styleable: it uses
// the platform design tokens and lives inside the character page, so custom layout/CSS apply.
'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import OffRulesMark from '@/app/dnd/_sheet/components/ui/OffRulesMark';
import PF2ContentPicker from './PF2ContentPicker';
import PF2ElementEditor, { type PF2EditableElement } from './PF2ElementEditor';
import PF2WeaponEditor, { type PF2EditableWeapon } from './PF2WeaponEditor';
import styles from './hextech.module.css';
import type { PF2Character } from '@/lib/dnd/systems/pathfinder2e/model';
import { PF2_ATTRIBUTES, PF2_SAVES } from '@/lib/dnd/systems/pathfinder2e/model';
import {
  pf2Derived, pf2SkillTotal, pf2SaveTotal, pf2PerceptionTotal, pf2AttackBonus, pf2Proficiency,
} from '@/lib/dnd/systems/pathfinder2e/rules';
import { pf2ResolveStrike } from '@/lib/dnd/systems/pathfinder2e/strike';
import { resolveD20Roll, rollNaturalD20, rollDiceExpr, degreeLabel } from '@/lib/dnd/roll';
import { pf2ConditionRollEffect, pf2ConditionMechanics, type Pf2RollKind } from '@/lib/dnd/conditions/pathfinder2e';
import InfoTip from '@/app/dnd/_sheet/components/InfoTip';

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

export default function PF2Sheet({ pf2, characterId, canEdit, isDM, variantKind = 'vanilla' }: {
  pf2: PF2Character; characterId?: string; canEdit?: boolean;
  isDM?: boolean;
  /** Vanilla characters are held to class and level; custom ones are flagged, not blocked. Defaults
   *  to vanilla — the safe direction, matching the server. */
  variantKind?: 'vanilla' | 'custom';
}) {
  const router = useRouter();
  const d = useMemo(() => pf2Derived(pf2), [pf2]);
  const id = pf2.identity;
  const label = { fontSize: 11, color: 'var(--hx-teal-1)', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase' as const };
  const [saving, setSaving] = useState(false);

  // An incremental in-place edit (R4) — POST one structured op to the write-gated pf2-edit route, then refresh
  // the server component so the new numbers render. Only wired when the viewer can edit + we have a character id.
  const postEdit = async (edit: Record<string, unknown>) => {
    if (!characterId || saving) return;
    setSaving(true);
    try {
      await fetch(`/api/dnd/characters/${characterId}/pf2-edit`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(edit),
      });
      router.refresh();
    } finally {
      setSaving(false);
    }
  };
  const canDoEdit = !!(canEdit && characterId);
  // Which content picker is open, if any. PF2 had no picker at all — the catalog and the gated ops
  // both existed, but nothing in the UI could reach them, so content could only arrive via the AI.
  const [picker, setPicker] = useState<'feat' | 'spell' | null>(null);
  // The element editor (S15). `initial` absent = authoring homebrew; present = editing what the
  // character holds.
  const [editor, setEditor] = useState<{ kind: 'feat' | 'spell'; initial?: PF2EditableElement } | null>(null);
  // Weapons get their own editor: traits are the mechanically important field and need a picker,
  // not a text box, so a typo cannot silently disable a weapon's defining property.
  const [weaponEditor, setWeaponEditor] = useState<PF2EditableWeapon | null | 'new'>(null);

  // In-app roller (R1b) — tap a save/skill/strike to roll a d20 + modifier, or a strike's damage, through the
  // shared engine; result shows in the banner. RNG (auto mode); PF2 uses the four-step degree ladder once a DC
  // is supplied (a target-DC field is a later slice).
  const [lastRoll, setLastRoll] = useState<{ label: string; total: number; detail: string; tone: 'crit' | 'fumble' | 'normal' } | null>(null);
  // Optional target DC — when set, a roll resolves PF2's four-step degree of success.
  const [targetDc, setTargetDc] = useState('');
  const rollLine = (name: string, modifier: number, kind: Pf2RollKind = 'skill') => {
    const dcNum = targetDc.trim() === '' ? undefined : Number(targetDc);
    const dc = Number.isFinite(dcNum) ? dcNum : undefined;
    // Auto-fold active PF2 conditions (Area R2 — PF2): the WORST status penalty + the WORST circumstance
    // penalty apply (same-type penalties don't stack; the two types do). Frightened/Sickened hit everything;
    // Prone hits attacks. The affecting conditions are named on the result so the player sees why.
    const cond = pf2ConditionRollEffect((pf2.combat.conditions ?? []) as { name: string; value?: number }[], kind);
    const r = resolveD20Roll({ natural: rollNaturalD20(), modifier: modifier + cond.penalty, dc, system: 'pathfinder2e' });
    const sign = r.modifier >= 0 ? `+ ${r.modifier}` : `− ${Math.abs(r.modifier)}`;
    let detail = `d20 [${r.natural}] ${sign}`;
    let tone: 'crit' | 'fumble' | 'normal' = r.critical ? 'crit' : r.fumble ? 'fumble' : 'normal';
    if (r.degree && r.dc != null) {
      detail += ` · vs DC ${r.dc} → ${degreeLabel(r.degree)}`;
      if (r.degree === 'critical-success') tone = 'crit';
      else if (r.degree === 'critical-failure') tone = 'fumble';
    }
    detail += `${r.critical ? ' · NAT 20' : ''}${r.fumble ? ' · NAT 1' : ''}`;
    if (cond.sources.length) detail += ` · ⚠ ${cond.penalty} from ${cond.sources.join(', ')}`;
    setLastRoll({ label: name, total: r.total, detail, tone });
  };
  const rollDamage = (name: string, expr: string) => {
    const r = rollDiceExpr(expr);
    setLastRoll({ label: name, total: r.total, detail: r.breakdown, tone: 'normal' });
  };

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
              {canDoEdit && (
                // Edit the attribute MODIFIER in place (R4) — commits set_attribute on Enter/blur; re-keyed to
                // reset after the sheet refreshes. PF2 tracks modifiers, so the input IS the modifier.
                <input key={`${k}-${pf2.attributes[k]}`} type="number" min={-5} max={12} defaultValue={pf2.attributes[k]} disabled={saving} aria-label={`Set ${k}`}
                  onKeyDown={(ev) => { if (ev.key === 'Enter') (ev.target as HTMLInputElement).blur(); }}
                  onBlur={(ev) => { const v = parseInt(ev.target.value, 10); if (Number.isFinite(v) && v !== pf2.attributes[k]) postEdit({ op: 'set_attribute', attribute: k, value: v }); }}
                  style={{ width: '100%', marginTop: 3, textAlign: 'center', fontSize: 10.5, padding: '1px 0', background: 'var(--hx-bg-2, #0b1622)', color: 'var(--hx-text)', border: '1px solid var(--hx-line)', borderRadius: 5 }} />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Headline defenses */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <Stat label="AC" value={`${d.ac}`} sub={pf2.combat.armorName && pf2.combat.armorName !== 'Unarmored' ? pf2.combat.armorName : undefined} />
        <Stat label="HP" value={`${pf2.combat.currentHp || d.maxHp}/${d.maxHp}`} sub={pf2.combat.tempHp ? `+${pf2.combat.tempHp} temp` : undefined} />
        <Stat label="Perception" value={fmt(pf2PerceptionTotal(pf2))} sub={pf2.perception.rank} />
        <Stat label="Initiative" value={fmt(pf2PerceptionTotal(pf2))} sub="Perception" />
        <Stat label="Speed" value={`${pf2.combat.speed} ft`} />
        <Stat label="Class DC" value={`${d.classDc}`} sub={pf2.combat.classDcAttribute} />
        {d.spellDc != null && <Stat label="Spell DC" value={`${d.spellDc}`} sub={`atk ${fmt(d.spellAttack ?? 0)} · ${pf2.spellcasting.tradition}`} />}
      </div>

      {/* Roller controls + result banner (R1b) — tap a save/skill/Strike below; set a target DC for the degree. */}
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

      {/* Saves — tap to roll (R1b) */}
      <div>
        <div style={label}>Saving Throws</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
          {PF2_SAVES.map((s) => (
            <button key={s} type="button" onClick={() => rollLine(`${s} save`, pf2SaveTotal(s, pf2), s === 'Fortitude' ? 'fortitude' : s === 'Reflex' ? 'reflex' : 'will')} title={`Roll ${s} (d20 ${fmt(pf2SaveTotal(s, pf2))})`}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px', border: '1px solid var(--hx-line)', borderRadius: 8, background: 'none', cursor: 'pointer' }}>
              <span style={{ fontSize: 12, color: 'var(--hx-muted)' }}>{s} 🎲</span>
              <strong style={{ fontSize: 15, color: 'var(--hx-gold-2)' }}>{fmt(pf2SaveTotal(s, pf2))}</strong>
              <RankPill rank={pf2.saves[s].rank} />
            </button>
          ))}
        </div>
      </div>

      {/* Active conditions (Area R2 — PF2). Shown so the player sees what's folding into their rolls; the
          penalties apply automatically under PF2's non-stacking rule. Set/cleared via the AI edit tool. */}
      {(pf2.combat.conditions ?? []).length > 0 && (
        <div>
          <div style={label}>Conditions <span style={{ fontWeight: 400, color: 'var(--hx-muted)', fontSize: 10 }}>· folded into rolls (worst status + worst circumstance) · hover or tap ⓘ</span></div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
            {(pf2.combat.conditions ?? []).map((c) => {
              const note = pf2ConditionMechanics(c.name)?.note ?? '';
              return (
                <span key={c.name} title={note} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11.5, padding: '3px 9px', border: '1px solid var(--hx-line)', borderRadius: 999, color: 'var(--hx-gold-2)', cursor: 'help' }}>
                  {c.name}{c.value && c.value > 1 ? ` ${c.value}` : ''}
                  {note && <InfoTip tip={note} label={`${c.name} rules`} />}
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* Skills */}
      <div>
        <div style={label}>Skills{pf2.combat.armorCheckPenalty ? <span style={{ fontWeight: 400, color: 'var(--hx-muted)', fontSize: 10 }}> · armor check penalty {pf2.combat.armorCheckPenalty} on ▲ skills</span> : null}</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 4, marginTop: 6 }}>
          {pf2.skills.map((sk) => {
            const penalized = !!sk.armorPenalty && !!pf2.combat.armorCheckPenalty;
            const total = pf2SkillTotal(sk, id.level, pf2.attributes, pf2.combat.armorCheckPenalty);
            return (
              <button key={sk.name} type="button" onClick={() => rollLine(`${sk.name} (${sk.attribute})`, total, 'skill')} title={`Roll ${sk.name} (d20 ${fmt(total)})`}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, padding: '3px 8px', border: '1px solid var(--hx-line)', borderRadius: 6, opacity: sk.rank === 'untrained' ? 0.55 : 1, background: 'none', cursor: 'pointer', width: '100%', textAlign: 'left' }}>
                <span style={{ fontSize: 11.5, color: 'var(--hx-text)' }}>{sk.name}{penalized ? <span title="armor check penalty applies" style={{ color: 'var(--hx-gold-2)' }}> ▲</span> : null} <span style={{ color: 'var(--hx-muted)', fontSize: 9.5 }}>{sk.attribute}</span></span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <strong style={{ fontSize: 12.5, color: 'var(--hx-teal-1)' }}>{fmt(total)} 🎲</strong>
                  <RankPill rank={sk.rank} />
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Strikes. Renders for an editor even with no weapons yet — otherwise a character who has
          none can never add one, since the ＋ Weapon button lives inside this block. */}
      {(pf2.attacks.length > 0 || canDoEdit) && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={label}>Strikes</div>
            {canDoEdit && (
              <button className="btn tiny" disabled={saving} onClick={() => setWeaponEditor('new')} title="Add or author a weapon">＋ Weapon</button>
            )}
          </div>
          <div style={{ display: 'grid', gap: 4, marginTop: 6 }}>
            {pf2.attacks.map((a) => {
              const bonus = pf2AttackBonus(a, id.level, pf2.attributes);
              // Resolve the weapon's TRAITS into real numbers (S13b/S15d). The sheet previously
              // rendered a stored damage string, so `deadly`, `striking` and the crit rules never
              // computed — a Rapier and a Shortsword rolled identically on a critical hit.
              const strike = pf2ResolveStrike(
                { name: a.name, damageDie: a.damage, damageType: a.damageType ?? '', traits: a.traits ?? [] },
                {
                  level: id.level, attributes: pf2.attributes,
                  proficiency: pf2Proficiency(a.rank, id.level),
                  itemBonus: a.weaponBonus,
                  striking: (a.striking as 'none' | 'striking' | 'greater' | 'major') ?? 'none',
                  ranged: (a.traits ?? []).some((t) => t.toLowerCase().startsWith('thrown') || t.toLowerCase() === 'ranged'),
                },
              );
              return (
                <div key={a.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '5px 10px', border: '1px solid var(--hx-line)', borderRadius: 6 }}>
                  <span style={{ fontSize: 12.5, color: 'var(--hx-text)' }}>
                    {a.name}
                    {a.customized && <span title="Hand-customized — edited away from how it came." style={{ color: 'var(--hx-gold-2)' }}> ✎</span>}
                    {a.traits.length ? <span style={{ color: 'var(--hx-muted)', fontSize: 10 }}> · {a.traits.join(', ')}</span> : null}
                  </span>
                  <span style={{ fontSize: 12, color: 'var(--hx-muted)', display: 'inline-flex', gap: 8, alignItems: 'baseline' }}>
                    {/* Tap the Strike bonus to roll the attack; tap the damage to roll its dice (R1b). */}
                    <button type="button" onClick={() => rollLine(`${a.name} Strike`, bonus, 'attack')} title={`Roll ${a.name} Strike (d20 ${fmt(bonus)})`} style={{ background: 'none', border: 'none', color: 'var(--hx-gold-2)', fontWeight: 700, cursor: 'pointer', padding: 0 }}>{fmt(bonus)} 🎲</button>
                    ·
                    <button
                      type="button" onClick={() => rollDamage(`${a.name} damage`, strike.damage)}
                      // The crit line is on the tooltip rather than always-visible: PF2 crits double
                      // the whole total and THEN add deadly/fatal dice, which is exactly the number
                      // a player is most likely to compute wrong by hand.
                      title={`Roll ${a.name} damage (${strike.damage})\nOn a critical hit: ${strike.critDamage}${strike.notes.length ? `\n${strike.notes.join('\n')}` : ''}`}
                      style={{ background: 'none', border: 'none', color: 'var(--hx-muted)', cursor: 'pointer', padding: 0 }}
                    >{strike.damage} 🎲</button>
                    {canDoEdit && (
                      <button
                        className="btn tiny" disabled={saving}
                        onClick={() => setWeaponEditor({ name: a.name, damage: a.damage, damageType: a.damageType, traits: a.traits, weaponBonus: a.weaponBonus, striking: a.striking, attribute: a.attribute })}
                        title={`Edit ${a.name}`}
                      >✎</button>
                    )}
                  </span>
                </div>
              );
            })}
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

      {picker && (
        <PF2ContentPicker
          pf2={pf2} kind={picker} isDM={isDM} variantKind={variantKind}
          onClose={() => setPicker(null)}
          // The server re-checks through gatePf2Edit regardless of what this sends — the picker's
          // greying is for feedback timing, never the enforcement point.
          onAdd={(edit) => { setPicker(null); void postEdit(edit); }}
        />
      )}

      {weaponEditor !== null && (
        <PF2WeaponEditor
          initial={weaponEditor === 'new' ? undefined : weaponEditor}
          onClose={() => setWeaponEditor(null)}
          onSave={(edit) => { setWeaponEditor(null); void postEdit(edit); }}
        />
      )}

      {editor && (
        <PF2ElementEditor
          kind={editor.kind} initial={editor.initial}
          onClose={() => setEditor(null)}
          onSave={(edit) => { setEditor(null); void postEdit(edit); }}
        />
      )}

      {/* Feats & features */}
      {(pf2.feats.length > 0 || canDoEdit) && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={label}>Feats &amp; Features</div>
            {canDoEdit && (
              <>
                <button className="btn tiny" disabled={saving} onClick={() => setPicker('feat')}>＋ Feat</button>
                <button className="btn tiny" disabled={saving} onClick={() => setEditor({ kind: 'feat' })} title="Author a homebrew feat">✎ New</button>
              </>
            )}
          </div>
          <div style={{ display: 'grid', gap: 5, marginTop: 6 }}>
            {pf2.feats.map((f) => (
              <div key={f.id} style={{ padding: '6px 10px', border: '1px solid var(--hx-line)', borderRadius: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <strong style={{ fontSize: 12.5, color: 'var(--hx-text)' }}>{f.name}</strong>
                  <span style={{ fontSize: 9, color: 'var(--hx-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{f.track}{f.level ? ` · L${f.level}` : ''}</span>
                  {/* ✎ = hand-tuned away from how it came. A different question from ⚑, and an
                      element can carry both. */}
                  {f.customized && <span title="Hand-customized — edited away from how it came." style={{ color: 'var(--hx-gold-2)' }}>✎</span>}
                  <OffRulesMark reason={f.offRules} />
                  {canDoEdit && (
                    <button
                      className="btn tiny" disabled={saving}
                      onClick={() => setEditor({ kind: 'feat', initial: { name: f.name, level: f.level, track: f.track, text: f.body } })}
                      title={`Edit ${f.name}`}
                      style={{ marginLeft: 'auto' }}
                    >Edit</button>
                  )}
                </div>
                {f.body && <div style={{ fontSize: 11.5, color: 'var(--hx-muted)', marginTop: 2 }}>{f.body}</div>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Spells. Previously the sheet showed slot COUNTS with no way to see which spells filled
          them — a caster could read "3 rank-2 slots" and not know a single spell they had. Grouped
          by rank, because that is how a PF2 caster actually prepares and casts. */}
      {((pf2.spellcasting.spells?.length ?? 0) > 0 || (canDoEdit && pf2.spellcasting.kind !== 'none')) && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={label}>Spells</div>
            {/* Only offered to a caster — a Fighter has no use for a spell picker, and showing one
                would suggest they could cast. */}
            {canDoEdit && pf2.spellcasting.kind !== 'none' && (
              <>
                <button className="btn tiny" disabled={saving} onClick={() => setPicker('spell')}>＋ Spell</button>
                <button className="btn tiny" disabled={saving} onClick={() => setEditor({ kind: 'spell' })} title="Author a homebrew spell">✎ New</button>
              </>
            )}
          </div>
          <div style={{ display: 'grid', gap: 5, marginTop: 6 }}>
            {[...new Set((pf2.spellcasting.spells ?? []).map((s) => s.rank))].sort((a, b) => a - b).map((rank) => (
              <div key={rank}>
                <div style={{ fontSize: 9.5, color: 'var(--hx-teal-1)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>
                  {rank === 0 ? 'Cantrips' : `Rank ${rank}`}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                  {(pf2.spellcasting.spells ?? []).filter((s) => s.rank === rank).map((s) => (
                    <span
                      key={s.name}
                      title={[
                        s.focus ? 'Focus spell — cast from Focus Points, not a slot.' : null,
                        // A prepared caster's unprepared spell is in the book but not castable
                        // today; a spontaneous caster's repertoire always is, so `prepared` is
                        // only meaningful for the former.
                        pf2.spellcasting.kind === 'prepared' ? (s.prepared ? 'Prepared today.' : 'Known, not prepared today.') : null,
                      ].filter(Boolean).join(' ') || undefined}
                      style={{
                        fontSize: 11.5, padding: '3px 8px', borderRadius: 12,
                        border: '1px solid var(--hx-line)',
                        color: 'var(--hx-text)',
                        // Dim an unprepared spell for a prepared caster — it is on the sheet but
                        // not castable right now, and showing it identically would misinform.
                        opacity: pf2.spellcasting.kind === 'prepared' && !s.prepared && !s.focus ? 0.55 : 1,
                      }}
                    >
                      {s.name}
                      {s.focus ? ' ✦' : ''}
                      {s.customized && <span title="Hand-customized — edited away from how it came."> ✎</span>}
                      <OffRulesMark reason={s.offRules} />
                      {canDoEdit && (
                        <button
                          className="btn tiny" disabled={saving}
                          onClick={() => setEditor({ kind: 'spell', initial: { name: s.name, rank: s.rank, prepared: s.prepared, text: s.effect } })}
                          title={`Edit ${s.name}`}
                          style={{ marginLeft: 6, fontSize: 10 }}
                        >✎</button>
                      )}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ fontSize: 10.5, color: 'var(--hx-muted)' }}>
        {pf2.senses && pf2.senses.length > 0 && <>Senses: {pf2.senses.join(', ')}. </>}
        Languages: {pf2.languages.join(', ') || '—'}. All numbers derived by the PF2 rules engine (proficiency = rank bonus + level when trained).
      </div>
    </div>
  );
}

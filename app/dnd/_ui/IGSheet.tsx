// app/dnd/_ui/IGSheet.tsx — the bespoke Intuitive Games character sheet (full-sheet Slices 4+).
//
// Renders the IGCharacter model (character.data.ig) tab-for-tab like the Character Sheet Template, with a
// VANILLA / CUSTOM / DM-GRANTED badge on every mechanical element and all derived numbers computed by the
// pure rules engine (never guessed). Slice 4 ships Identity + Ability Scores/Saves + Summary; later slices
// add Skills / Combat / Reference / Equipment / Companion into this same component. Styleable: it uses the
// platform design tokens and lives inside the character page, so custom layout/CSS apply.
//
// LAYOUT (2026-07-21 restyle): the sheet was one long unbroken column of ad-hoc headings, so finding "the
// stances / the powers / the attacks" meant scanning the whole thing. It is now organised as a stack of
// clearly-headed, visually-distinct <Section> cards with a sticky in-sheet jump-nav (the app's own
// `.jumpNavItem` pill idiom) and a prominent Vitals strip that leads with the core numbers. IG's distinctive
// mechanics are made legible: the active STANCE gets a prominent "Currently in: X" banner (it is a held state
// that modifies rolls, not a buried list item), and the three-action economy carries consistent cost glyphs.
// This pass is styling + JSX layout ONLY — every number is still computed by the same rules engine, and every
// interaction (rolling, editing, the picker, the editor, the ✎/⚑ markers) is preserved verbatim.
'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import styles from './hextech.module.css';
import OffRulesMark from '@/app/dnd/_sheet/components/ui/OffRulesMark';
import IGElementEditor, { type IGEditorKind, type IGEditableElement } from './IGElementEditor';
import IGContentPicker, { type IGPickerKind } from './IGContentPicker';
import type { IGCharacter } from '@/lib/dnd/systems/intuitive-games/model';
import { IG_ABILITIES, IG_SAVES } from '@/lib/dnd/systems/intuitive-games/model';
import { igAbilityMod, igDerived, igSkillTotal, igRanksSpent, igResolveAttack } from '@/lib/dnd/systems/intuitive-games/rules';
import { igInPlayState } from '@/lib/dnd/systems/intuitive-games/resolve';
import { resolveD20Roll, rollNaturalD20, rollDiceExpr, degreeLabel } from '@/lib/dnd/roll';
import { IG_STANCES, IG_STANCE_DEFS, IG_POWERS, IG_DEFENSIVE_POWERS, IG_CONDITIONS, IG_ACTION_ECONOMIES, igActionsByEconomy, findIGAncestry } from '@/lib/dnd/systems/intuitive-games/content';
import { igStanceInPlay, igConditionInPlay } from '@/lib/dnd/systems/intuitive-games/inPlay';
import { igConditionSummary, igStanceMechanicNote } from '@/lib/dnd/systems/intuitive-games/modifiers';
import { igConditionRollEffect, type IgRollKind } from '@/lib/dnd/conditions/intuitive-games';
import { igStanceRollEffect, igStanceDamageBonus } from '@/lib/dnd/stances/intuitive-games';
import { igCompanionHp, igCompanionAbility } from '@/lib/dnd/systems/intuitive-games/companions';
import type { IGEdit } from '@/lib/dnd/systems/intuitive-games/edit';
import { findIGFeat } from '@/lib/dnd/systems/intuitive-games/feats';
import { igAncestryArt, IG_ART_CREDIT } from '@/lib/dnd/systems/intuitive-games/art';
import InfoTip from '@/app/dnd/_sheet/components/InfoTip';
import { skinHxVars } from '@/lib/dnd/skin-tokens';

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

// Consistent action-cost iconography (req 4). IG's three-action economy is one of its distinctive
// mechanics, so a Single / Double / Triple / Reaction / Other cost should read at a glance as a glyph, not
// only as a word. Keyed by the IG_ACTION_ECONOMIES values so a new economy can't silently miss a glyph.
const ACTION_GLYPH: Record<string, string> = {
  Single: '◆', Double: '◆◆', Triple: '◆◆◆', Reaction: '⤾', Other: '○',
};

/**
 * A titled, visually-distinct card — the unit of the sheet's new hierarchy.
 *
 * Grouping each concern (vitals, abilities, skills, combat, powers, feats, …) into a bordered card with a
 * consistent gold display heading is what makes "find X at a glance" true, where the old flat column of
 * `<div style={label}>` headings did not. The `id` + `scrollMarginTop` let the sticky jump-nav anchor to it
 * without the target hiding under the site header. `accent` recolours the heading for the few sections that
 * carry their own identity colour (powers pink, stance descriptions teal).
 *
 * `scrollMarginTop: 108` matches the PF2 sheet's `.pf2Section` exactly (the app's other bespoke sheet), so an
 * anchored jump clears the /dnd site header (~52px) AND the sticky in-sheet jump-nav below it. It is inline
 * rather than a shared CSS class deliberately: the shared module currently holds a sibling's uncommitted
 * work, and self-contained styling keeps this change to one file.
 */
function Section({ id, title, accent, aside, children }: {
  id: string; title: string; accent?: string; aside?: ReactNode; children: ReactNode;
}) {
  return (
    <section id={id} style={{ scrollMarginTop: 108, border: '1px solid var(--hx-line)', borderRadius: 10, background: 'var(--hx-inset-soft)', padding: '11px 13px 13px', display: 'grid', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, borderBottom: '1px solid var(--hx-line)', paddingBottom: 6, flexWrap: 'wrap' }}>
        <h3 style={{ margin: 0, display: 'inline-flex', alignItems: 'center', gap: 7, fontFamily: 'var(--hx-font-display)', fontSize: 12.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: accent ?? 'var(--hx-gold-2)' }}>
          <span aria-hidden style={{ color: 'var(--hx-teal-1)', fontSize: 7 }}>◆</span>{title}
        </h3>
        {aside ? <div style={{ fontSize: 11.5, color: 'var(--hx-muted)' }}>{aside}</div> : null}
      </div>
      {children}
    </section>
  );
}

export default function IGSheet({ ig, elements, canEdit, characterId, isDM, variantKind = 'vanilla', sheetType }: {
  ig: IGCharacter; elements: Tagged[]; canEdit?: boolean; characterId?: string;
  isDM?: boolean;
  /** Vanilla characters are held to their class; custom ones are flagged, not blocked. Defaults to
   *  vanilla — the safe direction, matching the server. */
  variantKind?: 'vanilla' | 'custom';
  /** The character's chosen skin (`character.sheet_type`). Overrides the inherited `--hx-*` tokens on
   *  this sheet's root so the skin picker actually restyles the bespoke IG sheet (default → no change). */
  sheetType?: string;
}) {
  const derived = useMemo(() => igDerived(ig), [ig]);
  // What the numbers ACTUALLY are right now, with the active stance and conditions folded in.
  // The roll path has always applied these; the cards showed base values, so a Shaken character
  // read "+7 Reflex" and rolled +5 (S11, owner 2026-07-20). Now the card says what you'll roll.
  const inPlay = useMemo(() => igInPlayState(ig), [ig]);
  const resolvedSave = (k: (typeof IG_SAVES)[number]) => inPlay.saves.find((s) => s.key === k);
  /** ⌃/⌄ marks a save or attack that will roll with advantage/disadvantage. */
  const swingMark = (sw?: string) => (sw === 'advantage' ? ' ⌃' : sw === 'disadvantage' ? ' ⌄' : '');
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
    // Fold the active stance's unconditional flat damage bonus (Offensive advanced: +half level to damage).
    const dmg = igStanceDamageBonus(ig.combat?.stances?.[0] ?? null, derived.level);
    const total = r.total + (dmg?.bonus ?? 0);
    const detail = dmg ? `${r.breakdown} + ${dmg.bonus} (${dmg.source})` : r.breakdown;
    setLastRoll({ label, total, detail, tone: 'normal' });
  };
  // Incremental edit (enter/leave a stance, add/remove a condition) via the write-gated ig-edit route.
  // Available only to a viewer who can write this character; refreshes the sheet on success.
  const canDoEdit = !!(canEdit && characterId);
  /** The last refusal from the gate, shown to the player.
   *
   *  Every failure here used to be swallowed on the theory that "the unchanged sheet surfaces it".
   *  It does not: an unchanged sheet is indistinguishable from a slow one, and the gate writes a
   *  genuinely useful sentence ("build a custom one, or have the DM grant it") that was being
   *  thrown away. A silent refusal reads as the app ignoring you — the same reasoning the IG gate
   *  itself gives for returning a `refusal` string at all. */
  const [refusal, setRefusal] = useState<string | null>(null);

  /** POST one op, returning its refusal message or null. Shared so the single-op and sequence
   *  paths cannot report failures differently. */
  const postOne = async (edit: unknown): Promise<string | null> => {
    const res = await fetch(`/api/dnd/characters/${characterId}/ig-edit`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(edit),
    });
    if (res.ok) return null;
    const body = await res.json().catch(() => null) as { error?: string } | null;
    return body?.error || 'That edit was refused.';
  };

  const postEdit = async (edit: IGEdit) => {
    if (!characterId || editing) return;
    setEditing(true);
    setRefusal(null);
    try {
      const err = await postOne(edit);
      if (err) setRefusal(err);
      else router.refresh();
    } catch {
      setRefusal('Could not reach the server. Try again.');
    } finally {
      setEditing(false);
    }
  };

  /** Apply a SEQUENCE of ops in order, for the editor (IG-S2).
   *
   *  Authoring a power with rules text needs an add THEN an update, because IG's add ops carry only
   *  a name. They are applied here rather than as two user actions so a half-finished element
   *  cannot be left behind if the second call fails — and the refresh happens once, at the end.
   *  If an op fails mid-sequence we stop and REPORT, rather than continuing and leaving a
   *  half-authored element behind. */
  const postEdits = async (edits: Record<string, unknown>[]) => {
    if (!characterId || editing || !edits.length) return;
    setEditing(true);
    setRefusal(null);
    try {
      for (const [i, edit] of edits.entries()) {
        const err = await postOne(edit);
        if (err) {
          // Name the position when a LATER op failed: the add succeeded and the rules text did
          // not, so the sheet now holds a bare-named element. Saying so is the difference between
          // a confusing half-result and a clear one the player can finish by re-editing.
          setRefusal(i === 0 ? err : `${err} (The element was created, but its later details were not saved — edit it to finish.)`);
          break;
        }
      }
      router.refresh();
    } catch {
      setRefusal('Could not reach the server. Try again.');
    } finally {
      setEditing(false);
    }
  };

  // The element editor (IG-S2). `initial` absent = authoring homebrew; present = editing.
  const [igEditor, setIgEditor] = useState<{ kind: IGEditorKind; initial?: IGEditableElement } | null>(null);

  /** May this character author a brand-new POWER?
   *
   *  Mirrors `gateIgEdit` exactly, which gates `add_power` and NOTHING else. So this deliberately
   *  does not touch the feat or weapon editors: IG feats have free-prose prerequisites and stances
   *  can legitimately be held off-list, and both are ungated on the server for those stated
   *  reasons. Disabling them here would be the UI inventing a restriction the rules do not have —
   *  the mirror image of the bug, and just as wrong.
   *
   *  Predicting the refusal rather than only reporting it, because a button that always fails is
   *  worse than one that explains why before you press it. The server stays authoritative — this
   *  is a hint, and every op is still gated there. */
  const canAuthorPowers = !!isDM || variantKind === 'custom';

  /** The catalog picker (IG-S3). Until this existed, a vanilla IG character could not add a
   *  CATALOGUED power from the sheet at all — only the builder or the AI could — while ✎ New
   *  authors homebrew and is refused for exactly the characters most likely to want a normal
   *  power. Those two buttons answer different questions and both belong. */
  const [picker, setPicker] = useState<IGPickerKind | null>(null);

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
  const cb = ig.combat;
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

  // ── What the sheet actually holds, computed once so the jump-nav and each section's own conditional
  //    cannot drift apart (the nav must never link to a section that renders nothing). The combat flag
  //    mirrors the Combat block's own `has` check exactly. ─────────────────────────────────────────────
  const anc = findIGAncestry(id.ancestry);
  const eq = ig.equipment;
  const eqSlots = ([['Arms', eq.arms], ['Head', eq.head], ['Torso', eq.torso], ['Legs', eq.legs], ['Hands', eq.hands]] as [string, string][]).filter(([, v]) => v && v.trim());
  // Mirrors the Combat block's original `has` check EXACTLY (no `canDoEdit` term), so the section's
  // presence — and the nav anchor to it — is byte-for-byte the old behaviour, not a widened one.
  const hasCombat = !!(cb.attacks.length || cb.stances.length || cb.defensivePower || cb.conditions.length || cb.situationalBonuses.length || cb.hitPoints.classBackgroundHp || cb.damageReduction);
  const hasSkills = ig.skills.length > 0;
  const hasPowers = ig.powers.length > 0 || canDoEdit;
  const hasFeats = ig.feats.general.length > 0 || ig.feats.combat.length > 0 || canDoEdit;
  const hasEquipment = eqSlots.length > 0 || eq.other.length > 0;
  const hasDetails = !!(anc || idRows.length > 0 || langLines.length > 0 || id.bio || (ig.notes && ig.notes.trim()));
  const activeStance = cb.stances[0];

  // Only anchors to sections that will actually render — built after the presence flags above.
  const nav: { id: string; label: string }[] = [
    { id: 'ig-vitals', label: 'Vitals' },
    { id: 'ig-abilities', label: 'Abilities' },
  ];
  if (hasSkills) nav.push({ id: 'ig-skills', label: 'Skills' });
  if (hasCombat) nav.push({ id: 'ig-combat', label: 'Combat' });
  if (hasPowers) nav.push({ id: 'ig-powers', label: 'Powers' });
  if (hasFeats) nav.push({ id: 'ig-feats', label: 'Feats' });
  nav.push({ id: 'ig-reference', label: 'Reference' });
  if (hasEquipment) nav.push({ id: 'ig-equipment', label: 'Equipment' });
  if (ig.companion) nav.push({ id: 'ig-companion', label: 'Companion' });
  if (hasDetails) nav.push({ id: 'ig-details', label: 'Details' });

  const chip = (name: string) => {
    const tip = effectOf(name); // the rules text, so the chip hover-explains itself
    return (
      <span key={name} title={tip || undefined} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12.5, color: 'var(--hx-text)', border: '1px solid var(--hx-line)', borderRadius: 12, padding: '2px 9px', cursor: tip ? 'help' : 'default' }}>
        {name} {badgeFor(name)}
        {tip && <InfoTip tip={tip} label={`${name} rules`} />}
      </span>
    );
  };

  return (
    // The main column deliberately leaves its top open (header → jump-nav → Vitals) so a separate panel can
    // later mount above the stat block without a layout fight — the customizations summary is built elsewhere.
    // The skin's `--hx-*` overrides ride on the sheet's own root, so every var(--hx-…) below re-resolves
    // to the chosen skin (default → {} → unchanged). Spread first so the layout props below still win.
    <div className={styles.framedPanel} style={{ ...skinHxVars(sheetType), margin: '10px 0', padding: '14px 16px', display: 'grid', gap: 14 }}>
      {igEditor && (
        <IGElementEditor
          kind={igEditor.kind} initial={igEditor.initial}
          onClose={() => setIgEditor(null)}
          onSave={(edits) => { setIgEditor(null); void postEdits(edits); }}
        />
      )}

      {picker && (
        <IGContentPicker
          ig={ig} kind={picker} isDM={isDM} variantKind={variantKind}
          onClose={() => setPicker(null)}
          // The greying inside the picker is feedback timing; ig-edit re-derives the variant and
          // the DM flag server-side and remains the enforcement point.
          onAdd={(edit) => { setPicker(null); void postEdits([edit]); }}
        />
      )}

      {/* The gate's own words, not a generic failure. Dismissible, because it describes the LAST
          action rather than the state of the sheet — leaving it up would make it read as a
          standing problem with the character. */}
      {refusal && (
        <div
          role="status"
          style={{
            display: 'flex', alignItems: 'flex-start', gap: 8, padding: '8px 10px', borderRadius: 8,
            border: '1px solid var(--hx-line)', background: 'rgba(220,120,120,0.09)',
            fontSize: 12.5, color: 'var(--hx-text)',
          }}
        >
          <span aria-hidden style={{ color: 'var(--hx-gold-2)' }}>⚑</span>
          <span style={{ flex: 1 }}>{refusal}</span>
          <button
            type="button" onClick={() => setRefusal(null)} aria-label="Dismiss"
            style={{ background: 'none', border: 'none', color: 'var(--hx-muted)', cursor: 'pointer', fontSize: 13, lineHeight: 1, padding: 0 }}
          >×</button>
        </div>
      )}

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

      {/* Sticky in-sheet jump-nav (req 5) — the app's own `.jumpNavItem` pill idiom (each a bordered ◆ chip),
          so a long sheet is navigable without endless scrolling. Sits below the site header; sections carry a
          matching scroll-margin so an anchored jump lands with the heading visible. */}
      {nav.length > 2 && (
        // Sticky offsets mirror the PF2 sheet's `.pf2Nav` (top: 52 clears the /dnd site header; z-index 5
        // keeps the bar UNDER that header and any editor/picker modal). Near-opaque so section cards
        // scrolling beneath don't bleed through the pills. Inline (not a shared class) to keep this change
        // to one file while the shared CSS module holds a sibling's uncommitted work.
        <nav aria-label="Jump to section"
          style={{ position: 'sticky', top: 52, zIndex: 5, display: 'flex', flexWrap: 'wrap', gap: 6, padding: '8px 10px', border: '1px solid var(--hx-line)', borderRadius: 8, background: 'rgba(9,20,40,0.94)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)' }}>
          {nav.map((n) => <a key={n.id} href={`#${n.id}`} className={styles.jumpNavItem}>{n.label}</a>)}
        </nav>
      )}

      {/* ── VITALS (req 2/3) — the prominent, consistent stat strip that LEADS the sheet with the core numbers,
             plus the active-stance banner. A player finds HP, the three saves and proficiency at a glance
             here, and taps any save to roll it. ─────────────────────────────────────────────────────────── */}
      <Section id="ig-vitals" title="Vitals"
        aside={(
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--hx-muted)' }}>
            🎲 Target DC
            <input type="number" value={targetDc} onChange={(e) => setTargetDc(e.target.value)} placeholder="—"
              style={{ width: 52, fontSize: 12, padding: '3px 6px', background: 'var(--hx-inset-strong)', color: 'var(--hx-text)', border: '1px solid var(--hx-line)', borderRadius: 4 }} />
          </label>
        )}
      >
        {/* Active stance banner (req 3) — a stance is a HELD state that modifies rolls, so when one is active it
            deserves a "Currently in: X" callout, not a buried list item. Hover explains the full rules. The
            stance selector to change it lives in Combat; this is the always-visible status. */}
        {activeStance && (() => {
          const e = igStanceInPlay(activeStance, derived.level);
          return (
            <div title={e?.tooltip ?? activeStance} style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', border: '1px solid var(--hx-teal-2)', background: 'linear-gradient(180deg, rgba(10,200,185,0.10), rgba(10,200,185,0.04))', borderRadius: 9, padding: '8px 12px', cursor: 'help' }}>
              <span aria-hidden style={{ fontSize: 20, lineHeight: 1 }}>🜲</span>
              <div style={{ display: 'grid', gap: 1 }}>
                <span style={{ fontSize: 9.5, letterSpacing: '0.09em', textTransform: 'uppercase', color: 'var(--hx-muted)' }}>Currently in</span>
                <span style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--hx-teal-1)' }}>{e?.name ?? activeStance} {badgeFor(activeStance)}</span>
              </div>
              {e?.summary && <span style={{ fontSize: 11.5, color: 'var(--hx-muted)', flex: '1 1 200px', lineHeight: 1.4 }}>{e.summary}</span>}
            </div>
          );
        })()}

        {/* The stat strip: HP · the three saves · Proficiency. Uniform tiles in a responsive grid so they read
            as one coherent panel and reflow cleanly from phone to wide monitor. */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(96px, 1fr))', gap: 8 }}>
          <div style={{ textAlign: 'center', border: '1px solid var(--hx-line)', borderRadius: 8, padding: '8px 6px', background: 'var(--hx-inset)' }}>
            <div style={{ fontSize: 10.5, color: 'var(--hx-muted)' }}>Hit Points</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--hx-text)' }}>{derived.currentHp}<span style={{ fontSize: 12, color: 'var(--hx-muted)' }}> / {derived.maxHp}</span></div>
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
          {IG_SAVES.map((s) => {
            const rs = resolvedSave(s);
            const shown = rs?.total ?? derived.saves[s];
            const changed = shown !== derived.saves[s];
            return (
              <button key={s} type="button" onClick={() => rollLine(`${s} save`, derived.saves[s], s === 'Reflex' ? 'reflex_save' : s === 'Fortitude' ? 'fortitude_save' : 'will_save')}
                // The tooltip explains WHY the number moved, so a changed value is never mysterious.
                title={`Roll ${s} (d20 ${fmt(shown)})${rs?.sources.length ? ` · ${rs.sources.join(', ')}` : ''}`}
                style={{ textAlign: 'center', border: `1px solid ${changed || rs?.swing !== 'none' ? 'var(--hx-gold)' : 'var(--hx-line)'}`, borderRadius: 8, padding: '8px 6px', background: 'var(--hx-inset)', cursor: 'pointer' }}>
                <div style={{ fontSize: 10.5, color: 'var(--hx-muted)' }}>{s} 🎲{swingMark(rs?.swing)}</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: changed ? 'var(--hx-gold-2)' : 'var(--hx-teal-1)' }}>{fmt(shown)}</div>
                {/* Base shown alongside when something is modifying it, so the player can see both. */}
                {changed && <div style={{ fontSize: 9.5, color: 'var(--hx-muted)' }}>base {fmt(derived.saves[s])}</div>}
              </button>
            );
          })}
          <div style={{ textAlign: 'center', border: '1px solid var(--hx-line)', borderRadius: 8, padding: '8px 6px', background: 'var(--hx-inset)' }}>
            <div style={{ fontSize: 10.5, color: 'var(--hx-muted)' }}>Proficiency</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--hx-text)' }}>{fmt(derived.proficiency)}</div>
          </div>
        </div>
      </Section>

      {/* ── ABILITY SCORES ─────────────────────────────────────────────────────────────────────────────── */}
      <Section id="ig-abilities" title="Ability Scores">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(56px, 1fr))', gap: 8 }}>
          {IG_ABILITIES.map((k) => (
            <div key={k} style={{ display: 'grid', gap: 3 }}>
              {/* Tap an ability to roll an ability check (R1b): d20 + its modifier. */}
              <button type="button" onClick={() => rollLine(`${k} check`, igAbilityMod(ig.abilities[k]), (k === 'STR' || k === 'DEX') ? 'str_dex_check' : 'ability_check')} title={`Roll ${k} check (d20 ${fmt(igAbilityMod(ig.abilities[k]))})`}
                style={{ textAlign: 'center', border: '1px solid var(--hx-line)', borderRadius: 8, padding: '8px 4px', background: 'var(--hx-inset)', cursor: 'pointer', width: '100%' }}>
                <div style={{ fontSize: 10.5, color: 'var(--hx-muted)', letterSpacing: '0.06em' }}>{k} 🎲</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--hx-text)', lineHeight: 1.1 }}>{ig.abilities[k]}</div>
                <div style={{ fontSize: 12.5, color: 'var(--hx-gold-2)' }}>{fmt(igAbilityMod(ig.abilities[k]))}</div>
              </button>
              {canDoEdit && (
                // Editable score (IGS6): set the ability directly via the set_ability edit op. Commit on Enter or
                // blur; keyed by the current value so it resets after the sheet refreshes.
                <input key={`${k}-${ig.abilities[k]}`} type="number" min={1} max={30} defaultValue={ig.abilities[k]} disabled={editing} aria-label={`Set ${k}`}
                  onKeyDown={(ev) => { if (ev.key === 'Enter') (ev.target as HTMLInputElement).blur(); }}
                  onBlur={(ev) => { const v = parseInt(ev.target.value, 10); if (Number.isFinite(v) && v !== ig.abilities[k]) postEdit({ op: 'set_ability', ability: k, value: v }); }}
                  style={{ width: '100%', textAlign: 'center', fontSize: 11, padding: '2px 0', background: 'var(--hx-bg-2, #0b1622)', color: 'var(--hx-text)', border: '1px solid var(--hx-line)', borderRadius: 6 }} />
              )}
            </div>
          ))}
        </div>
      </Section>

      {/* ── SKILLS — general grouped by ability, combat skills separate; totals from the rules engine. ────── */}
      {hasSkills && (() => {
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
          <Section id="ig-skills" title="Skills"
            aside={<>Ranks: {igRanksSpent(ig)} spent / {ig.skillRanksAvailable} available · trained ●</>}
          >
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
          </Section>
        );
      })()}

      {/* ── COMBAT — attacks (to-hit + damage from the rules engine), HP/DR, stances, defensive power,
             conditions. The active-stance status lives in Vitals; the selector to CHANGE it lives here. ──── */}
      {hasCombat && (
        <Section id="ig-combat" title="Combat">
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
            {/* DR includes Advanced Defensive's "half your level", which previously appeared in
                no number anywhere — the stance granted it and the sheet never showed it. */}
            {inPlay.damageReduction.dr > 0 && (
              <div title={inPlay.damageReduction.sources.join(' · ')}
                style={{ border: `1px solid ${inPlay.damageReduction.dr !== cb.damageReduction ? 'var(--hx-gold)' : 'var(--hx-line)'}`, borderRadius: 8, padding: '6px 10px', fontSize: 12.5 }}>
                <span style={{ color: 'var(--hx-muted)' }}>DR </span>
                <span style={{ color: inPlay.damageReduction.dr !== cb.damageReduction ? 'var(--hx-gold-2)' : undefined }}>{inPlay.damageReduction.dr}</span>
                {inPlay.damageReduction.dr !== cb.damageReduction && (
                  <span style={{ color: 'var(--hx-muted)', fontSize: 10.5 }}> (gear {cb.damageReduction})</span>
                )}
              </div>
            )}
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
              {/* Defensive powers are a REACTION — tag the heading with the reaction glyph so its action cost
                  reads at a glance alongside the three-action economy reference below. */}
              <span style={label}>{ACTION_GLYPH.Reaction} Defensive Power <span style={{ textTransform: 'none', letterSpacing: 0 }}>(reaction)</span></span>
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
              <span style={label}>Conditions <span style={{ textTransform: 'none', letterSpacing: 0 }}>(hover or tap ⓘ for the full rules)</span></span>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                {cb.conditions.map((c) => {
                  const e = igConditionInPlay(c);
                  return (
                    <span key={c} title={e?.tooltip ?? c} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--hx-danger)', border: '1px solid var(--hx-danger)', borderRadius: 12, padding: '1px 8px', cursor: 'help' }}>
                      {c}
                      {e?.tooltip && <InfoTip tip={e.tooltip} label={`${c} rules`} />}
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
        </Section>
      )}

      {/* ── POWERS — IG's spells. ───────────────────────────────────────────────────────────────────────── */}
      {hasPowers && (
        <Section id="ig-powers" title="Powers" accent="var(--hx-pink-1, #d98cc0)"
          aside={canDoEdit ? (
            <span style={{ display: 'inline-flex', gap: 6 }}>
              {/* The catalogued path, and the one a vanilla character actually needs. Listed
                  BEFORE ✎ New so the ordinary action reads first. */}
              <button
                type="button" disabled={editing}
                onClick={() => setPicker('power')}
                title="Add a power from the Intuitive Games spell list"
                style={{ background: 'none', border: '1px solid var(--hx-line)', borderRadius: 10, color: 'var(--hx-muted)', cursor: 'pointer', fontSize: 10, padding: '1px 7px' }}
              >＋ Add</button>
              <button
                type="button" disabled={editing || !canAuthorPowers}
                onClick={() => setIgEditor({ kind: 'power' })}
                title={canAuthorPowers
                  ? 'Author a homebrew power'
                  : 'This is a vanilla character, so its powers are held to its class and level. Build a custom character, or ask the DM to grant it.'}
                style={{
                  background: 'none', border: '1px solid var(--hx-line)', borderRadius: 10,
                  color: 'var(--hx-muted)', cursor: canAuthorPowers ? 'pointer' : 'not-allowed',
                  fontSize: 10, padding: '1px 7px', opacity: canAuthorPowers ? 1 : 0.5,
                }}
              >✎ New</button>
            </span>
          ) : undefined}
        >
          {ig.powers.map((p) => (
            <div key={p} style={{ display: 'grid', gap: 1 }}>
              <span style={{ fontSize: 13, color: 'var(--hx-text)', display: 'flex', alignItems: 'center', gap: 6 }}>
                {p} {badgeFor(p)}
                {/* ✎ = hand-tuned away from how it came. Presence of an override IS the
                    signal — a separate flag could disagree with the text it describes. */}
                {ig.customEffects?.[p] && <span title="Hand-customized — edited away from how it came." style={{ color: 'var(--hx-gold-2)' }}>✎</span>}
                <OffRulesMark reason={ig.offRules?.[p]} />
                {canDoEdit && (
                  <button
                    type="button" disabled={editing}
                    onClick={() => setIgEditor({ kind: 'power', initial: { name: p, effect: ig.customEffects?.[p] ?? effectOf(p) } })}
                    title={`Edit ${p}`}
                    style={{ background: 'none', border: 'none', color: 'var(--hx-muted)', cursor: 'pointer', fontSize: 11, padding: 0 }}
                  >✎</button>
                )}
                {canDoEdit && (
                  <button type="button" aria-label={`Remove ${p}`} disabled={editing} onClick={() => postEdit({ op: 'remove_power', name: p })} style={{ background: 'none', border: 'none', color: 'var(--hx-muted)', cursor: 'pointer', fontSize: 13, lineHeight: 1, padding: 0 }}>×</button>
                )}
              </span>
              {/* A player's override WINS over the catalogue text — that is the point of
                  editing it. Falling back to the catalogue when the override is cleared is
                  why clearing stores nothing rather than an empty string. */}
              {ig.customEffects?.[p]
                ? <span style={{ fontSize: 11.5, color: 'var(--hx-muted)' }}>{ig.customEffects[p]}</span>
                : effectOf(p)
                ? <span style={{ fontSize: 11.5, color: 'var(--hx-muted)' }}>{effectOf(p)}</span>
                // A recognized (non-custom) power with no effect text is a roster power pending
                // Brendan's rules — say so (Ground Rule 2) rather than leaving a bare name that reads
                // as "no effect". A custom power gets no note (its effect simply isn't authored here).
                : srcByName.get(p.trim().toLowerCase()) && srcByName.get(p.trim().toLowerCase()) !== 'custom'
                  ? <span style={{ fontSize: 11, fontStyle: 'italic', color: 'var(--hx-gold-2)' }}>Effect text not yet published — work in progress.</span>
                  : null}
            </div>
          ))}
          {/* The power add path is the ＋ Add picker in this section's header (IG-S3). It
              replaced a <select> of roster names grouped by school, which drew from the same
              full roster but could show nothing ELSE: not the rules text, and — the reason it
              had to go — not whether the character may actually take the power. A vanilla
              character could pick any of ~60 names and learn only from the refusal afterwards
              which ones its class allows. The picker greys the ineligible with the reason. */}
          {ig.powers.length === 0 && <div style={{ fontSize: 11.5, color: 'var(--hx-muted)' }}>No powers yet.</div>}
        </Section>
      )}

      {/* ── FEATS ───────────────────────────────────────────────────────────────────────────────────────── */}
      {hasFeats && (
        <Section id="ig-feats" title="Feats" aside={<>hover for the full rules</>}>
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
            {canDoEdit && (
              // Was a bare <select> of names. IG feats have PREREQUISITES stated in prose and
              // real rules text, and a dropdown showed neither — so the pick was made blind and
              // the prerequisite could only be discovered by hovering the chip afterwards. The
              // picker shows both before you commit. De-duping is unchanged: applyIgEdit
              // already ignores a feat the character holds, so a stray pick stays harmless.
              <button
                type="button" disabled={editing}
                onClick={() => setPicker('feat')}
                title="Add a feat, with its prerequisites and rules text"
                style={{ fontSize: 12, background: 'none', color: 'var(--hx-muted)', border: '1px solid var(--hx-line)', borderRadius: 12, padding: '2px 9px', cursor: 'pointer' }}
              >＋ add feat…</button>
            )}
          </div>
        </Section>
      )}

      {/* ── REFERENCE — the character's known stance descriptions + the three-action economy, with cost
             glyphs so 1/2/3-action / reaction / free reads at a glance (req 4). ────────────────────────── */}
      <Section id="ig-reference" title="Reference" aside={<>powers, feats &amp; stances</>}>
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
                  <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--hx-gold-2)', letterSpacing: '0.05em', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    {/* Consistent action-cost glyph so the reader sees the cost, not just the word. */}
                    <span aria-hidden style={{ color: 'var(--hx-teal-1)' }}>{ACTION_GLYPH[e]}</span>{e.toUpperCase()}
                  </div>
                  {list.map((a) => <div key={a.name} style={{ fontSize: 12, color: 'var(--hx-muted)' }}>{a.name}{a.note ? ` (${a.note})` : ''}</div>)}
                </div>
              );
            })}
          </div>
        </details>
      </Section>

      {/* ── EQUIPMENT — worn slots + other possessions. ─────────────────────────────────────────────────── */}
      {hasEquipment && (
        <Section id="ig-equipment" title="Equipment">
          {eqSlots.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '4px 14px' }}>
              {eqSlots.map(([k, v]) => <div key={k} style={{ display: 'flex', gap: 6, alignItems: 'baseline' }}><span style={label}>{k}</span><span style={value}>{v}</span></div>)}
            </div>
          )}
          {eq.other.length > 0 && <div style={{ fontSize: 12.5, color: 'var(--hx-text)' }}><span style={label}>Other </span>{eq.other.join(', ')}</div>}
        </Section>
      )}

      {/* ── COMPANION CREATURE (Sheet 7) — its own scores, saves, HP, DR, movement, attacks, powers. ─────── */}
      {ig.companion && (() => {
        const co = ig.companion!;
        const saveTotal = (k: (typeof IG_SAVES)[number]) => {
          const abil = k === 'Fortitude' ? 'CON' : k === 'Reflex' ? 'DEX' : 'WIS';
          return co.saves[k].rank + Math.max(1, derived.level) + igAbilityMod(co.abilities[abil]) + co.saves[k].misc;
        };
        return (
          <section id="ig-companion" style={{ scrollMarginTop: 108 }}>
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
          </section>
        );
      })()}

      {/* ── DETAILS — ancestry (traits + art), character introduction, notes. The "who is this" reference,
             grouped at the end so the play-relevant sections lead. ────────────────────────────────────── */}
      {hasDetails && (
        <Section id="ig-details" title="Details">
          {/* Ancestry traits (B1): the full traits of the character's IG ancestry, each with its rules text.
              A known ancestry gets its blurb + both ancestry traits; an unknown one just shows the name row. */}
          {anc && (() => {
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

          {/* Notes */}
          {ig.notes && ig.notes.trim() && (
            <div style={{ display: 'grid', gap: 4 }}>
              <div style={label}>Notes</div>
              <p style={{ ...value, whiteSpace: 'pre-wrap', margin: 0, color: 'var(--hx-muted)' }}>{ig.notes}</p>
            </div>
          )}
        </Section>
      )}

      {/* The roll result, pinned as a sticky toast at the bottom of the viewport (req: rolling is preserved and
          made MORE usable) — tap a save/skill/attack far down the sheet and its result stays visible without
          scrolling back up. Rendered last so bottom-sticky pins it to the viewport while the sheet is in view. */}
      {lastRoll && (
        <div role="status" aria-live="polite"
          style={{ position: 'sticky', bottom: 10, zIndex: 6, justifySelf: 'center', maxWidth: '100%', border: '1px solid var(--hx-gold-1)', borderRadius: 10, padding: '8px 14px', display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', background: 'linear-gradient(180deg, rgba(16,35,59,0.98), rgba(11,26,44,0.98))', boxShadow: '0 8px 26px rgba(0,0,0,0.5)' }}>
          <span style={{ fontSize: 12, color: 'var(--hx-muted)' }}>{lastRoll.label}</span>
          <strong style={{ fontSize: 22, color: lastRoll.tone === 'crit' ? 'var(--hx-teal-1)' : lastRoll.tone === 'fumble' ? 'var(--hx-danger)' : 'var(--hx-gold-2)' }}>{lastRoll.total}</strong>
          <span style={{ fontSize: 11.5, color: 'var(--hx-muted)' }}>{lastRoll.detail}</span>
        </div>
      )}
    </div>
  );
}

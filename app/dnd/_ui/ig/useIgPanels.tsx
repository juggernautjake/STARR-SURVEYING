'use client';
// app/dnd/_ui/ig/useIgPanels.tsx — the Intuitive Games system's PANEL SET (T-6a).
//
// The multi-format architecture (see the planning doc) is "FORMAT = shell, SYSTEM = panels": a system
// exposes an ordered list of named content blocks, and each format (Classic tabs, Codex panes, Dashboard
// cards, Play) merely ARRANGES that one list. This hook is the IG panel set — the single source a shell
// reads — lifted out of the old IGSheet monolith so a later slice can lay these same panels into other
// formats. It mirrors the 5e `useFivePanels` and the PF2 `usePf2Panels` shape: each panel is a `SheetPanel`
// (id/label/emoji/render), and the hook additionally returns the surrounding furniture the Classic shell
// lays out (header, jump-nav, the refusal banner, the roll-result toast, and the picker/editor overlays).
//
// It OWNS all the shared state the old component held: the single stat resolution (igDerived + igInPlayState,
// computed once), the roll handlers, the write-gated ig-edit posts, the picker/editor state, and the banners.
// Every number is still computed by the pure rules engine (never guessed) and the sheet stays prop-driven
// (never the 5e store). This is a pure EXTRACTION — the rendered DOM and every interaction are byte-for-byte
// what the monolith produced; the Classic shell (IGSheet) just calls this and places the pieces in order.
import { useMemo, useState, useRef, useCallback, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import type { ActiveRoll } from '@/app/dnd/_sheet/state/store';
import { RollFeedProvider } from '@/app/dnd/_sheet/components/rollers/rollFeed';
import { buildD20ActiveRoll, buildDamageActiveRoll } from '@/app/dnd/_sheet/components/rollers/rollFeedBuild';
import { rollerStageFor } from '@/app/dnd/_sheet/components/rollers/rollerFor';
import RollerTemplateBar from '@/app/dnd/_sheet/components/rollers/RollerTemplateBar';
import { resolveRollerTemplate } from '@/lib/dnd/roller-templates';
import styles from '../hextech.module.css';
import OffRulesMark from '@/app/dnd/_sheet/components/ui/OffRulesMark';
import IGElementEditor, { type IGEditorKind, type IGEditableElement } from '../IGElementEditor';
import IGContentPicker, { type IGPickerKind } from '../IGContentPicker';
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
import type { SheetPanel } from '../../_sheet/panels/fivePanels';

const effectMap = (() => {
  const m = new Map<string, string>();
  // Include defensive powers so their chip can hover-explain itself like every other in-play effect
  // (owner: "hovering over any effect in play shows a tooltip explaining how it works").
  for (const e of [...IG_STANCES, ...IG_POWERS, ...IG_DEFENSIVE_POWERS]) if (e.effect) m.set(e.name.trim().toLowerCase(), e.effect);
  return m;
})();
const effectOf = (name: string) => effectMap.get(name.trim().toLowerCase()) ?? '';

type Source = 'vanilla' | 'custom' | 'dm-granted';
export interface Tagged { kind: string; name: string; source: Source }

const BADGE: Record<Source, { t: string; c: string; b: string }> = {
  vanilla: { t: 'VANILLA', c: 'var(--hx-teal-1)', b: 'rgba(10,200,185,0.12)' },
  custom: { t: 'CUSTOM', c: 'var(--hx-danger)', b: 'rgba(198,64,59,0.14)' },
  'dm-granted': { t: 'DM-GRANTED', c: 'var(--hx-gold-2)', b: 'rgba(200,170,110,0.14)' },
};
function Badge({ source }: { source: Source }) {
  const m = BADGE[source];
  return <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.06em', color: m.c, background: m.b, border: `1px solid ${m.c}`, borderRadius: 4, padding: '0 4px', whiteSpace: 'nowrap' }}>{m.t}</span>;
}

const fmt = (n: number) => (n >= 0 ? `+${n}` : `${n}`);

// Consistent action-cost iconography (req 4). IG's three-action economy is one of its distinctive
// mechanics, so a Single / Double / Triple / Reaction / Other cost should read at a glance as a glyph, not
// only as a word. Keyed by the IG_ACTION_ECONOMIES values so a new economy can't silently miss a glyph.
const ACTION_GLYPH: Record<string, string> = {
  Single: '◆', Double: '◆◆', Triple: '◆◆◆', Reaction: '⤾', Other: '○',
};

/**
 * A titled, visually-distinct card — the unit of the sheet's hierarchy.
 *
 * Grouping each concern (vitals, abilities, skills, combat, powers, feats, …) into a bordered card with a
 * consistent gold display heading is what makes "find X at a glance" true, where the old flat column of
 * `<div style={label}>` headings did not. The `id` + `scrollMarginTop` let the sticky jump-nav anchor to it
 * without the target hiding under the site header. `accent` recolours the heading for the few sections that
 * carry their own identity colour (powers pink, stance descriptions teal).
 *
 * `scrollMarginTop: 108` matches the PF2 sheet's `.pf2Section` exactly (the app's other bespoke sheet), so an
 * anchored jump clears the /dnd site header (~52px) AND the sticky in-sheet jump-nav below it.
 */
function Section({ id, title, accent, aside, children }: {
  id: string; title: string; accent?: string; aside?: ReactNode; children: ReactNode;
}) {
  return (
    <section id={id} style={{ scrollMarginTop: 108, border: '1px solid var(--hx-line)', borderRadius: 10, background: 'var(--hx-inset-soft)', padding: '13px 15px 15px', display: 'grid', gap: 11 }}>
      {/* The heading is the section's anchor, so it carries a 700 weight and a 14px size with a taller teal ◆
          tick — a solid, unmistakable divider. A 2px gold underline replaces the hairline so each card reads
          as "designed". */}
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, borderBottom: '2px solid var(--hx-line)', paddingBottom: 7, flexWrap: 'wrap' }}>
        <h3 style={{ margin: 0, display: 'inline-flex', alignItems: 'center', gap: 8, fontFamily: 'var(--hx-font-display)', fontWeight: 700, fontSize: 14, letterSpacing: '0.13em', textTransform: 'uppercase', color: accent ?? 'var(--hx-gold-2)' }}>
          <span aria-hidden style={{ color: 'var(--hx-teal-1)', fontSize: 9 }}>◆</span>{title}
        </h3>
        {aside ? <div style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--hx-muted)' }}>{aside}</div> : null}
      </div>
      {children}
    </section>
  );
}

/** The inputs the panel set needs — the SAME inputs the sheet takes, minus `sheetType` (a skin token the
 *  Classic shell applies to its own root, not something a panel reads). */
export interface UseIgPanelsArgs {
  ig: IGCharacter;
  elements: Tagged[];
  canEdit?: boolean;
  characterId?: string;
  isDM?: boolean;
  /** Vanilla characters are held to their class; custom ones are flagged, not blocked. Defaults to
   *  vanilla — the safe direction, matching the server. */
  variantKind?: 'vanilla' | 'custom';
  /** The chosen roller template (`data.rollerTemplate`) + animation pref (`data.rollerAnim`) + the sheet
   *  layout, so IG mounts the SAME animated dice roller the 5e sheet does (RO-5). */
  rollerTemplate?: string;
  rollerAnim?: boolean;
  layout?: string;
}

/** What the hook hands a format shell: the ordered panel list plus the surrounding furniture. A shell places
 *  `header → nav → banner → panels (in order, in their own `<Section>` wrappers) → roller`, and mounts
 *  `overlays` (the editor + picker modals) wherever the format wants. */
export interface IgPanelSet {
  panels: SheetPanel[];
  header: ReactNode;
  nav: ReactNode;
  banner: ReactNode;
  roller: ReactNode;
  overlays: ReactNode;
}

export function useIgPanels({ ig, elements, canEdit, characterId, isDM, variantKind = 'vanilla', rollerTemplate, rollerAnim, layout }: UseIgPanelsArgs): IgPanelSet {
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
  // The animated dice roller (RO-5): IG PUBLISHES each roll into the shared RollFeed as an `ActiveRoll`, so
  // the same Dice Core / Sigil Stack / Roll Board / Impact stages (with animations + sounds) render it.
  const [activeRoll, setActiveRoll] = useState<ActiveRoll | null>(null);
  const rollTokenRef = useRef(0);
  const noopCommit = useCallback(() => {}, []); // IG keeps its own toast; the stage's log-on-land is a no-op here
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
    // Roll the die/dice, KEEPING both faces for adv/dis so the roller can show "rolled 7, 18 → 18".
    const n1 = rollNaturalD20();
    const n2 = advantage || disadvantage ? rollNaturalD20() : null;
    const natural = advantage ? Math.max(n1, n2!) : disadvantage ? Math.min(n1, n2!) : n1;
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
    // Publish to the animated roller via the shared (unit-tested) builder — crit/fumble from the nat 20/1
    // OR the four-step degree, both dice kept for adv/dis, and the named sources as boosts/penalties.
    setActiveRoll(buildD20ActiveRoll({
      token: ++rollTokenRef.current, label, natural, total: r.total, modifier: r.modifier,
      faces: n2 != null ? [n1, n2] : null,
      mode: advantage ? 'adv' : disadvantage ? 'dis' : undefined,
      crit: r.critical || r.degree === 'critical-success',
      fumble: r.fumble || r.degree === 'critical-failure',
      tag: r.degree && r.dc != null ? `vs DC ${r.dc} → ${degreeLabel(r.degree)}` : undefined,
      boosts: advantage && sources.length ? sources : undefined,
      penalties: (disadvantage || cond.penalty) && sources.length ? sources : undefined,
    }));
  };
  const rollDamage = (label: string, expr: string) => {
    const r = rollDiceExpr(expr);
    // Fold the active stance's unconditional flat damage bonus (Offensive advanced: +half level to damage).
    const dmg = igStanceDamageBonus(ig.combat?.stances?.[0] ?? null, derived.level);
    const total = r.total + (dmg?.bonus ?? 0);
    const breakdown = dmg ? `${r.breakdown} + ${dmg.bonus} (${dmg.source})` : r.breakdown;
    setLastRoll({ label, total, detail: breakdown, tone: 'normal' });
    setActiveRoll(buildDamageActiveRoll({ token: ++rollTokenRef.current, label, total, breakdown }));
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

  // The owner's headline complaint was "skinny fonts that are a little small to read". Micro-labels were
  // 11px/400-weight muted; a 600 weight + 11.5px + a hair more tracking makes them a crisp caption while
  // keeping the muted hue the skins depend on. Body values move from a thin 13px to 14px/500 — comfortably
  // on the owner's "≥13.5–14px" target — so every `value`-styled line across the sheet reads solidly.
  const label = { fontSize: 11.5, fontWeight: 600 as const, color: 'var(--hx-muted)', letterSpacing: '0.05em', textTransform: 'uppercase' as const };
  const value = { fontSize: 14, fontWeight: 500 as const, color: 'var(--hx-text)' };

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
  const navItems: { id: string; label: string }[] = [
    { id: 'ig-vitals', label: 'Vitals' },
    { id: 'ig-abilities', label: 'Abilities' },
  ];
  if (hasSkills) navItems.push({ id: 'ig-skills', label: 'Skills' });
  if (hasCombat) navItems.push({ id: 'ig-combat', label: 'Combat' });
  if (hasPowers) navItems.push({ id: 'ig-powers', label: 'Powers' });
  if (hasFeats) navItems.push({ id: 'ig-feats', label: 'Feats' });
  navItems.push({ id: 'ig-reference', label: 'Reference' });
  if (hasEquipment) navItems.push({ id: 'ig-equipment', label: 'Equipment' });
  if (ig.companion) navItems.push({ id: 'ig-companion', label: 'Companion' });
  if (hasDetails) navItems.push({ id: 'ig-details', label: 'Details' });

  const chip = (name: string) => {
    const tip = effectOf(name); // the rules text, so the chip hover-explains itself
    return (
      <span key={name} className="igs-int" title={tip || undefined} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13.5, fontWeight: 500, color: 'var(--hx-text)', background: 'var(--hx-inset-soft)', border: '1px solid var(--hx-line)', borderRadius: 12, padding: '3px 11px', cursor: tip ? 'help' : 'default' }}>
        {name} {badgeFor(name)}
        {tip && <InfoTip tip={tip} label={`${name} rules`} />}
      </span>
    );
  };

  // ── VITALS (req 2/3) — the prominent, consistent stat strip that LEADS the sheet with the core numbers,
  //    plus the active-stance banner. A player finds HP, the three saves and proficiency at a glance here,
  //    and taps any save to roll it. ────────────────────────────────────────────────────────────────────
  const renderVitals = () => (
    <Section id="ig-vitals" title="Vitals"
      aside={(
        // D-16: the per-stat dice glyphs are gone — every save/skill/ability/attack is itself the button
        // (it lifts + glows on hover), and a tap sends it to the animated roller. This hint makes the
        // now-implicit interaction discoverable without cluttering each value.
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--hx-muted)' }}>Tap any value to roll it</span>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 600, color: 'var(--hx-muted)' }}>
            Target DC
            <input type="number" value={targetDc} onChange={(e) => setTargetDc(e.target.value)} placeholder="—"
              style={{ width: 52, fontSize: 14, fontWeight: 600, padding: '4px 7px', background: 'var(--hx-inset-strong)', color: 'var(--hx-text)', border: '1px solid var(--hx-line)', borderRadius: 5 }} />
          </label>
        </div>
      )}
    >
      {/* Active stance banner (req 3) — a stance is a HELD state that modifies rolls, so when one is active it
          deserves a "Currently in: X" callout, not a buried list item. Hover explains the full rules. The
          stance selector to change it lives in Combat; this is the always-visible status. */}
      {activeStance && (() => {
        const e = igStanceInPlay(activeStance, derived.level);
        return (
          <div title={e?.tooltip ?? activeStance} style={{ display: 'flex', alignItems: 'center', gap: 13, flexWrap: 'wrap', border: '1px solid var(--hx-teal-2)', borderLeft: '4px solid var(--hx-teal-1)', background: 'linear-gradient(180deg, rgba(10,200,185,0.12), rgba(10,200,185,0.04))', borderRadius: 9, padding: '10px 14px', cursor: 'help' }}>
            <span aria-hidden style={{ fontSize: 23, lineHeight: 1 }}>🜲</span>
            <div style={{ display: 'grid', gap: 2 }}>
              <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.11em', textTransform: 'uppercase', color: 'var(--hx-muted)' }}>Currently in</span>
              <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--hx-teal-1)' }}>{e?.name ?? activeStance} {badgeFor(activeStance)}</span>
            </div>
            {e?.summary && <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--hx-text)', flex: '1 1 200px', lineHeight: 1.45 }}>{e.summary}</span>}
          </div>
        );
      })()}

      {/* The stat strip: HP · the three saves · Proficiency. Uniform tiles in a responsive grid so they read
          as one coherent panel and reflow cleanly from phone to wide monitor. */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: 8 }}>
        <div className="igs-tile" style={{ textAlign: 'center', border: '1px solid var(--hx-line)', borderRadius: 8, padding: '9px 6px' }}>
          <div style={{ fontSize: 11.5, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--hx-muted)' }}>Hit Points</div>
          <div style={{ fontSize: 23, fontWeight: 800, color: 'var(--hx-text)', lineHeight: 1.1 }}>{derived.currentHp}<span style={{ fontSize: 14, fontWeight: 600, color: 'var(--hx-muted)' }}> / {derived.maxHp}</span></div>
          {canDoEdit && (
            // Quick damage / heal — posts apply_damage / heal to the ig-edit route (SQ4).
            <div style={{ display: 'flex', gap: 4, marginTop: 7, alignItems: 'center', justifyContent: 'center' }}>
              <input type="number" min={1} value={hpAmt} onChange={(e) => setHpAmt(e.target.value)} placeholder="±" aria-label="HP amount"
                style={{ width: 44, fontSize: 13.5, fontWeight: 600, padding: '3px 4px', textAlign: 'center', background: 'var(--hx-inset-strong)', color: 'var(--hx-text)', border: '1px solid var(--hx-line)', borderRadius: 6 }} />
              <button type="button" className="igs-int" disabled={editing || !hpAmt.trim()} title="Take damage"
                onClick={() => { const n = parseInt(hpAmt, 10); if (n > 0) { postEdit({ op: 'apply_damage', amount: n }); setHpAmt(''); } }}
                style={{ fontSize: 14, fontWeight: 700, lineHeight: 1, padding: '3px 8px', background: 'none', border: '1px solid var(--hx-danger)', color: 'var(--hx-danger)', borderRadius: 6, cursor: 'pointer' }}>−</button>
              <button type="button" className="igs-int" disabled={editing || !hpAmt.trim()} title="Heal"
                onClick={() => { const n = parseInt(hpAmt, 10); if (n > 0) { postEdit({ op: 'heal', amount: n }); setHpAmt(''); } }}
                style={{ fontSize: 14, fontWeight: 700, lineHeight: 1, padding: '3px 8px', background: 'none', border: '1px solid var(--hx-teal-1)', color: 'var(--hx-teal-1)', borderRadius: 6, cursor: 'pointer' }}>＋</button>
            </div>
          )}
        </div>
        {IG_SAVES.map((s) => {
          const rs = resolvedSave(s);
          const shown = rs?.total ?? derived.saves[s];
          const changed = shown !== derived.saves[s];
          return (
            <button key={s} type="button" className="igs-tile igs-int" onClick={() => rollLine(`${s} save`, derived.saves[s], s === 'Reflex' ? 'reflex_save' : s === 'Fortitude' ? 'fortitude_save' : 'will_save')}
              // The tooltip explains WHY the number moved, so a changed value is never mysterious.
              title={`Roll ${s} (d20 ${fmt(shown)})${rs?.sources.length ? ` · ${rs.sources.join(', ')}` : ''}`}
              style={{ textAlign: 'center', border: `1px solid ${changed || rs?.swing !== 'none' ? 'var(--hx-gold)' : 'var(--hx-line)'}`, borderRadius: 8, padding: '9px 6px', cursor: 'pointer' }}>
              <div style={{ fontSize: 11.5, fontWeight: 600, letterSpacing: '0.03em', textTransform: 'uppercase', color: 'var(--hx-muted)' }}>{s}{swingMark(rs?.swing)}</div>
              <div style={{ fontSize: 23, fontWeight: 800, lineHeight: 1.1, color: changed ? 'var(--hx-gold-2)' : 'var(--hx-teal-1)' }}>{fmt(shown)}</div>
              {/* Base shown alongside when something is modifying it, so the player can see both. */}
              {changed && <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--hx-muted)' }}>base {fmt(derived.saves[s])}</div>}
            </button>
          );
        })}
        <div className="igs-tile" style={{ textAlign: 'center', border: '1px solid var(--hx-line)', borderRadius: 8, padding: '9px 6px' }}>
          <div style={{ fontSize: 11.5, fontWeight: 600, letterSpacing: '0.03em', textTransform: 'uppercase', color: 'var(--hx-muted)' }}>Proficiency</div>
          <div style={{ fontSize: 23, fontWeight: 800, lineHeight: 1.1, color: 'var(--hx-text)' }}>{fmt(derived.proficiency)}</div>
        </div>
      </div>
    </Section>
  );

  // ── ABILITY SCORES ───────────────────────────────────────────────────────────────────────────────────
  const renderAbilities = () => (
    <Section id="ig-abilities" title="Ability Scores">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(62px, 1fr))', gap: 8 }}>
        {IG_ABILITIES.map((k) => (
          <div key={k} style={{ display: 'grid', gap: 3 }}>
            {/* Tap an ability to roll an ability check (R1b): d20 + its modifier. */}
            <button type="button" className="igs-tile igs-int" onClick={() => rollLine(`${k} check`, igAbilityMod(ig.abilities[k]), (k === 'STR' || k === 'DEX') ? 'str_dex_check' : 'ability_check')} title={`Roll ${k} check (d20 ${fmt(igAbilityMod(ig.abilities[k]))})`}
              style={{ textAlign: 'center', border: '1px solid var(--hx-line)', borderRadius: 8, padding: '9px 4px', cursor: 'pointer', width: '100%' }}>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--hx-muted)', letterSpacing: '0.07em' }}>{k}</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--hx-text)', lineHeight: 1.15 }}>{ig.abilities[k]}</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--hx-gold-2)' }}>{fmt(igAbilityMod(ig.abilities[k]))}</div>
            </button>
            {canDoEdit && (
              // Editable score (IGS6): set the ability directly via the set_ability edit op. Commit on Enter or
              // blur; keyed by the current value so it resets after the sheet refreshes.
              // Background is `--hx-inset-strong` (a skin-aware recessed well), NOT the old hardcoded navy
              // `#0b1622`: on the three LIGHT skins that fixed dark box turned into dark-ink-on-dark — an
              // unreadable field — whereas the token resolves to a soft light well there and the dark navy
              // on the dark skins, so the input is legible on all five. Same swap applied to every input/
              // select on this sheet (HP amount, target DC, stance/defensive-power/condition selectors).
              <input key={`${k}-${ig.abilities[k]}`} type="number" min={1} max={30} defaultValue={ig.abilities[k]} disabled={editing} aria-label={`Set ${k}`}
                onKeyDown={(ev) => { if (ev.key === 'Enter') (ev.target as HTMLInputElement).blur(); }}
                onBlur={(ev) => { const v = parseInt(ev.target.value, 10); if (Number.isFinite(v) && v !== ig.abilities[k]) postEdit({ op: 'set_ability', ability: k, value: v }); }}
                style={{ width: '100%', textAlign: 'center', fontSize: 12.5, fontWeight: 600, padding: '3px 0', background: 'var(--hx-inset-strong)', color: 'var(--hx-text)', border: '1px solid var(--hx-line)', borderRadius: 6 }} />
            )}
          </div>
        ))}
      </div>
    </Section>
  );

  // ── SKILLS — general grouped by ability, combat skills separate; totals from the rules engine. ─────────
  const renderSkills = () => {
    const general = ig.skills.filter((s) => !s.combat);
    const combat = ig.skills.filter((s) => s.combat);
    const byAbility = IG_ABILITIES.map((ab) => ({ ab, list: general.filter((s) => s.ability === ab) })).filter((g) => g.list.length);
    const Row = ({ s }: { s: (typeof ig.skills)[number] }) => {
      const total = igSkillTotal(s, derived.level, igAbilityMod(ig.abilities[s.ability]));
      // Tap a skill to roll it (R1b): d20 + total through the shared engine, result in the banner.
      return (
        <button type="button" className="igs-row" onClick={() => rollLine(`${s.name} (${s.ability})`, total)} title={`Roll ${s.name} (d20 ${fmt(total)})`}
          style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 13.5, fontWeight: 500, padding: '3px 6px', width: '100%', background: 'none', border: 'none', borderRadius: 5, cursor: 'pointer', textAlign: 'left' }}>
          <span style={{ color: 'var(--hx-text)' }}>{s.name}{s.proficient ? <span style={{ color: 'var(--hx-teal-1)', fontSize: 12 }}> ●</span> : null}</span>
          <span style={{ color: 'var(--hx-gold-2)', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{fmt(total)}</span>
        </button>
      );
    };
    return (
      <Section id="ig-skills" title="Skills"
        aside={<>Ranks: {igRanksSpent(ig)} spent / {ig.skillRanksAvailable} available · trained ●</>}
      >
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: '12px 20px' }}>
          {byAbility.map(({ ab, list }) => (
            <div key={ab}>
              {/* Group header: 12px/700 teal with a hairline underline, so each ability cluster reads as a
                  titled sub-panel rather than a faint caption floating over the rows. */}
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--hx-teal-1)', letterSpacing: '0.07em', marginBottom: 4, paddingBottom: 3, borderBottom: '1px solid var(--hx-line)' }}>{ab}-BASED</div>
              {list.map((s) => <Row key={s.name} s={s} />)}
            </div>
          ))}
          {combat.length > 0 && (
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--hx-danger)', letterSpacing: '0.07em', marginBottom: 4, paddingBottom: 3, borderBottom: '1px solid var(--hx-line)' }}>COMBAT SKILLS</div>
              {combat.map((s) => <Row key={s.name} s={s} />)}
            </div>
          )}
        </div>
      </Section>
    );
  };

  // ── COMBAT — attacks (to-hit + damage from the rules engine), HP/DR, stances, defensive power,
  //    conditions. The active-stance status lives in Vitals; the selector to CHANGE it lives here. ────────
  const renderCombat = () => (
    <Section id="ig-combat" title="Combat">
      {cb.attacks.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
            <thead>
              <tr style={{ color: 'var(--hx-muted)', textAlign: 'left' }}>
                {['Weapon', 'Type', 'Attack', 'Damage', 'Properties'].map((h) => <th key={h} style={{ padding: '2px 8px 5px 0', fontSize: 11.5, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', borderBottom: '2px solid var(--hx-line)' }}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {cb.attacks.map((a) => {
                const r = igResolveAttack(ig, a);
                return (
                  <tr key={a.id} style={{ color: 'var(--hx-text)' }}>
                    <td style={{ padding: '4px 8px 4px 0', fontWeight: 600 }}>{a.name}{a.weaponFocus ? <span title="Weapon Focus" style={{ color: 'var(--hx-gold-2)', fontSize: 11 }}> ✦</span> : null}{a.weaponSpecialization ? <span title="Weapon Specialization" style={{ color: 'var(--hx-gold-2)', fontSize: 11 }}>✦</span> : null}</td>
                    <td style={{ padding: '4px 8px 4px 0', fontWeight: 500, color: 'var(--hx-muted)' }}>{a.weaponType} {badgeFor(a.weaponType)}</td>
                    <td style={{ padding: '4px 8px 4px 0', fontVariantNumeric: 'tabular-nums' }}>
                      {/* Tap the to-hit to roll the attack (R1b): d20 + to-hit through the shared engine. */}
                      <button type="button" className="igs-link" onClick={() => rollLine(`${a.name} attack`, r.toHit, 'attack')} title={`Roll ${a.name} attack (d20 ${fmt(r.toHit)})`}
                        style={{ background: 'none', border: 'none', color: 'var(--hx-gold-2)', fontWeight: 700, fontSize: 14, cursor: 'pointer', padding: 0, fontVariantNumeric: 'tabular-nums' }}>
                        {fmt(r.toHit)}
                      </button>
                    </td>
                    <td style={{ padding: '4px 8px 4px 0', fontVariantNumeric: 'tabular-nums' }}>
                      {/* Tap the damage to roll the dice expression (R1b). */}
                      <button type="button" className="igs-link" onClick={() => rollDamage(`${a.name} damage`, r.damage)} title={`Roll ${a.name} damage (${r.damage})`}
                        style={{ background: 'none', border: 'none', color: 'var(--hx-text)', fontWeight: 600, cursor: 'pointer', padding: 0, fontVariantNumeric: 'tabular-nums' }}>
                        {r.damage}
                      </button>
                    </td>
                    <td style={{ padding: '4px 8px 4px 0', fontWeight: 500, color: 'var(--hx-muted)' }}>{a.properties}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <div className="igs-tile" style={{ border: '1px solid var(--hx-line)', borderRadius: 8, padding: '7px 11px', fontSize: 13.5, fontWeight: 600 }}>
          <span style={{ color: 'var(--hx-muted)', fontWeight: 700 }}>HP </span>{cb.hitPoints.classBackgroundHp} class+bg
          {cb.hitPoints.lethal ? <span style={{ color: 'var(--hx-danger)' }}> · {cb.hitPoints.lethal} lethal</span> : null}
          {cb.hitPoints.nonlethal ? <span style={{ color: 'var(--hx-muted)' }}> · {cb.hitPoints.nonlethal} nonlethal</span> : null}
        </div>
        {/* DR includes Advanced Defensive's "half your level", which previously appeared in
            no number anywhere — the stance granted it and the sheet never showed it. */}
        {inPlay.damageReduction.dr > 0 && (
          <div className="igs-tile" title={inPlay.damageReduction.sources.join(' · ')}
            style={{ border: `1px solid ${inPlay.damageReduction.dr !== cb.damageReduction ? 'var(--hx-gold)' : 'var(--hx-line)'}`, borderRadius: 8, padding: '7px 11px', fontSize: 13.5, fontWeight: 600 }}>
            <span style={{ color: 'var(--hx-muted)', fontWeight: 700 }}>DR </span>
            <span style={{ color: inPlay.damageReduction.dr !== cb.damageReduction ? 'var(--hx-gold-2)' : undefined }}>{inPlay.damageReduction.dr}</span>
            {inPlay.damageReduction.dr !== cb.damageReduction && (
              <span style={{ color: 'var(--hx-muted)', fontSize: 11.5, fontWeight: 500 }}> (gear {cb.damageReduction})</span>
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
                <span key={name} className="igs-int" title={e?.tooltip ?? name} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13.5, fontWeight: 500, color: 'var(--hx-text)', background: 'var(--hx-inset-soft)', border: '1px solid var(--hx-line)', borderRadius: 12, padding: '3px 11px', cursor: 'help' }}>
                  {e?.name ?? name} {badgeFor(name)}
                  {e?.summary ? <span style={{ color: 'var(--hx-muted)', fontSize: 12.5 }}>· {e.summary}</span> : null}
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
                style={{ fontSize: 13.5, fontWeight: 500, background: 'var(--hx-inset-strong)', color: 'var(--hx-text)', border: '1px solid var(--hx-line)', borderRadius: 8, padding: '4px 8px' }}
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
            return note ? <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--hx-teal-1)', lineHeight: 1.45 }}>{note}</div> : null;
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
            <select aria-label="Defensive power" value={cb.defensivePower} disabled={editing} onChange={(ev) => postEdit({ op: 'set_defensive_power', name: ev.target.value })} style={{ fontSize: 13.5, fontWeight: 500, background: 'var(--hx-inset-strong)', color: 'var(--hx-text)', border: '1px solid var(--hx-line)', borderRadius: 8, padding: '4px 8px', justifySelf: 'start' }}>
              <option value="">— no defensive power —</option>
              {IG_DEFENSIVE_POWERS.map((d) => <option key={d.name} value={d.name}>{d.name}</option>)}
            </select>
          )}
        </div>
      )}
      {cb.situationalBonuses.length > 0 && <div style={{ display: 'grid', gap: 4 }}><span style={label}>Situational Bonuses</span><div style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--hx-text)' }}>{cb.situationalBonuses.join(' · ')}</div></div>}
      {(cb.conditions.length > 0 || canDoEdit) && (
        <div style={{ display: 'grid', gap: 4 }}>
          <span style={label}>Conditions <span style={{ textTransform: 'none', letterSpacing: 0 }}>(hover or tap ⓘ for the full rules)</span></span>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            {cb.conditions.map((c) => {
              const e = igConditionInPlay(c);
              return (
                <span key={c} className="igs-int" title={e?.tooltip ?? c} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 13.5, fontWeight: 600, color: 'var(--hx-danger)', background: 'rgba(198,64,59,0.10)', border: '1px solid var(--hx-danger)', borderRadius: 12, padding: '2px 10px', cursor: 'help' }}>
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
                style={{ fontSize: 13.5, fontWeight: 500, background: 'var(--hx-inset-strong)', color: 'var(--hx-text)', border: '1px solid var(--hx-line)', borderRadius: 8, padding: '4px 8px' }}
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
              <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--hx-muted)', lineHeight: 1.45 }}>
                {sum.flatD20 !== 0 && (
                  <div><span style={{ color: 'var(--hx-danger)', fontWeight: 700 }}>{sum.flatD20} to attacks, saves &amp; skill checks</span> ({sum.flatSources.join(', ')})</div>
                )}
                {sum.disadvantages.map((d) => <div key={d}>{d}</div>)}
              </div>
            );
          })()}
        </div>
      )}
    </Section>
  );

  // ── POWERS — IG's spells. ──────────────────────────────────────────────────────────────────────────────
  const renderPowers = () => (
    <Section id="ig-powers" title="Powers" accent="var(--hx-pink-1, #d98cc0)"
      aside={canDoEdit ? (
        <span style={{ display: 'inline-flex', gap: 6 }}>
          {/* The catalogued path, and the one a vanilla character actually needs. Listed
              BEFORE ✎ New so the ordinary action reads first. */}
          <button
            type="button" className="igs-int" disabled={editing}
            onClick={() => setPicker('power')}
            title="Add a power from the Intuitive Games spell list"
            style={{ background: 'none', border: '1px solid var(--hx-line)', borderRadius: 10, color: 'var(--hx-gold-2)', fontWeight: 600, cursor: 'pointer', fontSize: 12, padding: '3px 10px' }}
          >＋ Add</button>
          <button
            type="button" className="igs-int" disabled={editing || !canAuthorPowers}
            onClick={() => setIgEditor({ kind: 'power' })}
            title={canAuthorPowers
              ? 'Author a homebrew power'
              : 'This is a vanilla character, so its powers are held to its class and level. Build a custom character, or ask the DM to grant it.'}
            style={{
              background: 'none', border: '1px solid var(--hx-line)', borderRadius: 10,
              color: 'var(--hx-muted)', fontWeight: 600, cursor: canAuthorPowers ? 'pointer' : 'not-allowed',
              fontSize: 12, padding: '3px 10px', opacity: canAuthorPowers ? 1 : 0.5,
            }}
          >✎ New</button>
        </span>
      ) : undefined}
    >
      {ig.powers.map((p) => (
        <div key={p} style={{ display: 'grid', gap: 2 }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--hx-text)', display: 'flex', alignItems: 'center', gap: 6 }}>
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
                style={{ background: 'none', border: 'none', color: 'var(--hx-muted)', cursor: 'pointer', fontSize: 12, padding: 0 }}
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
            ? <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--hx-muted)', lineHeight: 1.45 }}>{ig.customEffects[p]}</span>
            : effectOf(p)
            ? <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--hx-muted)', lineHeight: 1.45 }}>{effectOf(p)}</span>
            // A recognized (non-custom) power with no effect text is a roster power pending
            // Brendan's rules — say so (Ground Rule 2) rather than leaving a bare name that reads
            // as "no effect". A custom power gets no note (its effect simply isn't authored here).
            : srcByName.get(p.trim().toLowerCase()) && srcByName.get(p.trim().toLowerCase()) !== 'custom'
              ? <span style={{ fontSize: 12.5, fontWeight: 500, fontStyle: 'italic', color: 'var(--hx-gold-2)' }}>Effect text not yet published — work in progress.</span>
              : null}
        </div>
      ))}
      {/* The power add path is the ＋ Add picker in this section's header (IG-S3). It
          replaced a <select> of roster names grouped by school, which drew from the same
          full roster but could show nothing ELSE: not the rules text, and — the reason it
          had to go — not whether the character may actually take the power. A vanilla
          character could pick any of ~60 names and learn only from the refusal afterwards
          which ones its class allows. The picker greys the ineligible with the reason. */}
      {ig.powers.length === 0 && <div style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--hx-muted)' }}>No powers yet.</div>}
    </Section>
  );

  // ── FEATS ──────────────────────────────────────────────────────────────────────────────────────────────
  const renderFeats = () => (
    <Section id="ig-feats" title="Feats" aside={<>hover for the full rules</>}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        {[...ig.feats.general, ...ig.feats.combat].map((f) => {
          const def = findIGFeat(f);
          const tip = def ? `${def.name} — ${def.category} feat${def.prerequisites ? ` (Prereq: ${def.prerequisites})` : ''}: ${def.effect}` : undefined;
          return (
            <span key={f} className="igs-int" title={tip} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13.5, fontWeight: 500, color: 'var(--hx-text)', background: 'var(--hx-inset-soft)', border: '1px solid var(--hx-line)', borderRadius: 12, padding: '3px 11px', cursor: def ? 'help' : 'default' }}>
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
            type="button" className="igs-int" disabled={editing}
            onClick={() => setPicker('feat')}
            title="Add a feat, with its prerequisites and rules text"
            style={{ fontSize: 13, fontWeight: 600, background: 'none', color: 'var(--hx-gold-2)', border: '1px solid var(--hx-line)', borderRadius: 12, padding: '3px 11px', cursor: 'pointer' }}
          >＋ add feat…</button>
        )}
      </div>
    </Section>
  );

  // ── REFERENCE — the character's known stance descriptions + the three-action economy, with cost
  //    glyphs so 1/2/3-action / reaction / free reads at a glance (req 4). ──────────────────────────────
  const renderReference = () => (
    <Section id="ig-reference" title="Reference" aside={<>powers, feats &amp; stances</>}>
      {ig.stances.length > 0 && (
        <div style={{ display: 'grid', gap: 6 }}>
          <span style={{ ...label, color: 'var(--hx-teal-1)' }}>Stance descriptions</span>
          {ig.stances.map((s) => (
            <div key={s} style={{ display: 'grid', gap: 2 }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--hx-text)', display: 'flex', alignItems: 'center', gap: 6 }}>{s} {badgeFor(s)}</span>
              {effectOf(s) && <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--hx-muted)', lineHeight: 1.45 }}>{effectOf(s)}</span>}
            </div>
          ))}
        </div>
      )}
      <details style={{ fontSize: 13.5 }}>
        <summary style={{ cursor: 'pointer', ...label }}>Action economy (reference)</summary>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '10px 16px', marginTop: 8 }}>
          {IG_ACTION_ECONOMIES.map((e) => {
            const list = igActionsByEconomy()[e];
            return (
              <div key={e}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--hx-gold-2)', letterSpacing: '0.06em', display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                  {/* Consistent action-cost glyph so the reader sees the cost, not just the word. */}
                  <span aria-hidden style={{ color: 'var(--hx-teal-1)', fontSize: 13 }}>{ACTION_GLYPH[e]}</span>{e.toUpperCase()}
                </div>
                {list.map((a) => <div key={a.name} style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--hx-muted)', lineHeight: 1.4 }}>{a.name}{a.note ? ` (${a.note})` : ''}</div>)}
              </div>
            );
          })}
        </div>
      </details>
    </Section>
  );

  // ── EQUIPMENT — worn slots + other possessions. ────────────────────────────────────────────────────────
  const renderEquipment = () => (
    <Section id="ig-equipment" title="Equipment">
      {eqSlots.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '4px 14px' }}>
          {eqSlots.map(([k, v]) => <div key={k} style={{ display: 'flex', gap: 6, alignItems: 'baseline' }}><span style={label}>{k}</span><span style={value}>{v}</span></div>)}
        </div>
      )}
      {eq.other.length > 0 && <div style={{ fontSize: 13, color: 'var(--hx-text)' }}><span style={label}>Other </span>{eq.other.join(', ')}</div>}
    </Section>
  );

  // ── COMPANION CREATURE (Sheet 7) — its own scores, saves, HP, DR, movement, attacks, powers. ────────────
  const renderCompanion = () => {
    const co = ig.companion!;
    const saveTotal = (k: (typeof IG_SAVES)[number]) => {
      const abil = k === 'Fortitude' ? 'CON' : k === 'Reflex' ? 'DEX' : 'WIS';
      return co.saves[k].rank + Math.max(1, derived.level) + igAbilityMod(co.abilities[abil]) + co.saves[k].misc;
    };
    return (
      <section id="ig-companion" style={{ scrollMarginTop: 108 }}>
        <div className={styles.framedPanel} style={{ padding: '10px 12px', display: 'grid', gap: 10, background: 'rgba(10,200,185,0.04)' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
            <strong style={{ fontFamily: 'var(--hx-font-display)', fontWeight: 700, fontSize: 15, color: 'var(--hx-teal-1)' }}>◆ Companion</strong>
            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--hx-text)' }}>{co.name}</span>
            {co.creatureType && <span style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--hx-muted)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>· {co.creatureType} {badgeFor(co.creatureType)}</span>}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, minmax(48px, 1fr))', gap: 6 }}>
            {IG_ABILITIES.map((k) => (
              <div key={k} className="igs-tile" style={{ textAlign: 'center', border: '1px solid var(--hx-line)', borderRadius: 6, padding: '5px 2px' }}>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.05em', color: 'var(--hx-muted)' }}>{k}</div>
                <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--hx-text)', lineHeight: 1.15 }}>{co.abilities[k]}</div>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--hx-gold-2)' }}>{fmt(igAbilityMod(co.abilities[k]))}</div>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', fontSize: 13.5, fontWeight: 600 }}>
            <span title={`Rules HP for CON ${co.abilities.CON} at level ${Math.max(1, derived.level)}: ${igCompanionHp(co.abilities.CON, Math.max(1, derived.level))} (CON score at level 1, then +2 + CON mod per level).`} className="igs-tile" style={{ border: '1px solid var(--hx-line)', borderRadius: 8, padding: '5px 10px', cursor: 'help' }}><span style={{ color: 'var(--hx-muted)', fontWeight: 700 }}>HP </span>{co.hitPoints}</span>
            {IG_SAVES.map((s) => <span key={s} className="igs-tile" style={{ border: '1px solid var(--hx-line)', borderRadius: 8, padding: '5px 10px' }}><span style={{ color: 'var(--hx-muted)', fontWeight: 700 }}>{s.slice(0, 4)} </span>{fmt(saveTotal(s))}</span>)}
            {co.damageReduction > 0 && <span className="igs-tile" style={{ border: '1px solid var(--hx-line)', borderRadius: 8, padding: '5px 10px' }}><span style={{ color: 'var(--hx-muted)', fontWeight: 700 }}>DR </span>{co.damageReduction}</span>}
          </div>
          {(co.movement || co.resistances || co.vulnerabilities) && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '2px 14px', fontSize: 13 }}>
              {co.movement && <div><span style={label}>Movement </span><span style={value}>{co.movement}</span></div>}
              {co.resistances && <div><span style={label}>Resistances </span><span style={value}>{co.resistances}</span></div>}
              {co.vulnerabilities && <div><span style={label}>Vulnerabilities </span><span style={value}>{co.vulnerabilities}</span></div>}
            </div>
          )}
          {co.attacks.length > 0 && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {co.attacks.map((a) => { const r = igResolveAttack({ ...ig, abilities: co.abilities }, a); return <span key={a.id} className="igs-tile" style={{ fontSize: 13.5, fontWeight: 600, border: '1px solid var(--hx-line)', borderRadius: 8, padding: '5px 10px' }}>{a.name} <span style={{ color: 'var(--hx-gold-2)', fontWeight: 700 }}>{fmt(r.toHit)}</span> · {r.damage}</span>; })}
            </div>
          )}
          {co.powers.length > 0 && (
            <div style={{ fontSize: 13 }}>
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
  };

  // ── DETAILS — ancestry (traits + art), character introduction, notes. The "who is this" reference,
  //    grouped at the end so the play-relevant sections lead. ────────────────────────────────────────────
  const renderDetails = () => (
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
                  <figcaption style={{ fontSize: 10.5, color: 'var(--hx-muted)', letterSpacing: '0.02em' }}>Art · Brendan (Intuitive Games)</figcaption>
                </figure>
              )}
              <div style={{ flex: '1 1 260px', display: 'grid', gap: 7, minWidth: 220 }}>
                <div style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--hx-muted)', lineHeight: 1.5 }}>{anc.blurb}</div>
                <div style={{ display: 'grid', gap: 6 }}>
                  {anc.traits.map((t) => (
                    <div key={t.name} title={t.text} style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--hx-text)', lineHeight: 1.5, cursor: 'help' }}>
                      <span style={{ color: 'var(--hx-gold-2)', fontWeight: 700 }}>{t.name}.</span> {t.text}
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
  );

  // The ordered, gated panel set — the canonical order is this array's order, exactly the sections the
  // monolith rendered, gated by the same presence flags. `when === false` drops a panel (and its nav anchor).
  const panelDefs: (SheetPanel & { when?: boolean })[] = [
    { id: 'ig-vitals', label: 'Vitals', emoji: '❤', render: renderVitals },
    { id: 'ig-abilities', label: 'Abilities', emoji: '⬡', render: renderAbilities },
    { id: 'ig-skills', label: 'Skills', emoji: '◇', when: hasSkills, render: renderSkills },
    { id: 'ig-combat', label: 'Combat', emoji: '⚔', when: hasCombat, render: renderCombat },
    { id: 'ig-powers', label: 'Powers', emoji: '✦', when: hasPowers, render: renderPowers },
    { id: 'ig-feats', label: 'Feats', emoji: '✧', when: hasFeats, render: renderFeats },
    { id: 'ig-reference', label: 'Reference', emoji: '❯', render: renderReference },
    { id: 'ig-equipment', label: 'Equipment', emoji: '❖', when: hasEquipment, render: renderEquipment },
    { id: 'ig-companion', label: 'Companion', emoji: '◈', when: !!ig.companion, render: renderCompanion },
    { id: 'ig-details', label: 'Details', emoji: '☰', when: hasDetails, render: renderDetails },
  ];
  const panels: SheetPanel[] = panelDefs
    .filter((p) => p.when !== false)
    .map(({ when: _w, ...p }) => p);

  // ── Header + summary top-line ──────────────────────────────────────────────────────────────────────────
  const header = (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        {/* The character's name is the sheet's masthead — 21px and letter-spaced so it reads as a title. */}
        <strong style={{ fontFamily: 'var(--hx-font-display)', fontWeight: 700, fontSize: 21, letterSpacing: '0.02em', color: 'var(--hx-gold-2)' }}>{id.name || 'Unnamed'}</strong>
        <span style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--hx-muted)' }}>Intuitive Games · Level {derived.level}</span>
      </div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 5, fontSize: 13.5, fontWeight: 500, color: 'var(--hx-text)', alignItems: 'center' }}>
        {id.className && <span>{id.className} {badgeFor(id.className)}</span>}
        {id.subclass && <span style={{ color: 'var(--hx-muted)' }}>· {id.subclass} {badgeFor(id.subclass)}</span>}
        {id.specialization && <span style={{ color: 'var(--hx-muted)' }}>· {id.specialization}</span>}
        {id.background && <span style={{ color: 'var(--hx-muted)' }}>· {id.background}</span>}
      </div>
    </div>
  );

  // ── Sticky in-sheet jump-nav (req 5) — the app's own `.jumpNavItem` pill idiom (each a bordered ◆ chip),
  //    so a long sheet is navigable without endless scrolling. Sits below the site header; sections carry a
  //    matching scroll-margin so an anchored jump lands with the heading visible. ─────────────────────────
  const nav = navItems.length > 2 && (
    // Sticky offsets mirror the PF2 sheet's `.pf2Nav` (top: 52 clears the /dnd site header; z-index 5
    // keeps the bar UNDER that header and any editor/picker modal). Near-opaque so section cards
    // scrolling beneath don't bleed through the pills.
    <nav aria-label="Jump to section"
      style={{ position: 'sticky', top: 52, zIndex: 5, display: 'flex', flexWrap: 'wrap', gap: 6, padding: '8px 10px', border: '1px solid var(--hx-line)', borderRadius: 8, background: 'rgba(9,20,40,0.94)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)' }}>
      {navItems.map((n) => <a key={n.id} href={`#${n.id}`} className={styles.jumpNavItem}>{n.label}</a>)}
    </nav>
  );

  // ── The refusal banner — the gate's own words, not a generic failure. Dismissible, because it describes
  //    the LAST action rather than the state of the sheet. ────────────────────────────────────────────────
  const banner = refusal ? (
    <div
      role="status"
      style={{
        display: 'flex', alignItems: 'flex-start', gap: 8, padding: '9px 11px', borderRadius: 8,
        border: '1px solid var(--hx-line)', background: 'rgba(220,120,120,0.09)',
        fontSize: 13.5, fontWeight: 500, color: 'var(--hx-text)',
      }}
    >
      <span aria-hidden style={{ color: 'var(--hx-gold-2)' }}>⚑</span>
      <span style={{ flex: 1 }}>{refusal}</span>
      <button
        type="button" onClick={() => setRefusal(null)} aria-label="Dismiss"
        style={{ background: 'none', border: 'none', color: 'var(--hx-muted)', cursor: 'pointer', fontSize: 13, lineHeight: 1, padding: 0 }}
      >×</button>
    </div>
  ) : null;

  // ── The animated dice roller (RO-5) — the SAME Dice Core / Sigil Stack / Roll Board / Impact stages the
  //    5e sheet uses, fed by IG's own rolls through the shared RollFeed, with the on-roller template picker.
  //    Wrapped in `.dnd-sheet` so the stages' `.dnd-sheet`-scoped CSS (Dice Core, Sigil) resolves; the shell
  //    theme tokens are inherited from the IG sheet root. Tapping a save/skill/attack lands here, animated. ──
  const rollerId = resolveRollerTemplate(rollerTemplate, layout);
  const roller = (
    <RollFeedProvider value={{ activeRoll, commitRoll: noopCommit, rollerAnim }}>
      <div className="dnd-sheet" style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
        <RollerTemplateBar characterId={characterId} current={rollerId} canWrite={!!canEdit} />
        {rollerStageFor(rollerId)}
      </div>
    </RollFeedProvider>
  );

  // ── The editor + picker modals (IG-S2 / IG-S3). The shell mounts these wherever the format wants; the
  //    greying inside the picker is feedback timing — ig-edit re-derives the variant + DM flag server-side
  //    and remains the enforcement point. ────────────────────────────────────────────────────────────────
  const overlays = (
    <>
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
          onAdd={(edit) => { setPicker(null); void postEdits([edit]); }}
        />
      )}
    </>
  );

  return { panels, header, nav, banner, roller, overlays };
}

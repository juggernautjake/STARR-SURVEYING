// app/dnd/_ui/pf2/usePf2Panels.tsx — the Pathfinder 2e system's PANEL SET (T-5a).
//
// The multi-format architecture (see docs/planning/…/SHEET_TEMPLATES_MULTI_FORMAT) is
// "FORMAT = shell, SYSTEM = panels": a system exposes an ordered list of named content blocks, and
// each format (Classic tabs, Codex panes, Dashboard cards, Play) merely ARRANGES that one list.
//
// This hook is the PF2 panel set. It owns every piece of shared state the bespoke `PF2Sheet` used to
// compute inline — the ONE resolution (`pf2ResolveAll` → `.total` read by both card and roll), the
// in-app roller, the pickers/editors, the multiple-attack-penalty strike index, the refusal banner —
// and returns:
//   • `panels`  — the ordered, gated `SheetPanel[]` (attributes, defenses, conditions, skills,
//                 strikes, feats, spells), each `render` a closure over this hook's state.
//   • `header` / `nav` / `banner` / `roller` — the surrounding furniture.
//   • `overlays` — the picker/armor/weapon/element modals.
//   • `footer` — the senses/languages line.
// The default Classic shell (`PF2Sheet`) lays these out to reproduce the previous DOM exactly; later
// slices feed the SAME `panels` into the Codex/Dashboard/Play shells. Preserving the one-resolution
// rule is the whole point: there is no second computation for anything.
'use client';

import { useState, useRef, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import OffRulesMark from '@/app/dnd/_sheet/components/ui/OffRulesMark';
import PF2ContentPicker from '../PF2ContentPicker';
import PF2ElementEditor, { type PF2EditableElement } from '../PF2ElementEditor';
import PF2WeaponEditor, { type PF2EditableWeapon } from '../PF2WeaponEditor';
import PF2ArmorEditor from '../PF2ArmorEditor';
import styles from '../hextech.module.css';
import type { PF2Character, PF2ActionCost } from '@/lib/dnd/systems/pathfinder2e/model';
import { PF2_ATTRIBUTES, PF2_SAVES } from '@/lib/dnd/systems/pathfinder2e/model';
import { pf2Proficiency, pf2MaxHp } from '@/lib/dnd/systems/pathfinder2e/rules';
import {
  pf2ResolveAll, pf2ResolveSkill, pf2ResolveStrikeInPlay,
  type PF2ResolvedStat,
} from '@/lib/dnd/systems/pathfinder2e/resolve';
import { resolveD20Roll, rollNaturalD20, rollDiceExpr, degreeLabel } from '@/lib/dnd/roll';
import { pf2ConditionMechanics } from '@/lib/dnd/conditions/pathfinder2e';
import InfoTip from '@/app/dnd/_sheet/components/InfoTip';
import type { ActiveRoll } from '@/app/dnd/_sheet/state/store';
import { RollFeedProvider } from '@/app/dnd/_sheet/components/rollers/rollFeed';
import { buildD20ActiveRoll, buildDamageActiveRoll } from '@/app/dnd/_sheet/components/rollers/rollFeedBuild';
import { rollerStageFor } from '@/app/dnd/_sheet/components/rollers/rollerFor';
import RollerTemplateBar from '@/app/dnd/_sheet/components/rollers/RollerTemplateBar';
import DicePad from '@/app/dnd/_sheet/components/rollers/DicePad';
import SectionsManager from '@/app/dnd/_sheet/components/SectionsManager';
import { normalizeCustomSections, type CustomSection } from '@/lib/dnd/custom-sections';
import { resolveRollerTemplate, type RollerTemplateId } from '@/lib/dnd/roller-templates';
// The 5e panel set's shape, reused so all four systems speak one `SheetPanel` vocabulary. Type-only,
// so nothing from the store-coupled 5e module is pulled into this prop-driven PF2 code at runtime.
import type { SheetPanel } from '@/app/dnd/_sheet/panels/fivePanels';

export type { SheetPanel };

const fmt = (n: number) => (n >= 0 ? `+${n}` : `${n}`);
const RANK_ABBR: Record<string, string> = { untrained: 'U', trained: 'T', expert: 'E', master: 'M', legendary: 'L' };

function Stat({ label, value, sub, title, accent, onRoll }: { label: string; value: string; sub?: string; title?: string; accent?: boolean; onRoll?: () => void }) {
  const cls = accent ? `${styles.pf2Stat} ${styles.pf2StatAccent}` : styles.pf2Stat;
  // `title` carries the resolved breakdown, so hovering a headline number answers "why is it this?" without
  // a click — the same "show its work" contract the roller honours. `accent` lifts AC + HP (the two
  // most-checked numbers) out of the strip with a gold hairline. `onRoll` (AO-3) makes a d20 stat like
  // Perception / Initiative click-to-roll like the saves/skills/Strikes; a DC (Class DC) has no onRoll.
  if (onRoll) {
    return (
      <div
        title={title} role="button" tabIndex={0} className={cls} style={{ cursor: 'pointer' }}
        onClick={onRoll}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onRoll(); } }}
      >
        <span className={styles.pf2StatKey}>{label}</span>
        <strong className={styles.pf2StatVal}>{value}</strong>
        {sub && <span className={styles.pf2StatSub}>{sub}</span>}
      </div>
    );
  }
  return (
    <div title={title} className={cls}>
      <span className={styles.pf2StatKey}>{label}</span>
      <strong className={styles.pf2StatVal}>{value}</strong>
      {sub && <span className={styles.pf2StatSub}>{sub}</span>}
    </div>
  );
}

function RankPill({ rank }: { rank: string }) {
  // The U/T/E/M/L proficiency badge. Moved off inline styles onto `.pf2Rank*` so it reads as a solid,
  // filled chip (trained = teal, untrained = muted) instead of a stray 10.5px letter.
  const trained = rank !== 'untrained';
  return <span title={rank} className={`${styles.pf2Rank} ${trained ? styles.pf2RankTrained : styles.pf2RankUntrained}`}>{RANK_ABBR[rank] ?? '?'}</span>;
}

/** The PF2 three-action-economy cost glyphs. An activity's cost is the single fact a player reads
 *  most in a turn, so it gets the game's own iconography (◆ / ◆◆ / ◆◆◆ / ↺ / ⬦) rather than being
 *  buried in prose. Reaction and free are teal — distinct from the gold 1–3-action costs — and every
 *  glyph carries a title + aria-label so the icon-only cell is not opaque to a screen reader. */
const ACTION_GLYPH: Record<string, { glyph: string; label: string; special?: boolean }> = {
  '1': { glyph: '◆', label: '1 action' },
  '2': { glyph: '◆◆', label: '2 actions' },
  '3': { glyph: '◆◆◆', label: '3 actions' },
  reaction: { glyph: '↺', label: 'reaction', special: true },
  free: { glyph: '⬦', label: 'free action', special: true },
};
function ActionCost({ cost }: { cost?: PF2ActionCost }) {
  if (cost == null) return null;
  const a = ACTION_GLYPH[String(cost)];
  if (!a) return null;
  return (
    <span className={a.special ? `${styles.pf2Cost} ${styles.pf2CostSpecial}` : styles.pf2Cost} title={a.label} aria-label={a.label}>{a.glyph}</span>
  );
}

/** A section heading: TITLE — gold hairline — right-aligned controls, on one line. Replaces the
 *  ad-hoc `<div style={label}>` + button rows so every section is introduced the same way, which is
 *  what lets a player scan the sheet by its headings. */
function SectionHead({ title, note, children }: { title: React.ReactNode; note?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className={styles.pf2SectionHead}>
      <span className={styles.pf2SectionTitle}>{title}{note ? <span className={styles.pf2SectionNote}> {note}</span> : null}</span>
      <span className={styles.pf2SectionRule} />
      {children}
    </div>
  );
}

export interface UsePf2PanelsArgs {
  pf2: PF2Character;
  characterId?: string;
  canEdit?: boolean;
  isDM?: boolean;
  /** Vanilla characters are held to class and level; custom ones are flagged, not blocked. Defaults
   *  to vanilla — the safe direction, matching the server. */
  variantKind?: 'vanilla' | 'custom';
  /** The chosen roller template + animation pref + layout, so PF2 mounts the SAME animated dice roller
   *  the 5e sheet does (RO-5). */
  rollerTemplate?: string;
  rollerAnim?: boolean;
  layout?: string;
  /** Player-authored custom sections (`data.customSections`, D-13), surfaced as a "Custom" panel and
   *  persisted via the `/sections` route. */
  customSections?: CustomSection[];
}

export interface Pf2PanelSet {
  /** The ordered, module- and data-gated section list a format shell arranges. */
  panels: SheetPanel[];
  /** Name / level / size / system badge + the ancestry·background·class line. */
  header: React.ReactNode;
  /** The in-sheet jump index — one tap per rendered section. */
  nav: React.ReactNode;
  /** A refused edit, surfaced where the player will see it (or null). */
  banner: React.ReactNode;
  /** Target-DC control + the last-roll result banner. */
  roller: React.ReactNode;
  /** The picker / armor / weapon / element modals (rendered when open). */
  overlays: React.ReactNode;
  /** The senses + languages footnote. */
  footer: React.ReactNode;
}

/**
 * The PF2 panel set for THIS character. Owns all shared state and returns everything a format shell
 * needs to render the sheet. The Classic shell reproduces the previous `PF2Sheet` DOM exactly.
 */
export function usePf2Panels({ pf2, characterId, canEdit, isDM, variantKind = 'vanilla', rollerTemplate, rollerAnim, layout, customSections }: UsePf2PanelsArgs): Pf2PanelSet {
  const router = useRouter();
  const customSecs = useMemo(() => normalizeCustomSections(customSections), [customSections]);
  // ONE resolution for every headline number (S13b). The card and the roll both read `.total` from
  // this, which is the whole point: the sheet used to display `pf2SaveTotal` and roll that number
  // PLUS a condition penalty applied at the call site, so a Frightened character's card and dice
  // disagreed. Two places that each remember to apply conditions will eventually forget; one place
  // cannot.
  const d = pf2ResolveAll(pf2);
  const maxHp = pf2MaxHp(pf2);
  const id = pf2.identity;
  const [saving, setSaving] = useState(false);

  // An incremental in-place edit (R4) — POST one structured op to the write-gated pf2-edit route, then refresh
  // the server component so the new numbers render. Only wired when the viewer can edit + we have a character id.
  /** The gate's refusal, surfaced to the player (S15).
   *
   *  Every failure here used to be swallowed: `postEdit` awaited the fetch and ignored its
   *  response entirely, so a 400 and a 200 were indistinguishable. `gatePf2Edit` composes a
   *  genuinely useful sentence — it names the reason AND both ways forward ("build a custom one,
   *  or have the DM grant it") — and it was being thrown away. An unchanged sheet is
   *  indistinguishable from a slow one, so a refused edit read as the app ignoring you. Exactly
   *  the bug IG-S2 closed on its own sheet; same fix, deliberately. */
  const [refusal, setRefusal] = useState<string | null>(null);

  const postEdit = async (edit: Record<string, unknown>) => {
    if (!characterId || saving) return;
    setSaving(true);
    setRefusal(null);
    try {
      const res = await fetch(`/api/dnd/characters/${characterId}/pf2-edit`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(edit),
      });
      if (res.ok) {
        router.refresh();
      } else {
        const body = await res.json().catch(() => null) as { error?: string } | null;
        setRefusal(body?.error || 'That edit was refused.');
      }
    } catch {
      setRefusal('Could not reach the server. Try again.');
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
  const [armorOpen, setArmorOpen] = useState(false);

  // In-app roller (R1b) — tap a save/skill/strike to roll a d20 + modifier, or a strike's damage, through the
  // shared engine; result shows in the banner. RNG (auto mode); PF2 uses the four-step degree ladder once a DC
  // is supplied (a target-DC field is a later slice).
  const [lastRoll, setLastRoll] = useState<{ label: string; total: number; detail: string; tone: 'crit' | 'fumble' | 'normal' } | null>(null);
  // The animated dice roller (RO-5): PF2 PUBLISHES each roll into the shared RollFeed as an `ActiveRoll`,
  // so the same Dice Core / Sigil Stack / Roll Board / Impact stages (with animations + sounds) render it.
  const [activeRoll, setActiveRoll] = useState<ActiveRoll | null>(null);
  const rollTokenRef = useRef(0);
  const noopCommit = useCallback(() => {}, []);
  // Optional target DC — when set, a roll resolves PF2's four-step degree of success.
  const [targetDc, setTargetDc] = useState('');
  // Which Strike of the turn the Strikes block is showing: 0 = first, 1 = second, 2 = third or
  // later. Drives the multiple attack penalty.
  const [strikeIndex, setStrikeIndex] = useState(0);
  // Roll a RESOLVED statistic. It takes the `PF2ResolvedStat` rather than a bare number so the
  // roller cannot apply a condition the card did not, or vice versa — the modifier it rolls is by
  // construction the modifier the card printed. Conditions are already folded into `.total`.
  const rollLine = (name: string, stat: PF2ResolvedStat) => {
    const dcNum = targetDc.trim() === '' ? undefined : Number(targetDc);
    const dc = Number.isFinite(dcNum) ? dcNum : undefined;
    const r = resolveD20Roll({ natural: rollNaturalD20(), modifier: stat.total, dc, system: 'pathfinder2e' });
    const sign = r.modifier >= 0 ? `+ ${r.modifier}` : `− ${Math.abs(r.modifier)}`;
    let detail = `d20 [${r.natural}] ${sign}`;
    let tone: 'crit' | 'fumble' | 'normal' = r.critical ? 'crit' : r.fumble ? 'fumble' : 'normal';
    if (r.degree && r.dc != null) {
      detail += ` · vs DC ${r.dc} → ${degreeLabel(r.degree)}`;
      if (r.degree === 'critical-success') tone = 'crit';
      else if (r.degree === 'critical-failure') tone = 'fumble';
    }
    detail += `${r.critical ? ' · NAT 20' : ''}${r.fumble ? ' · NAT 1' : ''}`;
    // The roller shows its work — every source that contributed, named. A suppressed same-type
    // bonus is called out too, because "why isn't my +1 counting?" is PF2's most common maths
    // question and the answer (a bigger bonus of the same type won) is a rule, not a bug.
    detail += ` · ${stat.breakdown}`;
    if (stat.suppressed.length) {
      detail += ` · suppressed: ${stat.suppressed.map((m) => `+${m.value} ${m.source} (${m.type})`).join(', ')}`;
    }
    if (stat.conditional.length) {
      detail += ` · situational: ${stat.conditional.map((m) => `+${m.value} ${m.source} vs ${m.when}`).join('; ')}`;
    }
    setLastRoll({ label: name, total: r.total, detail, tone });
    // Publish to the animated roller via the shared (unit-tested) builder — a straight d20 (PF2 folds
    // adv/dis into the modifier), crit/fumble from a nat 20/1 OR the four-step degree.
    // The named contributing modifiers (AO-2): pass them as boosts/penalties so the animated stage ALWAYS
    // shows the full breakdown — not just when there's no DC. Without this, setting a Target DC replaced the
    // modifier breakdown in the tag with the degree, hiding "where did this +N come from".
    const boosts = stat.applied.filter((m) => m.value > 0).map((m) => `+${m.value} ${m.source}`);
    const penalties = stat.applied.filter((m) => m.value < 0).map((m) => `−${Math.abs(m.value)} ${m.source}`);
    setActiveRoll(buildD20ActiveRoll({
      token: ++rollTokenRef.current, label: name, natural: r.natural, total: r.total, modifier: r.modifier,
      crit: r.critical || r.degree === 'critical-success',
      fumble: r.fumble || r.degree === 'critical-failure',
      tag: r.degree && r.dc != null ? `vs DC ${r.dc} → ${degreeLabel(r.degree)}` : stat.breakdown,
      boosts: boosts.length ? boosts : undefined,
      penalties: penalties.length ? penalties : undefined,
    }));
  };
  const rollDamage = (name: string, expr: string) => {
    const r = rollDiceExpr(expr);
    setLastRoll({ label: name, total: r.total, detail: r.breakdown, tone: 'normal' });
    setActiveRoll(buildDamageActiveRoll({ token: ++rollTokenRef.current, label: name, total: r.total, breakdown: r.breakdown }));
  };

  const idBits = [id.ancestry && `${id.heritage ? id.heritage + ' ' : ''}${id.ancestry}`, id.background, id.className && `${id.className}${id.subclass ? ` (${id.subclass})` : ''}`, id.deity].filter(Boolean);

  // Whether the two long sections render at all decides whether their jump-link appears — a link to a
  // Strikes block a Fighterless character doesn't have would scroll to nothing.
  const showStrikes = pf2.attacks.length > 0 || canDoEdit;
  const showSpells = pf2.spellcasting.kind !== 'none';
  const showFeats = pf2.feats.length > 0 || canDoEdit;
  const hasConditions = (pf2.combat.conditions ?? []).length > 0;
  // The spells section renders for any caster (so the summary shows even before spells are added) OR
  // whenever there are spells — a non-caster who somehow holds spells still sees them.
  const spellsPresent = (pf2.spellcasting.spells?.length ?? 0) > 0;
  // The in-sheet section index. Scrolls the target into view and REPLACES the hash (never pushes),
  // so Back leaves the page in one press instead of walking every jump — the same contract JumpNav
  // established platform-wide (Slice 37).
  const navItems: { id: string; label: string }[] = [
    { id: 'pf2-attributes', label: 'Attributes' },
    { id: 'pf2-defenses', label: 'Defenses' },
    ...(hasConditions ? [{ id: 'pf2-conditions', label: 'Conditions' }] : []),
    { id: 'pf2-skills', label: 'Skills' },
    ...(showStrikes ? [{ id: 'pf2-strikes', label: 'Strikes' }] : []),
    ...(showFeats ? [{ id: 'pf2-feats', label: 'Feats' }] : []),
    ...(showSpells ? [{ id: 'pf2-spells', label: 'Spells' }] : []),
  ];
  const jump = (e: React.MouseEvent, anchor: string) => {
    e.preventDefault();
    const el = typeof document !== 'undefined' ? document.getElementById(anchor) : null;
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      if (typeof history !== 'undefined') history.replaceState(null, '', `#${anchor}`);
    }
  };

  // ── Furniture ─────────────────────────────────────────────────────────────────────────────────
  const header = (
    <>
      {/* Header. This is intentionally the FIRST child in flow (not absolutely pinned), so a panel can
          later be mounted as a sibling ABOVE the stat block without fighting a pin. */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <strong style={{ fontFamily: 'var(--hx-font-display)', fontSize: 22, fontWeight: 700, color: 'var(--hx-gold-3)' }}>{id.name || 'Unnamed'}</strong>
        <span style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--hx-muted)' }}>Level {id.level} · {id.size}</span>
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.07em', color: 'var(--hx-teal-1)', border: '1px solid var(--hx-teal-1)', borderRadius: 5, padding: '1px 6px', background: 'rgba(10,200,185,0.08)' }}>PATHFINDER 2e</span>
      </div>
      {idBits.length > 0 && <div style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--hx-text)', marginTop: -8 }}>{idBits.join(' · ')}</div>}
    </>
  );

  const nav = (
    // Sticky section index — a PF2 sheet is long, so the jump bar keeps every section one tap away
    // on a phone. Uses the platform's ◆-bulleted jump pills for a consistent idiom.
    <nav className={styles.pf2Nav} aria-label="Jump to a section">
      {navItems.map((i) => (
        <a key={i.id} href={`#${i.id}`} onClick={(e) => jump(e, i.id)} className={styles.jumpNavItem}>{i.label}</a>
      ))}
    </nav>
  );

  const banner = refusal ? (
    // A refused edit says so, and says what to do about it. Dismissible rather than auto-clearing:
    // the sentence names two courses of action and the player needs time to read it, not a toast
    // that vanishes while they are still deciding.
    <div role="alert" style={{ display: 'flex', alignItems: 'flex-start', gap: 8, border: '1px solid var(--hx-danger, #b4453c)', background: 'rgba(180,69,60,0.12)', borderRadius: 8, padding: '8px 12px' }}>
      <span style={{ fontSize: 13 }}>⚠</span>
      <span style={{ flex: 1, fontSize: 13, color: 'var(--hx-text)' }}>{refusal}</span>
      <button className="btn tiny" onClick={() => setRefusal(null)} aria-label="Dismiss">✕</button>
    </div>
  ) : null;

  // ── The animated dice roller (RO-5) — the SAME Dice Core / Sigil Stack / Roll Board / Impact stages the
  //    5e sheet uses, fed by PF2's own rolls through the shared RollFeed, with the on-roller template picker.
  //    The Target-DC input (sets the four-step degree) stays on top; wrapped in `.dnd-sheet` so the stages'
  //    scoped CSS resolves (the shell theme tokens are inherited from the PF2 sheet root). ──────────────────
  // Local state so switching templates on the roller is INSTANT (no page reload); the choice persists in the
  // background via the picker's /roller POST.
  const [rollerId, setRollerId] = useState<RollerTemplateId>(resolveRollerTemplate(rollerTemplate, layout));
  const roller = (
    <RollFeedProvider value={{ activeRoll, commitRoll: noopCommit, rollerAnim, rollDice: (sides, n) => rollDamage(`${n}d${sides}`, `${n}d${sides}`) }}>
      <div className="dnd-sheet" style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
        <label style={{ fontSize: 13, fontWeight: 500, color: 'var(--hx-muted)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          🎲 Target DC
          <input type="number" value={targetDc} onChange={(e) => setTargetDc(e.target.value)} placeholder="—"
            style={{ width: 56, fontSize: 14, fontWeight: 600, padding: '4px 6px', background: 'var(--hx-inset-strong)', color: 'var(--hx-text)', border: '1px solid var(--hx-line)', borderRadius: 5 }} />
        </label>
        <RollerTemplateBar characterId={characterId} current={rollerId} canWrite={!!canEdit} onPick={setRollerId} />
        {rollerStageFor(rollerId)}
        {/* The manual dice pad (d4–d100 + count), on EVERY template (owner) — the chosen template animates it. */}
        <DicePad />
      </div>
    </RollFeedProvider>
  );

  const overlays = (
    <>
      {picker && (
        <PF2ContentPicker
          pf2={pf2} kind={picker} isDM={isDM} variantKind={variantKind}
          onClose={() => setPicker(null)}
          // The server re-checks through gatePf2Edit regardless of what this sends — the picker's
          // greying is for feedback timing, never the enforcement point.
          onAdd={(edit) => { setPicker(null); void postEdit(edit); }}
        />
      )}

      {armorOpen && (
        <PF2ArmorEditor
          pf2={pf2}
          onClose={() => setArmorOpen(false)}
          onSave={(edit) => { setArmorOpen(false); void postEdit(edit); }}
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
    </>
  );

  const footer = (
    <div style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--hx-muted)', lineHeight: 1.5 }}>
      {pf2.senses && pf2.senses.length > 0 && <>Senses: {pf2.senses.join(', ')}. </>}
      Languages: {pf2.languages.join(', ') || '—'}. All numbers derived by the PF2 rules engine (proficiency = rank bonus + level when trained).
    </div>
  );

  // ── Panels ────────────────────────────────────────────────────────────────────────────────────
  const gated: (SheetPanel & { show: boolean })[] = [
    {
      id: 'pf2-attributes', label: 'Attributes', emoji: '⬡', show: true,
      render: () => (
        <>
          <SectionHead title="Attributes" />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 8 }}>
            {PF2_ATTRIBUTES.map((k) => (
              <div key={k} className={styles.pf2AttrCell}>
                <div className={styles.pf2AttrKey}>{k}</div>
                <strong className={styles.pf2AttrVal}>{fmt(pf2.attributes[k])}</strong>
                {canDoEdit && (
                  // Edit the attribute MODIFIER in place (R4) — commits set_attribute on Enter/blur; re-keyed to
                  // reset after the sheet refreshes. PF2 tracks modifiers, so the input IS the modifier.
                  <input key={`${k}-${pf2.attributes[k]}`} type="number" min={-5} max={12} defaultValue={pf2.attributes[k]} disabled={saving} aria-label={`Set ${k}`}
                    onKeyDown={(ev) => { if (ev.key === 'Enter') (ev.target as HTMLInputElement).blur(); }}
                    onBlur={(ev) => { const v = parseInt(ev.target.value, 10); if (Number.isFinite(v) && v !== pf2.attributes[k]) postEdit({ op: 'set_attribute', attribute: k, value: v }); }}
                    className={styles.pf2AttrInput} />
                )}
              </div>
            ))}
          </div>
        </>
      ),
    },
    {
      // Defenses & vitals — the numbers a player reaches for every round, gathered into one scannable
      // strip (AC, HP, Perception/Initiative, Speed, the DCs) with the three saving throws directly
      // beneath. AC and HP are accented so the two most-checked numbers stand out; every headline
      // carries its resolved breakdown on hover, and each save is tap-to-roll (R1b).
      id: 'pf2-defenses', label: 'Defenses', emoji: '❤', show: true,
      render: () => (
        <>
          <SectionHead title="Defenses & Vitals" />
          <div className={styles.pf2StatStrip}>
            {/* AC is clickable for an editor — armor is the one headline stat with no other way to
                change it, and it was previously settable only at build time. */}
            {canDoEdit ? (
              <button
                type="button" onClick={() => setArmorOpen(true)} disabled={saving}
                title="Edit armor"
                style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
              >
                <Stat label="AC ✎" value={`${d.ac.total}`} sub={pf2.combat.armorName && pf2.combat.armorName !== 'Unarmored' ? pf2.combat.armorName : undefined} title={d.ac.breakdown} accent />
              </button>
            ) : (
              <Stat label="AC" value={`${d.ac.total}`} sub={pf2.combat.armorName && pf2.combat.armorName !== 'Unarmored' ? pf2.combat.armorName : undefined} title={d.ac.breakdown} accent />
            )}
            <Stat label="HP" value={`${pf2.combat.currentHp || maxHp}/${maxHp}`} sub={pf2.combat.tempHp ? `+${pf2.combat.tempHp} temp` : undefined} accent />
            {/* Perception + Initiative are d20 rolls (initiative IS Perception by default), so both are
                click-to-roll like the saves/skills/Strikes (AO-3). */}
            <Stat label="Perception" value={fmt(d.perception.total)} sub={pf2.perception.rank} title={`Roll Perception (d20 ${fmt(d.perception.total)})\n${d.perception.breakdown}`} onRoll={() => rollLine('Perception', d.perception)} />
            <Stat label="Initiative" value={fmt(d.perception.total)} sub="Perception" title={`Roll Initiative (Perception, d20 ${fmt(d.perception.total)})\n${d.perception.breakdown}`} onRoll={() => rollLine('Initiative', d.perception)} />
            <Stat label="Speed" value={`${pf2.combat.speed} ft`} />
            <Stat label="Class DC" value={`${d.classDc.total}`} sub={pf2.combat.classDcAttribute} title={d.classDc.breakdown} />
            {d.spellDc && <Stat label="Spell DC" value={`${d.spellDc.total}`} sub={`atk ${fmt(d.spellAttack?.total ?? 0)} · ${pf2.spellcasting.tradition}`} title={d.spellDc.breakdown} />}
          </div>

          {/* Saving throws — tap to roll (R1b), directly under the defenses they belong with. */}
          <div style={{ marginTop: 12 }}>
            <div className={styles.pf2RollRow}>
              {PF2_SAVES.map((s) => {
                // The displayed number IS the rolled number — both are `stat.total`. This was the
                // "card says +7, rolls +5" bug: conditions were applied on the roll path only.
                const stat = d.saves[s];
                return (
                  <button key={s} type="button" onClick={() => rollLine(`${s} save`, stat)} title={`Roll ${s} (d20 ${fmt(stat.total)})\n${stat.breakdown}`} className={styles.pf2Chip}>
                    <span className={styles.pf2ChipKey}>{s} 🎲</span>
                    <strong className={styles.pf2ChipVal}>{fmt(stat.total)}</strong>
                    <RankPill rank={pf2.saves[s].rank} />
                  </button>
                );
              })}
            </div>
            {/* Spell out the U/T/E/M/L shorthand once — it rides on every save, skill and defence. */}
            <div className={styles.pf2RankLegend} style={{ marginTop: 8 }}>
              <span><b>U</b> untrained</span><span><b>T</b> trained</span><span><b>E</b> expert</span><span><b>M</b> master</span><span><b>L</b> legendary</span>
            </div>
          </div>
        </>
      ),
    },
    {
      // Active conditions (Area R2 — PF2). Shown so the player sees what's folding into their rolls; the
      // penalties apply automatically under PF2's non-stacking rule. Set/cleared via the AI edit tool.
      id: 'pf2-conditions', label: 'Conditions', emoji: '⚠', show: hasConditions,
      render: () => (
        <>
          <SectionHead title="Conditions" note="· folded into rolls (worst status + worst circumstance) · hover or tap ⓘ" />
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {(pf2.combat.conditions ?? []).map((c) => {
              const note = pf2ConditionMechanics(c.name)?.note ?? '';
              return (
                <span key={c.name} title={note} className={styles.pf2Cond}>
                  {c.name}{c.value && c.value > 1 ? ` ${c.value}` : ''}
                  {note && <InfoTip tip={note} label={`${c.name} rules`} />}
                </span>
              );
            })}
          </div>
        </>
      ),
    },
    {
      id: 'pf2-skills', label: 'Skills', emoji: '◇', show: true, count: pf2.skills.length,
      render: () => (
        <>
          <SectionHead title="Skills" note={pf2.combat.armorCheckPenalty ? `· armor check penalty ${pf2.combat.armorCheckPenalty} on ▲ skills` : undefined} />
          <div className={styles.pf2SkillGrid}>
            {pf2.skills.map((sk) => {
              const penalized = !!sk.armorPenalty && !!pf2.combat.armorCheckPenalty;
              const stat = pf2ResolveSkill(sk, pf2);
              const total = stat.total;
              return (
                <button key={sk.name} type="button" onClick={() => rollLine(`${sk.name} (${sk.attribute})`, stat)} title={`Roll ${sk.name} (d20 ${fmt(total)})\n${stat.breakdown}`}
                  className={`${styles.pf2SkillChip}${sk.rank === 'untrained' ? ` ${styles.pf2SkillUntrained}` : ''}`}>
                  <span className={styles.pf2SkillName}>{sk.name}{penalized ? <span title="armor check penalty applies" style={{ color: 'var(--hx-gold-2)' }}> ▲</span> : null} <span className={styles.pf2SkillAttr}>{sk.attribute}</span></span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <strong className={styles.pf2SkillVal}>{fmt(total)} 🎲</strong>
                    <RankPill rank={sk.rank} />
                  </span>
                </button>
              );
            })}
          </div>
        </>
      ),
    },
    {
      // Strikes. Renders for an editor even with no weapons yet — otherwise a character who has
      // none can never add one, since the ＋ Weapon button lives inside this block.
      id: 'pf2-strikes', label: 'Strikes', emoji: '✦', show: showStrikes, count: pf2.attacks.length,
      render: () => (
        <>
          <SectionHead title="Strikes">
            {/* Which Strike of the turn this is. PF2's multiple attack penalty is −5/−10 (−4/−8 for
                an agile weapon) and caps after the third, and it is the single largest modifier a
                PF2 character deals with in a normal turn. Without this control the sheet could only
                ever show a first Strike, so the player had to do the game's most common subtraction
                in their head — and agile weapons make it a DIFFERENT subtraction per weapon. */}
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--hx-muted)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              Strike #
              <select
                value={strikeIndex} onChange={(e) => setStrikeIndex(Number(e.target.value))}
                aria-label="Which Strike of this turn"
                style={{ fontSize: 13, fontWeight: 500, padding: '3px 6px', background: 'var(--hx-inset-strong)', color: 'var(--hx-text)', border: '1px solid var(--hx-line)', borderRadius: 5 }}
              >
                <option value={0}>1st (no MAP)</option>
                <option value={1}>2nd (−5 / −4 agile)</option>
                <option value={2}>3rd+ (−10 / −8 agile)</option>
              </select>
            </label>
            {canDoEdit && (
              <button className="btn tiny" disabled={saving} onClick={() => setWeaponEditor('new')} title="Add or author a weapon">＋ Weapon</button>
            )}
          </SectionHead>
          <div style={{ display: 'grid', gap: 4 }}>
            {pf2.attacks.map((a) => {
              // One call resolves traits, runes, conditions AND the multiple attack penalty
              // (S13b). The MAP is the piece that was missing outright: `pf2Map` existed and was
              // tested, but nothing ever passed a strike index, so a Fighter's third attack of the
              // turn displayed and rolled ten points too high.
              const resolved = pf2ResolveStrikeInPlay(a, pf2, strikeIndex);
              const strike = resolved.strike;
              const bonus = resolved.total;
              return (
                <div key={a.id} className={styles.pf2StrikeRow}>
                  <span style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--hx-text)' }}>
                    {a.name}
                    {a.customized && <span title="Hand-customized — edited away from how it came." style={{ color: 'var(--hx-gold-2)' }}> ✎</span>}
                    {a.traits.length ? <span style={{ color: 'var(--hx-muted)', fontSize: 11.5, fontWeight: 500 }}> · {a.traits.join(', ')}</span> : null}
                  </span>
                  <span style={{ display: 'inline-flex', gap: 8, alignItems: 'baseline' }}>
                    {/* Tap the Strike bonus to roll the attack; tap the damage to roll its dice (R1b). */}
                    <button type="button" onClick={() => rollLine(`${a.name} Strike${strikeIndex ? ` (${strikeIndex + 1}${strikeIndex === 1 ? 'nd' : 'rd+'})` : ''}`, resolved)} title={`Roll ${a.name} Strike (d20 ${fmt(bonus)})\n${resolved.breakdown}`} className={`${styles.pf2RollBtn} ${styles.pf2RollBtnAtk}`}>{fmt(bonus)} 🎲</button>
                    <span style={{ color: 'var(--hx-muted)' }}>·</span>
                    <button
                      type="button" onClick={() => rollDamage(`${a.name} damage`, strike.damage)}
                      // The crit line is on the tooltip rather than always-visible: PF2 crits double
                      // the whole total and THEN add deadly/fatal dice, which is exactly the number
                      // a player is most likely to compute wrong by hand.
                      title={`Roll ${a.name} damage (${strike.damage})\nOn a critical hit: ${strike.critDamage}${strike.notes.length ? `\n${strike.notes.join('\n')}` : ''}`}
                      className={`${styles.pf2RollBtn} ${styles.pf2RollBtnDmg}`}
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
        </>
      ),
    },
    {
      id: 'pf2-feats', label: 'Feats', emoji: '✧', show: showFeats, count: pf2.feats.length,
      render: () => (
        <>
          <SectionHead title="Feats & Features">
            {canDoEdit && (
              <>
                <button className="btn tiny" disabled={saving} onClick={() => setPicker('feat')}>＋ Feat</button>
                <button className="btn tiny" disabled={saving} onClick={() => setEditor({ kind: 'feat' })} title="Author a homebrew feat">✎ New</button>
              </>
            )}
          </SectionHead>
          <div style={{ display: 'grid', gap: 5 }}>
            {pf2.feats.map((f) => (
              <div key={f.id} className={styles.pf2FeatCard}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  {/* The action-cost glyph leads the line: an activity's cost is the fact a player
                      reads most, so it reads at a glance instead of being buried in the body text. */}
                  <ActionCost cost={f.actionCost} />
                  <strong className={styles.pf2FeatName}>{f.name}</strong>
                  <span className={styles.pf2FeatMeta}>{f.track}{f.level ? ` · L${f.level}` : ''}</span>
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
                {f.body && <div className={styles.pf2FeatBody}>{f.body}</div>}
              </div>
            ))}
          </div>
        </>
      ),
    },
    {
      // Spellcasting. The summary (tradition, kind, attribute, DC proficiency) + slots-per-rank sit
      // directly ABOVE the spells that fill them. Grouped by rank, because that is how a PF2 caster
      // actually prepares and casts.
      id: 'pf2-spells', label: 'Spells', emoji: '✨', show: showSpells || spellsPresent, count: pf2.spellcasting.spells?.length,
      render: () => (
        <>
          <SectionHead title="Spellcasting">
            {/* Only offered to a caster — a Fighter has no use for a spell picker, and showing one
                would suggest they could cast. */}
            {canDoEdit && pf2.spellcasting.kind !== 'none' && (
              <>
                <button className="btn tiny" disabled={saving} onClick={() => setPicker('spell')}>＋ Spell</button>
                <button className="btn tiny" disabled={saving} onClick={() => setEditor({ kind: 'spell' })} title="Author a homebrew spell">✎ New</button>
              </>
            )}
          </SectionHead>
          {/* Summary + slot pills — the caster's "how I cast" line, then the slots per rank. */}
          {pf2.spellcasting.kind !== 'none' && (
            <div style={{ display: 'grid', gap: 8, marginBottom: 12 }}>
              <div style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--hx-muted)' }}>
                {pf2.spellcasting.tradition} {pf2.spellcasting.kind}, {pf2.spellcasting.attribute} · proficiency {fmt(pf2Proficiency(pf2.spellcasting.rank, id.level))} ({pf2.spellcasting.rank}).
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {pf2.spellcasting.slots.map((n, r) => (n > 0 ? (
                  <span key={r} className={styles.pf2SlotPill}>
                    {r === 0 ? 'Cantrips' : `Rank ${r}`}: <strong style={{ color: 'var(--hx-teal-1)', fontWeight: 700 }}>{n}</strong>
                  </span>
                ) : null))}
              </div>
            </div>
          )}
          <div style={{ display: 'grid', gap: 5 }}>
            {[...new Set((pf2.spellcasting.spells ?? []).map((s) => s.rank))].sort((a, b) => a - b).map((rank) => (
              <div key={rank}>
                <div className={styles.pf2SpellRankHead}>
                  {rank === 0 ? 'Cantrips' : `Rank ${rank}`}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
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
                      // Dim an unprepared spell for a prepared caster — it is on the sheet but not
                      // castable right now, and showing it identically would misinform.
                      className={`${styles.pf2SpellChip}${pf2.spellcasting.kind === 'prepared' && !s.prepared && !s.focus ? ` ${styles.pf2SpellDim}` : ''}`}
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
                          style={{ marginLeft: 6, fontSize: 11 }}
                        >✎</button>
                      )}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
      ),
    },
    {
      // Player-authored custom sections (D-13) — the SAME renderer + editor as 5e/IG, persisted via the
      // `/sections` route (PF2 has no live 5e store), buffered + saved by SectionsManager. Shown when the
      // owner can add them OR any already exist.
      id: 'pf2-custom', label: 'Custom', emoji: '✚', show: !!canEdit || customSecs.length > 0,
      render: () => (
        <>
          <SectionHead title="Custom Sections" />
          <SectionsManager characterId={characterId} initial={customSecs} canWrite={!!canEdit} />
        </>
      ),
    },
  ];

  const panels: SheetPanel[] = gated.filter((p) => p.show).map(({ show: _show, ...p }) => p);

  return { panels, header, nav, banner, roller, overlays, footer };
}

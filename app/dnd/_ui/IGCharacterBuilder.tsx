// app/dnd/_ui/IGCharacterBuilder.tsx — the Intuitive Games "build from vanilla" picker (IG builder Slice 7c).
//
// Pick an ancestry / class / subclass and any stances / powers / feats from the vanilla catalog (plus
// freeform weapons), see a live VANILLA vs CUSTOM count, and Build — which assembles the character server-
// side and persists it. Everything picked from the catalog is vanilla; a freeform/custom entry is flagged
// custom (allowed here, blocked only at submission in a vanilla-only campaign). AI-customize comes next.
'use client';

import React, { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from './hextech.module.css';
import IgBoostAllocator from './IgBoostAllocator';
import { igCatalog } from '@/lib/dnd/systems/intuitive-games/catalog';
import { igCreaturesByGroup, IG_BACKGROUND_DEFS, IG_CLASS_DETAILS, findIGClassDetail, igClassPowerEffect } from '@/lib/dnd/systems/intuitive-games/content';
import { igPowerEligibility } from '@/lib/dnd/systems/intuitive-games/eligibility';
import { igLevelBreakdown } from '@/lib/dnd/systems/intuitive-games/levelup';
import { igParentClasses, igSubclassesOf } from '@/lib/dnd/systems/intuitive-games/taxonomy';
import { classifyElement, type ElementKind } from '@/lib/dnd/provenance';

const ABILITY_KEYS = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'] as const;

/**
 * Every distinct option name of a kind, across all of that kind's catalog groups.
 *
 * DISTINCT is the operative word, and it is not a tidiness measure. Intuitive Games publishes
 * three feats — Armor Proficiency, Shield Proficiency and Weapon Training — on BOTH its general
 * and combat feat pages, with differently-worded effects (`feats.ts` records this, deliberately
 * preserving both as the site has them). Flattening the groups therefore yielded the same name
 * twice, which caused two real problems and one visible symptom:
 *
 *   · The chips were keyed by name, so React warned about duplicate keys and reserved the right
 *     to duplicate or omit either one. That was the symptom, and fixing it with a composite key
 *     would have silenced the warning while leaving the actual bug in place.
 *   · The actual bug: a character's `feats` is a bare `string[]`. Both chips store the SAME
 *     string, and selection is tested with `includes(name)` — so the two chips toggled in
 *     lockstep. The UI offered a choice between two things that the sheet cannot tell apart.
 *
 * Since storage is by name, exactly one takeable thing called "Armor Proficiency" exists, and
 * showing one chip is the only presentation that matches what selecting it actually does.
 *
 * KNOWN GAP, recorded rather than papered over: which of the two published effect texts applies
 * is a content question this UI cannot answer, and deduping here does not resolve it. Resolving
 * it properly means either reconciling the two entries in `feats.ts` or giving IG feats a
 * category-qualified identity in storage — a model change, not a rendering fix.
 */
function names(groups: ReturnType<typeof igCatalog>, kind: ElementKind): string[] {
  return Array.from(
    new Set(groups.filter((g) => g.kind === kind).flatMap((g) => g.entries.map((e) => e.name))),
  );
}

export default function IGCharacterBuilder({ characterId, initialName, aiConfigured, variantKind = 'vanilla', startOpen = false, layout = 'panel' }: { characterId: string; initialName: string; aiConfigured?: boolean;
  /** Vanilla builds are held to the class rules; custom ones may take anything (Area MV). Defaults
   *  to vanilla — the safe direction for an unlabelled sheet, matching the server. */
  variantKind?: 'vanilla' | 'custom';
  /** Open the builder expanded — the dedicated /builder wizard sets this since the build controls are the
   *  page's whole purpose there, while on the sheet the panel stays collapsed (secondary). */
  startOpen?: boolean;
  /** 'panel' (default) shows every field at once — the sheet-page builder. 'steps' walks the SAME fields one
   *  section at a time with Prev/Next for the guided /builder wizard (B15). Same state, picks, and POST. */
  layout?: 'panel' | 'steps' }) {
  const router = useRouter();
  const catalog = useMemo(() => igCatalog(), []);
  const ancestries = useMemo(() => names(catalog, 'ancestry'), [catalog]);
  // The class picker offers the four PARENT classes; the subclass picker is scoped to the chosen parent
  // (Area T1). `subclasses` (the full catalog list) is only the pre-selection fallback.
  const classes = useMemo(() => igParentClasses(), []);
  const subclasses = useMemo(() => names(catalog, 'subclass'), [catalog]);
  const stanceOpts = useMemo(() => names(catalog, 'stance'), [catalog]);
  const powerOpts = useMemo(() => names(catalog, 'power'), [catalog]);
  const featOpts = useMemo(() => names(catalog, 'feat'), [catalog]);
  const defPowerOpts = useMemo(() => names(catalog, 'defensive-power'), [catalog]);
  const weaponTypeOpts = useMemo(() => names(catalog, 'weapon-type'), [catalog]);
  const bestiary = useMemo(() => igCreaturesByGroup(), []);

  const [open, setOpen] = useState(startOpen);
  const [name, setName] = useState(initialName);
  const [ancestry, setAncestry] = useState('');
  const [className, setClassName] = useState('');
  const [subclass, setSubclass] = useState('');
  const [specialization, setSpecialization] = useState('');
  const [background, setBackground] = useState('');
  const [level, setLevel] = useState(1);
  const [istep, setIstep] = useState(0); // which foundation section is shown in 'steps' layout
  const [stances, setStances] = useState<string[]>([]);
  const [powers, setPowers] = useState<string[]>([]);
  const [feats, setFeats] = useState<string[]>([]);
  const [defensivePower, setDefensivePower] = useState('');
  const [weaponTypes, setWeaponTypes] = useState<string[]>([]);
  const [weaponsText, setWeaponsText] = useState('');
  const [abilities, setAbilities] = useState<Record<string, number>>({ STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 });
  const [companionType, setCompanionType] = useState('');
  const [companionName, setCompanionName] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiBusy, setAiBusy] = useState(false);

  const toggle = (set: React.Dispatch<React.SetStateAction<string[]>>, v: string) =>
    set((prev) => prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v]);

  // Live provenance count (pure classifier — matches what the server will compute).
  const preview = useMemo(() => {
    const els: { kind: ElementKind; name: string }[] = [];
    if (ancestry) els.push({ kind: 'ancestry', name: ancestry });
    if (className) els.push({ kind: 'class', name: className });
    if (subclass) els.push({ kind: 'subclass', name: subclass });
    stances.forEach((s) => els.push({ kind: 'stance', name: s }));
    powers.forEach((s) => els.push({ kind: 'power', name: s }));
    feats.forEach((s) => els.push({ kind: 'feat', name: s }));
    weaponTypes.forEach((s) => els.push({ kind: 'weapon-type', name: s }));
    if (defensivePower) els.push({ kind: 'defensive-power', name: defensivePower });
    if (companionType) els.push({ kind: 'creature-type', name: companionType });
    let vanilla = 0, custom = 0;
    for (const e of els) (classifyElement('intuitive-games', e.kind, e.name) === 'vanilla' ? vanilla++ : custom++);
    return { vanilla, custom, total: els.length };
  }, [ancestry, className, subclass, stances, powers, feats, weaponTypes, defensivePower, companionType]);

  async function build() {
    setBusy(true); setMsg(null);
    try {
      const weapons = weaponsText.split(',').map((s) => s.trim()).filter(Boolean);
      const r = await fetch(`/api/dnd/characters/${characterId}/ig-build`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ picks: { name, ancestry, className, subclass, specialization, background, level, abilities, stances, powers, feats, defensivePower, weaponTypes, weapons, companionType, companionName } }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setMsg(j.error ?? 'Could not build.'); return; }
      setMsg(`Built — ${j.summary.vanilla} vanilla, ${j.summary.custom} custom${j.summary.dmGranted ? `, ${j.summary.dmGranted} DM-granted` : ''}.`);
      router.refresh();
    } catch { setMsg('Network error — please try again.'); } finally { setBusy(false); }
  }

  async function aiBuild() {
    if (!aiPrompt.trim()) { setMsg('Describe the character you want the AI to build.'); return; }
    setAiBusy(true); setMsg(null);
    try {
      const r = await fetch(`/api/dnd/characters/${characterId}/ig-build/ai`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: aiPrompt }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setMsg(j.error ?? 'Could not build.'); return; }
      setMsg(`AI built — ${j.summary.vanilla} vanilla, ${j.summary.custom} custom${j.summary.custom ? ' (flagged for DM review)' : ''}.`);
      router.refresh();
    } catch { setMsg('Network error — please try again.'); } finally { setAiBusy(false); }
  }

  const input = { padding: '7px 9px', fontSize: 13, background: 'rgba(1,10,19,0.55)', border: '1px solid var(--hx-line)', color: 'var(--hx-text)', borderRadius: 6 } as const;
  // `reasonFor` makes a chip list eligibility-aware (Area MV). Without it the builder offered every
  // power in the game and the server refused the save — correct, but the player only found out at
  // the end. Ineligible chips are shown greyed WITH their reason rather than hidden: "why can't I
  // take this?" is a question the builder should answer, and hiding it makes the list look
  // arbitrary. Same treatment as the 5e spell/feat pickers.
  const Chips = ({ opts, sel, on, reasonFor }: {
    opts: string[]; sel: string[]; on: (v: string) => void;
    reasonFor?: (o: string) => string | undefined;
  }) => (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
      {opts.map((o) => {
        const active = sel.includes(o);
        // An already-selected chip is never blocked, so a pick made before the class was set (or
        // one a DM granted) can always be removed again. Blocking deselection would strand it.
        const reason = active ? undefined : reasonFor?.(o);
        const blocked = !!reason;
        return (
          <button
            key={o} type="button"
            onClick={() => { if (!blocked) on(o); }}
            disabled={blocked}
            title={blocked ? `${reason} — pick a different class, or build a custom character to take it anyway.` : o}
            style={{
              fontSize: 11.5, padding: '3px 8px', borderRadius: 12,
              cursor: blocked ? 'not-allowed' : 'pointer',
              border: `1px solid ${active ? 'var(--hx-teal-1)' : 'var(--hx-line)'}`,
              background: active ? 'rgba(10,200,185,0.15)' : 'transparent',
              color: active ? 'var(--hx-teal-1)' : 'var(--hx-muted)',
              opacity: blocked ? 0.4 : 1,
              textDecoration: blocked ? 'line-through' : 'none',
            }}
          >{o}</button>
        );
      })}
    </div>
  );

  // B2: what the chosen class/subclass grants, from the captured A10 data. Prefer the subclass (more
  // granular — its own stance/powers), else the parent class. Undefined for a name we have no detail for.
  const classDetail = findIGClassDetail(subclass) ?? findIGClassDetail(className);

  // The same eligibility core the server gates with, so the builder and the save can never
  // disagree about what is legal. Returns the reason a power is unavailable, or undefined.
  // Note this deliberately does NOT gate stances or feats — a level-1 trait may be taken as "a new
  // stance", and IG feat prerequisites are unstructured prose (see eligibility.ts).
  const powerReason = (name: string): string | undefined => {
    // A custom character may take anything, so nothing is greyed for them — matching the server,
    // which only enforces when the build is vanilla.
    if (variantKind !== 'vanilla') return undefined;
    const v = igPowerEligibility(name, { className, subclass, level, specializations: specialization ? [specialization] : [], knownPowers: [] });
    return v.ok ? undefined : v.reason;
  };
  const detailRow = (label: string, value?: string) =>
    value ? <div><span style={{ color: 'var(--hx-muted)' }}>{label}: </span><span style={{ color: 'var(--hx-ink)' }}>{value}</span></div> : null;

  return (
    <details className={styles.framedPanel} style={{ margin: '10px 0', padding: '10px 14px' }} open={open} onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
      <summary style={{ cursor: 'pointer', fontFamily: 'var(--hx-font-display)', color: 'var(--hx-gold-2)' }}>
        ◆ Build from the Intuitive Games library
        <span style={{ fontSize: 11.5, fontWeight: 400, color: 'var(--hx-muted)', marginLeft: 8 }}>· pick vanilla content or add your own (flagged custom)</span>
      </summary>
      {(() => {
        // ── Section nodes — arranged by `layout` (panel = all at once; steps = one at a time), same state. ──
        const sectionLabel = { fontSize: 11.5, color: 'var(--hx-teal-1)', fontWeight: 700, letterSpacing: '0.05em' } as const;
        const aiBlock = aiConfigured ? (
          <div style={{ display: 'grid', gap: 6, padding: '8px 10px', border: '1px solid var(--hx-line)', borderRadius: 8, background: 'rgba(200,170,110,0.05)' }}>
            <span style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '0.05em', color: 'var(--hx-gold-2)' }}>✨ AI BUILD (grounded to Intuitive Games)</span>
            <textarea value={aiPrompt} onChange={(e) => setAiPrompt(e.target.value)} rows={2} placeholder="Describe the character — e.g. “a cunning Migoi freebooter duelist who fights defensively and has a griffon companion”" style={input} />
            <button type="button" className={styles.hexBtn} disabled={aiBusy} onClick={aiBuild} style={{ justifySelf: 'start' }}>{aiBusy ? 'Building…' : '✨ Build with AI'}</button>
            <span style={{ fontSize: 10.5, color: 'var(--hx-muted)' }}>The AI matches Intuitive Games mechanics; anything it invents is auto-flagged custom for DM review.</span>
          </div>
        ) : null;
        const nameLevelRow = (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Character name" style={{ ...input, flex: 2, minWidth: 160 }} />
            <input type="number" min={1} max={10} value={level} onChange={(e) => setLevel(Math.max(1, Math.min(10, +e.target.value || 1)))} style={{ ...input, width: 70 }} title="Level" />
          </div>
        );
        const classRow = (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <select value={ancestry} onChange={(e) => setAncestry(e.target.value)} style={{ ...input, flex: 1, minWidth: 130 }}><option value="">Ancestry…</option>{ancestries.map((a) => <option key={a} value={a}>{a}</option>)}</select>
            <select value={className} onChange={(e) => { setClassName(e.target.value); setSubclass(''); }} style={{ ...input, flex: 1, minWidth: 130 }}><option value="">Class…</option>{classes.map((a) => <option key={a} value={a}>{a}</option>)}</select>
            <select value={subclass} onChange={(e) => setSubclass(e.target.value)} disabled={!className} title={className ? `Subclasses of ${className}` : 'Pick a class first'} style={{ ...input, flex: 1, minWidth: 130, opacity: className ? 1 : 0.6 }}><option value="">Subclass…</option>{(className ? igSubclassesOf(className) : subclasses).map((a) => <option key={a} value={a}>{a}</option>)}</select>
          </div>
        );
        const classDetailNode = classDetail ? (
          <div data-testid="ig-class-features" style={{ fontSize: 11.5, lineHeight: 1.5, border: '1px solid var(--hx-line)', borderRadius: 6, padding: '7px 10px', background: 'rgba(255,255,255,0.02)', display: 'grid', gap: 1 }}>
            <div style={{ color: 'var(--hx-teal-1)', fontWeight: 600 }}>{classDetail.name}{classDetail.classification ? ` — ${classDetail.classification}` : ''}</div>
            {detailRow('Primary', classDetail.primaryAbility)}
            {detailRow('HP', classDetail.hp)}
            {detailRow('Stance', classDetail.grantedStance)}
            {detailRow('Defensive power', classDetail.defensivePower)}
            {detailRow('Starting power', classDetail.startingPower)}
            {classDetail.powers?.length ? (
              <div><span style={{ color: 'var(--hx-muted)' }}>Powers: </span>
                {classDetail.powers.map((p, i) => {
                  const eff = igClassPowerEffect(p);
                  return <span key={p}>{i > 0 ? ', ' : ''}<span title={eff ?? 'Effect text not captured yet.'} style={{ color: 'var(--hx-ink)', cursor: eff ? 'help' : 'default', borderBottom: eff ? '1px dotted var(--hx-line)' : 'none' }}>{p}</span></span>;
                })}
              </div>
            ) : null}
            {classDetail.specializations?.length ? (
              <div><span style={{ color: 'var(--hx-muted)' }}>Specializations: </span>
                {classDetail.specializations.map((s, i) => {
                  const bare = s.split(' (')[0];
                  const eff = igClassPowerEffect(bare) ?? (s.includes('(') ? s.slice(s.indexOf('(') + 1, s.lastIndexOf(')')) : undefined);
                  return <span key={s}>{i > 0 ? ', ' : ''}<span title={eff ?? 'Effect text not captured yet.'} style={{ color: 'var(--hx-ink)', cursor: eff ? 'help' : 'default', borderBottom: eff ? '1px dotted var(--hx-line)' : 'none' }}>{bare}</span></span>;
                })}
              </div>
            ) : null}
            {classDetail.note ? <div style={{ color: 'var(--hx-muted)', fontStyle: 'italic' }}>{classDetail.note}</div> : null}
          </div>
        ) : null;
        // The IG per-level progression for this subclass through the chosen level — the FULL scraped schedule
        // (intuitivegames.net/character-building): each level's trait/feat/boost/power/specialization gains,
        // with the subclass's real option lists where a short one exists. Read-only preview.
        const breakdown = (className || subclass) && level > 1 ? igLevelBreakdown(subclass || className, level) : [];
        const milestoneNode = breakdown.length ? (
          <div data-testid="ig-milestones" style={{ fontSize: 11.5, lineHeight: 1.5, border: '1px solid var(--hx-line)', borderRadius: 6, padding: '7px 10px', background: 'rgba(255,255,255,0.02)', display: 'grid', gap: 3 }}>
            <div style={{ color: 'var(--hx-teal-1)', fontWeight: 600 }}>Level 2–{level} progression <span style={{ fontWeight: 400, color: 'var(--hx-muted)' }}>· what you gain each level</span></div>
            {breakdown.map((r) => (
              <div key={r.level}>
                <span style={{ color: 'var(--hx-muted)' }}>L{r.level} · </span>
                <span style={{ color: 'var(--hx-ink)' }}>
                  {r.gains.map((g) => `${g.label}${g.count && g.count > 1 ? ` ×${g.count}` : ''}`).join(' · ')}
                </span>
                <span style={{ color: 'var(--hx-muted)' }}> · {r.solidasCumulative} Solidas</span>
              </div>
            ))}
          </div>
        ) : null;
        const roleRow = (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <input list="ig-spec-opts" value={specialization} onChange={(e) => setSpecialization(e.target.value)} placeholder="Specialization" style={{ ...input, flex: 1, minWidth: 130 }} />
            <datalist id="ig-spec-opts">
              {Array.from(new Set(IG_CLASS_DETAILS.flatMap((c) => c.specializations ?? []))).map((s) => {
                const nm = s.split(' (')[0];
                return <option key={s} value={nm}>{s}</option>;
              })}
            </datalist>
            <input list="ig-background-opts" value={background} onChange={(e) => setBackground(e.target.value)} placeholder="Background" style={{ ...input, flex: 1, minWidth: 130 }} />
            <datalist id="ig-background-opts">{IG_BACKGROUND_DEFS.map((b) => <option key={b.name} value={b.name}>{`${b.name} — ${b.stance} stance, ${b.hp} HP`}</option>)}</datalist>
            <select value={defensivePower} onChange={(e) => setDefensivePower(e.target.value)} style={{ ...input, flex: 1, minWidth: 130 }}><option value="">Defensive power…</option>{defPowerOpts.map((a) => <option key={a} value={a}>{a}</option>)}</select>
          </div>
        );
        const abilitiesBlock = (<><div style={sectionLabel}>ABILITY SCORES</div><IgBoostAllocator onChange={setAbilities} /></>);
        const stancesBlock = (<><div style={sectionLabel}>STANCES</div><Chips opts={stanceOpts} sel={stances} on={(v) => toggle(setStances, v)} /></>);
        const powersBlock = (<><div style={sectionLabel}>POWERS</div><Chips opts={powerOpts} sel={powers} on={(v) => toggle(setPowers, v)} reasonFor={powerReason} /></>);
        const featsBlock = (<><div style={sectionLabel}>FEATS</div><Chips opts={featOpts} sel={feats} on={(v) => toggle(setFeats, v)} /></>);
        const weaponsBlock = (
          <>
            <div style={sectionLabel}>WEAPON GROUPS</div>
            <Chips opts={weaponTypeOpts} sel={weaponTypes} on={(v) => toggle(setWeaponTypes, v)} />
            <input value={weaponsText} onChange={(e) => setWeaponsText(e.target.value)} placeholder="Weapons (comma-separated, e.g. Cutlass, Pistol)" style={input} />
          </>
        );
        const companionBlock = (
          <>
            <div style={sectionLabel}>COMPANION CREATURE</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <select value={companionType} onChange={(e) => setCompanionType(e.target.value)} style={{ ...input, flex: 1, minWidth: 150 }}>
                <option value="">No companion</option>
                {Object.entries(bestiary).map(([grp, list]) => (
                  <optgroup key={grp} label={grp}>{list.map((n) => <option key={n} value={n}>{n}</option>)}</optgroup>
                ))}
              </select>
              {companionType && <input value={companionName} onChange={(e) => setCompanionName(e.target.value)} placeholder="Companion name" style={{ ...input, flex: 1, minWidth: 130 }} />}
            </div>
          </>
        );
        const buildRow = (
          <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
              <div style={{ fontSize: 12.5, color: 'var(--hx-muted)' }}>
                {preview.total} picked · <span style={{ color: 'var(--hx-teal-1)' }}>{preview.vanilla} vanilla</span>{preview.custom > 0 && <> · <span style={{ color: 'var(--hx-danger)' }}>{preview.custom} custom</span></>}
              </div>
              <button type="button" className={`${styles.hexBtn} ${styles.hexBtnPrimary}`} disabled={busy} onClick={build}>{busy ? 'Building…' : '⚒ Build character'}</button>
            </div>
            <div style={{ fontSize: 11, color: 'var(--hx-muted)' }}>Building replaces the current sheet. Custom picks are allowed here and flagged — a vanilla-only campaign only blocks them at submission.</div>
            {msg && <div style={{ fontSize: 12.5, color: 'var(--hx-muted)' }}>{msg}</div>}
          </>
        );

        if (layout === 'steps') {
          const navBtn: React.CSSProperties = { fontSize: 13, fontWeight: 700, padding: '7px 14px', borderRadius: 8, cursor: 'pointer', border: '1px solid var(--hx-line)', background: 'rgba(1,10,19,0.55)', color: 'var(--hx-text)' };
          const stepDefs: { title: string; help: string; body: React.ReactNode }[] = [
            { title: 'Identity & class', help: 'Name, level, ancestry, and your class + subclass — the class preview shows what it grants and your milestone path.', body: <div style={{ display: 'grid', gap: 10 }}>{nameLevelRow}{classRow}{classDetailNode}{milestoneNode}</div> },
            { title: 'Role & defense', help: 'Your specialization and background (which sets a stance + HP), and a defensive power (your reaction).', body: <div style={{ display: 'grid', gap: 10 }}>{roleRow}</div> },
            { title: 'Ability scores', help: 'The IG method: start 10, eight +2 boosts, cap 14 (≤2 per ability).', body: <div style={{ display: 'grid', gap: 8 }}>{abilitiesBlock}</div> },
            { title: 'Stances & powers', help: 'Pick the stances you know and your powers — ineligible powers are greyed with the reason.', body: <div style={{ display: 'grid', gap: 8 }}>{stancesBlock}{powersBlock}</div> },
            { title: 'Feats, weapons, companion & finish', help: 'Choose feats, weapon groups + weapons, and an optional companion creature, then build.', body: <div style={{ display: 'grid', gap: 8 }}>{featsBlock}{weaponsBlock}{companionBlock}{buildRow}</div> },
          ];
          const idx = Math.min(istep, stepDefs.length - 1);
          const cur = stepDefs[idx];
          return (
            <div style={{ marginTop: 10, display: 'grid', gap: 12 }}>
              {aiBlock}
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--hx-gold-2)' }}>{cur.title}</div>
                <div style={{ fontSize: 12, color: 'var(--hx-muted)' }}>Foundation {idx + 1} of {stepDefs.length} · Intuitive Games</div>
              </div>
              <div style={{ display: 'flex', gap: 5 }}>
                {stepDefs.map((s, i) => (
                  <button key={i} type="button" onClick={() => setIstep(i)} title={s.title} aria-label={`Go to ${s.title}`} style={{ height: 5, flex: 1, borderRadius: 3, border: 'none', cursor: 'pointer', background: i <= idx ? 'var(--hx-teal-1)' : 'var(--hx-line)' }} />
                ))}
              </div>
              <div style={{ fontSize: 12.5, color: 'var(--hx-muted)', lineHeight: 1.45 }}>{cur.help}</div>
              <div>{cur.body}</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <button type="button" disabled={idx === 0} onClick={() => setIstep((i) => Math.max(0, i - 1))} style={{ ...navBtn, opacity: idx === 0 ? 0.4 : 1, cursor: idx === 0 ? 'default' : 'pointer' }}>← Prev</button>
                {idx < stepDefs.length - 1 && (
                  <button type="button" onClick={() => setIstep((i) => Math.min(stepDefs.length - 1, i + 1))} style={navBtn}>Next →</button>
                )}
              </div>
            </div>
          );
        }

        return (
          <div style={{ marginTop: 10, display: 'grid', gap: 10 }}>
            {aiBlock}
            {nameLevelRow}
            {classRow}
            {classDetailNode}
            {milestoneNode}
            {roleRow}
            {abilitiesBlock}
            {stancesBlock}
            {powersBlock}
            {featsBlock}
            {weaponsBlock}
            {companionBlock}
            {buildRow}
          </div>
        );
      })()}
    </details>
  );
}

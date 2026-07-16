// app/dnd/_ui/IGCharacterBuilder.tsx — the Intuitive Games "build from vanilla" picker (IG builder Slice 7c).
//
// Pick an ancestry / class / subclass and any stances / powers / feats from the vanilla catalog (plus
// freeform weapons), see a live VANILLA vs CUSTOM count, and Build — which assembles the character server-
// side and persists it. Everything picked from the catalog is vanilla; a freeform/custom entry is flagged
// custom (allowed here, blocked only at submission in a vanilla-only campaign). AI-customize comes next.
'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from './hextech.module.css';
import { igCatalog } from '@/lib/dnd/systems/intuitive-games/catalog';
import { igCreaturesByGroup } from '@/lib/dnd/systems/intuitive-games/content';
import { classifyElement, type ElementKind } from '@/lib/dnd/provenance';

const ABILITY_KEYS = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'] as const;

function names(groups: ReturnType<typeof igCatalog>, kind: ElementKind): string[] {
  return groups.filter((g) => g.kind === kind).flatMap((g) => g.entries.map((e) => e.name));
}

export default function IGCharacterBuilder({ characterId, initialName, aiConfigured }: { characterId: string; initialName: string; aiConfigured?: boolean }) {
  const router = useRouter();
  const catalog = useMemo(() => igCatalog(), []);
  const ancestries = useMemo(() => names(catalog, 'ancestry'), [catalog]);
  const classes = useMemo(() => names(catalog, 'class'), [catalog]);
  const subclasses = useMemo(() => names(catalog, 'subclass'), [catalog]);
  const stanceOpts = useMemo(() => names(catalog, 'stance'), [catalog]);
  const powerOpts = useMemo(() => names(catalog, 'power'), [catalog]);
  const featOpts = useMemo(() => names(catalog, 'feat'), [catalog]);
  const defPowerOpts = useMemo(() => names(catalog, 'defensive-power'), [catalog]);
  const weaponTypeOpts = useMemo(() => names(catalog, 'weapon-type'), [catalog]);
  const bestiary = useMemo(() => igCreaturesByGroup(), []);

  const [open, setOpen] = useState(false);
  const [name, setName] = useState(initialName);
  const [ancestry, setAncestry] = useState('');
  const [className, setClassName] = useState('');
  const [subclass, setSubclass] = useState('');
  const [specialization, setSpecialization] = useState('');
  const [background, setBackground] = useState('');
  const [level, setLevel] = useState(1);
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
  const Chips = ({ opts, sel, on }: { opts: string[]; sel: string[]; on: (v: string) => void }) => (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
      {opts.map((o) => {
        const active = sel.includes(o);
        return <button key={o} type="button" onClick={() => on(o)} style={{ fontSize: 11.5, padding: '3px 8px', borderRadius: 12, cursor: 'pointer', border: `1px solid ${active ? 'var(--hx-teal-1)' : 'var(--hx-line)'}`, background: active ? 'rgba(10,200,185,0.15)' : 'transparent', color: active ? 'var(--hx-teal-1)' : 'var(--hx-muted)' }}>{o}</button>;
      })}
    </div>
  );

  return (
    <details className={styles.framedPanel} style={{ margin: '10px 0', padding: '10px 14px' }} open={open} onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
      <summary style={{ cursor: 'pointer', fontFamily: 'var(--hx-font-display)', color: 'var(--hx-gold-2)' }}>
        ◆ Build from the Intuitive Games library
        <span style={{ fontSize: 11.5, fontWeight: 400, color: 'var(--hx-muted)', marginLeft: 8 }}>· pick vanilla content or add your own (flagged custom)</span>
      </summary>
      <div style={{ marginTop: 10, display: 'grid', gap: 10 }}>
        {aiConfigured && (
          <div style={{ display: 'grid', gap: 6, padding: '8px 10px', border: '1px solid var(--hx-line)', borderRadius: 8, background: 'rgba(200,170,110,0.05)' }}>
            <span style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '0.05em', color: 'var(--hx-gold-2)' }}>✨ AI BUILD (grounded to Intuitive Games)</span>
            <textarea value={aiPrompt} onChange={(e) => setAiPrompt(e.target.value)} rows={2} placeholder="Describe the character — e.g. “a cunning Migoi freebooter duelist who fights defensively and has a griffon companion”" style={input} />
            <button type="button" className={styles.hexBtn} disabled={aiBusy} onClick={aiBuild} style={{ justifySelf: 'start' }}>{aiBusy ? 'Building…' : '✨ Build with AI'}</button>
            <span style={{ fontSize: 10.5, color: 'var(--hx-muted)' }}>The AI matches Intuitive Games mechanics; anything it invents is auto-flagged custom for DM review.</span>
          </div>
        )}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Character name" style={{ ...input, flex: 2, minWidth: 160 }} />
          <input type="number" min={1} max={10} value={level} onChange={(e) => setLevel(Math.max(1, Math.min(10, +e.target.value || 1)))} style={{ ...input, width: 70 }} title="Level" />
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <select value={ancestry} onChange={(e) => setAncestry(e.target.value)} style={{ ...input, flex: 1, minWidth: 130 }}><option value="">Ancestry…</option>{ancestries.map((a) => <option key={a} value={a}>{a}</option>)}</select>
          <select value={className} onChange={(e) => setClassName(e.target.value)} style={{ ...input, flex: 1, minWidth: 130 }}><option value="">Class…</option>{classes.map((a) => <option key={a} value={a}>{a}</option>)}</select>
          <select value={subclass} onChange={(e) => setSubclass(e.target.value)} style={{ ...input, flex: 1, minWidth: 130 }}><option value="">Subclass…</option>{subclasses.map((a) => <option key={a} value={a}>{a}</option>)}</select>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <input value={specialization} onChange={(e) => setSpecialization(e.target.value)} placeholder="Specialization" style={{ ...input, flex: 1, minWidth: 130 }} />
          <input value={background} onChange={(e) => setBackground(e.target.value)} placeholder="Background" style={{ ...input, flex: 1, minWidth: 130 }} />
          <select value={defensivePower} onChange={(e) => setDefensivePower(e.target.value)} style={{ ...input, flex: 1, minWidth: 130 }}><option value="">Defensive power…</option>{defPowerOpts.map((a) => <option key={a} value={a}>{a}</option>)}</select>
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--hx-teal-1)', fontWeight: 700, letterSpacing: '0.05em' }}>ABILITY SCORES</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 6 }}>
          {ABILITY_KEYS.map((k) => (
            <label key={k} style={{ display: 'grid', gap: 2, textAlign: 'center' }}>
              <span style={{ fontSize: 10, color: 'var(--hx-muted)' }}>{k}</span>
              <input type="number" min={1} max={30} value={abilities[k]} onChange={(e) => setAbilities((a) => ({ ...a, [k]: Math.max(1, Math.min(30, +e.target.value || 10)) }))} style={{ ...input, textAlign: 'center', padding: '5px 2px' }} />
            </label>
          ))}
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--hx-teal-1)', fontWeight: 700, letterSpacing: '0.05em' }}>STANCES</div>
        <Chips opts={stanceOpts} sel={stances} on={(v) => toggle(setStances, v)} />
        <div style={{ fontSize: 11.5, color: 'var(--hx-teal-1)', fontWeight: 700, letterSpacing: '0.05em' }}>POWERS</div>
        <Chips opts={powerOpts} sel={powers} on={(v) => toggle(setPowers, v)} />
        <div style={{ fontSize: 11.5, color: 'var(--hx-teal-1)', fontWeight: 700, letterSpacing: '0.05em' }}>FEATS</div>
        <Chips opts={featOpts} sel={feats} on={(v) => toggle(setFeats, v)} />
        <div style={{ fontSize: 11.5, color: 'var(--hx-teal-1)', fontWeight: 700, letterSpacing: '0.05em' }}>WEAPON GROUPS</div>
        <Chips opts={weaponTypeOpts} sel={weaponTypes} on={(v) => toggle(setWeaponTypes, v)} />
        <input value={weaponsText} onChange={(e) => setWeaponsText(e.target.value)} placeholder="Weapons (comma-separated, e.g. Cutlass, Pistol)" style={input} />
        <div style={{ fontSize: 11.5, color: 'var(--hx-teal-1)', fontWeight: 700, letterSpacing: '0.05em' }}>COMPANION CREATURE</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <select value={companionType} onChange={(e) => setCompanionType(e.target.value)} style={{ ...input, flex: 1, minWidth: 150 }}>
            <option value="">No companion</option>
            {Object.entries(bestiary).map(([grp, list]) => (
              <optgroup key={grp} label={grp}>{list.map((n) => <option key={n} value={n}>{n}</option>)}</optgroup>
            ))}
          </select>
          {companionType && <input value={companionName} onChange={(e) => setCompanionName(e.target.value)} placeholder="Companion name" style={{ ...input, flex: 1, minWidth: 130 }} />}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 12.5, color: 'var(--hx-muted)' }}>
            {preview.total} picked · <span style={{ color: 'var(--hx-teal-1)' }}>{preview.vanilla} vanilla</span>{preview.custom > 0 && <> · <span style={{ color: 'var(--hx-danger)' }}>{preview.custom} custom</span></>}
          </div>
          <button type="button" className={`${styles.hexBtn} ${styles.hexBtnPrimary}`} disabled={busy} onClick={build}>{busy ? 'Building…' : '⚒ Build character'}</button>
        </div>
        <div style={{ fontSize: 11, color: 'var(--hx-muted)' }}>Building replaces the current sheet. Custom picks are allowed here and flagged — a vanilla-only campaign only blocks them at submission.</div>
        {msg && <div style={{ fontSize: 12.5, color: 'var(--hx-muted)' }}>{msg}</div>}
      </div>
    </details>
  );
}

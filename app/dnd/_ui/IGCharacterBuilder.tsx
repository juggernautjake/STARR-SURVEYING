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
import { classifyElement, type ElementKind } from '@/lib/dnd/provenance';

function names(groups: ReturnType<typeof igCatalog>, kind: ElementKind): string[] {
  return groups.filter((g) => g.kind === kind).flatMap((g) => g.entries.map((e) => e.name));
}

export default function IGCharacterBuilder({ characterId, initialName }: { characterId: string; initialName: string }) {
  const router = useRouter();
  const catalog = useMemo(() => igCatalog(), []);
  const ancestries = useMemo(() => names(catalog, 'ancestry'), [catalog]);
  const classes = useMemo(() => names(catalog, 'class'), [catalog]);
  const subclasses = useMemo(() => names(catalog, 'subclass'), [catalog]);
  const stanceOpts = useMemo(() => names(catalog, 'stance'), [catalog]);
  const powerOpts = useMemo(() => names(catalog, 'power'), [catalog]);
  const featOpts = useMemo(() => names(catalog, 'feat'), [catalog]);

  const [open, setOpen] = useState(false);
  const [name, setName] = useState(initialName);
  const [ancestry, setAncestry] = useState('');
  const [className, setClassName] = useState('');
  const [subclass, setSubclass] = useState('');
  const [level, setLevel] = useState(1);
  const [stances, setStances] = useState<string[]>([]);
  const [powers, setPowers] = useState<string[]>([]);
  const [feats, setFeats] = useState<string[]>([]);
  const [weaponsText, setWeaponsText] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

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
    let vanilla = 0, custom = 0;
    for (const e of els) (classifyElement('intuitive-games', e.kind, e.name) === 'vanilla' ? vanilla++ : custom++);
    return { vanilla, custom, total: els.length };
  }, [ancestry, className, subclass, stances, powers, feats]);

  async function build() {
    setBusy(true); setMsg(null);
    try {
      const weapons = weaponsText.split(',').map((s) => s.trim()).filter(Boolean);
      const r = await fetch(`/api/dnd/characters/${characterId}/ig-build`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ picks: { name, ancestry, className, subclass, level, stances, powers, feats, weapons } }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setMsg(j.error ?? 'Could not build.'); return; }
      setMsg(`Built — ${j.summary.vanilla} vanilla, ${j.summary.custom} custom${j.summary.dmGranted ? `, ${j.summary.dmGranted} DM-granted` : ''}.`);
      router.refresh();
    } catch { setMsg('Network error — please try again.'); } finally { setBusy(false); }
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
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Character name" style={{ ...input, flex: 2, minWidth: 160 }} />
          <input type="number" min={1} max={10} value={level} onChange={(e) => setLevel(Math.max(1, Math.min(10, +e.target.value || 1)))} style={{ ...input, width: 70 }} title="Level" />
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <select value={ancestry} onChange={(e) => setAncestry(e.target.value)} style={{ ...input, flex: 1, minWidth: 130 }}><option value="">Ancestry…</option>{ancestries.map((a) => <option key={a} value={a}>{a}</option>)}</select>
          <select value={className} onChange={(e) => setClassName(e.target.value)} style={{ ...input, flex: 1, minWidth: 130 }}><option value="">Class…</option>{classes.map((a) => <option key={a} value={a}>{a}</option>)}</select>
          <select value={subclass} onChange={(e) => setSubclass(e.target.value)} style={{ ...input, flex: 1, minWidth: 130 }}><option value="">Subclass…</option>{subclasses.map((a) => <option key={a} value={a}>{a}</option>)}</select>
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--hx-teal-1)', fontWeight: 700, letterSpacing: '0.05em' }}>STANCES</div>
        <Chips opts={stanceOpts} sel={stances} on={(v) => toggle(setStances, v)} />
        <div style={{ fontSize: 11.5, color: 'var(--hx-teal-1)', fontWeight: 700, letterSpacing: '0.05em' }}>POWERS</div>
        <Chips opts={powerOpts} sel={powers} on={(v) => toggle(setPowers, v)} />
        <div style={{ fontSize: 11.5, color: 'var(--hx-teal-1)', fontWeight: 700, letterSpacing: '0.05em' }}>FEATS</div>
        <Chips opts={featOpts} sel={feats} on={(v) => toggle(setFeats, v)} />
        <input value={weaponsText} onChange={(e) => setWeaponsText(e.target.value)} placeholder="Weapons (comma-separated, e.g. Cutlass, Pistol)" style={input} />

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

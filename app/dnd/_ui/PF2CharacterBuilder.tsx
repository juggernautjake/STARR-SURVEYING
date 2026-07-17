// app/dnd/_ui/PF2CharacterBuilder.tsx — the Pathfinder 2e "build from vanilla" picker.
//
// Pick an ancestry / heritage / background / class / subclass from the vanilla library, set attribute
// MODIFIERS and level, choose trained skills, and Build — which assembles the character server-side and
// persists it (shared-engine projection + the pf2e sidecar). Or describe the character and let the AI
// build it, grounded to the PF2 Remaster rules. Everything picked from the library is rules-legal; custom
// entries are allowed and flagged for DM review.
'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from './hextech.module.css';
import { PF2_ANCESTRIES, PF2_CLASSES, PF2_BACKGROUNDS, PF2_SKILLS, PF2_ARMORS } from '@/lib/dnd/systems/pathfinder2e/content';
import { PF2_ATTRIBUTES, type PF2AttributeKey } from '@/lib/dnd/systems/pathfinder2e/model';

export default function PF2CharacterBuilder({ characterId, initialName, aiConfigured }: { characterId: string; initialName: string; aiConfigured?: boolean }) {
  const router = useRouter();
  const ancestries = useMemo(() => PF2_ANCESTRIES, []);
  const classes = useMemo(() => PF2_CLASSES, []);
  const backgrounds = useMemo(() => PF2_BACKGROUNDS, []);

  const [open, setOpen] = useState(false);
  const [name, setName] = useState(initialName);
  const [level, setLevel] = useState(1);
  const [ancestry, setAncestry] = useState('');
  const [heritage, setHeritage] = useState('');
  const [background, setBackground] = useState('');
  const [className, setClassName] = useState('');
  const [subclass, setSubclass] = useState('');
  const [deity, setDeity] = useState('');
  const [armor, setArmor] = useState('Unarmored');
  const [keyAttribute, setKeyAttribute] = useState<PF2AttributeKey>('STR');
  const [attributes, setAttributes] = useState<Record<PF2AttributeKey, number>>({ STR: 0, DEX: 0, CON: 0, INT: 0, WIS: 0, CHA: 0 });
  const [trainedSkills, setTrainedSkills] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiBusy, setAiBusy] = useState(false);

  const cls = useMemo(() => classes.find((c) => c.name === className) || null, [classes, className]);
  const anc = useMemo(() => ancestries.find((a) => a.name === ancestry) || null, [ancestries, ancestry]);

  // When a class is chosen, default the key attribute to its first option.
  function chooseClass(v: string) {
    setClassName(v);
    const c = classes.find((x) => x.name === v);
    if (c) setKeyAttribute(c.keyAttribute[0]);
  }

  const toggleSkill = (s: string) =>
    setTrainedSkills((prev) => prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]);

  async function post(url: string, payload: unknown, setSpin: (b: boolean) => void) {
    setSpin(true); setMsg(null);
    try {
      const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setMsg(j.error ?? 'Could not build.'); return; }
      setMsg(`Built — ${j.summary.vanilla} vanilla, ${j.summary.custom} custom${j.summary.custom ? ' (flagged for DM review)' : ''}.`);
      router.refresh();
    } catch { setMsg('Network error — please try again.'); } finally { setSpin(false); }
  }

  const build = () => post(`/api/dnd/characters/${characterId}/pf2-build`, {
    picks: { name, level, ancestry, heritage, background, className, subclass, deity, keyAttribute, attributes, trainedSkills, armor },
  }, setBusy);

  const aiBuild = () => {
    if (!aiPrompt.trim()) { setMsg('Describe the character you want the AI to build.'); return; }
    post(`/api/dnd/characters/${characterId}/pf2-build/ai`, { prompt: aiPrompt }, setAiBusy);
  };

  const input = { padding: '7px 9px', fontSize: 13, background: 'rgba(1,10,19,0.55)', border: '1px solid var(--hx-line)', color: 'var(--hx-text)', borderRadius: 6 } as const;
  const label = { fontSize: 11.5, color: 'var(--hx-teal-1)', fontWeight: 700, letterSpacing: '0.05em' } as const;
  const fmt = (n: number) => (n >= 0 ? `+${n}` : `${n}`);

  return (
    <details className={styles.framedPanel} style={{ margin: '10px 0', padding: '10px 14px' }} open={open} onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
      <summary style={{ cursor: 'pointer', fontFamily: 'var(--hx-font-display)', color: 'var(--hx-gold-2)' }}>
        ◆ Build from the Pathfinder 2e library
        <span style={{ fontSize: 11.5, fontWeight: 400, color: 'var(--hx-muted)', marginLeft: 8 }}>· Remaster · pick vanilla content or add your own (flagged custom)</span>
      </summary>
      <div style={{ marginTop: 10, display: 'grid', gap: 10 }}>
        {aiConfigured && (
          <div style={{ display: 'grid', gap: 6, padding: '8px 10px', border: '1px solid var(--hx-line)', borderRadius: 8, background: 'rgba(200,170,110,0.05)' }}>
            <span style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '0.05em', color: 'var(--hx-gold-2)' }}>✨ AI BUILD (grounded to Pathfinder 2e Remaster)</span>
            <textarea value={aiPrompt} onChange={(e) => setAiPrompt(e.target.value)} rows={2} placeholder="Describe the character — e.g. “a stern dwarf cleric of Torag with heavy armor and a warhammer, Warpriest doctrine”" style={input} />
            <button type="button" className={styles.hexBtn} disabled={aiBusy} onClick={aiBuild} style={{ justifySelf: 'start' }}>{aiBusy ? 'Building…' : '✨ Build with AI'}</button>
            <span style={{ fontSize: 10.5, color: 'var(--hx-muted)' }}>The AI matches PF2 Remaster mechanics; anything it invents is auto-flagged custom for DM review.</span>
          </div>
        )}

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Character name" style={{ ...input, flex: 2, minWidth: 160 }} />
          <input type="number" min={1} max={20} value={level} onChange={(e) => setLevel(Math.max(1, Math.min(20, +e.target.value || 1)))} style={{ ...input, width: 70 }} title="Level (1–20)" />
        </div>

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <select value={ancestry} onChange={(e) => { setAncestry(e.target.value); setHeritage(''); }} style={{ ...input, flex: 1, minWidth: 130 }}>
            <option value="">Ancestry…</option>{ancestries.map((a) => <option key={a.name} value={a.name}>{a.name}</option>)}
          </select>
          <select value={heritage} onChange={(e) => setHeritage(e.target.value)} style={{ ...input, flex: 1, minWidth: 130 }} disabled={!anc}>
            <option value="">{anc ? 'Heritage…' : 'Pick an ancestry first'}</option>{(anc?.heritages ?? []).map((h) => <option key={h} value={h}>{h}</option>)}
          </select>
          <select value={background} onChange={(e) => setBackground(e.target.value)} style={{ ...input, flex: 1, minWidth: 130 }}>
            <option value="">Background…</option>{backgrounds.map((b) => <option key={b.name} value={b.name}>{b.name}</option>)}
          </select>
        </div>

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <select value={className} onChange={(e) => chooseClass(e.target.value)} style={{ ...input, flex: 1, minWidth: 130 }}>
            <option value="">Class…</option>{classes.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
          </select>
          <input value={subclass} onChange={(e) => setSubclass(e.target.value)} list={cls && cls.subclassOptions.length ? 'pf2-subclass-opts' : undefined} placeholder={cls ? cls.subclassLabel : 'Subclass'} style={{ ...input, flex: 1, minWidth: 130 }} />
          {cls && cls.subclassOptions.length > 0 && (
            <datalist id="pf2-subclass-opts">{cls.subclassOptions.map((o) => <option key={o} value={o} />)}</datalist>
          )}
          <input value={deity} onChange={(e) => setDeity(e.target.value)} placeholder="Deity (optional)" style={{ ...input, flex: 1, minWidth: 120 }} />
        </div>
        {cls && (
          <div style={{ fontSize: 11, color: 'var(--hx-muted)', lineHeight: 1.5 }}>
            {cls.summary} <span style={{ color: 'var(--hx-teal-1)' }}>Key: {cls.keyAttribute.join(' or ')} · HP {cls.hpPerLevel}/level{cls.spellcasting ? ` · ${cls.spellcasting.tradition} ${cls.spellcasting.kind} caster` : ''}.</span>
          </div>
        )}

        <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={label}>KEY ATTRIBUTE</span>
            <select value={keyAttribute} onChange={(e) => setKeyAttribute(e.target.value as PF2AttributeKey)} style={{ ...input, width: 90 }}>
              {(cls?.keyAttribute ?? PF2_ATTRIBUTES).map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
          </span>
          <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={label}>ARMOR</span>
            <select value={armor} onChange={(e) => setArmor(e.target.value)} style={{ ...input, minWidth: 150 }} title="Sets AC item bonus + Dex cap">
              {PF2_ARMORS.map((a) => <option key={a.name} value={a.name}>{a.name}{a.category !== 'unarmored' ? ` (+${a.acBonus} AC, ${a.category})` : ''}</option>)}
            </select>
          </span>
        </div>

        <div style={label}>ATTRIBUTE MODIFIERS <span style={{ fontWeight: 400, color: 'var(--hx-muted)' }}>(PF2 uses modifiers, e.g. +4)</span></div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 6 }}>
          {PF2_ATTRIBUTES.map((k) => (
            <label key={k} style={{ display: 'grid', gap: 2, textAlign: 'center' }}>
              <span style={{ fontSize: 10, color: k === keyAttribute ? 'var(--hx-gold-2)' : 'var(--hx-muted)' }}>{k}{k === keyAttribute ? ' ★' : ''}</span>
              <input type="number" min={-5} max={12} value={attributes[k]} onChange={(e) => setAttributes((a) => ({ ...a, [k]: Math.max(-5, Math.min(12, +e.target.value || 0)) }))} style={{ ...input, textAlign: 'center', padding: '5px 2px' }} />
              <span style={{ fontSize: 9.5, color: 'var(--hx-muted)' }}>{fmt(attributes[k])}</span>
            </label>
          ))}
        </div>

        <div style={label}>TRAINED SKILLS <span style={{ fontWeight: 400, color: 'var(--hx-muted)' }}>{cls ? `(${cls.trainedSkills} + INT free picks${cls.fixedSkills?.length ? `; ${cls.fixedSkills.join(', ')} always trained` : ''})` : ''}</span></div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
          {PF2_SKILLS.map((s) => {
            const active = trainedSkills.includes(s.name);
            const fixed = cls?.fixedSkills?.includes(s.name);
            return (
              <button key={s.name} type="button" onClick={() => toggleSkill(s.name)} title={`${s.attribute}`} style={{ fontSize: 11.5, padding: '3px 8px', borderRadius: 12, cursor: 'pointer', border: `1px solid ${active || fixed ? 'var(--hx-teal-1)' : 'var(--hx-line)'}`, background: active || fixed ? 'rgba(10,200,185,0.15)' : 'transparent', color: active || fixed ? 'var(--hx-teal-1)' : 'var(--hx-muted)' }}>
                {s.name}{fixed ? ' ●' : ''}
              </button>
            );
          })}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
          <button type="button" className={`${styles.hexBtn} ${styles.hexBtnPrimary}`} disabled={busy} onClick={build}>{busy ? 'Building…' : '⚒ Build character'}</button>
        </div>
        <div style={{ fontSize: 11, color: 'var(--hx-muted)' }}>Building replaces the current sheet. Custom (non-library) picks are allowed and flagged — a vanilla-only campaign only blocks them at submission.</div>
        {msg && <div style={{ fontSize: 12.5, color: 'var(--hx-muted)' }}>{msg}</div>}
      </div>
    </details>
  );
}

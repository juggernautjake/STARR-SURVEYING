'use client';
// app/dnd/characters/[id]/build/subclass/page.tsx — the homebrew SUBCLASS designer (Slice 5 UI).
//
// Describe a subclass in prose and the AI drafts it (via /homebrew-subclass), or write one yourself; either
// way every field is editable and the save route attaches it to its parent class.
//
// 2026-07-26 — editable draft + no AI required, the same change made to the feat designer.
//
// Before this the draft was read-only and the AI was mandatory (the POST 503s without a key), so a player who
// wanted to hand-write a subclass could not begin one. The parent class is the part that needed server help:
// only the server knows which classes this character's system has — including a homebrew class saved on the
// character, which the registry cannot see — so the new GET returns that list and the form offers a real
// picker rather than asking anyone to guess a class KEY.
import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import styles from '@/app/dnd/_ui/hextech.module.css';

interface SubFeature { level: number; name: string; body: string }
interface Draft { name: string; classKey: string; features: SubFeature[] }
interface ParentClass { key: string; name: string; custom: boolean }

const blankDraft = (): Draft => ({ name: '', classKey: '', features: [] });

export default function HomebrewSubclassBuilderPage() {
  const params = useParams<{ id: string }>();
  const characterId = params?.id as string;
  const [prompt, setPrompt] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const [classes, setClasses] = useState<ParentClass[]>([]);
  const [subclassLevels, setSubclassLevels] = useState<Record<string, number>>({});

  // The parent-class options for THIS character's system, fetched once. Without them the form could only ask
  // for a raw class key, which is exactly the kind of "guess the internal identifier" control this designer
  // exists to avoid.
  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const r = await fetch(`/api/dnd/characters/${characterId}/homebrew-subclass`);
        const j = await r.json().catch(() => ({}));
        if (!alive || !r.ok) return;
        setClasses(j.classes ?? []);
        setSubclassLevels(j.subclassLevels ?? {});
      } catch { /* the picker degrades to empty; the save route still validates the parent */ }
    })();
    return () => { alive = false; };
  }, [characterId]);

  // The same two conditions the save route enforces, checked here so the button's state matches the outcome:
  // a parent class that RESOLVES, and at least one feature. Parent resolution is a server fact, so this uses
  // the fetched list — and treats an unknown key as unresolvable rather than assuming it is fine.
  const parent = useMemo(
    () => classes.find((c) => c.key === draft?.classKey) ?? null,
    [classes, draft?.classKey],
  );
  const problems = useMemo(() => {
    if (!draft) return [];
    const out: string[] = [];
    if (!draft.name.trim()) out.push('A subclass needs a name.');
    if (!draft.classKey) out.push('A subclass must belong to a parent class.');
    else if (classes.length && !parent) out.push(`No “${draft.classKey}” class exists in this system to attach it to.`);
    if (!draft.features.length) out.push('The subclass needs at least one feature.');
    else if (draft.features.some((f) => !f.name.trim())) out.push('Every feature needs a name.');
    return out;
  }, [draft, classes, parent]);
  const savable = !!draft && problems.length === 0;

  const patch = (p: Partial<Draft>) => { setDraft((d) => (d ? { ...d, ...p } : d)); setSaved(null); };
  const patchFeature = (i: number, p: Partial<SubFeature>) =>
    patch({ features: (draft?.features ?? []).map((f, j) => (j === i ? { ...f, ...p } : f)) });

  /** A new feature defaults to the parent's own subclass level — the level it would really be granted at. */
  const addFeature = () => {
    const lvl = subclassLevels[draft?.classKey ?? ''] || 3;
    const next = draft?.features.length ? Math.max(...draft.features.map((f) => f.level)) + 1 : lvl;
    patch({ features: [...(draft?.features ?? []), { level: Math.min(20, next), name: '', body: '' }] });
  };

  async function drawWithAi() {
    if (!prompt.trim()) { setError('Describe the subclass you want, or write one yourself below.'); return; }
    setBusy(true); setError(null);
    try {
      const r = await fetch(`/api/dnd/characters/${characterId}/homebrew-subclass`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setError(j.error ?? 'Could not draft the subclass.'); return; }
      const s = (j as { subclass?: Draft }).subclass;
      if (s) setDraft({ ...blankDraft(), ...s, features: s.features ?? [] });
      setSaved(null);
    } catch { setError('Network error — please try again.'); } finally { setBusy(false); }
  }

  async function save() {
    if (!draft || !savable) return;
    setSaving(true); setError(null);
    try {
      const r = await fetch(`/api/dnd/characters/${characterId}/homebrew-subclass/save`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ subclass: draft }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setError(j.error ?? 'Could not save the subclass.'); return; }
      setSaved(j.name ?? 'the subclass');
    } catch { setError('Network error — please try again.'); } finally { setSaving(false); }
  }

  const input = { padding: '9px 11px', fontSize: 14, background: 'rgba(1,10,19,0.55)', border: '1px solid var(--hx-line)', color: 'var(--hx-text)', borderRadius: 6, width: '100%' } as const;
  const label = { fontSize: 11.5, color: 'var(--hx-teal-1)', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase' } as const;

  return (
    <div className={styles.root}>
      <div className={styles.screen} style={{ alignItems: 'flex-start' }}>
        <div style={{ width: '100%', maxWidth: 720, margin: '0 auto', display: 'grid', gap: 16 }}>
          <div>
            <a className={styles.hexBtn} href={`/dnd/characters/${characterId}`}>← Back to sheet</a>
            <h1 className={styles.title} style={{ textAlign: 'left', margin: '8px 0 0' }}>Homebrew Subclass Designer</h1>
            <p style={{ color: 'var(--hx-muted)', margin: '4px 0 0' }}>
              Describe a subclass and let the AI draft it, or write one yourself. Either way you can edit every
              field, and it attaches to a real parent class in this character&rsquo;s system.
            </p>
          </div>

          <div className={styles.framedPanel} style={{ display: 'grid', gap: 8, padding: '12px 14px' }}>
            <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={3} style={input}
              placeholder="e.g. “a Barbarian subclass, Storm Herald, whose rage becomes an elemental aura — a resistance at 3, an aura that damages nearby foes at 6…”" />
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button type="button" className={`${styles.hexBtn} ${styles.hexBtnPrimary}`} disabled={busy} onClick={drawWithAi}>
                {busy ? 'Drafting…' : '✨ Draft with AI'}
              </button>
              <button type="button" className={styles.hexBtn} onClick={() => { setDraft(blankDraft()); setSaved(null); setError(null); }}>
                ✎ Write it myself
              </button>
            </div>
            {error && <div className={styles.error}>{error}</div>}
          </div>

          {draft && (
            <section className={styles.framedPanel} style={{ display: 'grid', gap: 12, padding: '14px 16px' }}>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <div style={{ display: 'grid', gap: 4, minWidth: 200, flex: 2 }}>
                  <label style={label} htmlFor="hs-name">Name</label>
                  <input id="hs-name" style={input} value={draft.name} onChange={(e) => patch({ name: e.target.value })} placeholder="Subclass name" />
                </div>
                <div style={{ display: 'grid', gap: 4, minWidth: 180, flex: 1 }}>
                  <label style={label} htmlFor="hs-parent">Parent class</label>
                  <select id="hs-parent" style={input} value={draft.classKey} onChange={(e) => patch({ classKey: e.target.value })}>
                    <option value="">Choose a class…</option>
                    {classes.map((c) => (
                      <option key={c.key} value={c.key}>{c.name}{c.custom ? ' (homebrew)' : ''}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gap: 6 }}>
                <span style={label}>Features</span>
                {draft.features.map((f, i) => (
                  <div key={i} style={{ display: 'grid', gap: 6, padding: '8px 10px', border: '1px solid var(--hx-line)', borderRadius: 6 }}>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <input
                        style={{ ...input, width: 74 }} type="number" min={1} max={20} value={f.level}
                        onChange={(e) => patchFeature(i, { level: Math.max(1, Math.min(20, Number(e.target.value) || 1)) })}
                        aria-label={`Feature ${i + 1} level`}
                      />
                      <input style={{ ...input, flex: 1, minWidth: 140 }} value={f.name} placeholder="Feature name"
                        onChange={(e) => patchFeature(i, { name: e.target.value })} aria-label={`Feature ${i + 1} name`} />
                      <button type="button" className="btn tiny danger"
                        onClick={() => patch({ features: draft.features.filter((_, j) => j !== i) })}>✕</button>
                    </div>
                    <textarea style={input} rows={3} value={f.body} placeholder="What it does"
                      onChange={(e) => patchFeature(i, { body: e.target.value })} aria-label={`Feature ${i + 1} rules text`} />
                  </div>
                ))}
                <button type="button" className="btn tiny" onClick={addFeature} style={{ justifySelf: 'start' }}>+ Add a feature</button>
              </div>

              {problems.length > 0 ? (
                <div style={{ display: 'grid', gap: 4 }}>
                  {problems.map((p, i) => <div key={i} style={{ fontSize: 12.5, color: 'var(--hx-gold-2)' }}>⚠ {p}</div>)}
                </div>
              ) : (
                <div style={{ fontSize: 12.5, color: 'var(--hx-teal-1)' }}>
                  ✓ Ready to save{parent ? ` as a ${parent.name} subclass` : ''}.
                </div>
              )}

              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <button type="button" className={`${styles.hexBtn} ${styles.hexBtnPrimary}`} disabled={saving || !savable} onClick={save}
                  title={savable ? 'Save this subclass to your character' : 'Needs a name, a parent class and at least one feature'}>
                  {saving ? 'Saving…' : '⚒ Save to my character'}
                </button>
                {saved && <span style={{ fontSize: 12.5, color: 'var(--hx-teal-1)' }}>✓ Saved “{saved}”.</span>}
              </div>
              <div style={{ fontSize: 11, color: 'var(--hx-muted)' }}>Saved subclasses are flagged custom for DM review and attach to their parent class.</div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

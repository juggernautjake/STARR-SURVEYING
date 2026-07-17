'use client';
// app/dnd/characters/[id]/build/subclass/page.tsx — the homebrew SUBCLASS designer (Slice 5 UI).
//
// Describe a subclass in prose (naming its parent class); the AI drafts it (via /homebrew-subclass) and
// the engine builds it. Shows the subclass, its parent class, its features, and any validity notes.
// Propose-only for now. Mirrors the class + feat designers.
import { useState } from 'react';
import { useParams } from 'next/navigation';
import styles from '@/app/dnd/_ui/hextech.module.css';

interface SubFeature { level: number; name: string; body: string }
interface Subclass { name: string; classKey: string; features: SubFeature[] }
interface Result { subclass: Subclass; parentName: string | null; warnings: string[] }

export default function HomebrewSubclassBuilderPage() {
  const params = useParams<{ id: string }>();
  const characterId = params?.id as string;
  const [prompt, setPrompt] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);

  async function draft() {
    if (!prompt.trim()) { setError('Describe the subclass you want.'); return; }
    setBusy(true); setError(null);
    try {
      const r = await fetch(`/api/dnd/characters/${characterId}/homebrew-subclass`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setError(j.error ?? 'Could not draft the subclass.'); return; }
      setResult(j as Result); setSaved(null);
    } catch { setError('Network error — please try again.'); } finally { setBusy(false); }
  }

  async function save() {
    if (!result) return;
    setSaving(true); setError(null);
    try {
      const r = await fetch(`/api/dnd/characters/${characterId}/homebrew-subclass/save`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ subclass: result.subclass }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setError(j.error ?? 'Could not save the subclass.'); return; }
      setSaved(j.name ?? 'the subclass');
    } catch { setError('Network error — please try again.'); } finally { setSaving(false); }
  }

  // Savable when a parent class exists and it has features (mirrors the endpoint's checks).
  const savable = !!result?.parentName && (result?.subclass.features.length ?? 0) > 0;

  const input = { padding: '9px 11px', fontSize: 14, background: 'rgba(1,10,19,0.55)', border: '1px solid var(--hx-line)', color: 'var(--hx-text)', borderRadius: 6, width: '100%' } as const;
  const sub = result?.subclass;

  return (
    <div className={styles.root}>
      <div className={styles.screen} style={{ alignItems: 'flex-start' }}>
        <div style={{ width: '100%', maxWidth: 720, margin: '0 auto', display: 'grid', gap: 16 }}>
          <div>
            <a className={styles.hexBtn} href={`/dnd/characters/${characterId}`}>← Back to sheet</a>
            <h1 className={styles.title} style={{ textAlign: 'left', margin: '8px 0 0' }}>Homebrew Subclass Designer</h1>
            <p style={{ color: 'var(--hx-muted)', margin: '4px 0 0' }}>Describe a subclass and its parent class; the AI drafts it. A draft to iterate on.</p>
          </div>

          <div className={styles.framedPanel} style={{ display: 'grid', gap: 8, padding: '12px 14px' }}>
            <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={3} style={input}
              placeholder="e.g. “a Barbarian subclass, Storm Herald, whose rage becomes an elemental aura — a resistance at 3, an aura that damages nearby foes at 6…”" />
            <button type="button" className={`${styles.hexBtn} ${styles.hexBtnPrimary}`} disabled={busy} onClick={draft} style={{ justifySelf: 'start' }}>
              {busy ? 'Drafting…' : '✨ Draft with AI'}
            </button>
            {error && <div className={styles.error}>{error}</div>}
          </div>

          {sub && (
            <section className={styles.framedPanel} style={{ display: 'grid', gap: 10, padding: '14px 16px' }}>
              <div>
                <strong style={{ fontFamily: 'var(--hx-font-display)', fontSize: 18, color: 'var(--hx-gold-2)' }}>{sub.name}</strong>
                <div style={{ fontSize: 12.5, color: 'var(--hx-muted)', marginTop: 2 }}>
                  {result.parentName ? `${result.parentName} subclass` : sub.classKey ? `${sub.classKey} subclass` : 'subclass'}
                </div>
              </div>
              {result.warnings.length > 0 && (
                <div style={{ display: 'grid', gap: 4 }}>
                  {result.warnings.map((w, i) => <div key={i} style={{ fontSize: 12.5, color: 'var(--hx-gold-2)' }}>⚠ {w}</div>)}
                </div>
              )}
              <div style={{ display: 'grid', gap: 6 }}>
                <div style={{ fontSize: 11.5, color: 'var(--hx-teal-1)', fontWeight: 700, letterSpacing: '0.05em' }}>FEATURES</div>
                {sub.features.map((f, i) => (
                  <div key={i} style={{ padding: '6px 10px', border: '1px solid var(--hx-line)', borderRadius: 6 }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
                      <span style={{ fontSize: 11, color: 'var(--hx-muted)' }}>Lv {f.level}</span>
                      <strong style={{ fontSize: 13, color: 'var(--hx-text)' }}>{f.name}</strong>
                    </div>
                    {f.body && <div style={{ fontSize: 12, color: 'var(--hx-muted)', marginTop: 2 }}>{f.body}</div>}
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <button type="button" className={`${styles.hexBtn} ${styles.hexBtnPrimary}`} disabled={saving || !savable} onClick={save}
                  title={savable ? 'Save this subclass to your character' : 'Needs a resolvable parent class and at least one feature'}>
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

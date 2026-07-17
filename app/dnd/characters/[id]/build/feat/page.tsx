'use client';
// app/dnd/characters/[id]/build/feat/page.tsx — the homebrew FEAT designer (Slice 5 UI).
//
// Describe a feat in prose; the AI drafts it (via /homebrew-feat), the existing engine builds + reviews
// it, and this shows it with the engine's feedback (errors block, warnings advise). Propose-only for now;
// persisting the feat is a follow-up. Mirrors the class designer.
import { useState } from 'react';
import { useParams } from 'next/navigation';
import styles from '@/app/dnd/_ui/hextech.module.css';

interface Feat { name: string; category: string; prerequisite?: string; abilityIncrease?: string[]; body: string; repeatable?: boolean }
interface ReviewItem { field: string; message: string; severity: 'error' | 'warning' }
interface Result { feat: Feat; review: { ok: boolean; errors: ReviewItem[]; warnings: ReviewItem[] } }

export default function HomebrewFeatBuilderPage() {
  const params = useParams<{ id: string }>();
  const characterId = params?.id as string;
  const [prompt, setPrompt] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);

  async function draft() {
    if (!prompt.trim()) { setError('Describe the feat you want.'); return; }
    setBusy(true); setError(null);
    try {
      const r = await fetch(`/api/dnd/characters/${characterId}/homebrew-feat`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setError(j.error ?? 'Could not draft the feat.'); return; }
      setResult(j as Result); setSaved(null);
    } catch { setError('Network error — please try again.'); } finally { setBusy(false); }
  }

  async function save() {
    if (!result) return;
    setSaving(true); setError(null);
    try {
      const r = await fetch(`/api/dnd/characters/${characterId}/homebrew-feat/save`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ feat: result.feat }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setError(j.error ?? 'Could not save the feat.'); return; }
      setSaved(j.name ?? 'the feat');
    } catch { setError('Network error — please try again.'); } finally { setSaving(false); }
  }

  const input = { padding: '9px 11px', fontSize: 14, background: 'rgba(1,10,19,0.55)', border: '1px solid var(--hx-line)', color: 'var(--hx-text)', borderRadius: 6, width: '100%' } as const;
  const feat = result?.feat;

  return (
    <div className={styles.root}>
      <div className={styles.screen} style={{ alignItems: 'flex-start' }}>
        <div style={{ width: '100%', maxWidth: 720, margin: '0 auto', display: 'grid', gap: 16 }}>
          <div>
            <a className={styles.hexBtn} href={`/dnd/characters/${characterId}`}>← Back to sheet</a>
            <h1 className={styles.title} style={{ textAlign: 'left', margin: '8px 0 0' }}>Homebrew Feat Designer</h1>
            <p style={{ color: 'var(--hx-muted)', margin: '4px 0 0' }}>Describe a feat; the AI drafts it and the engine checks it. A draft to iterate on.</p>
          </div>

          <div className={styles.framedPanel} style={{ display: 'grid', gap: 8, padding: '12px 14px' }}>
            <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={3} style={input}
              placeholder="e.g. “a general feat, level 4+, that grants +1 Dexterity and lets you take the Dash action as a bonus action once per turn”" />
            <button type="button" className={`${styles.hexBtn} ${styles.hexBtnPrimary}`} disabled={busy} onClick={draft} style={{ justifySelf: 'start' }}>
              {busy ? 'Drafting…' : '✨ Draft with AI'}
            </button>
            {error && <div className={styles.error}>{error}</div>}
          </div>

          {feat && (
            <section className={styles.framedPanel} style={{ display: 'grid', gap: 10, padding: '14px 16px' }}>
              <div>
                <strong style={{ fontFamily: 'var(--hx-font-display)', fontSize: 18, color: 'var(--hx-gold-2)' }}>{feat.name}</strong>
                <div style={{ fontSize: 12.5, color: 'var(--hx-muted)', marginTop: 2 }}>
                  {feat.category} feat
                  {feat.prerequisite ? ` · ${feat.prerequisite}` : ''}
                  {feat.abilityIncrease?.length ? ` · +1 ${feat.abilityIncrease.map((a) => a.toUpperCase()).join('/')}` : ''}
                  {feat.repeatable ? ' · repeatable' : ''}
                </div>
              </div>
              {(result.review.errors.length > 0 || result.review.warnings.length > 0) ? (
                <div style={{ display: 'grid', gap: 4 }}>
                  {result.review.errors.map((e, i) => <div key={`e${i}`} style={{ fontSize: 12.5, color: 'var(--hx-danger, #ff6b6b)' }}>⛔ {e.field}: {e.message}</div>)}
                  {result.review.warnings.map((w, i) => <div key={`w${i}`} style={{ fontSize: 12.5, color: 'var(--hx-gold-2)' }}>⚠ {w.field}: {w.message}</div>)}
                </div>
              ) : (
                <div style={{ fontSize: 12.5, color: 'var(--hx-teal-1)' }}>✓ The engine found no problems with this feat.</div>
              )}
              <div style={{ fontSize: 13, color: 'var(--hx-text)', whiteSpace: 'pre-wrap', lineHeight: 1.55 }}>{feat.body}</div>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <button type="button" className={`${styles.hexBtn} ${styles.hexBtnPrimary}`} disabled={saving || !result.review.ok} onClick={save}
                  title={result.review.ok ? 'Save this feat to your character' : 'Fix the errors above before saving'}>
                  {saving ? 'Saving…' : '⚒ Save to my character'}
                </button>
                {saved && <span style={{ fontSize: 12.5, color: 'var(--hx-teal-1)' }}>✓ Saved “{saved}”.</span>}
              </div>
              <div style={{ fontSize: 11, color: 'var(--hx-muted)' }}>Saved feats are flagged custom for DM review.</div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

'use client';
// app/dnd/characters/[id]/build/class/page.tsx — the homebrew CLASS designer (Slice 5 UI).
//
// Describe a class in prose; the AI drafts it (via /homebrew-class), the existing engine builds +
// reviews it, and this shows the draft with the engine's balance feedback (errors block a future save,
// warnings advise). Propose-only for now — persisting the edited class onto the character is the next
// slice. A focused page so a player can iterate on a class design with the AI + see it validated.
import { useState } from 'react';
import { useParams } from 'next/navigation';
import styles from '@/app/dnd/_ui/hextech.module.css';

interface Feature { level: number; name: string; body: string; choice?: string }
interface Definition { name: string; hitDie: number; primaryAbility: string[]; savingThrows: string[]; features: Feature[]; caster?: { kind: string } }
interface ReviewItem { field: string; message: string; severity: 'error' | 'warning' }
interface Result { draft: Record<string, unknown> & { skillChoices?: { count: number }; subclassLabel?: string }; definition: Definition; review: { ok: boolean; errors: ReviewItem[]; warnings: ReviewItem[] } }

export default function HomebrewClassBuilderPage() {
  const params = useParams<{ id: string }>();
  const characterId = params?.id as string;
  const [prompt, setPrompt] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);

  async function draft() {
    if (!prompt.trim()) { setError('Describe the class you want.'); return; }
    setBusy(true); setError(null);
    try {
      const r = await fetch(`/api/dnd/characters/${characterId}/homebrew-class`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setError(j.error ?? 'Could not draft the class.'); return; }
      setResult(j as Result); setSaved(null);
    } catch { setError('Network error — please try again.'); } finally { setBusy(false); }
  }

  async function save() {
    if (!result) return;
    setSaving(true); setError(null);
    try {
      const r = await fetch(`/api/dnd/characters/${characterId}/homebrew-class/save`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ draft: result.draft }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setError(j.error ?? 'Could not save the class.'); return; }
      setSaved(j.name ?? 'the class');
    } catch { setError('Network error — please try again.'); } finally { setSaving(false); }
  }

  const input = { padding: '9px 11px', fontSize: 14, background: 'rgba(1,10,19,0.55)', border: '1px solid var(--hx-line)', color: 'var(--hx-text)', borderRadius: 6, width: '100%' } as const;
  const def = result?.definition;

  return (
    <div className={styles.root}>
      <div className={styles.screen} style={{ alignItems: 'flex-start' }}>
        <div style={{ width: '100%', maxWidth: 760, margin: '0 auto', display: 'grid', gap: 16 }}>
          <div>
            <a className={styles.hexBtn} href={`/dnd/characters/${characterId}`}>← Back to sheet</a>
            <h1 className={styles.title} style={{ textAlign: 'left', margin: '8px 0 0' }}>Homebrew Class Designer</h1>
            <p style={{ color: 'var(--hx-muted)', margin: '4px 0 0' }}>
              Describe a class; the AI drafts it and the engine checks it. This is a draft to iterate on — saving it to your sheet comes next.
            </p>
          </div>

          <div className={styles.framedPanel} style={{ display: 'grid', gap: 8, padding: '12px 14px' }}>
            <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={3} style={input}
              placeholder="e.g. “a d10 martial spellblade that keys off Intelligence, prepares arcane spells, and gets a bonded weapon at level 1 with an Arcane Strike at 3”" />
            <button type="button" className={`${styles.hexBtn} ${styles.hexBtnPrimary}`} disabled={busy} onClick={draft} style={{ justifySelf: 'start' }}>
              {busy ? 'Drafting…' : '✨ Draft with AI'}
            </button>
            {error && <div className={styles.error}>{error}</div>}
          </div>

          {def && (
            <section className={styles.framedPanel} style={{ display: 'grid', gap: 12, padding: '14px 16px' }}>
              <div>
                <strong style={{ fontFamily: 'var(--hx-font-display)', fontSize: 19, color: 'var(--hx-gold-2)' }}>{def.name}</strong>
                <div style={{ fontSize: 12.5, color: 'var(--hx-muted)', marginTop: 2 }}>
                  d{def.hitDie} hit die · key {def.primaryAbility.map((a) => a.toUpperCase()).join('/')} · saves {def.savingThrows.map((a) => a.toUpperCase()).join('/')}
                  {result?.draft.skillChoices ? ` · ${result.draft.skillChoices.count} skills` : ''}
                  {def.caster ? ` · ${def.caster.kind} caster` : ' · non-caster'}
                  {result?.draft.subclassLabel ? ` · ${result.draft.subclassLabel}` : ''}
                </div>
              </div>

              {/* Review — errors block a future save, warnings advise. */}
              {(result.review.errors.length > 0 || result.review.warnings.length > 0) && (
                <div style={{ display: 'grid', gap: 4 }}>
                  {result.review.errors.map((e, i) => (
                    <div key={`e${i}`} style={{ fontSize: 12.5, color: 'var(--hx-danger, #ff6b6b)' }}>⛔ {e.field}: {e.message}</div>
                  ))}
                  {result.review.warnings.map((w, i) => (
                    <div key={`w${i}`} style={{ fontSize: 12.5, color: 'var(--hx-gold-2)' }}>⚠ {w.field}: {w.message}</div>
                  ))}
                </div>
              )}
              {result.review.ok && result.review.warnings.length === 0 && (
                <div style={{ fontSize: 12.5, color: 'var(--hx-teal-1)' }}>✓ The engine found no problems with this class.</div>
              )}

              <div style={{ display: 'grid', gap: 6 }}>
                <div style={{ fontSize: 11.5, color: 'var(--hx-teal-1)', fontWeight: 700, letterSpacing: '0.05em' }}>FEATURES</div>
                {def.features.map((f, i) => (
                  <div key={i} style={{ padding: '6px 10px', border: '1px solid var(--hx-line)', borderRadius: 6 }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
                      <span style={{ fontSize: 11, color: 'var(--hx-muted)' }}>Lv {f.level}</span>
                      <strong style={{ fontSize: 13, color: 'var(--hx-text)' }}>{f.name}</strong>
                      {f.choice && <span style={{ fontSize: 10, color: 'var(--hx-muted)' }}>· {f.choice} choice (auto-added)</span>}
                    </div>
                    {f.body && <div style={{ fontSize: 12, color: 'var(--hx-muted)', marginTop: 2 }}>{f.body}</div>}
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <button type="button" className={`${styles.hexBtn} ${styles.hexBtnPrimary}`} disabled={saving || !result.review.ok} onClick={save}
                  title={result.review.ok ? 'Save this class to your character' : 'Fix the errors above before saving'}>
                  {saving ? 'Saving…' : '⚒ Save to my character'}
                </button>
                {saved && <span style={{ fontSize: 12.5, color: 'var(--hx-teal-1)' }}>✓ Saved “{saved}” — it resolves in the level builder now.</span>}
                {!result.review.ok && <span style={{ fontSize: 11.5, color: 'var(--hx-muted)' }}>Fix the errors above to enable saving.</span>}
              </div>
              <div style={{ fontSize: 11, color: 'var(--hx-muted)' }}>Refine the prompt and re-draft to iterate. Saved classes are flagged custom for DM review.</div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

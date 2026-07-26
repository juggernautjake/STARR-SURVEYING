'use client';
// app/dnd/characters/[id]/build/feat/page.tsx — the homebrew FEAT designer (Slice 5 UI).
//
// Describe a feat in prose and the AI drafts it (via /homebrew-feat); the engine reviews it (errors block,
// warnings advise); "Save to my character" persists it and it then resolves in the ASI picker like any other.
//
// 2026-07-26 — the draft is now EDITABLE, and you no longer need the AI to reach it.
//
// Before this, the drafted feat was read-only: the only way to change one word of it was to re-prompt the AI
// and hope, and a player with no AI key could not author a feat at all. Slice 5's own checklist recorded "a
// manual field-by-field edit form on the draft" as the remaining nice-to-have three times over (class, feat,
// subclass). It matters more than "nice": homebrew is one of the two ways a player customises a character,
// and re-rolling a whole draft to fix a prerequisite is not customisation.
//
// The review runs LOCALLY on every edit, from the same pure `reviewCustomFeat` the save route uses, so the
// feedback you see while typing is the feedback that will decide whether the save is accepted. The server
// still rebuilds and re-reviews from parsed input — it does not trust this page — which is exactly why
// editing here is safe: the worst a hand-edited field can do is be refused.
import { useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import styles from '@/app/dnd/_ui/hextech.module.css';
import { buildCustomFeat, reviewCustomFeat, type CustomFeat } from '@/lib/dnd/classes/custom';
import { splitReview } from '@/lib/dnd/classes/custom-ai';
import type { AbilityKey } from '@/app/dnd/_sheet/rules/dnd';

type Draft = Omit<CustomFeat, 'key' | 'system' | 'custom'> & { system?: string };

const ABILITIES: AbilityKey[] = ['str', 'dex', 'con', 'int', 'wis', 'cha'];
const CATEGORIES: CustomFeat['category'][] = ['origin', 'general', 'fighting-style', 'epic-boon'];

/** An empty draft, for authoring without the AI. */
const blankDraft = (): Draft => ({ name: '', category: 'general', body: '', prerequisite: '', abilityIncrease: [] });

export default function HomebrewFeatBuilderPage() {
  const params = useParams<{ id: string }>();
  const characterId = params?.id as string;
  const [prompt, setPrompt] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);

  // The engine's verdict on what is on screen RIGHT NOW — recomputed on every edit from the same pure
  // function the save route runs, so the two can never disagree about whether this feat is legal.
  //
  // `system` is deliberately not an editable field and not shown: the save route derives the real one from
  // the character (`normalizeSystem(character.system)`), so this page cannot know it and must not invent it.
  // The placeholder exists only to satisfy the review's presence check — a feat whose system were genuinely
  // blank would be refused server-side, and no value typed here would change what gets stored.
  const review = useMemo(() => {
    if (!draft) return null;
    return splitReview(reviewCustomFeat(buildCustomFeat({
      ...draft,
      system: draft.system || 'set-on-save',
      custom: {},
      ...(draft.abilityIncrease?.length ? { abilityIncrease: draft.abilityIncrease } : { abilityIncrease: [] }),
    })));
  }, [draft]);

  const patch = (p: Partial<Draft>) => { setDraft((d) => (d ? { ...d, ...p } : d)); setSaved(null); };

  async function drawWithAi() {
    if (!prompt.trim()) { setError('Describe the feat you want, or write one yourself below.'); return; }
    setBusy(true); setError(null);
    try {
      const r = await fetch(`/api/dnd/characters/${characterId}/homebrew-feat`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setError(j.error ?? 'Could not draft the feat.'); return; }
      // The AI's draft becomes the STARTING POINT of an editable form rather than a finished artifact.
      const f = (j as { feat?: Draft }).feat;
      if (f) setDraft({ ...blankDraft(), ...f });
      setSaved(null);
    } catch { setError('Network error — please try again.'); } finally { setBusy(false); }
  }

  async function save() {
    if (!draft || !review?.ok) return;
    setSaving(true); setError(null);
    try {
      const r = await fetch(`/api/dnd/characters/${characterId}/homebrew-feat/save`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ feat: draft }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setError(j.error ?? 'Could not save the feat.'); return; }
      setSaved(j.name ?? 'the feat');
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
            <h1 className={styles.title} style={{ textAlign: 'left', margin: '8px 0 0' }}>Homebrew Feat Designer</h1>
            <p style={{ color: 'var(--hx-muted)', margin: '4px 0 0' }}>
              Describe a feat and let the AI draft it, or write one yourself. Either way you can edit every
              field, and the engine checks it as you go.
            </p>
          </div>

          <div className={styles.framedPanel} style={{ display: 'grid', gap: 8, padding: '12px 14px' }}>
            <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={3} style={input}
              placeholder="e.g. “a general feat, level 4+, that grants +1 Dexterity and lets you take the Dash action as a bonus action once per turn”" />
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button type="button" className={`${styles.hexBtn} ${styles.hexBtnPrimary}`} disabled={busy} onClick={drawWithAi}>
                {busy ? 'Drafting…' : '✨ Draft with AI'}
              </button>
              {/* Authoring without the AI. Not a fallback for a missing key so much as the honest primary
                  path for someone who already knows what they want to write. */}
              <button type="button" className={styles.hexBtn} onClick={() => { setDraft(blankDraft()); setSaved(null); setError(null); }}>
                ✎ Write it myself
              </button>
            </div>
            {error && <div className={styles.error}>{error}</div>}
          </div>

          {draft && review && (
            <section className={styles.framedPanel} style={{ display: 'grid', gap: 12, padding: '14px 16px' }}>
              <div style={{ display: 'grid', gap: 10 }}>
                <div style={{ display: 'grid', gap: 4 }}>
                  <label style={label} htmlFor="hf-name">Name</label>
                  <input id="hf-name" style={input} value={draft.name} onChange={(e) => patch({ name: e.target.value })} placeholder="Feat name" />
                </div>

                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <div style={{ display: 'grid', gap: 4, minWidth: 160, flex: 1 }}>
                    <label style={label} htmlFor="hf-cat">Category</label>
                    <select id="hf-cat" style={input} value={draft.category} onChange={(e) => patch({ category: e.target.value as CustomFeat['category'] })}>
                      {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div style={{ display: 'grid', gap: 4, minWidth: 200, flex: 2 }}>
                    <label style={label} htmlFor="hf-prereq">Prerequisite</label>
                    <input id="hf-prereq" style={input} value={draft.prerequisite ?? ''} onChange={(e) => patch({ prerequisite: e.target.value })} placeholder="e.g. Level 4+, Strength 13+" />
                  </div>
                </div>

                <div style={{ display: 'grid', gap: 4 }}>
                  <span style={label}>Ability increase</span>
                  <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                    {ABILITIES.map((a) => {
                      const on = (draft.abilityIncrease ?? []).includes(a);
                      return (
                        <button
                          key={a} type="button"
                          onClick={() => patch({ abilityIncrease: on ? (draft.abilityIncrease ?? []).filter((x) => x !== a) : [...(draft.abilityIncrease ?? []), a] })}
                          style={{
                            fontSize: 12, padding: '4px 9px', borderRadius: 12, cursor: 'pointer',
                            border: `1px solid ${on ? 'var(--hx-teal-1)' : 'var(--hx-line)'}`,
                            background: on ? 'rgba(10,200,185,0.15)' : 'transparent',
                            color: on ? 'var(--hx-teal-1)' : 'var(--hx-muted)',
                          }}
                        >+1 {a.toUpperCase()}</button>
                      );
                    })}
                  </div>
                </div>

                <div style={{ display: 'grid', gap: 4 }}>
                  <label style={label} htmlFor="hf-body">Rules text</label>
                  <textarea id="hf-body" style={input} rows={6} value={draft.body} onChange={(e) => patch({ body: e.target.value })}
                    placeholder="What the feat actually does." />
                </div>

                <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center', fontSize: 13, color: 'var(--hx-text)' }}>
                  <input type="checkbox" checked={!!draft.repeatable} onChange={(e) => patch({ repeatable: e.target.checked })} />
                  Can be taken more than once
                </label>
              </div>

              {/* The engine's live verdict on the fields above. */}
              {(review.errors.length > 0 || review.warnings.length > 0) ? (
                <div style={{ display: 'grid', gap: 4 }}>
                  {review.errors.map((e, i) => <div key={`e${i}`} style={{ fontSize: 12.5, color: 'var(--hx-danger, #ff6b6b)' }}>⛔ {e.field}: {e.message}</div>)}
                  {review.warnings.map((w, i) => <div key={`w${i}`} style={{ fontSize: 12.5, color: 'var(--hx-gold-2)' }}>⚠ {w.field}: {w.message}</div>)}
                </div>
              ) : (
                <div style={{ fontSize: 12.5, color: 'var(--hx-teal-1)' }}>✓ The engine found no problems with this feat.</div>
              )}

              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <button type="button" className={`${styles.hexBtn} ${styles.hexBtnPrimary}`} disabled={saving || !review.ok} onClick={save}
                  title={review.ok ? 'Save this feat to your character' : 'Fix the errors above before saving'}>
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

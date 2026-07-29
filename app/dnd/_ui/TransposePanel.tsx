'use client';
// TransposePanel — translate a piece into another system, then argue with the result (P6-18).
//
// The owner's loop: *"The user could review it and approve it or deny it or tell the AI to try again, along
// with a few notes on what they want different … The user can continue this process until satisfied, or
// they can choose to edit the AI generated thing to make it exactly what they want if it is close."*
//
// So the review offers four exits, and all four are one click:
//   · **Keep it**   — it becomes an ordinary private piece of yours; the "translated" state ends.
//   · **Try again** — with notes; rewrites the SAME draft rather than stacking another.
//   · **Discard**   — deletes it. A rejected translation should leave nothing behind.
//   · **Open it**   — go read and edit the full thing when it is close enough to finish by hand.
//
// Approve / discard reuse the ordinary PATCH and DELETE rather than bespoke endpoints, so a translated
// piece obeys exactly the same ownership rules as any other.
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import styles from './hextech.module.css';

interface Variant { id: string; name: string; summary?: string; description?: string; system: string }

export default function TransposePanel({
  contentId,
  currentSystem,
  systems,
  aiConfigured,
}: {
  contentId: string;
  currentSystem: string;
  systems: { key: string; name: string }[];
  aiConfigured: boolean;
}) {
  const router = useRouter();
  const targets = systems.filter((s) => s.key !== currentSystem);
  const [target, setTarget] = useState(targets[0]?.key ?? '');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [variant, setVariant] = useState<Variant | null>(null);
  const [rationale, setRationale] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [kept, setKept] = useState(false);

  async function run(retry: boolean) {
    if (busy || !target) return;
    setBusy(true); setErr(null);
    try {
      const r = await fetch(`/api/dnd/homebrew/${contentId}/transpose`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system: target,
          notes: notes.trim() || undefined,
          // Retrying rewrites the same draft, so a fussy author ends with one variant they like rather
          // than nine they rejected.
          variantId: retry && variant ? variant.id : undefined,
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setErr(j.error ?? 'The translation failed.'); return; }
      setVariant(j.content);
      setRationale(j.rationale ?? null);
      setNotes('');
    } catch {
      setErr('Network error — please try again.');
    } finally {
      setBusy(false);
    }
  }

  async function discard() {
    if (!variant || busy) return;
    setBusy(true); setErr(null);
    try {
      const r = await fetch(`/api/dnd/homebrew/${variant.id}`, { method: 'DELETE' });
      if (!r.ok) { setErr('Could not discard that draft.'); return; }
      setVariant(null); setRationale(null);
    } finally { setBusy(false); }
  }

  function keep() {
    // Nothing to save: the draft is already a real private piece of theirs. "Keep" just ends the review —
    // pretending it needs a write would invent a state the data model does not have.
    setKept(true);
    router.refresh();
  }

  const label = { fontSize: 11.5, letterSpacing: '0.06em', color: 'var(--hx-gold-2)', fontFamily: 'var(--hx-font-display)' } as const;
  const help = { fontSize: 11.5, color: 'var(--hx-muted)', lineHeight: 1.5 } as const;

  if (!targets.length) return null;

  return (
    <section className={styles.framedPanel} style={{ padding: '14px 16px', display: 'grid', gap: 10 }}>
      <div className={styles.framedPanelTop} />
      <h2 className={styles.panelTitle} style={{ margin: 0, fontSize: 14 }}>Translate to another system</h2>

      {!aiConfigured ? (
        <p style={{ margin: 0, ...help }}>AI translation isn’t configured on this deployment.</p>
      ) : !variant ? (
        <div style={{ display: 'grid', gap: 8 }}>
          <p style={{ margin: 0, ...help }}>
            Carry this into another system — keeping what it <em>is</em>, expressed in that system’s own
            mechanics. You get a private draft to review; nothing is published and the original is untouched.
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <select className={styles.input} style={{ width: 'auto', flex: '1 1 180px', padding: '7px 9px' }}
              value={target} onChange={(e) => setTarget(e.target.value)}>
              {targets.map((s) => <option key={s.key} value={s.key}>{s.name}</option>)}
            </select>
            <button type="button" className={`${styles.hexBtn} ${styles.hexBtnPrimary}`} onClick={() => run(false)} disabled={busy} style={{ padding: '7px 16px' }}>
              {busy ? 'Translating…' : '⇄ Translate'}
            </button>
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          <div style={{ border: '1px solid var(--hx-teal-1)', background: 'rgba(10,200,185,0.06)', padding: '11px 12px', borderRadius: 3, display: 'grid', gap: 6 }}>
            <span style={{ fontSize: 10.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--hx-teal-1)' }}>
              AI draft · {systems.find((s) => s.key === variant.system)?.name ?? variant.system} · not checked by a human
            </span>
            <strong style={{ fontFamily: 'var(--hx-font-display)', color: 'var(--hx-gold-2)', fontSize: 15 }}>{variant.name}</strong>
            {variant.summary && <span style={{ fontSize: 13, color: 'var(--hx-text)' }}>{variant.summary}</span>}
            {variant.description && (
              <div style={{ whiteSpace: 'pre-wrap', fontSize: 12.5, lineHeight: 1.6, color: 'var(--hx-text)', maxHeight: 260, overflowY: 'auto' }}>
                {variant.description}
              </div>
            )}
            {/* "What did it decide to do differently" is the question a reviewer actually has. */}
            {rationale && (
              <div style={{ borderTop: '1px dashed var(--hx-line)', paddingTop: 6, fontSize: 12, color: 'var(--hx-muted)', lineHeight: 1.55 }}>
                <strong style={{ color: 'var(--hx-teal-1)' }}>What changed: </strong>{rationale}
              </div>
            )}
          </div>

          {kept ? (
            <p style={{ margin: 0, fontSize: 12.5, color: 'var(--hx-teal-1)' }}>
              Kept as a private draft. <Link href={`/dnd/content/${variant.id}`} style={{ color: 'var(--hx-teal-1)' }}>Open it</Link> to edit or publish.
            </p>
          ) : (
            <>
              <div style={{ display: 'grid', gap: 4 }}>
                <label htmlFor="tp-notes" style={label}>Not quite right?</label>
                <textarea id="tp-notes" className={styles.input} rows={2}
                  style={{ width: '100%', padding: '7px 9px', fontSize: 12.5, resize: 'vertical' }}
                  placeholder="Tell it what to change — “too strong for a level 1 feat”, “use the three-action economy”, “keep the flavour but drop the exhaustion”."
                  value={notes} onChange={(e) => setNotes(e.target.value)} />
                <span style={help}>It sees this and its previous attempt, so anything you don’t mention stays as it is.</span>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button type="button" className={`${styles.hexBtn} ${styles.hexBtnPrimary}`} onClick={keep} disabled={busy} style={{ padding: '6px 14px', fontSize: 12.5 }}>
                  ✓ Keep it
                </button>
                <button type="button" className={styles.hexBtn} onClick={() => run(true)} disabled={busy} style={{ padding: '6px 14px', fontSize: 12.5 }}>
                  {busy ? 'Trying…' : '↻ Try again'}
                </button>
                <Link href={`/dnd/content/${variant.id}`} className={styles.hexBtn} style={{ padding: '6px 14px', fontSize: 12.5, textDecoration: 'none' }}>
                  ✎ Open &amp; edit
                </Link>
                <button type="button" className={styles.hexBtn} onClick={discard} disabled={busy}
                  style={{ padding: '6px 14px', fontSize: 12.5, borderColor: 'var(--hx-danger, #ff6b6b)', color: '#ff9d9d' }}>
                  ✕ Discard
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {err && <p style={{ margin: 0, fontSize: 12.5, color: 'var(--hx-danger, #ff6b6b)' }}>{err}</p>}
    </section>
  );
}

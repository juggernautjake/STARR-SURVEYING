'use client';
// AssessmentPanel — the AI's read on a piece of custom content (P6-17).
//
// Shown only to the piece's creator. An assessment is feedback on someone's work-in-progress, and putting
// "Needs work" on a public page under a stranger's name would be a different feature entirely — one nobody
// asked for.
//
// The tone rules are enforced by the layout, not just the prompt: strengths render FIRST, the verdict is a
// word rather than a score, and nothing here can block or alter the piece. It is an opinion, positioned as
// one.
import { useState } from 'react';
import styles from './hextech.module.css';
import {
  ASSESSMENT_LABELS, isAssessmentStale, type Assessment,
} from '@/lib/dnd/homebrew/assess';

const VERDICT_COLOR: Record<string, string> = {
  solid: 'var(--hx-teal-1, #0ac8b9)',
  watch: 'var(--hx-gold-2, #c8aa6e)',
  rough: 'var(--hx-danger, #ff6b6b)',
};

export default function AssessmentPanel({
  contentId,
  initial,
  updatedAt,
  aiConfigured,
}: {
  contentId: string;
  initial: Assessment | null;
  updatedAt?: string | null;
  aiConfigured: boolean;
}) {
  const [assessment, setAssessment] = useState<Assessment | null>(initial);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const stale = isAssessmentStale(assessment, updatedAt);

  async function run() {
    if (busy) return;
    setBusy(true); setErr(null);
    try {
      const r = await fetch(`/api/dnd/homebrew/${contentId}/assess`, { method: 'POST' });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setErr(j.error ?? 'The review failed.'); return; }
      setAssessment(j.assessment);
    } catch {
      setErr('Network error — please try again.');
    } finally {
      setBusy(false);
    }
  }

  const list = (title: string, items: string[], color?: string) =>
    items.length > 0 && (
      <div style={{ display: 'grid', gap: 3 }}>
        <span style={{ fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: color ?? 'var(--hx-muted)' }}>{title}</span>
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.6, color: 'var(--hx-text)' }}>
          {items.map((s) => <li key={s}>{s}</li>)}
        </ul>
      </div>
    );

  return (
    <section className={styles.framedPanel} style={{ padding: '14px 16px', display: 'grid', gap: 10 }}>
      <div className={styles.framedPanelTop} />
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <h2 className={styles.panelTitle} style={{ margin: 0, fontSize: 14 }}>Design review</h2>
        {aiConfigured && (
          <button type="button" className={styles.hexBtn} onClick={run} disabled={busy} style={{ padding: '5px 13px', fontSize: 12 }}>
            {busy ? 'Reading…' : assessment ? 'Review again' : 'Ask for a review'}
          </button>
        )}
      </div>

      {!aiConfigured && (
        <p style={{ margin: 0, fontSize: 12.5, color: 'var(--hx-muted)' }}>
          AI review isn’t configured on this deployment.
        </p>
      )}

      {!assessment && aiConfigured && !busy && (
        <p style={{ margin: 0, fontSize: 12.5, color: 'var(--hx-muted)', lineHeight: 1.55 }}>
          Get a second pair of eyes on this — how it compares to official content of the same kind, what
          works, and what’s still missing. It’s an opinion, not a verdict: nothing here changes your content
          or stops you sharing it.
        </p>
      )}

      {assessment && (
        <div style={{ display: 'grid', gap: 10 }}>
          <div style={{ display: 'flex', gap: 9, alignItems: 'baseline', flexWrap: 'wrap' }}>
            <span style={{
              fontSize: 10.5, letterSpacing: '0.12em', textTransform: 'uppercase', padding: '2px 9px',
              borderRadius: 2, border: `1px solid ${VERDICT_COLOR[assessment.verdict]}`, color: VERDICT_COLOR[assessment.verdict],
            }}>
              {ASSESSMENT_LABELS[assessment.verdict]}
            </span>
            <span style={{ fontSize: 13.5, color: 'var(--hx-text)', lineHeight: 1.55, flex: '1 1 240px' }}>
              {assessment.summary}
            </span>
          </div>

          {/* Strengths first, always. A review that opens with problems reads as a rejection of work
              someone has just finished. */}
          {list('What works', assessment.strengths, 'var(--hx-teal-1)')}
          {list('Worth a look', assessment.concerns, 'var(--hx-gold-2)')}
          {list('Still missing', assessment.gaps)}

          {stale && (
            <p style={{ margin: 0, fontSize: 11.5, color: 'var(--hx-gold-2)', lineHeight: 1.5 }}>
              You’ve edited this since the review was written, so parts of it may no longer apply.
            </p>
          )}
        </div>
      )}

      {err && <p style={{ margin: 0, fontSize: 12.5, color: 'var(--hx-danger, #ff6b6b)' }}>{err}</p>}
    </section>
  );
}

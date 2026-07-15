// app/dnd/_ui/BuildQuestions.tsx — the AI builder's open design questions (Phase V, Slice 5).
// When the AI couldn't resolve gaps/conflicts on its own, it asks here; the owner answers and the
// character re-ingests with the answers as authoritative context.
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from './hextech.module.css';

export default function BuildQuestions({ characterId, questions }: { characterId: string; questions: string[] }) {
  const router = useRouter();
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  if (!questions?.length) return null;

  async function submit() {
    const payload = questions.map((q, i) => ({ question: q, answer: (answers[i] ?? '').trim() })).filter((a) => a.answer);
    if (!payload.length) { setMsg('Answer at least one question first.'); return; }
    setBusy(true); setMsg(null);
    try {
      const r = await fetch(`/api/dnd/characters/${characterId}/answer`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ answers: payload }),
      });
      if (!r.ok) { const j = await r.json().catch(() => ({})); setMsg(j.error ?? 'Could not save answers.'); setBusy(false); return; }
      setMsg('Applying your answers…');
      await fetch(`/api/dnd/characters/${characterId}/ingest`, { method: 'POST' }).catch(() => {});
      router.refresh();
    } catch {
      setMsg('Network error — please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.framedPanel} style={{ display: 'grid', gap: 12, padding: '14px 16px', margin: '10px 0' }}>
      <div>
        <strong style={{ fontFamily: 'var(--hx-font-display)', color: 'var(--hx-gold-2)' }}>◆ The builder needs your call</strong>
        <p style={{ margin: '4px 0 0', fontSize: 12.5, color: 'var(--hx-muted)' }}>
          These are gaps or conflicts across your sources. Answer what you can and the sheet rebuilds using your answers as the source of truth.
        </p>
      </div>
      {questions.map((q, i) => (
        <div key={i} style={{ display: 'grid', gap: 4 }}>
          <span style={{ fontSize: 13, color: 'var(--hx-text)' }}>{i + 1}. {q}</span>
          <input
            value={answers[i] ?? ''}
            onChange={(e) => setAnswers((a) => ({ ...a, [i]: e.target.value }))}
            placeholder="Your answer…"
            style={{ padding: '8px 10px', background: 'rgba(1,10,19,0.5)', border: '1px solid var(--hx-line)', color: 'var(--hx-text)' }}
          />
        </div>
      ))}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <button className={`${styles.hexBtn} ${styles.hexBtnPrimary}`} type="button" disabled={busy} onClick={submit}>
          {busy ? 'Rebuilding…' : 'Apply answers & rebuild'}
        </button>
        {msg && <span style={{ fontSize: 12.5, color: 'var(--hx-muted)' }}>{msg}</span>}
      </div>
    </div>
  );
}

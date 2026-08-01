'use client';
// app/dnd/_ui/maps/FireTrigger.tsx — set a trigger off for real (M6-4).
//
// The board beside this button already shows a DRY RUN of the same plan, built by the same resolver. This
// is the live path, and the difference is stated on the control rather than implied: a preview changes
// nothing, this changes sheets and the map.
//
// ── IT REPORTS EVERY ACTION, NOT A COUNT ────────────────────────────────────────────────────────────
//
// M6-5's note on why the executor was not rushed: *"a half-implemented executor that silently no-ops
// three of its eleven actions is worse than an engine that plainly has no executor."* Three of the eleven
// genuinely cannot be performed by a server — a die is rolled by a person, speakers are in the room — so
// the result lists what was DONE, what the TABLE has to do, and what FAILED. A summary line alone would
// let "2 done" mean two of five.
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from '../hextech.module.css';

interface Outcome { kind: string; status: 'done' | 'asked' | 'failed'; detail: string }

const TONE: Record<Outcome['status'], { glyph: string; colour: string }> = {
  done: { glyph: '✓', colour: 'var(--hx-teal-1)' },
  // Deliberately NOT the danger colour: a puzzle that asks the table for a roll is working correctly,
  // and painting it red would make a healthy trigger look broken.
  asked: { glyph: '→', colour: 'var(--hx-gold-2)' },
  failed: { glyph: '✕', colour: 'var(--hx-danger)' },
};

export default function FireTrigger({
  campaignId,
  triggerId,
  name,
  once,
}: {
  campaignId: string;
  triggerId: string;
  name: string;
  /** A `once` trigger is spent by a real firing. Said on the button, before it is pressed. */
  once: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ summary: string; outcomes: Outcome[] } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function fire() {
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch(`/api/dnd/campaigns/${encodeURIComponent(campaignId)}/map-triggers/fire`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ triggerId }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setErr(j?.error ?? 'That did not work.'); return; }
      setResult({ summary: j.summary, outcomes: j.outcomes ?? [] });
      // The map may have changed — a revealed object, a moved token, a spawned creature.
      router.refresh();
    } catch {
      setErr('Network error — please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: 'grid', gap: 6 }}>
      <button
        type="button"
        className={styles.hexBtn}
        disabled={busy}
        onClick={() => void fire()}
        style={{ minHeight: 44, justifySelf: 'start', borderColor: 'var(--hx-danger)', color: 'var(--hx-danger)' }}
        title={
          once
            ? `Fire ${name} for real. It is a once-only trigger, so this spends it.`
            : `Fire ${name} for real — this changes the map and the sheets, unlike the preview above.`
        }
      >
        ⚡ Fire it for real{once ? ' (spends it)' : ''}
      </button>

      {result && (
        <div style={{ display: 'grid', gap: 3, fontSize: 12 }} data-testid="fire-result">
          <strong style={{ color: 'var(--hx-teal-1)' }}>{result.summary}</strong>
          {result.outcomes.map((o, i) => (
            <div key={`${o.kind}-${i}`} style={{ color: TONE[o.status].colour }}>
              <span aria-hidden>{TONE[o.status].glyph}</span>{' '}
              <span style={{ color: 'var(--hx-muted)' }}>{o.kind}</span> — {o.detail}
            </div>
          ))}
        </div>
      )}

      {err && <div role="status" style={{ fontSize: 12, color: 'var(--hx-danger)' }}>{err}</div>}
    </div>
  );
}

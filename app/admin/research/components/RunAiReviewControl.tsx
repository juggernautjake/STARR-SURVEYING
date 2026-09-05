'use client';

// app/admin/research/components/RunAiReviewControl.tsx — the Review-stage "Run AI Review" control.
//
// Plan GATHER_AND_REVIEW_SPLIT U4. In the two-run model a gather run files documents with NO AI; the
// operator reviews them, then chooses to run the analysis — a SEPARATE run with its OWN cost cap they
// set here. This posts that cap to the analyze route (which enforces it, R1), so the money spent on
// analysis is bounded independently of what the gather run spent.

import { useState } from 'react';
import { Sparkles } from 'lucide-react';

/** The analyze request body. Pure + exported so the payload (esp. the cost cap) is unit-tested. */
export function analyzeRequestBody(maxCostUsd: number): { maxCostUsd: number } {
  // Clamp to the same range the route accepts (0–100); a $0 cap is meaningful ("estimate only").
  const clamped = Math.min(Math.max(Number.isFinite(maxCostUsd) ? maxCostUsd : 0, 0), 100);
  return { maxCostUsd: clamped };
}

export interface RunAiReviewControlProps {
  projectId: string;
  /** Default cost cap shown in the input. */
  defaultMaxCostUsd?: number;
  /** Called after the analyze run is accepted, so the page can refresh/poll. */
  onStarted?: () => void;
}

export default function RunAiReviewControl({
  projectId,
  defaultMaxCostUsd = 5,
  onStarted,
}: RunAiReviewControlProps) {
  const [maxCost, setMaxCost] = useState<number>(defaultMaxCostUsd);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [started, setStarted] = useState(false);

  async function run() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/research/${projectId}/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(analyzeRequestBody(maxCost)),
      });
      if (!res.ok && res.status !== 202) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        setError(body.error ?? `Could not start the review (HTTP ${res.status}).`);
        return;
      }
      setStarted(true);
      onStarted?.();
    } catch {
      setError('Could not reach the server to start the review.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="run-ai-review"
      data-testid="run-ai-review"
      style={{
        display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap',
        border: '1px solid var(--border, #e5e7eb)', borderRadius: 8, padding: '0.75rem 1rem',
        margin: '0 0 1.25rem', background: 'var(--surface-2, #fafafa)',
      }}
    >
      <Sparkles size={16} aria-hidden="true" />
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <strong style={{ fontSize: '0.9rem' }}>Run AI Review</strong>
        <span style={{ fontSize: '0.78rem', opacity: 0.75 }}>
          OCR + extract bearings, distances and summaries over the gathered documents.
        </span>
      </div>
      <div style={{ flex: 1 }} />
      <label style={{ fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
        Cost limit&nbsp;$
        <input
          type="number"
          min={0}
          max={100}
          step={1}
          value={maxCost}
          onChange={(e) => setMaxCost(Number(e.target.value))}
          disabled={busy}
          aria-label="AI review cost limit in dollars"
          style={{ width: 70, padding: '0.3rem 0.4rem', borderRadius: 6, border: '1px solid var(--border, #d1d5db)' }}
        />
      </label>
      <button
        onClick={run}
        disabled={busy}
        title="Start the AI review with this cost limit"
        style={{
          background: '#2563EB', color: '#fff', border: 'none', borderRadius: 6,
          padding: '0.5rem 1rem', fontSize: '0.85rem', fontWeight: 600,
          cursor: busy ? 'default' : 'pointer', whiteSpace: 'nowrap', opacity: busy ? 0.7 : 1,
        }}
      >
        {busy ? 'Starting…' : started ? 'Review running' : 'Run AI Review'}
      </button>
      {error && <span role="alert" style={{ color: '#DC2626', fontSize: '0.8rem', flexBasis: '100%' }}>{error}</span>}
      {started && !error && (
        <span role="status" style={{ color: '#16A34A', fontSize: '0.8rem', flexBasis: '100%' }}>
          AI review started — its progress and cost will appear as it runs.
        </span>
      )}
    </div>
  );
}

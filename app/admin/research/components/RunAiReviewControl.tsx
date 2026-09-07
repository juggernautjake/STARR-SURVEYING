'use client';

// app/admin/research/components/RunAiReviewControl.tsx — the Review-stage "Run AI Review" control.
//
// Plan GATHER_AND_REVIEW_SPLIT U4. In the two-run model a gather run files documents with NO AI; the
// operator reviews them, then chooses to run the analysis — a SEPARATE run with its OWN cost cap they
// set here. This posts that cap to the analyze route (which enforces it, R1), so the money spent on
// analysis is bounded independently of what the gather run spent.

import { useState, useEffect } from 'react';
import { Sparkles } from 'lucide-react';
import { Counter, RunViewStyles } from './ResearchRunView';
import { describeReviewProgress, type ReviewStatus } from '@/lib/research/review-progress';

/** The analyze request body. Pure + exported so the payload (esp. the cost cap) is unit-tested. */
export function analyzeRequestBody(maxCostUsd: number): { maxCostUsd: number } {
  // Clamp to the same range the route accepts (0–100); a $0 cap is meaningful ("estimate only").
  const clamped = Math.min(Math.max(Number.isFinite(maxCostUsd) ? maxCostUsd : 0, 0), 100);
  return { maxCostUsd: clamped };
}

/** What the status route says about the review — its OWN clock, cost and bar, beside the research run's. */
interface ReviewProgress {
  status: string;
  spent?: number;
  cap?: number | null;
  review?: ReviewStatus | null;
}

/** The review's bar and its three counters (owner, 2026-09-07: "a seperate loading bar for the
 *  analysis stage … two seperate cost counters"). Reuses the run view's bar and counter styles so the
 *  two stages read the same way; `RunViewStyles` is mounted here because the run view is not on this
 *  stage. Pure over the status payload, so the harness can render every state. */
export function AiReviewProgressBar({ p, now = Date.now() }: { p: ReviewProgress; now?: number }) {
  const rv = p.review;
  if (!rv) return null;
  const running = p.status === 'analyzing';
  const stopped = rv.progress?.stage === 'stopped';
  const tone = stopped ? 'bad' : running ? 'busy' : 'good';
  const pct = Math.max(0, Math.min(100, Math.round(rv.percent)));
  const done = rv.progress?.documentsDone ?? 0;
  const total = rv.progress?.documentsTotal ?? null;
  const cap = rv.costCapUsd;
  return (
    <div data-testid="ai-review-bar" style={{ flexBasis: '100%' }}>
      <RunViewStyles />
      <div className="rrv__bar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}
           aria-label={`AI review progress: ${pct}%`}>
        <div className={`rrv__bar-fill rrv__bar-fill--${tone}`} style={{ width: `${pct}%` }} />
        <span className="rrv__bar-pct">{pct}%</span>
      </div>
      <p className="rrv__status-phase" data-testid="ai-review-phase">{describeReviewProgress(rv.progress, p.status)}</p>
      <div className="rrv__counters">
        <Counter label="Documents" value={`${done}${total != null ? ` / ${total}` : ''}`} live={running}
                 hint={rv.progress?.stage === 'analyzing' ? 'Documents analysed for data points, of those the read pass left readable.' : 'Documents read by the tiled reader, of those on file that are not marked unrelated.'} />
        <Counter label="Elapsed" value={formatReviewElapsed(rv.startedAt, rv.finishedAt, now)} live={running}
                 hint="From the moment the worker took the review. The research run's clock is its own." />
        <Counter label="Review spent" value={`$${rv.spendUsd.toFixed(2)}${cap != null ? ` / $${Number(cap).toFixed(2)}` : ''}`} live={running}
                 hint="AI calls booked to this review, against the cost limit you set. The research run's spend is counted separately on the Research stage." />
      </div>
    </div>
  );
}

/** "12:34" / "1:02:05" — the review's elapsed time, live while it runs. */
export function formatReviewElapsed(startedAt: string, finishedAt: string | null, now = Date.now()): string {
  const start = Date.parse(startedAt);
  const end = finishedAt ? Date.parse(finishedAt) : now;
  const s = Math.max(0, Math.floor((end - start) / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`;
}

/** The one line under the button: the review's own elapsed time and spend (owner, 2026-09-07:
 *  "a separate counter for the AI review and a separate cost counter"). */
export function reviewStatusLine(p: ReviewProgress | null, now = Date.now()): string {
  if (!p) return 'AI review started — its progress and cost will appear as it runs.';
  const rv = p.review;
  const money = rv ? `$${rv.spendUsd.toFixed(2)}${rv.costCapUsd != null ? ` of $${Number(rv.costCapUsd).toFixed(2)}` : ''}` : (typeof p.spent === 'number' ? `~$${p.spent.toFixed(2)}` : '');
  if (p.status === 'analyzing') return rv ? `AI review running — ${formatReviewElapsed(rv.startedAt, null, now)} elapsed · ${money} spent` : `AI review running${money ? ` — ${money} spent` : '…'}`;
  if (p.status === 'review') return rv ? `AI review complete — ${formatReviewElapsed(rv.startedAt, rv.finishedAt, now)} · ${money}.` : `AI review complete${money ? ` — ${money}` : ''}.`;
  return 'AI review started — its progress and cost will appear as it runs.';
}

export interface RunAiReviewControlProps {
  projectId: string;
  /** Default cost cap shown in the input. */
  defaultMaxCostUsd?: number;
  /** Called after the analyze run is accepted, so the page can refresh/poll. */
  onStarted?: () => void;
  /** The project is already at `analyzing` (a review in progress when the page opened) — poll it. */
  analyzing?: boolean;
  /** The review has ended (the poll saw the project leave `analyzing`) — the page reloads the project
   *  so its stage follows; nothing else polls the project row while a review runs. */
  onFinished?: () => void;
}

export default function RunAiReviewControl({
  projectId,
  defaultMaxCostUsd = 5,
  onStarted,
  analyzing = false,
  onFinished,
}: RunAiReviewControlProps) {
  const [maxCost, setMaxCost] = useState<number>(defaultMaxCostUsd);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [started, setStarted] = useState(analyzing);
  // R3 — live analyze spend vs the cap the operator set; the review's own clock rides with it.
  const [progress, setProgress] = useState<ReviewProgress | null>(null);
  // A one-second tick so the review's clock advances between polls.
  const [, setTick] = useState(0);
  useEffect(() => {
    if (progress?.status !== 'analyzing') return;
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [progress?.status]);

  // The LAST review's bar and counters, for a page opened after it finished: one read on mount, and
  // the bar shows when the route has a stamped review. Without this the review's cost and time
  // vanished the moment it ended, and the only place they existed was the ledger.
  useEffect(() => {
    if (started) return;
    let live = true;
    fetch(`/api/admin/research/${projectId}/analyze`).then((r) => r.json()).then((j) => {
      if (live && j?.review) setProgress({ status: j.status, spent: j.estimatedCostUsd, cap: j.costCapUsd, review: j.review });
    }).catch(() => { /* nothing to show yet */ });
    return () => { live = false; };
  }, [started, projectId]);

  // After the review starts, poll its status so the operator sees spend against the cap they set.
  useEffect(() => {
    if (!started) return;
    let live = true;
    const tick = async () => {
      try {
        const j = await fetch(`/api/admin/research/${projectId}/analyze`).then((r) => r.json());
        if (!live) return;
        setProgress({ status: j.status, spent: j.estimatedCostUsd, cap: j.costCapUsd, review: j.review ?? null });
        if (j.status === 'analyzing') setTimeout(tick, 4000);
        else onFinished?.();
      } catch { /* transient; the next tick retries */ }
    };
    void tick();
    return () => { live = false; };
  }, [started, projectId]);

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
        <span role="status" data-testid="ai-review-progress" style={{ color: '#166534', fontSize: '0.8rem', flexBasis: '100%' }}>
          {reviewStatusLine(progress)}
        </span>
      )}
      {!error && progress?.review && (started || progress.review.finishedAt) && <AiReviewProgressBar p={progress} />}
    </div>
  );
}

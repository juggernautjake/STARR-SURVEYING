'use client';
// app/admin/research/components/WorkerStatusBanner.tsx — the app stops pretending (plan R2).
//
// Before this, a dead research worker looked like a slow page: click Run, watch a spinner, get a
// generic failure — or, if the fallback fired, get a silently weaker "lite" run announced only by a
// status line that scrolls past. The person waiting could not tell which of three situations they
// were in, and two of them are somebody else's job to fix.
//
// So the banner states the situation in one sentence and what it means for a run. It is deliberately
// NOT a red error box in every state: "this deployment has no worker" is a normal configuration, not
// a fault, and colouring it as one teaches people to ignore the banner that matters.

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Info, RefreshCw } from 'lucide-react';
import type { WorkerVerdict } from '@/lib/research/worker-status';

import './WorkerStatusBanner.css';

interface Props {
  /** Show the banner even when everything is fine. Off by default — a healthy engine does not need
   *  to announce itself on every page; it needs to be quiet until it is not. */
  showWhenOk?: boolean;
  /** Re-probe every N ms while mounted. Off by default; the run panel turns it on. */
  pollMs?: number;
}

type Loaded = WorkerVerdict & { checkedAt: string };

export default function WorkerStatusBanner({ showWhenOk = false, pollMs }: Props) {
  const [verdict, setVerdict] = useState<Loaded | null>(null);
  const [state, setState] = useState<'loading' | 'ok' | 'failed'>('loading');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/research/worker-status');
      if (!res.ok) { setState('failed'); return; }
      setVerdict((await res.json()) as Loaded);
      setState('ok');
    } catch {
      setState('failed');
    }
  }, []);

  useEffect(() => {
    void load();
    if (!pollMs) return;
    const t = setInterval(() => { void load(); }, pollMs);
    return () => clearInterval(t);
  }, [load, pollMs]);

  // Loading is silent. A banner that flashes "checking…" on every page load is noise, and the answer
  // arrives in well under a second on the cached path.
  if (state === 'loading') return null;

  if (state === 'failed') {
    return (
      <div className="worker-status worker-status--warn" role="status">
        <AlertTriangle size={15} aria-hidden />
        <span>Could not check whether the research worker is available — this is a fault in this app, not in the worker.</span>
      </div>
    );
  }

  if (!verdict) return null;
  if (verdict.state === 'ok' && !showWhenOk) return null;

  const tone =
    verdict.state === 'ok' ? 'ok'
    : verdict.state === 'not_configured' ? 'info'
    : 'warn';
  const Icon = tone === 'ok' ? CheckCircle2 : tone === 'info' ? Info : AlertTriangle;

  return (
    <div className={`worker-status worker-status--${tone}`} role="status">
      <Icon size={15} aria-hidden className="worker-status__icon" />
      <div className="worker-status__body">
        <p className="worker-status__headline">{verdict.headline}</p>
        {verdict.hint ? <p className="worker-status__hint">{verdict.hint}</p> : null}
        {/* Said explicitly rather than left to happen. The fallback already existed; what was
            missing was anybody being told it had been taken. */}
        {verdict.offerLite ? (
          <p className="worker-status__hint">
            A run started now uses the built-in lite pipeline: public records, imagery and AI
            analysis, but no browser-driven county portal scraping.
          </p>
        ) : null}
        {verdict.warnings.length > 0 ? (
          <ul className="worker-status__warnings">
            {verdict.warnings.map((w) => <li key={w}>{w}</li>)}
          </ul>
        ) : null}
      </div>
      <div className="worker-status__meta">
        {verdict.version ? <span>v{verdict.version}{verdict.buildSha && verdict.buildSha !== 'unknown' ? ` · ${verdict.buildSha}` : ''}</span> : null}
        {verdict.state === 'ok' ? <span>{verdict.latencyMs} ms</span> : null}
        <button
          type="button"
          className="worker-status__refresh"
          onClick={() => { setRefreshing(true); void load().finally(() => setRefreshing(false)); }}
          disabled={refreshing}
          title="Check again"
        >
          <RefreshCw size={13} aria-hidden /> {refreshing ? 'Checking…' : 'Check again'}
        </button>
      </div>
    </div>
  );
}

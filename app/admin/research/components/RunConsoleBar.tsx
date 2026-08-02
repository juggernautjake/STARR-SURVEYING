'use client';
// app/admin/research/components/RunConsoleBar.tsx — the two questions an operator actually has
// (plan R22): how much has this cost, and is it going to finish.
//
// The run panel already showed a progress list and a cancel button. It showed no cost, no
// elapsed-versus-budget, and no sight of the work a budget quietly dropped — so an operator watching
// a 25-minute run could not answer either question.

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Clock, DollarSign } from 'lucide-react';
import type { RunConsole } from '@/lib/research/run-console';

interface Props {
  projectId: string;
  /** Poll interval while a run is active. */
  pollMs?: number;
}

interface Payload {
  run: RunConsole | null;
  usageFailed?: boolean;
  message?: string;
}

export default function RunConsoleBar({ projectId, pollMs = 10_000 }: Props) {
  const [data, setData] = useState<Payload | null>(null);
  const [readFailed, setReadFailed] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/research/${projectId}/run-console`);
      if (!res.ok) { setReadFailed(true); return; }
      setReadFailed(false);
      setData((await res.json()) as Payload);
    } catch { setReadFailed(true); }
  }, [projectId]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    // Only poll while something is actually running — a finished run does not change, and polling it
    // every ten seconds is load nobody asked for.
    if (data?.run?.status !== 'running') return;
    const t = setInterval(() => void load(), pollMs);
    return () => clearInterval(t);
  }, [data?.run?.status, load, pollMs]);

  if (readFailed) {
    return (
      <div className="run-console run-console--bad">
        The run status could not be read. This is <strong>not</strong> the same as nothing running —
        a run may be active and spending.
      </div>
    );
  }
  if (!data) return null;
  if (!data.run) return null;

  const r = data.run;
  const pct = r.time.fractionUsed != null ? Math.round(r.time.fractionUsed * 100) : null;

  return (
    <div className={`run-console run-console--${r.status}`}>
      <div className="run-console__headline">
        {(r.time.looksStalled || r.status === 'interrupted') && (
          <AlertTriangle size={14} aria-hidden />
        )}
        {r.headline}
      </div>

      <div className="run-console__metrics">
        <span className="run-console__metric" title={r.time.headline}>
          <Clock size={13} aria-hidden />
          {pct != null
            ? `${Math.round(r.time.elapsedMs / 60_000)} / ${Math.round(r.time.budgetMs! / 60_000)} min (${pct}%)`
            : `${Math.round(r.time.elapsedMs / 60_000)} min — no limit set`}
        </span>

        {/* $0.00 and "nothing recorded" are different facts, and the second is why R4 exists. */}
        <span
          className={`run-console__metric${r.spend.noEventsRecorded ? ' run-console__metric--unknown' : ''}`}
          title={r.spend.headline}
        >
          <DollarSign size={13} aria-hidden />
          {r.spend.noEventsRecorded ? 'no spend recorded' : `$${r.spend.totalUsd.toFixed(2)}`}
        </span>

        {r.status === 'running' && <span className="run-console__metric">{r.phase}</span>}
      </div>

      {pct != null && (
        <div className="run-console__bar" aria-hidden>
          <div
            className={`run-console__bar-fill${pct >= 90 ? ' run-console__bar-fill--near' : ''}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}

      {data.usageFailed && (
        <p className="run-console__note run-console__note--warn">
          The spend figures could not be read, so the cost shown above is incomplete.
        </p>
      )}

      {/* A run that finished "successfully" having skipped the deed chain is not a run that
          finished. This is the part a budget silently eats. */}
      {r.skipped.length > 0 && (
        <details className="run-console__skipped">
          <summary>{r.skipped.length} piece(s) of work were skipped to stay inside the budget</summary>
          <ul>
            {r.skipped.map((s, i) => (
              <li key={i}><strong>{s.what}</strong> — {s.reason}</li>
            ))}
          </ul>
        </details>
      )}

      {r.budgetSummary && <p className="run-console__note">{r.budgetSummary}</p>}
    </div>
  );
}

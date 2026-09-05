'use client';

// app/admin/research/components/ProjectCostBadge.tsx — the project's true all-phases spend (F2/U).
//
// Surfaces the per-project cost ledger (GET .../cost) so the operator sees what the WHOLE project has
// actually cost — gather + analyze — not just the worker-phase "SPENT" the run card shows. Reads the
// research_usage_events truth (the $1.82-vs-$3.13 gap the owner flagged).

import { useEffect, useState } from 'react';

interface CostResponse {
  totalUsd: number;
  events: number;
  byEventType: Record<string, number>;
}

const usd = (n: number) => `$${(Number.isFinite(n) && n > 0 ? n : 0).toFixed(2)}`;

export default function ProjectCostBadge({ projectId }: { projectId: string }) {
  const [cost, setCost] = useState<CostResponse | null>(null);
  const [err, setErr] = useState(false);

  useEffect(() => {
    let live = true;
    fetch(`/api/admin/research/${projectId}/cost`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((j: CostResponse) => { if (live) setCost(j); })
      .catch(() => { if (live) setErr(true); });
    return () => { live = false; };
  }, [projectId]);

  if (err || !cost) return null;
  if (cost.totalUsd <= 0) return null;

  // Group the ledger's event types into the two phases the operator thinks in.
  const buy = cost.byEventType['document_purchase'] ?? 0;
  const ai = Object.entries(cost.byEventType)
    .filter(([k]) => k !== 'document_purchase')
    .reduce((s, [, v]) => s + v, 0);

  return (
    <div
      className="project-cost-badge"
      data-testid="project-cost-badge"
      title="Real spend from the usage ledger, across every run on this project"
      style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.82rem', padding: '0.35rem 0.7rem', border: '1px solid var(--border, #e5e7eb)', borderRadius: 999, background: 'var(--surface-2, #fafafa)' }}
    >
      <strong>Project spend {usd(cost.totalUsd)}</strong>
      <span style={{ opacity: 0.7 }}>
        {buy > 0 && <>purchases {usd(buy)} · </>}AI {usd(ai)}
      </span>
    </div>
  );
}

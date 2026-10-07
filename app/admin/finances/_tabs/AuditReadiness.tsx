'use client';
// app/admin/finances/_tabs/AuditReadiness.tsx — "can this year be locked?", and if not, what to check.
//
// Owner, 2026-10-07: flagged receipts "must be checked before a full audit can be done for taxes".
// Lists the open duplicate pairs and the receipts whose reading could not be confirmed
// (lib/receipts/audit-readiness.ts) for the chosen year, and tells the parent whether locking is
// allowed — the Lock button is disabled while anything here remains.
import { useEffect, useState } from 'react';
import Link from 'next/link';
import './AuditReadiness.css';

interface Readiness {
  ok: boolean;
  duplicates: Array<{ id: string; confidence: string; summary: string }>;
  needsReview: Array<{ id: string; vendor: string | null; date: string | null; totalCents: number | null; reason: string }>;
}

export default function AuditReadiness({ year, onReady }: { year: number; onReady: (ok: boolean | null) => void }): React.ReactElement | null {
  const [r, setR] = useState<Readiness | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setR(null);
    onReady(null);
    fetch(`/api/admin/finances/audit-readiness?year=${year}`)
      .then(async (res) => { const j = await res.json(); if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status}`); return j as Readiness; })
      .then((j) => { if (alive) { setR(j); onReady(j.ok); } })
      .catch((e: Error) => { if (alive) { setError(e.message); onReady(null); } });
    return () => { alive = false; };
  }, [year, onReady]);

  if (error) return <p className="aud aud--warn" role="alert">Could not check audit readiness: {error}</p>;
  if (!r) return <p className="aud">Checking {year} for duplicates and unconfirmed receipts…</p>;
  if (r.ok) {
    return <p className="aud aud--ok" data-testid="audit-ready">✓ {year} is ready to lock: no possible duplicates and every receipt&rsquo;s reading is confirmed.</p>;
  }
  return (
    <section className="aud aud--warn" data-testid="audit-blockers">
      <p className="aud__title">{year} cannot be locked until these are checked:</p>
      {r.duplicates.length > 0 && (
        <>
          <p className="aud__sub">{r.duplicates.length} possible duplicate{r.duplicates.length === 1 ? '' : 's'} — decide &ldquo;keep both&rdquo; or remove one</p>
          <ul className="aud__list">{r.duplicates.slice(0, 20).map((d) => <li key={d.id}>{d.summary} <span className="aud__tag">{d.confidence}</span></li>)}</ul>
        </>
      )}
      {r.needsReview.length > 0 && (
        <>
          <p className="aud__sub">{r.needsReview.length} receipt{r.needsReview.length === 1 ? '' : 's'} whose reading could not be confirmed — check against the photo and approve</p>
          <ul className="aud__list">
            {r.needsReview.slice(0, 20).map((n) => (
              <li key={n.id}>
                {n.vendor ?? 'Receipt'}{n.date ? ` · ${n.date.slice(0, 10)}` : ''}{n.totalCents != null ? ` · $${(n.totalCents / 100).toFixed(2)}` : ''} — {n.reason}
              </li>
            ))}
          </ul>
        </>
      )}
      <Link className="aud__link" href="/admin/receipts?tab=queue">Open the receipt queue →</Link>
    </section>
  );
}

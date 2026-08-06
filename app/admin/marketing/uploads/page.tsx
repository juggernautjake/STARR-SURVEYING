'use client';
// /admin/marketing/uploads — did the nightly Google Ads upload work? A8.
//
// The cron uploads with `partialFailure: true`, so Google answers **HTTP 200 while rejecting individual
// rows**. There is no exception, no alert, no non-2xx — the run looks perfect. Without this page the
// symptom is "the numbers in Ads are lower than ours" three weeks later, with nothing to inspect.
//
// ── NOT CONNECTED IS A STATE, NOT AN ERROR ─────────────────────────────────────────────────────────
//
// There is no developer token yet, by design (A7's CSV path exists so nothing waits on it). So the top of
// the page says which specific piece is missing and what to do about it, in plain words — not a red
// failure box for a feature nobody has turned on.
//
// ── GOOGLE'S OWN WORDS ─────────────────────────────────────────────────────────────────────────────
//
// Error text is shown verbatim. A paraphrase is a support ticket: the operator cannot search for it, and
// Google's help pages are written against their strings, not ours.
import { useCallback, useEffect, useState } from 'react';

interface LogRow {
  id: string;
  event_id: string | null;
  conversion_action: string;
  kind: string;
  adjustment_type: string | null;
  status: string;
  error_code: string | null;
  error_detail: string | null;
  attempts: number;
  uploaded_at: string | null;
  created_at: string;
}

interface Payload {
  connection: {
    problem: string | null;
    help: string | null;
    customerId: string | null;
    connectedBy: string | null;
    lastUploadedAt: string | null;
    lastError: string | null;
    conversionActions?: { configured: string[]; missing: string[] };
  };
  counts: {
    total: number; uploaded: number; failed: number; pending: number;
    conversions: number; adjustments: number;
    failedConversions: number; failedAdjustments: number; windowSkips: number;
  };
  failures: LogRow[];
  recent: LogRow[];
}

const when = (iso: string | null): string => (iso ? new Date(iso).toLocaleString() : '—');

/** Milestone keys are database values; this page is read by whoever is turning the integration on. */
const MILESTONE_LABELS: Record<string, string> = {
  inquiry_received: 'Inquiry',
  quoted: 'Quoted',
  job_created: 'Job won',
  payment_received: 'Job paid',
};
const milestoneLabel = (m: string): string => MILESTONE_LABELS[m] ?? m;

export default function MarketingUploadsPage(): React.ReactElement {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetch('/api/admin/marketing/uploads');
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `HTTP ${res.status}`);
      setData(await res.json() as Payload);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the upload log.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const conn = data?.connection;

  return (
    <div className="mu">
      <h1 className="mu__title">Google Ads uploads</h1>
      <p className="mu__lead">
        What the nightly job sent, and anything Google rejected. Rejections arrive inside a successful
        response — they are invisible anywhere else.
      </p>

      <section className="mu__panel" data-testid="uploads-connection">
        <h2 className="mu__h2">Connection</h2>
        {loading ? <p className="mu__muted">Loading…</p> : conn?.problem ? (
          <>
            <p className="mu__pending">
              <strong>Not uploading yet</strong> — <code>{conn.problem}</code>
            </p>
            {/* The actionable half. "not-connected" on its own helps nobody. */}
            <p className="mu__muted">{conn.help}</p>
            <p className="mu__muted">
              This is expected until the Ads credentials arrive. In the meantime the{' '}
              <a href="/admin/marketing/exports">CSV export</a> does the same job by hand.
            </p>
          </>
        ) : conn ? (
          <ul className="mu__stats">
            <li><span>Account</span> {conn.customerId ?? '—'}</li>
            <li><span>Connected by</span> {conn.connectedBy ?? '—'}</li>
            <li>
              <span>Last upload</span>{' '}
              {conn.lastUploadedAt
                ? when(conn.lastUploadedAt)
                : /* Never-uploaded and uploaded-then-broke look identical if you only print a date. */
                  <em>never — the nightly job has not sent anything yet</em>}
            </li>
            {conn.lastError && <li className="mu__bad"><span>Last error</span> {conn.lastError}</li>}
          </ul>
        ) : <p className="mu__muted">No connection record.</p>}

        {/* PARTIAL configuration — added 2026-08-06.
         *
         * Not an error, and that is exactly the problem: with some conversion actions configured the
         * job runs, reports success, and silently drops every event whose milestone has no resource
         * name. Configure only "inquiry" and Google learns about leads but never hears that any of
         * them became paid work — which is the value-based bidding this pipeline exists to feed. */}
        {!loading && conn?.conversionActions && conn.conversionActions.missing.length > 0
          && conn.conversionActions.configured.length > 0 && (
          <p className="mu__pending" data-testid="uploads-partial-actions">
            <strong>Only some milestones are being reported.</strong>{' '}
            Sending: {conn.conversionActions.configured.map(milestoneLabel).join(', ')}.{' '}
            Not sending: {conn.conversionActions.missing.map(milestoneLabel).join(', ')} — those
            events are skipped every night, silently. Set the matching{' '}
            <code>GOOGLE_ADS_RESOURCE_…</code> variables to start reporting them.
          </p>
        )}
      </section>

      {data && (
        <section className="mu__panel" data-testid="uploads-counts">
          <h2 className="mu__h2">Last 100 attempts</h2>
          <ul className="mu__stats">
            <li><span>{data.counts.uploaded}</span> accepted by Google</li>
            {/* The two failures need different responses, so they are never shown as one number. */}
            <li className={data.counts.failedConversions ? 'mu__bad' : undefined}>
              <span>{data.counts.failedConversions}</span> conversions rejected{' '}
              <em>(revenue Google never heard about)</em>
            </li>
            <li className={data.counts.failedAdjustments ? 'mu__bad' : undefined}>
              <span>{data.counts.failedAdjustments}</span> adjustments rejected{' '}
              <em>(Google still has the ESTIMATE and is still bidding on it)</em>
            </li>
            <li><span>{data.counts.pending}</span> pending</li>
            <li>
              <span>{data.counts.conversions}</span> conversions / <strong>{data.counts.adjustments}</strong> adjustments sent
            </li>
          </ul>
        </section>
      )}

      {data && data.counts.windowSkips > 0 && (
        <section className="mu__panel" data-testid="uploads-window-skips">
          <h2 className="mu__h2">{data.counts.windowSkips} correction{data.counts.windowSkips === 1 ? '' : 's'} the window closed on</h2>
          <p className="mu__muted">
            These jobs invoiced at a different figure than the quote we reported, but the click was more
            than 90 days old — Google will not accept an adjustment. <strong>Our books are correct and
            were not changed to match.</strong> Google&apos;s reported conversion value for these jobs is
            permanently the original estimate.
          </p>
          <p className="mu__hint">
            Recorded on each lifecycle event under <code>adjustment_skipped_window</code>, with both the
            reported and the actual figure, so the gap can be measured rather than guessed at.
          </p>
        </section>
      )}

      {data && data.failures.length > 0 && (
        <section className="mu__panel" data-testid="uploads-failures">
          <h2 className="mu__h2">Rejected — Google&apos;s own words</h2>
          <div className="mu__scroll">
            <table className="mu__table">
              <thead>
                <tr><th>When</th><th>What</th><th>Code</th><th>Detail</th><th>Action</th></tr>
              </thead>
              <tbody>
                {data.failures.map((f) => (
                  <tr key={f.id}>
                    <td>{when(f.created_at)}</td>
                    <td>{f.kind === 'adjustment' ? (f.adjustment_type ?? 'adjustment').toLowerCase() : 'conversion'}</td>
                    <td><code>{f.error_code ?? '—'}</code></td>
                    <td>{f.error_detail ?? '—'}</td>
                    <td className="mu__mono">{f.conversion_action}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mu__hint">
            A rejected row can be re-sent: the nightly job retries anything without a successful log entry,
            and a corrected value goes as an adjustment rather than a duplicate.
          </p>
        </section>
      )}

      {data && data.recent.length === 0 && (
        <section className="mu__panel">
          <p className="mu__muted">
            Nothing has been attempted yet. That is the correct state before the credentials exist.
          </p>
        </section>
      )}

      {error && <p className="mu__error" role="alert">{error}</p>}

      <style jsx>{`
        .mu { padding: 20px; max-width: 900px; }
        .mu__title { font-size: 1.4rem; margin: 0 0 6px; }
        .mu__lead { color: #4b5563; margin: 0 0 18px; }
        .mu__panel { border: 1px solid #e5e7eb; border-radius: 10px; padding: 14px 16px; margin-bottom: 14px; background: #fff; }
        .mu__h2 { font-size: 1.05rem; margin: 0 0 8px; font-weight: 600; }
        .mu__muted { color: #6b7280; font-size: 0.88rem; margin: 4px 0; }
        .mu__hint { color: #6b7280; font-size: 0.82rem; margin: 10px 0 0; }
        .mu__pending { margin: 0 0 4px; }
        .mu__bad { color: #991b1b; }
        .mu__error { color: #991b1b; }
        .mu__stats { list-style: none; padding: 0; margin: 0; display: grid; gap: 6px; font-size: 0.9rem; }
        .mu__stats span { font-weight: 700; display: inline-block; min-width: 9ch; }
        .mu__stats em { color: #6b7280; font-style: normal; }
        .mu__scroll { overflow-x: auto; }
        .mu__table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
        .mu__table th, .mu__table td { text-align: left; padding: 7px 9px; border-bottom: 1px solid #f0f1f3; vertical-align: top; }
        .mu__table th { color: #4b5563; font-weight: 600; white-space: nowrap; }
        .mu__mono { font-family: ui-monospace, monospace; font-size: 0.78rem; word-break: break-all; }
      `}</style>
    </div>
  );
}

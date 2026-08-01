'use client';
// /admin/marketing/exports — download the offline-conversion CSV and mark it uploaded. A7.
//
// The whole point of A7 is that it works with **no Google API access and no developer-token wait**: pick a
// range, download a file, drag it into Google Ads → Goals → Conversions → Uploads. When A8's API path
// lands, this page stays as the manual fallback and the audit trail.
//
// ── THE SUMMARY COMES BEFORE THE DOWNLOAD, DELIBERATELY ────────────────────────────────────────────
//
// A CSV is opaque. Someone downloads it, uploads it, and Google reports "37 conversions" — and there is
// no way to tell whether the other 60 were already sent, had no click id, or fell outside the 90-day
// window. Each of those means something different and one of them is a bug.
//
// So the page tells you what the file WILL contain before you take it anywhere, broken down by why rows
// were left out. The counts are the product; the file is just the delivery mechanism.
//
// ── MARKING IS A SEPARATE, EXPLICIT STEP ───────────────────────────────────────────────────────────
//
// Downloading is not uploading. If the download marked rows as sent, then a file you glanced at and
// closed — or one Google rejected — would silently lose those conversions forever, because the next
// export would skip them. Mark only after Google has accepted it.
import { useCallback, useEffect, useState } from 'react';

const MILESTONES = [
  { key: 'job_created', label: 'Job — Won (primary)', hint: 'The bidding conversion. Valued at the accepted quote.' },
  { key: 'quoted', label: 'Lead — Quoted', hint: 'Observation only; do not bid on this.' },
  { key: 'inquiry_received', label: 'Lead — Inquiry', hint: 'Observation only. Already tracked client-side too.' },
  { key: 'payment_received', label: 'Job — Paid', hint: 'Restates a won job where the click window allows.' },
];

interface Summary {
  conversionName: string;
  total: number;
  alreadyExported: number;
  outOfWindow: number;
  noIdentifier: number;
  included: number;
  eventIds: string[];
}

export default function MarketingExportsPage(): React.ReactElement {
  const [milestone, setMilestone] = useState('job_created');
  const [format, setFormat] = useState<'click' | 'enhanced'>('click');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(false);
  const [marked, setMarked] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const qs = useCallback(() => {
    const p = new URLSearchParams({ milestone, format });
    if (from) p.set('from', new Date(from).toISOString());
    if (to) p.set('to', new Date(to).toISOString());
    return p;
  }, [milestone, format, from, to]);

  const loadSummary = useCallback(async () => {
    setLoading(true); setError(null); setMarked(null);
    try {
      const p = qs(); p.set('summary', '1');
      const res = await fetch(`/api/admin/marketing/exports?${p.toString()}`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { setError(json.error ?? 'Could not read the export summary.'); setSummary(null); return; }
      setSummary(json as Summary);
    } finally {
      setLoading(false);
    }
  }, [qs]);

  useEffect(() => { void loadSummary(); }, [loadSummary]);

  async function markUploaded() {
    if (!summary?.eventIds.length) return;
    setError(null);
    const res = await fetch('/api/admin/marketing/exports', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eventIds: summary.eventIds }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) { setError(json.error ?? 'Could not mark them.'); return; }
    setMarked(json.marked ?? 0);
    await loadSummary();
  }

  return (
    <div className="mx">
      <h1 className="mx__title">Google Ads — offline conversions</h1>
      <p className="mx__lead">
        Download a conversion file and upload it in Google Ads under <strong>Goals → Conversions →
        Uploads</strong>. Nothing here needs API access.
      </p>

      <section className="mx__panel">
        <div className="mx__row">
          <label htmlFor="mx-milestone">Conversion action</label>
          <select id="mx-milestone" value={milestone} onChange={(e) => setMilestone(e.target.value)}>
            {MILESTONES.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
          </select>
        </div>
        <p className="mx__hint">{MILESTONES.find((m) => m.key === milestone)?.hint}</p>

        <div className="mx__row">
          <label htmlFor="mx-format">Match on</label>
          <select id="mx-format" value={format} onChange={(e) => setFormat(e.target.value as 'click' | 'enhanced')}>
            <option value="click">Google Click ID (web leads)</option>
            <option value="enhanced">Hashed email / phone (phone + referral leads)</option>
          </select>
        </div>
        <p className="mx__hint">
          {format === 'click'
            ? 'Only leads that arrived from an ad click. Rows outside the 90-day click window are left out — Google would reject them.'
            : 'Enhanced Conversions for Leads. Covers leads with no click at all, which at this business is most of them.'}
        </p>

        <div className="mx__row mx__row--dates">
          <label htmlFor="mx-from">From</label>
          <input id="mx-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          <label htmlFor="mx-to">To</label>
          <input id="mx-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
      </section>

      {/* The counts, before the file. See the header — this is the product; the CSV is delivery. */}
      <section className="mx__panel" data-testid="export-summary">
        {loading ? <p className="mx__muted">Counting…</p> : summary ? (
          <>
            <h2 className="mx__h2">This file will contain <strong>{summary.included}</strong> conversion{summary.included === 1 ? '' : 's'}</h2>
            <p className="mx__muted">Uploading as <code>{summary.conversionName}</code> — the name must match your Ads account exactly.</p>
            <ul className="mx__stats">
              <li><span>{summary.total}</span> milestones in range</li>
              <li><span>{summary.alreadyExported}</span> already exported <em>(skipped so nothing is counted twice)</em></li>
              <li><span>{summary.outOfWindow}</span> outside the 90-day click window <em>(Google would reject these)</em></li>
              <li><span>{summary.noIdentifier}</span> with no usable identifier <em>(no click id, or no hashed email/phone)</em></li>
            </ul>
            {summary.included === 0 && (
              <p className="mx__muted">
                Nothing to upload for this selection. That is a normal answer — most leads at this business
                arrive by phone and have no click to match on.
              </p>
            )}
          </>
        ) : <p className="mx__muted">No summary.</p>}
      </section>

      <section className="mx__panel mx__actions">
        <a className="mx__btn mx__btn--primary" href={`/api/admin/marketing/exports?${qs().toString()}`}
          data-testid="export-download">
          ⬇ Download CSV
        </a>
        <button type="button" className="mx__btn" onClick={() => void markUploaded()}
          disabled={!summary?.included} data-testid="export-mark">
          Mark as uploaded to Google
        </button>
        {marked !== null && <span className="mx__ok">Marked {marked}. They will not be exported again.</span>}
      </section>
      <p className="mx__hint">
        Only press <em>Mark as uploaded</em> once Google has accepted the file. Marking a file you never
        uploaded loses those conversions — the next export will skip them.
      </p>

      {error && <p className="mx__error" role="alert">{error}</p>}

      <style jsx>{`
        .mx { padding: 20px; max-width: 820px; }
        .mx__title { font-size: 1.4rem; margin: 0 0 6px; }
        .mx__lead { color: #4b5563; margin: 0 0 18px; }
        .mx__panel { border: 1px solid #e5e7eb; border-radius: 10px; padding: 14px 16px; margin-bottom: 14px; background: #fff; }
        .mx__h2 { font-size: 1.05rem; margin: 0 0 4px; font-weight: 600; }
        .mx__row { display: flex; align-items: center; gap: 10px; margin-bottom: 6px; flex-wrap: wrap; }
        .mx__row--dates label { min-width: 0; }
        .mx__row label { min-width: 130px; font-weight: 600; font-size: 0.85rem; }
        .mx__hint { color: #6b7280; font-size: 0.82rem; margin: 0 0 12px; }
        .mx__muted { color: #6b7280; font-size: 0.88rem; }
        .mx__stats { list-style: none; padding: 0; margin: 10px 0 0; display: grid; gap: 4px; font-size: 0.88rem; }
        .mx__stats span { font-weight: 700; display: inline-block; min-width: 2.5ch; }
        .mx__stats em { color: #6b7280; font-style: normal; }
        .mx__actions { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
        .mx__btn { padding: 10px 14px; border-radius: 8px; border: 1px solid #d1d5db; background: #fff;
          cursor: pointer; font: inherit; text-decoration: none; color: inherit; min-height: 44px;
          display: inline-flex; align-items: center; }
        .mx__btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .mx__btn--primary { background: #1d3095; color: #fff; border-color: #1d3095; }
        .mx__ok { color: #065f46; font-size: 0.88rem; }
        .mx__error { color: #991b1b; }
        select, input { padding: 8px 10px; border: 1px solid #d1d5db; border-radius: 8px; font: inherit; min-height: 40px; }
      `}</style>
    </div>
  );
}

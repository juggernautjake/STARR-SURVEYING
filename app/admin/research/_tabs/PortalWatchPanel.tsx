'use client';
// PortalWatchPanel — has this county announced a portal migration? §I3.3
//
// Sits beside the sweep because the two answer the same question from opposite ends of time. The
// sweep probes and tells you an adapter BROKE. This searches and tells you one is ABOUT TO — the
// difference between a planned adapter update and a failed run at 2am.
//
// ── IT REPORTS WHAT IT REJECTED ─────────────────────────────────────────────────────────────────
//
// Noise is counted and shown, not hidden. A panel that displays only hits looks exactly like a panel
// whose search is broken, and "nothing announced" is only reassuring if you can see that something
// was actually checked. Same reason the status line distinguishes "no key configured" from "searched
// and found nothing": those produce an identical empty list and mean opposite things.
//
// Styled with scoped CSS rather than the inline style objects the rest of this tab uses, following
// AttributionCard — component styles that travel with the component.
import { useCallback, useState } from 'react';

type Status = 'searched' | 'not-configured' | 'search-failed';
type Verdict = 'likely' | 'possible' | 'noise';

interface Hit {
  url: string;
  title: string;
  verdict: Verdict;
  reasons: string[];
  excerpt: string | null;
  year: number | null;
}

interface Report {
  county: string;
  hits: Hit[];
  counts: Record<Verdict, number>;
  actionable: boolean;
}

interface Data { status: Status; report: Report | null; steps: string[] }

const STATUS_COPY: Record<Status, { tone: 'ok' | 'warn' | 'off'; text: string }> = {
  searched: { tone: 'ok', text: 'Searched the public web for a migration announcement.' },
  'not-configured': { tone: 'off', text: 'Not searched: no TAVILY_API_KEY is set. This is a blank, not an all-clear.' },
  'search-failed': { tone: 'warn', text: 'The search provider did not answer. Try again — this is not "nothing announced".' },
};

export default function PortalWatchPanel(): React.ReactElement {
  const [county, setCounty] = useState('');
  const [vendor, setVendor] = useState('');
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async () => {
    if (!county.trim()) return;
    setLoading(true); setError(null); setData(null);
    try {
      const qs = new URLSearchParams({ county: county.trim() });
      if (vendor.trim()) qs.set('vendor', vendor.trim());
      const res = await fetch(`/api/admin/research/portal-watch?${qs}`);
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `HTTP ${res.status}`);
      setData(await res.json() as Data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The portal watch could not run.');
    } finally { setLoading(false); }
  }, [county, vendor]);

  const status = data ? STATUS_COPY[data.status] : null;
  const surfaced = data?.report?.hits.filter((h) => h.verdict !== 'noise') ?? [];

  return (
    <div className="pw">
      <h2 className="pw__title">Portal migration watch</h2>
      <p className="pw__sub">
        The sweep tells you an adapter broke. This asks whether a county has <em>announced</em> that
        its records portal is moving — usually weeks before the old URL stops answering.
      </p>

      <div className="pw__row">
        <input
          type="text" value={county} placeholder="County, e.g. Bell"
          onChange={(e) => setCounty(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void run(); }}
          data-testid="pw-county"
        />
        <input
          type="text" value={vendor} placeholder="Current vendor (optional)"
          onChange={(e) => setVendor(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void run(); }}
        />
        <button type="button" onClick={() => void run()} disabled={loading || !county.trim()} data-testid="pw-run">
          {loading ? 'Searching…' : 'Check'}
        </button>
      </div>

      {status && <p className={`pw__status pw__status--${status.tone}`} role="status">{status.text}</p>}

      {data?.report && (
        <p className="pw__counts">
          {data.report.counts.likely} likely · {data.report.counts.possible} possible ·{' '}
          {/* Shown deliberately: a watch that reports only its hits is indistinguishable from one
              that is not running. */}
          {data.report.counts.noise} checked and rejected
        </p>
      )}

      {data?.report && surfaced.length === 0 && data.status === 'searched' && (
        <p className="pw__quiet">
          Nothing announced for {data.report.county}. {data.report.hits.length} result(s) were checked
          and none carried a county-specific migration notice.
        </p>
      )}

      {surfaced.length > 0 && (
        <ul className="pw__list">
          {surfaced.map((h, i) => (
            <li key={i} className="pw__item">
              <div className="pw__head">
                <span className={`pw__verdict pw__verdict--${h.verdict}`}>{h.verdict}</span>
                {h.year && <span className="pw__year">{h.year}</span>}
              </div>
              <a href={h.url} target="_blank" rel="noopener noreferrer" className="pw__link">{h.title}</a>
              {h.excerpt && <p className="pw__excerpt">“{h.excerpt}”</p>}
              <p className="pw__reasons">{h.reasons.join(' · ')}</p>
            </li>
          ))}
        </ul>
      )}

      {error && <p className="pw__error" role="alert">{error}</p>}

      <style jsx>{`
        .pw { padding: 14px 16px; border: 1px solid var(--theme-border, #e5e7eb); border-radius: 10px;
          background: var(--theme-bg-surface, #fff); }
        .pw__title { font-size: 1rem; margin: 0 0 6px; font-weight: 600; }
        .pw__sub { color: var(--theme-fg-secondary, #6b7280); font-size: 0.84rem; margin: 0 0 12px; }
        .pw__row { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 12px; }
        .pw__row input { flex: 1 1 180px; padding: 8px 10px; border: 1px solid var(--color-border, #d1d5db);
          border-radius: 8px; font: inherit; min-height: 40px; }
        .pw__row button { padding: 8px 16px; border-radius: 8px; border: 1px solid var(--theme-accent, #1d3095);
          background: var(--theme-accent, #1d3095); color: var(--theme-accent-fg, #fff); font: inherit; cursor: pointer; min-height: 40px; }
        .pw__row button:disabled { opacity: 0.45; cursor: not-allowed; }
        .pw__status { font-size: 0.82rem; margin: 0 0 8px; padding: 7px 10px; border-radius: 8px; }
        .pw__status--ok { background: var(--color-info-bg, #eff6ff); color: var(--color-info-text, #1e3a8a); }
        .pw__status--warn { background: var(--color-warning-bg, #fef3c7); color: var(--color-warning-text, #78350f); }
        .pw__status--off { background: var(--color-bg-subtle, #f3f4f6); color: var(--color-text-secondary, #4b5563); }
        .pw__counts { font-size: 0.8rem; color: var(--color-text-secondary, #6b7280); margin: 0 0 10px;
          font-variant-numeric: tabular-nums; }
        .pw__quiet { font-size: 0.85rem; color: var(--color-text-secondary, #4b5563); margin: 0; }
        .pw__list { list-style: none; padding: 0; margin: 0; display: grid; gap: 12px; }
        .pw__item { border-left: 3px solid var(--color-border, #e5e7eb); padding-left: 11px; }
        .pw__head { display: flex; gap: 8px; align-items: center; margin-bottom: 4px; }
        .pw__verdict { font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.03em;
          padding: 2px 7px; border-radius: 99px; }
        .pw__verdict--likely { background: var(--color-success-bg, #dcfce7); color: var(--color-success-text, #14532d); }
        .pw__verdict--possible { background: var(--color-warning-bg, #fef3c7); color: var(--color-warning-text, #78350f); }
        .pw__year { font-size: 0.72rem; color: var(--color-text-tertiary, #6b7280); font-variant-numeric: tabular-nums; }
        .pw__link { font-size: 0.87rem; font-weight: 500; color: var(--color-brand, #1d3095); }
        .pw__excerpt { font-size: 0.83rem; color: var(--color-text-primary, #374151); margin: 5px 0 3px;
          font-style: italic; }
        .pw__reasons { font-size: 0.75rem; color: var(--color-text-tertiary, #6b7280); margin: 0; }
        .pw__error { color: var(--color-error-text, #991b1b); font-size: 0.85rem; margin: 10px 0 0; }
      `}</style>
    </div>
  );
}

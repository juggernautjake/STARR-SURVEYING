'use client';
// /admin/marketing/spend — what the ads cost, so "cost per lead" has a denominator. A11.
//
// The owner asked for true lead costs. Conversions without spend is a numerator on its own: "we got 14
// leads" is not something anyone can act on.
//
// ── THE MANUAL SHARE IS SHOWN, NOT HIDDEN ──────────────────────────────────────────────────────────
//
// Until the Ads developer token arrives, spend is typed off the invoice. That is fine — a rough
// denominator beats none — but only if the page says so. A figure you know is approximate is usable; one
// you believe is exact and is not is worse than nothing, because you will act on it with confidence.
//
// ── ENTERING A DAY TWICE UPDATES IT ────────────────────────────────────────────────────────────────
//
// Manual entries sit at the same grain as the nightly import, so re-entering a day corrects it rather
// than adding to it — and when the API import eventually runs, the real number overwrites the estimate.
import { useCallback, useEffect, useMemo, useState } from 'react';

interface Row {
  id: string; spend_date: string; platform: string;
  campaign_id: string; campaign_name: string | null;
  impressions: number; clicks: number; cost_micros: number;
  conversions: number; source: string; notes: string | null; entered_by: string | null;
}

interface Totals {
  spendMicros: number; spendDollars: number; clicks: number; impressions: number;
  manualMicros: number; manualShare: number;
}

const money = (dollars: number): string =>
  dollars.toLocaleString(undefined, { style: 'currency', currency: 'USD' });

export default function MarketingSpendPage(): React.ReactElement {
  const [rows, setRows] = useState<Row[]>([]);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const [entryDate, setEntryDate] = useState('');
  const [entryCost, setEntryCost] = useState('');
  const [entryPlatform, setEntryPlatform] = useState('google_ads');
  const [entryNotes, setEntryNotes] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const p = new URLSearchParams();
      if (from) p.set('from', from);
      if (to) p.set('to', to);
      const res = await fetch(`/api/admin/marketing/spend?${p.toString()}`);
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `HTTP ${res.status}`);
      const json = await res.json() as { rows: Row[]; totals: Totals };
      setRows(json.rows); setTotals(json.totals);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load spend.');
    } finally { setLoading(false); }
  }, [from, to]);

  useEffect(() => { void load(); }, [load]);

  const save = useCallback(async () => {
    setError(null); setSaved(null);
    try {
      const res = await fetch('/api/admin/marketing/spend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          spendDate: entryDate, costDollars: Number(entryCost),
          platform: entryPlatform, notes: entryNotes || undefined,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setSaved(`Recorded ${money(Number(entryCost))} for ${entryDate}.`);
      setEntryCost(''); setEntryNotes('');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save.');
    }
  }, [entryDate, entryCost, entryPlatform, entryNotes, load]);

  const canSave = Boolean(entryDate) && entryCost !== '' && Number(entryCost) >= 0 && Number.isFinite(Number(entryCost));

  const byPlatform = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of rows) map.set(r.platform, (map.get(r.platform) ?? 0) + Number(r.cost_micros ?? 0));
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [rows]);

  return (
    <div className="ms">
      <h1 className="ms__title">Ad spend</h1>
      <p className="ms__lead">
        The denominator. Without it, conversions are a count with nothing to divide by.
      </p>

      <section className="ms__panel">
        <div className="ms__row">
          <label htmlFor="ms-from">From</label>
          <input id="ms-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          <label htmlFor="ms-to">To</label>
          <input id="ms-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
      </section>

      <section className="ms__panel" data-testid="spend-totals">
        {loading ? <p className="ms__muted">Loading…</p> : totals ? (
          <>
            <h2 className="ms__h2">{money(totals.spendDollars)} across {rows.length} row{rows.length === 1 ? '' : 's'}</h2>
            <ul className="ms__stats">
              <li><span>{totals.clicks.toLocaleString()}</span> clicks</li>
              <li><span>{totals.impressions.toLocaleString()}</span> impressions</li>
              {byPlatform.map(([p, micros]) => (
                <li key={p}><span>{money(micros / 1_000_000)}</span> {p.replace(/_/g, ' ')}</li>
              ))}
            </ul>
            {/* The honesty meter. Every derived cost figure is only as exact as this fraction. */}
            {totals.manualShare > 0 && (
              <p className="ms__warn" data-testid="spend-manual-share">
                <strong>{Math.round(totals.manualShare * 100)}% of this total was typed in by hand.</strong>{' '}
                Treat every cost-per-lead figure derived from it as approximate until the Ads API import is
                connected.
              </p>
            )}
            {rows.length === 0 && (
              <p className="ms__muted">
                No spend recorded for this range. Enter it below — a rough denominator beats none, and an
                absent one makes every cost figure on the dashboard silently wrong.
              </p>
            )}
          </>
        ) : <p className="ms__muted">No data.</p>}
      </section>

      <section className="ms__panel" data-testid="spend-entry">
        <h2 className="ms__h2">Record spend by hand</h2>
        <p className="ms__hint">
          From the Google Ads invoice or the campaign screen. Entering the same day twice corrects it
          rather than adding to it, and the API import will overwrite it with the real number.
        </p>
        <div className="ms__row">
          <label htmlFor="ms-date">Date</label>
          <input id="ms-date" type="date" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} />
          <label htmlFor="ms-cost">Cost ($)</label>
          <input id="ms-cost" type="number" min="0" step="0.01" value={entryCost}
            onChange={(e) => setEntryCost(e.target.value)} placeholder="0.00" />
          <label htmlFor="ms-platform">Platform</label>
          <select id="ms-platform" value={entryPlatform} onChange={(e) => setEntryPlatform(e.target.value)}>
            <option value="google_ads">Google Ads</option>
            <option value="facebook">Facebook</option>
            <option value="instagram">Instagram</option>
            <option value="other">Other</option>
          </select>
        </div>
        <div className="ms__row">
          <label htmlFor="ms-notes">Note</label>
          <input id="ms-notes" type="text" value={entryNotes} maxLength={500}
            onChange={(e) => setEntryNotes(e.target.value)} placeholder="e.g. monthly invoice total, split evenly" />
        </div>
        <button type="button" className="ms__btn ms__btn--primary" onClick={() => void save()}
          disabled={!canSave} data-testid="spend-save">
          Record spend
        </button>
        {saved && <span className="ms__ok">{saved}</span>}
      </section>

      {rows.length > 0 && (
        <section className="ms__panel">
          <h2 className="ms__h2">Rows</h2>
          <div className="ms__scroll">
            <table className="ms__table">
              <thead>
                <tr><th>Date</th><th>Platform</th><th>Campaign</th><th>Clicks</th><th>Cost</th><th>Source</th></tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td>{r.spend_date}</td>
                    <td>{r.platform.replace(/_/g, ' ')}</td>
                    <td>{r.campaign_name ?? <em className="ms__muted">account level</em>}</td>
                    <td>{Number(r.clicks ?? 0).toLocaleString()}</td>
                    <td>{money(Number(r.cost_micros ?? 0) / 1_000_000)}</td>
                    <td>{r.source === 'manual'
                      ? <span className="ms__tag" title={r.entered_by ?? undefined}>typed in</span>
                      : <span className="ms__tag ms__tag--api">from Ads</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {error && <p className="ms__error" role="alert">{error}</p>}

      <style jsx>{`
        .ms { padding: 20px; max-width: 940px; }
        .ms__title { font-size: 1.4rem; margin: 0 0 6px; }
        .ms__lead { color: #4b5563; margin: 0 0 18px; }
        .ms__panel { border: 1px solid #e5e7eb; border-radius: 10px; padding: 14px 16px; margin-bottom: 14px; background: #fff; }
        .ms__h2 { font-size: 1.05rem; margin: 0 0 6px; font-weight: 600; }
        .ms__row { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; flex-wrap: wrap; }
        .ms__row label { font-weight: 600; font-size: 0.85rem; }
        .ms__hint { color: #6b7280; font-size: 0.82rem; margin: 0 0 12px; }
        .ms__muted { color: #6b7280; font-size: 0.88rem; }
        .ms__warn { background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; padding: 9px 11px;
          font-size: 0.85rem; color: #78350f; margin: 12px 0 0; }
        .ms__stats { list-style: none; padding: 0; margin: 10px 0 0; display: grid; gap: 4px; font-size: 0.88rem; }
        .ms__stats span { font-weight: 700; display: inline-block; min-width: 9ch; }
        .ms__btn { padding: 10px 14px; border-radius: 8px; border: 1px solid #d1d5db; background: #fff;
          cursor: pointer; font: inherit; min-height: 44px; }
        .ms__btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .ms__btn--primary { background: #1d3095; color: #fff; border-color: #1d3095; }
        .ms__ok { color: #065f46; font-size: 0.88rem; margin-left: 10px; }
        .ms__error { color: #991b1b; }
        .ms__scroll { overflow-x: auto; }
        .ms__table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
        .ms__table th, .ms__table td { text-align: left; padding: 7px 9px; border-bottom: 1px solid #f0f1f3; }
        .ms__table th { color: #4b5563; font-weight: 600; white-space: nowrap; }
        .ms__tag { font-size: 0.74rem; padding: 2px 7px; border-radius: 99px; background: #fef3c7; color: #78350f; }
        .ms__tag--api { background: #dcfce7; color: #14532d; }
        select, input { padding: 8px 10px; border: 1px solid #d1d5db; border-radius: 8px; font: inherit; min-height: 40px; }
      `}</style>
    </div>
  );
}

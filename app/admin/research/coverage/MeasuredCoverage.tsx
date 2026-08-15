'use client';
// app/admin/research/coverage/MeasuredCoverage.tsx — what we can actually read (plan R11).
//
// The table below this one renders the worker's compiled clerk registry: a map of INTENT, showing a
// county identically whether its adapter has ever successfully read a page or not. This panel is the
// other claim — what has been PROVEN — and it is deliberately a separate block rather than a colour
// change on the same rows, because the two answer different questions and a reader must be able to
// tell which one they are looking at.
//
// The state that matters most is `unverified`: an adapter registered and believed to work, which
// nothing has ever tested. Showing it the same as a proven one converts an unknown into a promise,
// and this dashboard is what a firm looks at before telling a customer it can search their county.

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, CircleDashed, HelpCircle, XCircle } from 'lucide-react';
import type { CountyCoverage, CoverageTotals, SiteState } from '@/lib/research/coverage-rollup';

interface Payload {
  counties: CountyCoverage[];
  totals: CoverageTotals;
  headline: string;
  checksSeen: number;
}

const SITE_LABEL: Record<string, string> = {
  clerk_deeds: 'Deeds',
  appraisal_cad: 'Appraisal',
};

const STATE_META: Record<SiteState, { icon: typeof CheckCircle2; label: string; tone: string }> = {
  verified:   { icon: CheckCircle2,  label: 'proven',     tone: 'ok' },
  unverified: { icon: HelpCircle,    label: 'untested',   tone: 'unknown' },
  failing:    { icon: AlertTriangle, label: 'failing',    tone: 'bad' },
  planned:    { icon: CircleDashed,  label: 'placeholder', tone: 'muted' },
  absent:     { icon: XCircle,       label: 'none',       tone: 'muted' },
};

export default function MeasuredCoverage() {
  const [data, setData] = useState<Payload | null>(null);
  const [state, setState] = useState<'loading' | 'ok' | 'failed'>('loading');

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/research/coverage');
      if (!res.ok) { setState('failed'); return; }
      setData((await res.json()) as Payload);
      setState('ok');
    } catch { setState('failed'); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  if (state === 'loading') return <p className="measured__note">Reading the registry…</p>;
  if (state === 'failed') {
    return (
      <p className="measured__note measured__note--bad">
        The measured coverage could not be read. This is not “no counties are covered” — it is this
        page failing to ask.
      </p>
    );
  }
  if (!data) return null;

  return (
    <section className="measured">
      <header className="measured__head">
        <h2 className="measured__title">What we have actually proven</h2>
        <p className="measured__headline">{data.headline}</p>
        {data.checksSeen === 0 ? (
          // The single most important sentence on the page when it is true.
          <p className="measured__warn">
            <AlertTriangle size={14} aria-hidden /> No health check has ever run, so every county
            below is registered-but-untested. That is a fact about us, not about the counties.
          </p>
        ) : null}
      </header>

      {data.counties.length === 0 ? (
        <p className="measured__note">
          No adapters are registered yet. The worker publishes its compiled county list on boot — if
          this is empty, the worker has not connected to this database.
        </p>
      ) : (
        // admin-ui-alignment-2026-08-15 (A11) — wrapped so it scrolls inside its card on a phone
        // instead of running 110px past the right edge. `.admin-table-wrap` is the shared wrapper
        // in AdminResponsive.css that 26 other admin tables already use.
        <div className="admin-table-wrap"><table className="measured__table">
          <thead>
            <tr>
              <th>County</th>
              <th>Deeds</th>
              <th>Appraisal</th>
              <th>Coverage</th>
              <th>Last proven</th>
            </tr>
          </thead>
          <tbody>
            {data.counties.map((c) => (
              <tr key={c.county} className={`measured__row measured__row--${c.level}`}>
                <td className="measured__county">{c.county}</td>
                {c.sites.map((s) => {
                  const meta = STATE_META[s.state];
                  const Icon = meta.icon;
                  return (
                    <td key={s.siteType} className={`measured__cell measured__cell--${meta.tone}`}>
                      {/* The note is the tooltip: a reader hovering a "untested" chip wants to know
                          what would change it, not a restatement of the word. */}
                      <span title={`${SITE_LABEL[s.siteType] ?? s.siteType}: ${s.note}`}>
                        <Icon size={13} aria-hidden /> {meta.label}
                      </span>
                      {s.system ? <em className="measured__vendor">{s.system}</em> : null}
                    </td>
                  );
                })}
                <td className={`measured__level measured__level--${c.level}`}>{c.level}</td>
                <td className="measured__when">
                  {c.sites.map((s) => s.lastVerifiedAt).filter(Boolean)[0]?.slice(0, 10) ?? 'never'}
                </td>
              </tr>
            ))}
          </tbody>
        </table></div>
      )}

      <p className="measured__foot">
        {/* Naming the difference, so the table below is not read as a contradiction. */}
        The table further down lists which counties an adapter was <em>written</em> for. This one
        lists which have been <em>proven to read a page</em>. A county can appear in both and be
        broken in reality — closing that gap is what the health checks and repair queue are for.
      </p>
    </section>
  );
}

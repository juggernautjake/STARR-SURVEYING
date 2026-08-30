'use client';
// MarketWatchPanel — who is about to need a survey, and who else is bidding? §I3.2
//
// The dashboard above counts leads that already arrived. This asks where the next ones are: a
// subdivision plat on a commissioners' court agenda, a rezoning up for approval, a site plan filed
// with a city. Each is a project that needs a surveyor before it needs almost anything else, and
// each is published days or weeks ahead on a public agenda.
//
// The second subject is competitor naming — which firms a public body has already engaged, which is
// in the minutes and nowhere else.
//
// ── IT SAYS HOW MUCH IT DID NOT LOOK AT ─────────────────────────────────────────────────────────
//
// The watch covers eleven of the firm's forty-six service-area counties, the ones within a short
// drive of Belton. That is a deliberate cost decision — ninety-two searches a sweep to cover all
// forty-six would be money spent on places the firm rarely bids.
//
// A bounded sweep that does not admit it is bounded is the dangerous kind: an empty result reads as
// "nothing is being platted in the service area" when it means "we looked at a quarter of it". So
// the coverage note is rendered with the results, every time, not tucked in a tooltip.
import { useCallback, useEffect, useState } from 'react';

type Status = 'searched' | 'not-configured' | 'search-failed';
type Verdict = 'likely' | 'possible' | 'noise';

interface Subject { id: string; label: string; actOn: string }
interface Hit {
  url: string; title: string; verdict: Verdict;
  reasons: string[]; excerpt: string | null; year: number | null;
}
interface Report { subject: string; hits: Hit[]; counts: Record<Verdict, number>; actionable: boolean }
interface Run { status: Status; report: Report | null; coverage?: string }

const STATUS_COPY: Record<Status, { tone: 'ok' | 'warn' | 'off'; text: string }> = {
  searched: { tone: 'ok', text: 'Checked the public record. Unverified — open the source before acting on it.' },
  'not-configured': { tone: 'off', text: 'Not checked: no search key is configured. This is a blank, not a quiet market.' },
  'search-failed': { tone: 'warn', text: 'The search provider did not answer. Try again — this is not "nothing is happening".' },
};

export default function MarketWatchPanel(): React.ReactElement {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [coverage, setCoverage] = useState<string>('');
  const [runs, setRuns] = useState<Record<string, Run>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Only the subject list and the coverage note load on mount — both static, both free. Each sweep
  // is eleven searches, so it waits for a click.
  useEffect(() => {
    let alive = true;
    fetch('/api/admin/marketing/market-watch')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((j) => { if (alive) { setSubjects(j.subjects ?? []); setCoverage(j.coverage ?? ''); } })
      .catch(() => { if (alive) setError('Could not load the watch list.'); });
    return () => { alive = false; };
  }, []);

  const check = useCallback(async (id: string) => {
    setBusy(id); setError(null);
    try {
      const res = await fetch(`/api/admin/marketing/market-watch?subject=${encodeURIComponent(id)}`);
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `HTTP ${res.status}`);
      // Awaited before the updater — a state updater cannot be async, and the functional form still
      // matters so two subjects checked in quick succession do not clobber each other.
      const run = await res.json() as Run;
      setRuns((prev) => ({ ...prev, [id]: run }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The check could not run.');
    } finally { setBusy(null); }
  }, []);

  if (subjects.length === 0 && !error) return <></>;

  return (
    <section style={{ marginTop: 24 }}>
      <h2 style={{ fontSize: 16, marginBottom: 4 }}>Who is about to need a survey?</h2>
      <p style={{ margin: '0 0 6px', fontSize: 13, color: 'var(--color-doc-body-alt)' }}>
        The dashboard above counts leads that arrived. This looks for the next ones &mdash; plats,
        site plans and rezonings on public agendas, which need a surveyor early.
      </p>
      {coverage && (
        <p style={{ margin: '0 0 10px', fontSize: 12, color: 'var(--color-doc-body-alt)', fontStyle: 'italic' }}>
          {coverage}
        </p>
      )}

      <div style={{ display: 'grid', gap: 10 }}>
        {subjects.map((s) => {
          const run = runs[s.id];
          const status = run ? STATUS_COPY[run.status] : null;
          const surfaced = run?.report?.hits.filter((h) => h.verdict !== 'noise') ?? [];
          const tone = status?.tone === 'ok' ? 'var(--color-info-text, #1e3a8a)'
            : status?.tone === 'warn' ? 'var(--color-warning-text, #78350f)'
            : 'var(--color-doc-body-alt)';

          return (
            <div key={s.id} style={{ border: '1px solid var(--color-doc-line-alt)', borderRadius: 8, padding: '10px 14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 180 }}>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{s.label}</div>
                  {/* What to DO with a hit. A watch nobody acts on is a subscription. */}
                  <div style={{ fontSize: 12, color: 'var(--color-doc-body-alt)' }}>{s.actOn}</div>
                </div>
                <button
                  type="button"
                  onClick={() => void check(s.id)}
                  disabled={busy === s.id}
                  data-testid={`market-watch-check-${s.id}`}
                  style={{
                    minHeight: 34, padding: '6px 14px', borderRadius: 8, cursor: busy === s.id ? 'default' : 'pointer',
                    border: '1px solid var(--color-doc-line-alt)', background: 'transparent',
                    font: 'inherit', fontSize: 13, opacity: busy === s.id ? 0.5 : 1,
                  }}
                >
                  {busy === s.id ? 'Checking…' : run ? 'Check again' : 'Check'}
                </button>
              </div>

              {status && (
                <p role="status" style={{ margin: '8px 0 0', fontSize: 12.5, color: tone }}>{status.text}</p>
              )}

              {run?.report && surfaced.length === 0 && run.status === 'searched' && (
                <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--color-doc-body-alt)' }}>
                  Nothing surfaced. {run.report.hits.length} result(s) checked and rejected.
                </p>
              )}

              {surfaced.length > 0 && (
                <ul style={{ listStyle: 'none', margin: '10px 0 0', padding: 0, display: 'grid', gap: 10 }}>
                  {surfaced.map((h, i) => (
                    <li key={i} style={{ borderLeft: '3px solid var(--color-doc-line-alt)', paddingLeft: 10 }}>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 3 }}>
                        <span style={{
                          fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.03em',
                          padding: '2px 7px', borderRadius: 99,
                          background: h.verdict === 'likely' ? 'var(--color-success-bg, #dcfce7)' : 'var(--color-warning-bg, #fef3c7)',
                          color: h.verdict === 'likely' ? 'var(--color-success-text, #14532d)' : 'var(--color-warning-text, #78350f)',
                        }}>{h.verdict}</span>
                        {h.year && <span style={{ fontSize: 11, color: 'var(--color-doc-body-alt)' }}>{h.year}</span>}
                      </div>
                      <a href={h.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13, fontWeight: 500 }}>
                        {h.title}
                      </a>
                      {h.excerpt && (
                        <p style={{ margin: '4px 0 2px', fontSize: 12.5, fontStyle: 'italic' }}>&ldquo;{h.excerpt}&rdquo;</p>
                      )}
                      <p style={{ margin: 0, fontSize: 11, color: 'var(--color-doc-body-alt)' }}>{h.reasons.join(' · ')}</p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>

      {error && <p role="alert" style={{ marginTop: 8, fontSize: 13, color: 'var(--color-danger-text, #991b1b)' }}>{error}</p>}
    </section>
  );
}

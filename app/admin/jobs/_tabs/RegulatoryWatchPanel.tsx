'use client';
// RegulatoryWatchPanel — has a rule we depend on changed? §I3.5
//
// The register above answers "are we current". It cannot answer "has the thing we are current WITH
// moved" — a TBPELS amendment, a revised FEMA panel, a county fee schedule. None of those send an
// email; they are published, and then they are in force.
//
// ── IT WAITS FOR A CLICK ────────────────────────────────────────────────────────────────────────
//
// Each topic spends two or three searches, and rules change on the timescale of months. Opening the
// compliance tab to check an insurance date should not bill a lookup.
//
// ── AND IT SAYS WHICH KIND OF NOTHING IT FOUND ──────────────────────────────────────────────────
//
// On a compliance surface this is the whole point: "we checked and nothing changed" and "we never
// checked" are opposite facts that produce the same empty list. Branching on `status` rather than on
// hit count is what keeps a blank from reading as an all-clear.
//
// Nothing here is compliance advice, and nothing is written to the register. Every row is an
// unverified web page with its source attached; a licensed professional reads it and decides.
import { useCallback, useEffect, useState } from 'react';

type Status = 'searched' | 'not-configured' | 'search-failed';
type Verdict = 'likely' | 'possible' | 'noise';

interface Topic { id: string; label: string; why: string }
interface Hit {
  url: string; title: string; verdict: Verdict;
  reasons: string[]; excerpt: string | null; year: number | null;
}
interface Report { subject: string; hits: Hit[]; counts: Record<Verdict, number>; actionable: boolean }
interface Run { status: Status; report: Report | null }

const STATUS_COPY: Record<Status, { tone: 'ok' | 'warn' | 'off'; text: string }> = {
  searched: { tone: 'ok', text: 'Checked the public record. Unverified — open the source before acting on it.' },
  'not-configured': { tone: 'off', text: 'Not checked: no search key is configured. This is a blank, not an all-clear.' },
  'search-failed': { tone: 'warn', text: 'The search provider did not answer. Try again — this is not "nothing changed".' },
};

export default function RegulatoryWatchPanel(): React.ReactElement {
  const [topics, setTopics] = useState<Topic[]>([]);
  const [runs, setRuns] = useState<Record<string, Run>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Only the topic LIST loads on mount — it is a static description and costs nothing. The searches
  // themselves wait for a click.
  useEffect(() => {
    let alive = true;
    fetch('/api/admin/compliance/regulatory-watch')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((j) => { if (alive) setTopics(j.topics ?? []); })
      .catch(() => { if (alive) setError('Could not load the watch list.'); });
    return () => { alive = false; };
  }, []);

  const check = useCallback(async (id: string) => {
    setBusy(id); setError(null);
    try {
      const res = await fetch(`/api/admin/compliance/regulatory-watch?topic=${encodeURIComponent(id)}`);
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `HTTP ${res.status}`);
      // Awaited before the updater, not inside it — a state updater cannot be async, and the
      // functional form is still needed so two topics checked in quick succession do not clobber
      // each other's result.
      const run = await res.json() as Run;
      setRuns((prev) => ({ ...prev, [id]: run }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The check could not run.');
    } finally { setBusy(null); }
  }, []);

  if (topics.length === 0 && !error) return <></>;

  return (
    <section>
      <h2 style={{ fontSize: 16, marginBottom: 4 }}>Has a rule changed?</h2>
      <p style={{ margin: '0 0 10px', fontSize: 13, color: 'var(--color-doc-body-alt)' }}>
        The register above tracks what we hold. This asks whether the thing we hold it under has
        moved. Nothing here is written to the register &mdash; open the source and judge it.
      </p>

      <div style={{ display: 'grid', gap: 10 }}>
        {topics.map((t) => {
          const run = runs[t.id];
          const status = run ? STATUS_COPY[run.status] : null;
          const surfaced = run?.report?.hits.filter((h) => h.verdict !== 'noise') ?? [];
          const tone = status?.tone === 'ok' ? 'var(--color-info-text, #1e3a8a)'
            : status?.tone === 'warn' ? 'var(--color-warning-text, #78350f)'
            : 'var(--color-doc-body-alt)';

          return (
            <div key={t.id} style={{ border: '1px solid var(--color-doc-line-alt)', borderRadius: 8, padding: '10px 14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 180 }}>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{t.label}</div>
                  <div style={{ fontSize: 12, color: 'var(--color-doc-body-alt)' }}>{t.why}</div>
                </div>
                <button
                  type="button"
                  onClick={() => void check(t.id)}
                  disabled={busy === t.id}
                  data-testid={`reg-watch-check-${t.id}`}
                  style={{
                    minHeight: 34, padding: '6px 14px', borderRadius: 8, cursor: busy === t.id ? 'default' : 'pointer',
                    border: '1px solid var(--color-doc-line-alt)', background: 'transparent',
                    font: 'inherit', fontSize: 13, opacity: busy === t.id ? 0.5 : 1,
                  }}
                >
                  {busy === t.id ? 'Checking…' : run ? 'Check again' : 'Check'}
                </button>
              </div>

              {status && (
                <p role="status" style={{ margin: '8px 0 0', fontSize: 12.5, color: tone }}>{status.text}</p>
              )}

              {run?.report && surfaced.length === 0 && run.status === 'searched' && (
                <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--color-doc-body-alt)' }}>
                  Nothing announced. {run.report.hits.length} result(s) checked and rejected.
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

      {error && <p role="alert" style={{ marginTop: 8, fontSize: 13, color: 'var(--color-error-text, #991b1b)' }}>{error}</p>}
    </section>
  );
}

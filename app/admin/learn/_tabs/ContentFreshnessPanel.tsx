'use client';
// ContentFreshnessPanel — has the material we TEACH been revised? §I3.4
//
// The references list above says what the course cites. It cannot say whether any of those
// documents has MOVED — a new NCEES handbook edition, an amended chapter, a repealed rule. None of
// them send an email; they are published, and the course carries on teaching the previous version
// with complete confidence.
//
// That is the failure this panel exists for, and it is quiet rather than loud: not a broken page, a
// plausible question with an out-of-date answer.
//
// ── IT FLAGS. IT NEVER EDITS. ───────────────────────────────────────────────────────────────────
//
// Every row is an unverified web page with its source attached and the triggering sentence quoted.
// A person opens the actual document and decides. Nothing on this surface writes to course content,
// and the API behind it has no write path at all — rewriting a practice question from a search
// result would mean teaching whatever ranked well that morning.
//
// ── AND IT SAYS WHICH KIND OF NOTHING IT FOUND ──────────────────────────────────────────────────
//
// "We checked and the handbook has not moved" and "we never checked" produce the same empty list.
// Branching on `status` rather than hit count is what stops a blank reading as an all-clear — which
// on a study surface would be a promise of currency that nothing verified.
import { useCallback, useEffect, useState } from 'react';

type Status = 'searched' | 'not-configured' | 'search-failed';
type Verdict = 'likely' | 'possible' | 'noise';

interface Subject { id: string; label: string; affects: string }
interface Hit {
  url: string; title: string; verdict: Verdict;
  reasons: string[]; excerpt: string | null; year: number | null;
}
interface Report { subject: string; hits: Hit[]; counts: Record<Verdict, number>; actionable: boolean }
interface Run { status: Status; report: Report | null }

const STATUS_COPY: Record<Status, { tone: 'ok' | 'warn' | 'off'; text: string }> = {
  searched: { tone: 'ok', text: 'Checked the public record. Unverified — open the source before changing any content.' },
  'not-configured': { tone: 'off', text: 'Not checked: no search key is configured. This is a blank, not an all-clear.' },
  'search-failed': { tone: 'warn', text: 'The search provider did not answer. Try again — this is not "nothing changed".' },
};

export default function ContentFreshnessPanel(): React.ReactElement {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [runs, setRuns] = useState<Record<string, Run>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Only the subject LIST loads on mount — it is a static description and costs nothing. The
  // searches wait for a click, because a handbook edition turns over on a multi-year cycle and
  // billing two searches a night to watch it is money spent to feel thorough.
  useEffect(() => {
    let alive = true;
    fetch('/api/admin/learn/content-freshness')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((j) => { if (alive) setSubjects(j.subjects ?? []); })
      .catch(() => { if (alive) setError('Could not load the watch list.'); });
    return () => { alive = false; };
  }, []);

  const check = useCallback(async (id: string) => {
    setBusy(id); setError(null);
    try {
      const res = await fetch(`/api/admin/learn/content-freshness?subject=${encodeURIComponent(id)}`);
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `HTTP ${res.status}`);
      // Awaited before the updater, not inside it — a state updater cannot be async, and the
      // functional form is still needed so two subjects checked in quick succession do not clobber
      // each other's result.
      const run = await res.json() as Run;
      setRuns((prev) => ({ ...prev, [id]: run }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The check could not run.');
    } finally { setBusy(null); }
  }, []);

  if (subjects.length === 0 && !error) return <></>;

  return (
    <section style={{ marginTop: 24 }}>
      <h2 style={{ fontSize: 16, marginBottom: 4 }}>Has anything we cite been revised?</h2>
      <p style={{ margin: '0 0 10px', fontSize: 13, color: 'var(--color-doc-body-alt)' }}>
        The course cites these documents as authority. This asks whether any of them has moved.
        Nothing here edits course content &mdash; open the source and judge it yourself.
      </p>

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
                  {/* What to OPEN if this moves, not merely that it moved. */}
                  <div style={{ fontSize: 12, color: 'var(--color-doc-body-alt)' }}>{s.affects}</div>
                </div>
                <button
                  type="button"
                  onClick={() => void check(s.id)}
                  disabled={busy === s.id}
                  data-testid={`learn-watch-check-${s.id}`}
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

      {error && <p role="alert" style={{ marginTop: 8, fontSize: 13, color: 'var(--color-danger-text, #991b1b)' }}>{error}</p>}
    </section>
  );
}

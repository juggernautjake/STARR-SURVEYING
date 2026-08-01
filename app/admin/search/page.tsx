// app/admin/search/page.tsx — one search box over every document and record (platform audit §3b/8e).
//
// The backend (seed 515 + /api/admin/search) is useless until something can reach it. That is not a
// throwaway remark in this repo: §1.4 found 35 pages that existed, worked, and were unreachable, and
// named "authored but not wired" the signature defect here. A search API with no search box is the
// purest possible instance of it.
//
// Three things this page refuses to do, each because the alternative lies to the user:
//
//  · It never renders a failed request as "no results". `notes` and `error` are shown. An empty list
//    and a broken query look identical, and audit §1.1b is what that costs.
//  · It never renders a result as a link when the corpus has no viewer page (`href: null` —
//    `customers` today). A 404 reads as data loss.
//  · It shows WHICH date it filtered on. "Documents from 1974" means the recording date, not the
//    upload date, and those differ by decades.

'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Search, AlertCircle, Loader2, Info } from 'lucide-react';
import { Result } from './SearchResult';
import type { Hit, SearchResponse } from './types';

const DATE_ROLES = [
  { id: 'created', label: 'Date added' },
  { id: 'effective', label: 'Date it happened' },
  { id: 'modified', label: 'Last changed' },
] as const;

export default function SearchPage() {
  const params = useSearchParams();
  const [q, setQ] = useState(params.get('q') ?? '');
  const [corpora, setCorpora] = useState<string[]>([]);
  const [dateRole, setDateRole] = useState<string>('created');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const [data, setData] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  // Guards against an out-of-order response overwriting a newer one — the classic search-box bug where
  // a slow query for "wag" lands after "waggoner" and silently replaces the right answer.
  const seq = useRef(0);

  const run = useCallback(async () => {
    const mine = ++seq.current;
    setLoading(true);
    setFailed(null);
    try {
      const sp = new URLSearchParams();
      sp.set('q', q);
      if (corpora.length) sp.set('corpora', corpora.join(','));
      if (dateRole !== 'created') sp.set('date_role', dateRole);
      if (from) sp.set('from', from);
      if (to) sp.set('to', to);

      const res = await fetch(`/api/admin/search?${sp}`);
      const body = (await res.json()) as SearchResponse;
      if (mine !== seq.current) return;
      // A non-2xx carries a real reason; showing it beats "no results found", which would be a lie.
      if (!res.ok) { setFailed(body.error ?? `Search failed (HTTP ${res.status})`); setData(null); }
      else setData(body);
    } catch (e) {
      if (mine !== seq.current) return;
      setFailed(e instanceof Error ? e.message : String(e));
      setData(null);
    } finally {
      if (mine === seq.current) setLoading(false);
    }
  }, [q, corpora, dateRole, from, to]);

  // Debounced, so typing does not fire a query per keystroke against ten tables.
  useEffect(() => {
    const t = setTimeout(run, 250);
    return () => clearTimeout(t);
  }, [run]);

  const options = data?.corpora ?? [];
  const grouped = useMemo(() => {
    const out = new Map<string, Hit[]>();
    for (const h of data?.results ?? []) {
      if (!out.has(h.corpusLabel)) out.set(h.corpusLabel, []);
      out.get(h.corpusLabel)!.push(h);
    }
    return [...out.entries()];
  }, [data]);

  const toggle = (id: string) =>
    setCorpora((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  return (
    <div style={{ padding: '1.5rem', maxWidth: '60rem', margin: '0 auto' }}>
      <h1 style={{ margin: 0, fontSize: 'var(--text-xl)', color: 'var(--color-text-primary)' }}>Search</h1>
      <p style={{ margin: '0.25rem 0 1.25rem', color: 'var(--color-text-tertiary)', fontSize: 'var(--text-sm)' }}>
        Documents, jobs, customers, contacts, leads and invoices — everything at once. Spelling does not
        have to be exact.
      </p>

      <div style={{ position: 'relative' }}>
        <Search
          size={18}
          style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }}
        />
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Try a name, an address, a job number, or a phrase from a deed…"
          aria-label="Search everything"
          style={{
            width: '100%', padding: '0.7rem 0.75rem 0.7rem 2.5rem',
            border: 'var(--border-normal)', borderRadius: 'var(--radius-lg)',
            background: 'var(--color-bg-input)', color: 'var(--color-text-primary)',
            fontSize: 'var(--text-base)',
          }}
        />
      </div>

      {/* ── Filters ─────────────────────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', margin: '0.85rem 0' }}>
        {options.map((c) => {
          const on = corpora.includes(c.id);
          return (
            <button
              key={c.id}
              onClick={() => toggle(c.id)}
              aria-pressed={on}
              style={{
                padding: '0.3rem 0.7rem', borderRadius: 'var(--radius-pill)', cursor: 'pointer',
                border: on ? 'var(--border-focus)' : 'var(--border-light)',
                background: on ? 'var(--color-bg-hover)' : 'var(--color-bg-card)',
                color: 'var(--color-text-secondary)', fontSize: 'var(--text-xs)',
              }}
            >
              {c.label}
            </button>
          );
        })}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem', alignItems: 'center', marginBottom: '1rem' }}>
        {/* Naming WHICH date is filtered is not a nicety. A deed recorded in 1974 was uploaded last
            Tuesday; filtering the wrong one returns an empty list that reads as an empty archive. */}
        <select
          value={dateRole}
          onChange={(e) => setDateRole(e.target.value)}
          aria-label="Which date to filter on"
          style={{
            padding: '0.35rem 0.5rem', border: 'var(--border-normal)', borderRadius: 'var(--radius-md)',
            background: 'var(--color-bg-input)', color: 'var(--color-text-secondary)', fontSize: 'var(--text-xs)',
          }}
        >
          {DATE_ROLES.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
        </select>
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From date"
          style={{ padding: '0.3rem 0.5rem', border: 'var(--border-normal)', borderRadius: 'var(--radius-md)', background: 'var(--color-bg-input)', color: 'var(--color-text-secondary)', fontSize: 'var(--text-xs)' }} />
        <span style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-xs)' }}>to</span>
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="To date"
          style={{ padding: '0.3rem 0.5rem', border: 'var(--border-normal)', borderRadius: 'var(--radius-md)', background: 'var(--color-bg-input)', color: 'var(--color-text-secondary)', fontSize: 'var(--text-xs)' }} />
        {(from || to || corpora.length || dateRole !== 'created') && (
          <button
            onClick={() => { setCorpora([]); setFrom(''); setTo(''); setDateRole('created'); }}
            style={{ padding: '0.3rem 0.6rem', border: 'var(--border-light)', borderRadius: 'var(--radius-md)', background: 'var(--color-bg-card)', color: 'var(--color-text-tertiary)', fontSize: 'var(--text-xs)', cursor: 'pointer' }}
          >
            Clear filters
          </button>
        )}
      </div>

      {/* ── A failure is shown as a failure, never as "no results" ──────────────────────────── */}
      {failed && (
        <div role="alert" data-testid="search-error" style={{
          display: 'flex', gap: '0.5rem', alignItems: 'flex-start', padding: '0.75rem',
          border: 'var(--border-light)', borderRadius: 'var(--radius-md)',
          background: 'var(--color-error-bg)', color: 'var(--color-error)', fontSize: 'var(--text-sm)',
        }}>
          <AlertCircle size={16} style={{ flexShrink: 0, marginTop: '0.1rem' }} />
          <div>
            <strong>The search itself failed.</strong> This is not an empty archive — the query did not run.
            <div style={{ marginTop: '0.25rem', color: 'var(--color-text-tertiary)' }}>{failed}</div>
          </div>
        </div>
      )}

      {/* Anything the API ignored or corrected — a bad date, a corpus you cannot see. Silently
          narrowing someone's search is how a result set becomes quietly wrong. */}
      {(data?.notes?.length ?? 0) > 0 && (
        <ul data-testid="search-notes" style={{
          margin: '0 0 1rem', padding: '0.6rem 0.75rem 0.6rem 1.75rem',
          border: 'var(--border-light)', borderRadius: 'var(--radius-md)',
          background: 'var(--color-warning-bg)', color: 'var(--color-text-secondary)', fontSize: 'var(--text-xs)',
        }}>
          {data!.notes!.map((n) => <li key={n}>{n}</li>)}
        </ul>
      )}

      {/* ── Whether the AI half actually ran ────────────────────────────────────────────────────
          This line exists because its absence is the bug. AI search that silently falls back to
          keyword looks EXACTLY like AI search that works — which is how the FS tutor's semantic path
          sat at zero embeddings for months without anyone noticing (§8d). If it did not run, the page
          says so, and says what would switch it on. */}
      {!failed && data?.semantic?.message && (
        <div data-testid="semantic-status" style={{
          display: 'flex', gap: '0.5rem', alignItems: 'flex-start', padding: '0.55rem 0.7rem',
          margin: '0 0 1rem', border: 'var(--border-light)', borderRadius: 'var(--radius-md)',
          background: 'var(--color-bg-card)', color: 'var(--color-text-tertiary)',
          fontSize: 'var(--text-xs)',
        }}>
          <Info size={14} style={{ flexShrink: 0, marginTop: '0.1rem' }} />
          <span>{data.semantic.message}</span>
        </div>
      )}

      {loading && (
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', color: 'var(--color-text-tertiary)', fontSize: 'var(--text-sm)' }}>
          <Loader2 size={16} className="spin" /> Searching…
        </div>
      )}

      {!loading && !failed && data && (data.results?.length ?? 0) === 0 && q.trim().length >= 2 && (
        <div data-testid="search-empty" style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-tertiary)', fontSize: 'var(--text-sm)' }}>
          Nothing matched <strong>{data.query}</strong>. Spelling is forgiven, so try fewer words rather
          than different ones.
        </div>
      )}

      {!loading && !failed && (data?.results?.length ?? 0) > 0 && (
        <>
          <div style={{ color: 'var(--color-text-tertiary)', fontSize: 'var(--text-xs)', marginBottom: '0.5rem' }}>
            {data!.total} result{data!.total === 1 ? '' : 's'}{data!.truncated ? ' (showing the best matches)' : ''}
          </div>

          {grouped.map(([label, hits]) => (
            <section key={label} style={{ marginBottom: '1.25rem' }}>
              <h2 style={{
                margin: '0 0 0.4rem', fontSize: 'var(--text-xs)', textTransform: 'uppercase',
                letterSpacing: '0.04em', color: 'var(--color-text-muted)',
              }}>
                {label}
              </h2>
              {hits.map((h) => <Result key={`${h.corpus}:${h.id}`} hit={h} />)}
            </section>
          ))}
        </>
      )}
    </div>
  );
}

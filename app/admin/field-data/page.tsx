// app/admin/field-data/page.tsx — Office reviewer surface for
// mobile-captured data points + photos. Closes the F3 plan item:
// "Office reviewer sees points + photos in web app."
//
// Default view: all data points across all jobs in the last 14 days,
// newest first. Filters: job_id, user_email, date range, free-text
// search on point name/description. Click a row to drill into
// /admin/field-data/[id] for the full photo gallery.
//
// Data flows through PowerSync from the mobile capture loop
// (lib/dataPoints.ts + lib/fieldMedia.ts) into Supabase; this page
// reads from `supabaseAdmin` so it bypasses RLS — every employee's
// captures show up regardless of who's signed in (per the §5.10.1
// "admins see all" privacy contract).
'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';

interface FieldDataRow {
  id: string;
  job_id: string;
  name: string;
  code_category: string | null;
  description: string | null;
  device_lat: number | null;
  device_lon: number | null;
  is_offset: boolean | null;
  is_correction: boolean | null;
  created_at: string;
  job_name: string | null;
  job_number: string | null;
  created_by_email: string | null;
  created_by_name: string | null;
  media_count: number;
  thumb_signed_url: string | null;
}

interface ListResponse {
  points: FieldDataRow[];
  total: number;
  limit: number;
  offset: number;
}

const PAGE_SIZE = 50;

function defaultRange(): { from: string; to: string } {
  const today = new Date();
  const from = new Date(today);
  from.setDate(today.getDate() - 13);
  return {
    from: isoDate(from),
    to: isoDate(today),
  };
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function FieldDataPage() {
  const { data: session } = useSession();

  const [{ from, to }, setRange] = useState(defaultRange());
  const [userEmail, setUserEmail] = useState('');
  const [jobId, setJobId] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [data, setData] = useState<ListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchData = useCallback(async () => {
    if (!session?.user?.email) return;
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({
        from,
        to,
        limit: String(PAGE_SIZE),
        offset: String(page * PAGE_SIZE),
      });
      if (userEmail) params.set('user_email', userEmail);
      if (jobId) params.set('job_id', jobId);
      const res = await fetch(`/api/admin/field-data?${params.toString()}`);
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(json?.error ?? `Failed (HTTP ${res.status})`);
      }
      setData(json as ListResponse);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [session, from, to, userEmail, jobId, page]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  // Free-text search runs client-side over the current page so
  // surveyors can quickly grep "rebar" or "BM01" without re-fetching.
  // Server-side search would need a tsvector column we haven't added.
  const filtered = useMemo(() => {
    if (!data) return [];
    if (!search.trim()) return data.points;
    const needle = search.trim().toLowerCase();
    return data.points.filter(
      (p) =>
        p.name.toLowerCase().includes(needle) ||
        (p.description?.toLowerCase().includes(needle) ?? false) ||
        (p.code_category?.toLowerCase().includes(needle) ?? false)
    );
  }, [data, search]);

  const hasNext =
    data != null && data.offset + data.points.length < data.total;
  const hasPrev = page > 0;

  if (!session?.user?.email) {
    return <div style={styles.empty}>Sign in required.</div>;
  }

  return (
    <div style={styles.wrap}>
      <header style={styles.header}>
        <div>
          <h1 style={styles.h1}>Field Data</h1>
          <p style={styles.subtitle}>
            Data points + photos captured from the Starr Field mobile
            app. Everything the surveyor records on their phone lands
            here within seconds of regaining reception. Click a row to
            see the full photo gallery and metadata.
          </p>
        </div>
      </header>

      <div style={styles.controls}>
        <label style={styles.field}>
          <span style={styles.fieldLabel}>From</span>
          <input
            type="date"
            value={from}
            max={to}
            onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))}
            style={styles.input}
          />
        </label>
        <label style={styles.field}>
          <span style={styles.fieldLabel}>To</span>
          <input
            type="date"
            value={to}
            min={from}
            onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))}
            style={styles.input}
          />
        </label>
        <label style={styles.field}>
          <span style={styles.fieldLabel}>Employee</span>
          <input
            type="email"
            placeholder="all employees"
            value={userEmail}
            onChange={(e) => {
              setUserEmail(e.target.value);
              setPage(0);
            }}
            style={styles.input}
          />
        </label>
        <label style={styles.field}>
          <span style={styles.fieldLabel}>Job ID</span>
          <input
            type="text"
            placeholder="all jobs"
            value={jobId}
            onChange={(e) => {
              setJobId(e.target.value);
              setPage(0);
            }}
            style={styles.input}
          />
        </label>
        <label style={styles.field}>
          <span style={styles.fieldLabel}>Search</span>
          <input
            type="text"
            placeholder="name or description"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={styles.input}
          />
        </label>
        <button
          type="button"
          onClick={() => void fetchData()}
          style={styles.refreshBtn}
          disabled={loading}
        >
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>

      {error ? <div style={styles.error}>{error}</div> : null}

      {data ? (
        <div style={styles.summary}>
          {data.total === 0
            ? 'No data points in this range.'
            : `Showing ${filtered.length} of ${data.total} point${data.total === 1 ? '' : 's'}`}
        </div>
      ) : null}

      {loading && !data ? (
        <div style={styles.empty}>Loading…</div>
      ) : !data || filtered.length === 0 ? (
        <div style={styles.empty}>
          No data points to show. Try widening the date range or
          clearing filters.
        </div>
      ) : (
        <div style={styles.grid}>
          {filtered.map((p) => (
            <Link
              key={p.id}
              href={`/admin/field-data/${p.id}`}
              style={styles.card}
            >
              <div style={styles.thumbWrap}>
                {p.thumb_signed_url ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={p.thumb_signed_url}
                    alt={p.name}
                    style={styles.thumb}
                  />
                ) : (
                  <div style={styles.thumbPlaceholder}>
                    {p.media_count > 0 ? '🔄' : '—'}
                  </div>
                )}
                {p.media_count > 1 ? (
                  <span style={styles.mediaBadge}>+{p.media_count - 1}</span>
                ) : null}
              </div>

              <div style={styles.cardBody}>
                <div style={styles.cardHeader}>
                  <span style={styles.pointName}>{p.name}</span>
                  {p.is_offset ? (
                    <span style={styles.flag}>offset</span>
                  ) : null}
                  {p.is_correction ? (
                    <span style={styles.flag}>correction</span>
                  ) : null}
                </div>
                <div style={styles.cardMeta}>
                  {p.job_number ? `${p.job_number} · ` : ''}
                  {p.job_name ?? 'Unknown job'}
                </div>
                <div style={styles.cardMeta}>
                  {p.created_by_name ?? p.created_by_email ?? 'Unknown'} ·{' '}
                  {formatTimestamp(p.created_at)}
                </div>
                {p.description ? (
                  <div style={styles.cardDesc}>{p.description}</div>
                ) : null}
              </div>
            </Link>
          ))}
        </div>
      )}

      {data && (hasPrev || hasNext) ? (
        <div style={styles.pager}>
          <button
            type="button"
            disabled={!hasPrev || loading}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            style={styles.pagerBtn}
          >
            ‹ Previous
          </button>
          <span style={styles.pagerLabel}>Page {page + 1}</span>
          <button
            type="button"
            disabled={!hasNext || loading}
            onClick={() => setPage((p) => p + 1)}
            style={styles.pagerBtn}
          >
            Next ›
          </button>
        </div>
      ) : null}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrap: {
    padding: '24px',
    maxWidth: 1200,
    margin: '0 auto',
  },
  header: {
    marginBottom: 16,
  },
  h1: {
    fontSize: 22,
    fontWeight: 600,
    margin: '0 0 4px',
  },
  subtitle: {
    fontSize: 13,
    color: '#6B7280',
    margin: 0,
    maxWidth: 720,
    lineHeight: 1.5,
  },
  controls: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'flex-end',
    gap: 12,
    marginBottom: 16,
  },
  field: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: 600,
    color: '#6B7280',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  input: {
    padding: '8px 10px',
    border: '1px solid #E2E5EB',
    borderRadius: 8,
    fontSize: 13,
    minWidth: 160,
  },
  refreshBtn: {
    background: 'transparent',
    border: '1px solid #E2E5EB',
    borderRadius: 8,
    padding: '8px 14px',
    cursor: 'pointer',
    fontSize: 13,
  },
  error: {
    background: '#FEF2F2',
    border: '1px solid #B42318',
    color: '#B42318',
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
    fontSize: 13,
  },
  summary: {
    fontSize: 12,
    color: '#6B7280',
    marginBottom: 12,
  },
  empty: {
    padding: 32,
    textAlign: 'center',
    color: '#6B7280',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
    gap: 16,
    marginBottom: 24,
  },
  card: {
    display: 'flex',
    flexDirection: 'column',
    border: '1px solid #E2E5EB',
    borderRadius: 12,
    overflow: 'hidden',
    background: '#FFFFFF',
    textDecoration: 'none',
    color: 'inherit',
  },
  thumbWrap: {
    width: '100%',
    aspectRatio: '4 / 3',
    background: '#F7F8FA',
    position: 'relative',
    overflow: 'hidden',
  },
  thumb: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  },
  thumbPlaceholder: {
    width: '100%',
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#9CA3AF',
    fontSize: 28,
  },
  mediaBadge: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    background: 'rgba(0,0,0,0.7)',
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: 600,
    padding: '2px 8px',
    borderRadius: 999,
  },
  cardBody: {
    padding: 12,
  },
  cardHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
    flexWrap: 'wrap',
  },
  pointName: {
    fontSize: 14,
    fontWeight: 600,
  },
  flag: {
    fontSize: 10,
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    background: '#FEF3C7',
    color: '#92400E',
    padding: '2px 6px',
    borderRadius: 4,
  },
  cardMeta: {
    fontSize: 12,
    color: '#6B7280',
    marginBottom: 2,
  },
  cardDesc: {
    fontSize: 12,
    color: '#4B5563',
    marginTop: 6,
    overflow: 'hidden',
    display: '-webkit-box',
    WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical',
  },
  pager: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
    paddingTop: 8,
    paddingBottom: 24,
  },
  pagerBtn: {
    background: 'transparent',
    border: '1px solid #E2E5EB',
    borderRadius: 8,
    padding: '6px 12px',
    cursor: 'pointer',
    fontSize: 13,
  },
  pagerLabel: {
    fontSize: 13,
    color: '#6B7280',
  },
};

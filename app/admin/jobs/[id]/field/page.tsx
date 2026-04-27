// app/admin/jobs/[id]/field/page.tsx — Per-job consolidated field-
// captures view.
//
// Per the user's request: "There needs to be a list of all of the
// points that have been logged in the app for a given job, and if
// they select a point it should open that point info and show all of
// the comments, files, or media relating to that point. They should
// also be able to download any media in any job."
//
// MVP scope (this batch):
//   - Job header + stats line ("X points · Y photos · Z videos…").
//   - Points list as clickable thumbnail cards. Each card links to
//     the existing /admin/field-data/{point_id} drilldown which
//     ALREADY shows comments, files, and media for that point.
//   - "Download all media (manifest CSV)" button that hits the
//     manifest endpoint and triggers a download. CSV has one row
//     per downloadable with a 4-hour signed URL — bookkeeper can
//     `xargs wget` or open in Excel.
//
// Deferred for next round:
//   - Job-level media block (photos/voice/video attached at job
//     level, no point assignment) inline on this page.
//   - Job-level notes inline on this page.
//   - Job-level files inline on this page.
//   - ZIP-stream download (F5+ polish).
//
// Logging + error handling: every fetch reports its outcome via
// the visible error banner; a sign-failure surfaces as a
// placeholder thumbnail (the API caps log lines per request).
'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { useSession } from 'next-auth/react';

interface PointSummary {
  id: string;
  name: string;
  code_category: string | null;
  description: string | null;
  device_lat: number | null;
  device_lon: number | null;
  is_offset: boolean | null;
  is_correction: boolean | null;
  created_at: string;
  created_by_email: string | null;
  created_by_name: string | null;
  media_count: number;
  note_count: number;
  thumb_signed_url: string | null;
}

interface JobHeader {
  id: string;
  name: string | null;
  job_number: string | null;
  description: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  client_name: string | null;
  stage: string | null;
}

interface FieldDataResponse {
  job: JobHeader;
  points: PointSummary[];
  // Job-level surfaces returned by the API but NOT rendered in this
  // MVP (deferred to the next round per the scoping note above).
  job_media: unknown[];
  job_notes: unknown[];
  job_files: unknown[];
  stats: {
    points: number;
    photos: number;
    videos: number;
    voice: number;
    notes: number;
    files: number;
    total_media: number;
  };
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

export default function JobFieldDataPage() {
  const { data: session } = useSession();
  const params = useParams();
  const jobId = typeof params?.id === 'string' ? params.id : null;

  const [data, setData] = useState<FieldDataResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [downloading, setDownloading] = useState(false);

  const fetchData = useCallback(async () => {
    if (!session?.user?.email || !jobId) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/admin/jobs/${jobId}/field-data`);
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(json?.error ?? `Failed (HTTP ${res.status})`);
      }
      setData(json as FieldDataResponse);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [session, jobId]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const onDownloadManifest = useCallback(async () => {
    if (!jobId) return;
    setDownloading(true);
    setError('');
    try {
      const res = await fetch(
        `/api/admin/jobs/${jobId}/field-data/manifest`
      );
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        throw new Error(
          json?.error ?? `Manifest failed (HTTP ${res.status})`
        );
      }
      const blob = await res.blob();
      // Trigger browser download — same pattern /admin/mileage uses
      // for its CSV export.
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const filename =
        data?.job?.job_number
          ? `media_manifest_${data.job.job_number}.csv`
          : `media_manifest_${jobId}.csv`;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Download failed');
    } finally {
      setDownloading(false);
    }
  }, [jobId, data]);

  if (!session?.user?.email) {
    return <div style={styles.empty}>Sign in required.</div>;
  }
  if (loading && !data) {
    return <div style={styles.empty}>Loading…</div>;
  }
  if (error && !data) {
    return (
      <div style={styles.wrap}>
        <Link href={`/admin/jobs/${jobId}`} style={styles.back}>
          ‹ Back to job
        </Link>
        <div style={styles.error}>{error}</div>
      </div>
    );
  }
  if (!data) return null;

  const { job, points, stats } = data;
  const headerSubtitle = [
    job.client_name,
    [job.address, job.city, job.state, job.zip].filter(Boolean).join(', '),
  ]
    .filter(Boolean)
    .join(' — ');

  return (
    <div style={styles.wrap}>
      <Link href={`/admin/jobs/${jobId}`} style={styles.back}>
        ‹ Back to job
      </Link>

      <header style={styles.header}>
        <div>
          <h1 style={styles.h1}>
            {job.name ?? 'Untitled job'}
            {job.job_number ? (
              <span style={styles.h1Sub}> · {job.job_number}</span>
            ) : null}
          </h1>
          {headerSubtitle ? (
            <p style={styles.subtitle}>{headerSubtitle}</p>
          ) : null}
        </div>
        <button
          type="button"
          style={styles.primaryBtn}
          onClick={() => void onDownloadManifest()}
          disabled={downloading || stats.total_media + stats.files === 0}
          title={
            stats.total_media + stats.files === 0
              ? 'No media or files attached to this job yet.'
              : 'Downloads a CSV with one row per file + a 4-hour signed URL each.'
          }
        >
          {downloading ? 'Preparing…' : '⬇ Download all media (CSV)'}
        </button>
      </header>

      <div style={styles.statsBar}>
        <Stat label="Points" value={stats.points} />
        <Stat label="Photos" value={stats.photos} />
        <Stat label="Videos" value={stats.videos} />
        <Stat label="Voice" value={stats.voice} />
        <Stat label="Notes" value={stats.notes} />
        <Stat label="Files" value={stats.files} />
      </div>

      {error ? <div style={styles.error}>{error}</div> : null}

      <section style={styles.section}>
        <h2 style={styles.h2}>Points</h2>
        {points.length === 0 ? (
          <div style={styles.empty}>
            No points captured yet for this job. As crew uses the
            mobile app, points appear here within seconds of regaining
            reception.
          </div>
        ) : (
          <div style={styles.grid}>
            {points.map((p) => (
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
                    <div style={styles.thumbPlaceholder}>—</div>
                  )}
                  {p.media_count > 1 ? (
                    <span style={styles.mediaBadge}>
                      +{p.media_count - 1}
                    </span>
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
                    {p.code_category ? `${p.code_category} · ` : ''}
                    {p.created_by_name ?? p.created_by_email ?? 'Unknown'}
                    {' · '}
                    {formatTimestamp(p.created_at)}
                  </div>
                  <div style={styles.cardCounts}>
                    {p.media_count > 0 ? (
                      <span>📷 {p.media_count}</span>
                    ) : null}
                    {p.note_count > 0 ? (
                      <span>📝 {p.note_count}</span>
                    ) : null}
                    {p.media_count === 0 && p.note_count === 0 ? (
                      <span style={{ color: '#9CA3AF' }}>
                        no attachments
                      </span>
                    ) : null}
                  </div>
                  {p.description ? (
                    <div style={styles.cardDesc}>{p.description}</div>
                  ) : null}
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div style={styles.stat}>
      <div style={styles.statValue}>{value}</div>
      <div style={styles.statLabel}>{label}</div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrap: {
    padding: '24px',
    maxWidth: 1100,
    margin: '0 auto',
  },
  back: {
    display: 'inline-block',
    fontSize: 13,
    color: '#1D3095',
    marginBottom: 16,
    textDecoration: 'none',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 16,
    marginBottom: 16,
    flexWrap: 'wrap',
  },
  h1: {
    fontSize: 24,
    fontWeight: 600,
    margin: '0 0 4px',
  },
  h1Sub: {
    fontSize: 16,
    fontWeight: 500,
    color: '#6B7280',
  },
  subtitle: {
    fontSize: 13,
    color: '#6B7280',
    margin: 0,
  },
  primaryBtn: {
    background: '#1D3095',
    color: '#FFFFFF',
    border: 'none',
    borderRadius: 8,
    padding: '8px 14px',
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 500,
  },
  statsBar: {
    display: 'grid',
    gridTemplateColumns: 'repeat(6, 1fr)',
    gap: 8,
    background: '#F7F8FA',
    border: '1px solid #E2E5EB',
    borderRadius: 12,
    padding: 12,
    marginBottom: 24,
  },
  stat: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 2,
  },
  statValue: {
    fontSize: 22,
    fontWeight: 700,
  },
  statLabel: {
    fontSize: 11,
    fontWeight: 600,
    color: '#6B7280',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
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
  empty: {
    padding: 32,
    textAlign: 'center',
    color: '#6B7280',
    background: '#F7F8FA',
    borderRadius: 12,
  },
  section: {
    marginBottom: 24,
  },
  h2: {
    fontSize: 16,
    fontWeight: 600,
    margin: '0 0 12px',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
    gap: 16,
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
    marginBottom: 4,
  },
  cardCounts: {
    display: 'flex',
    gap: 12,
    fontSize: 12,
    color: '#4B5563',
    marginBottom: 6,
  },
  cardDesc: {
    fontSize: 12,
    color: '#4B5563',
    overflow: 'hidden',
    display: '-webkit-box',
    WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical',
  },
};

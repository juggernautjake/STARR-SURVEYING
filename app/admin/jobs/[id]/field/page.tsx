// app/admin/jobs/[id]/field/page.tsx — Per-job consolidated field-
// captures view.
//
// Per the user's request: "There needs to be a list of all of the
// points that have been logged in the app for a given job, and if
// they select a point it should open that point info and show all of
// the comments, files, or media relating to that point. They should
// also be able to download any media in any job."
//
// Surfaces:
//   - Job header + stats line ("X points · Y photos · Z videos…").
//   - Points list as clickable thumbnail cards. Each card links to
//     /admin/field-data/{point_id} for the per-point detail (comments,
//     files, media) view.
//   - Job-level photos / voice / video inline (i.e. media attached
//     to the job but not to any specific point — happens when the
//     surveyor captures from the camera roll w/o picking a point).
//   - Job-level notes + job-level files inline.
//   - "CSV manifest" button → /api/admin/jobs/{id}/field-data/manifest
//     returns a CSV with one row per downloadable + a 4-hour signed
//     URL each. Useful for `xargs wget` or Excel review.
//   - "Download ZIP" button → /api/admin/jobs/{id}/field-data/zip
//     streams a ZIP with every photo / voice / video / file in the
//     job. Server-side stream so the browser handles the dialog.
//
// Per the user's directive: every uploaded item shows the uploader
// name + upload timestamp ("Uploaded by Lance · Apr 27 14:22").
//
// Logging + error handling: every fetch reports its outcome via the
// visible error banner; a sign-failure surfaces as a placeholder
// thumbnail (the API caps log lines per request).
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

interface JobMedia {
  id: string;
  media_type: string;
  storage_signed_url: string | null;
  thumbnail_signed_url: string | null;
  original_signed_url: string | null;
  duration_seconds: number | null;
  file_size_bytes: number | null;
  device_lat: number | null;
  device_lon: number | null;
  captured_at: string | null;
  uploaded_at: string | null;
  upload_state: string | null;
  transcription: string | null;
  transcription_status: string | null;
  download_name: string;
  uploaded_by_email: string | null;
  uploaded_by_name: string | null;
}

interface JobNote {
  id: string;
  body: string;
  note_template: string | null;
  structured_payload: Record<string, unknown> | null;
  is_current: boolean;
  user_email: string;
  created_at: string;
}

interface JobFile {
  id: string;
  name: string;
  description: string | null;
  signed_url: string | null;
  content_type: string | null;
  file_size_bytes: number | null;
  upload_state: string | null;
  created_at: string;
  uploaded_by_email: string | null;
  uploaded_by_name: string | null;
}

interface FieldDataResponse {
  job: JobHeader;
  points: PointSummary[];
  job_media: JobMedia[];
  job_notes: JobNote[];
  job_files: JobFile[];
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

function formatTimestamp(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatBytes(bytes: number | null): string {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function uploaderLine(
  email: string | null,
  name: string | null,
  iso: string | null
): string {
  const who = name || email || 'Unknown';
  return `Uploaded by ${who} · ${formatTimestamp(iso)}`;
}

export default function JobFieldDataPage() {
  const { data: session } = useSession();
  const params = useParams();
  const jobId = typeof params?.id === 'string' ? params.id : null;

  const [data, setData] = useState<FieldDataResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [downloading, setDownloading] = useState(false);
  const [zipping, setZipping] = useState(false);

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

  const onDownloadZip = useCallback(async () => {
    if (!jobId) return;
    setZipping(true);
    setError('');
    try {
      // Fire the request — the route streams a ZIP back. We open it
      // in a new tab so the browser handles the download dialog
      // without occupying the SPA's main connection (large jobs may
      // take several minutes to stream end-to-end).
      const url = `/api/admin/jobs/${jobId}/field-data/zip`;
      // Sanity-ping the endpoint so 4xx surfaces inline rather than
      // as a blank tab. HEAD is cheap on the server and skips the
      // streaming.
      const head = await fetch(url, { method: 'HEAD' });
      if (!head.ok) {
        throw new Error(
          head.status === 404
            ? 'No media to ZIP.'
            : `ZIP failed (HTTP ${head.status})`
        );
      }
      window.open(url, '_blank');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ZIP failed');
    } finally {
      setZipping(false);
    }
  }, [jobId]);

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

  const { job, points, stats, job_media, job_notes, job_files } = data;
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
        <div style={styles.btnRow}>
          <button
            type="button"
            style={styles.primaryBtn}
            onClick={() => void onDownloadManifest()}
            disabled={downloading || stats.total_media + stats.files === 0}
            title={
              stats.total_media + stats.files === 0
                ? 'No media or files attached to this job yet.'
                : 'CSV with one row per file + a 4-hour signed URL each.'
            }
          >
            {downloading ? 'Preparing…' : '⬇ CSV manifest'}
          </button>
          <button
            type="button"
            style={styles.secondaryBtn}
            onClick={() => void onDownloadZip()}
            disabled={zipping || stats.total_media + stats.files === 0}
            title={
              stats.total_media + stats.files === 0
                ? 'No media or files attached to this job yet.'
                : 'Streams a ZIP with every photo/voice/video/file in one bundle.'
            }
          >
            {zipping ? 'Bundling…' : '📦 Download ZIP'}
          </button>
        </div>
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

      {/* Job-level (un-attached) media. Crew can capture a photo
          directly against the job without picking a point — those
          show up here so the bookkeeper isn't hunting under a
          phantom point name. */}
      <section style={styles.section}>
        <h2 style={styles.h2}>
          Job-level photos / voice / video{' '}
          {job_media.length > 0 ? `(${job_media.length})` : ''}
        </h2>
        {job_media.length === 0 ? (
          <div style={styles.empty}>
            No media attached at the job level. (Per-point media
            appears on each point card above.)
          </div>
        ) : (
          <div style={styles.mediaGrid}>
            {job_media.map((m) => (
              <JobMediaCard key={m.id} media={m} />
            ))}
          </div>
        )}
      </section>

      <section style={styles.section}>
        <h2 style={styles.h2}>
          Job-level notes{' '}
          {job_notes.length > 0 ? `(${job_notes.length})` : ''}
        </h2>
        {job_notes.length === 0 ? (
          <div style={styles.empty}>
            No notes attached at the job level.
          </div>
        ) : (
          <div style={styles.noteList}>
            {job_notes.map((n) => (
              <article key={n.id} style={styles.noteCard}>
                <header style={styles.noteHeader}>
                  <span style={styles.noteTemplate}>
                    {n.note_template ?? 'Free-text'}
                  </span>
                  <span style={styles.noteMeta}>
                    {n.user_email ? `${n.user_email} · ` : ''}
                    {formatTimestamp(n.created_at)}
                  </span>
                </header>
                <p style={styles.noteBody}>{n.body || '(no body)'}</p>
                {!n.is_current ? (
                  <span style={styles.archivedBadge}>archived</span>
                ) : null}
              </article>
            ))}
          </div>
        )}
      </section>

      <section style={styles.section}>
        <h2 style={styles.h2}>
          Job-level files{' '}
          {job_files.length > 0 ? `(${job_files.length})` : ''}
        </h2>
        {job_files.length === 0 ? (
          <div style={styles.empty}>
            No files attached at the job level.
          </div>
        ) : (
          <div style={styles.noteList}>
            {job_files.map((f) => (
              <article key={f.id} style={styles.noteCard}>
                <header style={styles.noteHeader}>
                  <span style={styles.noteTemplate}>📎 File</span>
                  <span style={styles.noteMeta}>
                    {uploaderLine(
                      f.uploaded_by_email,
                      f.uploaded_by_name,
                      f.created_at
                    )}
                  </span>
                </header>
                <p style={styles.noteBody}>{f.name || '(unnamed)'}</p>
                {f.description ? (
                  <p style={styles.fileDesc}>{f.description}</p>
                ) : null}
                <div style={styles.fileMeta}>
                  {f.content_type ? <span>{f.content_type}</span> : null}
                  {f.file_size_bytes ? (
                    <span>{formatBytes(f.file_size_bytes)}</span>
                  ) : null}
                </div>
                {f.signed_url ? (
                  <a
                    href={f.signed_url}
                    target="_blank"
                    rel="noreferrer"
                    style={styles.dlLink}
                  >
                    Download →
                  </a>
                ) : null}
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

/**
 * One job-level media tile. Render branches by media_type:
 *   - photo : thumbnail + "Open full-resolution" link
 *   - voice : <audio controls> + transcript (if present)
 *   - video : <video controls> with poster fallback to thumbnail
 * Always shows uploader attribution at the top.
 */
function JobMediaCard({ media }: { media: JobMedia }) {
  const downloadUrl =
    media.original_signed_url ?? media.storage_signed_url;
  return (
    <article style={styles.mediaCard}>
      <div style={styles.uploaderLineDark}>
        {uploaderLine(
          media.uploaded_by_email,
          media.uploaded_by_name,
          media.uploaded_at ?? media.captured_at
        )}
      </div>
      {media.media_type === 'video' ? (
        downloadUrl ? (
          <video
            controls
            preload="metadata"
            poster={media.thumbnail_signed_url ?? undefined}
            style={styles.mediaPlayer}
          >
            <source src={downloadUrl} type="video/mp4" />
            <source src={downloadUrl} type="video/quicktime" />
          </video>
        ) : (
          <div style={styles.mediaMissing}>No video available</div>
        )
      ) : media.media_type === 'voice' ? (
        downloadUrl ? (
          <audio controls preload="metadata" style={styles.audioPlayer}>
            <source src={downloadUrl} type="audio/mp4" />
            <source src={downloadUrl} type="audio/mpeg" />
          </audio>
        ) : (
          <div style={styles.mediaMissing}>No audio available</div>
        )
      ) : media.thumbnail_signed_url ?? media.storage_signed_url ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={
            media.thumbnail_signed_url ??
            media.storage_signed_url ??
            undefined
          }
          alt=""
          style={styles.mediaImg}
        />
      ) : (
        <div style={styles.mediaMissing}>No image available</div>
      )}
      <div style={styles.mediaMeta}>
        <span>{formatTimestamp(media.captured_at)}</span>
        {media.file_size_bytes ? (
          <span>{formatBytes(media.file_size_bytes)}</span>
        ) : null}
      </div>
      {media.transcription ? (
        <p style={styles.transcript}>“{media.transcription}”</p>
      ) : null}
      {downloadUrl ? (
        <a
          href={downloadUrl}
          download={media.download_name}
          target="_blank"
          rel="noreferrer"
          style={styles.dlLink}
        >
          Download →
        </a>
      ) : null}
    </article>
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
  secondaryBtn: {
    background: '#FFFFFF',
    color: '#1D3095',
    border: '1px solid #1D3095',
    borderRadius: 8,
    padding: '8px 14px',
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 500,
  },
  btnRow: {
    display: 'flex',
    gap: 8,
    flexWrap: 'wrap',
  },
  mediaGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
    gap: 16,
  },
  mediaCard: {
    border: '1px solid #E2E5EB',
    borderRadius: 12,
    padding: 12,
    background: '#FFFFFF',
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  mediaImg: {
    width: '100%',
    aspectRatio: '4 / 3',
    objectFit: 'cover',
    borderRadius: 8,
    background: '#F7F8FA',
  },
  mediaPlayer: {
    width: '100%',
    maxHeight: 280,
    borderRadius: 8,
    background: '#0B0E14',
  },
  audioPlayer: {
    width: '100%',
  },
  mediaMissing: {
    width: '100%',
    aspectRatio: '4 / 3',
    background: '#F7F8FA',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#9CA3AF',
    fontSize: 13,
    borderRadius: 8,
  },
  mediaMeta: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: 11,
    color: '#6B7280',
  },
  uploaderLineDark: {
    fontSize: 11,
    color: '#0B0E14',
    fontWeight: 500,
  },
  noteList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  noteCard: {
    border: '1px solid #E2E5EB',
    borderRadius: 12,
    padding: 14,
    background: '#FFFFFF',
  },
  noteHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    gap: 8,
    marginBottom: 6,
    flexWrap: 'wrap',
  },
  noteTemplate: {
    background: '#EEF2FF',
    color: '#1D3095',
    fontSize: 11,
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    padding: '2px 8px',
    borderRadius: 4,
  },
  noteMeta: {
    fontSize: 12,
    color: '#6B7280',
  },
  noteBody: {
    fontSize: 14,
    lineHeight: 1.5,
    margin: '0 0 8px',
    color: '#0B0E14',
  },
  archivedBadge: {
    display: 'inline-block',
    marginTop: 8,
    background: '#F3F4F6',
    color: '#6B7280',
    padding: '2px 8px',
    borderRadius: 4,
    fontSize: 11,
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  fileDesc: {
    fontSize: 12,
    color: '#4B5563',
    margin: '0 0 8px',
  },
  fileMeta: {
    display: 'flex',
    gap: 12,
    fontSize: 12,
    color: '#6B7280',
    marginBottom: 6,
  },
  dlLink: {
    fontSize: 12,
    color: '#1D3095',
    textDecoration: 'none',
    fontWeight: 500,
  },
  transcript: {
    fontSize: 12,
    color: '#0B0E14',
    fontStyle: 'italic',
    background: '#F7F8FA',
    padding: 8,
    borderRadius: 8,
    margin: 0,
    lineHeight: 1.4,
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

// app/admin/field-data/[id]/page.tsx — Per-data-point detail with full
// photo gallery, GPS metadata, and creator info.
'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { useSession } from 'next-auth/react';

interface PointRow {
  id: string;
  job_id: string;
  name: string;
  code_category: string | null;
  description: string | null;
  device_lat: number | null;
  device_lon: number | null;
  device_altitude_m: number | null;
  device_accuracy_m: number | null;
  device_compass_heading: number | null;
  is_offset: boolean | null;
  is_correction: boolean | null;
  corrects_point_id: string | null;
  created_at: string;
  job_name: string | null;
  job_number: string | null;
  created_by_email: string | null;
  created_by_name: string | null;
}

interface MediaRow {
  id: string;
  media_type: string;
  burst_group_id: string | null;
  position: number | null;
  duration_seconds: number | null;
  file_size_bytes: number | null;
  device_lat: number | null;
  device_lon: number | null;
  device_compass_heading: number | null;
  captured_at: string | null;
  uploaded_at: string | null;
  upload_state: string | null;
  transcription: string | null;
  storage_signed_url: string | null;
  thumbnail_signed_url: string | null;
  original_signed_url: string | null;
  annotated_signed_url: string | null;
}

interface DetailResponse {
  point: PointRow;
  media: MediaRow[];
}

function formatTimestamp(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '—';
  return d.toLocaleString();
}

function formatBytes(bytes: number | null): string {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function FieldDataDetailPage() {
  const { data: session } = useSession();
  const params = useParams();
  const id = typeof params?.id === 'string' ? params.id : null;

  const [data, setData] = useState<DetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  const fetchDetail = useCallback(async () => {
    if (!session?.user?.email || !id) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/admin/field-data/${id}`);
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(json?.error ?? `Failed (HTTP ${res.status})`);
      }
      setData(json as DetailResponse);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [session, id]);

  useEffect(() => {
    void fetchDetail();
  }, [fetchDetail]);

  if (!session?.user?.email) {
    return <div style={styles.empty}>Sign in required.</div>;
  }
  if (loading && !data) {
    return <div style={styles.empty}>Loading…</div>;
  }
  if (error) {
    return (
      <div style={styles.wrap}>
        <Link href="/admin/field-data" style={styles.back}>
          ‹ Back to Field Data
        </Link>
        <div style={styles.error}>{error}</div>
      </div>
    );
  }
  if (!data) return null;

  const { point, media } = data;
  const mapsHref =
    point.device_lat != null && point.device_lon != null
      ? `https://www.google.com/maps?q=${point.device_lat},${point.device_lon}`
      : null;

  return (
    <div style={styles.wrap}>
      <Link href="/admin/field-data" style={styles.back}>
        ‹ Back to Field Data
      </Link>

      <header style={styles.header}>
        <div>
          <h1 style={styles.h1}>{point.name}</h1>
          <p style={styles.subtitle}>
            {point.job_number ? `${point.job_number} · ` : ''}
            {point.job_name ?? 'Unknown job'} · captured by{' '}
            {point.created_by_name ?? point.created_by_email ?? 'Unknown'} ·{' '}
            {formatTimestamp(point.created_at)}
          </p>
          <div style={styles.flagRow}>
            {point.code_category ? (
              <span style={styles.flag}>{point.code_category}</span>
            ) : null}
            {point.is_offset ? (
              <span style={styles.flagWarn}>offset shot</span>
            ) : null}
            {point.is_correction ? (
              <span style={styles.flagWarn}>correction</span>
            ) : null}
          </div>
        </div>
        {point.job_id ? (
          <Link
            href={`/admin/jobs/${point.job_id}`}
            style={styles.jobLink}
          >
            View job →
          </Link>
        ) : null}
      </header>

      <div style={styles.metaGrid}>
        <MetaCell
          label="Latitude"
          value={point.device_lat?.toFixed(6) ?? '—'}
        />
        <MetaCell
          label="Longitude"
          value={point.device_lon?.toFixed(6) ?? '—'}
        />
        <MetaCell
          label="Accuracy"
          value={
            point.device_accuracy_m != null
              ? `±${Math.round(point.device_accuracy_m)} m`
              : '—'
          }
        />
        <MetaCell
          label="Altitude"
          value={
            point.device_altitude_m != null
              ? `${Math.round(point.device_altitude_m)} m`
              : '—'
          }
        />
        <MetaCell
          label="Heading"
          value={
            point.device_compass_heading != null
              ? `${Math.round(point.device_compass_heading)}°`
              : '—'
          }
        />
        <MetaCell
          label="Map"
          value={
            mapsHref ? (
              <a href={mapsHref} target="_blank" rel="noreferrer">
                Open in Maps
              </a>
            ) : (
              '—'
            )
          }
        />
      </div>

      {point.description ? (
        <div style={styles.descBlock}>
          <span style={styles.fieldLabel}>Notes</span>
          <p style={styles.desc}>{point.description}</p>
        </div>
      ) : null}

      <h2 style={styles.h2}>
        Photos {media.length > 0 ? `(${media.length})` : ''}
      </h2>
      {media.length === 0 ? (
        <div style={styles.empty}>No photos attached to this point.</div>
      ) : (
        <div style={styles.photoGrid}>
          {media.map((m) => (
            <PhotoCard
              key={m.id}
              media={m}
              onOpenLightbox={(url) => setLightboxUrl(url)}
            />
          ))}
        </div>
      )}

      {lightboxUrl ? (
        <div
          style={styles.lightboxWrap}
          onClick={() => setLightboxUrl(null)}
          role="dialog"
          aria-modal="true"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={lightboxUrl}
            alt=""
            style={styles.lightboxImg}
            onClick={(e) => e.stopPropagation()}
          />
          <button
            type="button"
            style={styles.lightboxClose}
            onClick={() => setLightboxUrl(null)}
            aria-label="Close lightbox"
          >
            ×
          </button>
        </div>
      ) : null}
    </div>
  );
}

function MetaCell({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div style={styles.metaCell}>
      <div style={styles.fieldLabel}>{label}</div>
      <div style={styles.metaValue}>{value}</div>
    </div>
  );
}

function PhotoCard({
  media,
  onOpenLightbox,
}: {
  media: MediaRow;
  onOpenLightbox: (url: string) => void;
}) {
  // Voice memos render with the native <audio> control instead of an
  // image. Same upload-state badge so the bookkeeper can spot a memo
  // that hasn't synced yet.
  if (media.media_type === 'voice') {
    const audioUrl =
      media.original_signed_url ?? media.storage_signed_url;
    return (
      <div style={styles.photoCard}>
        <div style={styles.audioBlock}>
          <span style={styles.audioGlyph}>🎙</span>
          {audioUrl ? (
            <audio controls preload="metadata" style={styles.audioPlayer}>
              <source src={audioUrl} type="audio/mp4" />
              <source src={audioUrl} type="audio/mpeg" />
              Your browser does not support the audio element.
            </audio>
          ) : (
            <span style={styles.audioMissing}>
              {media.upload_state === 'pending'
                ? 'Uploading…'
                : 'No audio available'}
            </span>
          )}
        </div>
        <div style={styles.photoMeta}>
          <div style={styles.photoMetaRow}>
            <span style={styles.fieldLabel}>Captured</span>
            <span>{formatTimestamp(media.captured_at)}</span>
          </div>
          {media.duration_seconds ? (
            <div style={styles.photoMetaRow}>
              <span style={styles.fieldLabel}>Duration</span>
              <span>
                {Math.floor(media.duration_seconds / 60)}:
                {(media.duration_seconds % 60)
                  .toString()
                  .padStart(2, '0')}
              </span>
            </div>
          ) : null}
          <div style={styles.photoMetaRow}>
            <span style={styles.fieldLabel}>State</span>
            <span
              style={{
                color:
                  media.upload_state === 'failed'
                    ? '#B42318'
                    : media.upload_state === 'done'
                      ? '#067647'
                      : '#D97706',
              }}
            >
              {media.upload_state ?? '—'}
            </span>
          </div>
          {media.transcription ? (
            <div style={styles.transcriptBlock}>
              <span style={styles.fieldLabel}>Transcript</span>
              <p style={styles.transcript}>{media.transcription}</p>
            </div>
          ) : null}
          {audioUrl ? (
            <a
              href={audioUrl}
              target="_blank"
              rel="noreferrer"
              style={styles.fullLink}
            >
              Download audio →
            </a>
          ) : null}
        </div>
      </div>
    );
  }

  const displayUrl =
    media.original_signed_url ??
    media.storage_signed_url ??
    media.thumbnail_signed_url;
  const thumbUrl = media.thumbnail_signed_url ?? displayUrl;
  return (
    <div style={styles.photoCard}>
      {thumbUrl ? (
        <button
          type="button"
          style={styles.photoBtn}
          onClick={() => displayUrl && onOpenLightbox(displayUrl)}
          aria-label="Open photo"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={thumbUrl} alt="" style={styles.photoImg} />
        </button>
      ) : (
        <div style={styles.photoMissing}>
          {media.upload_state === 'pending'
            ? 'Uploading…'
            : 'No image available'}
        </div>
      )}
      <div style={styles.photoMeta}>
        <div style={styles.photoMetaRow}>
          <span style={styles.fieldLabel}>Captured</span>
          <span>{formatTimestamp(media.captured_at)}</span>
        </div>
        <div style={styles.photoMetaRow}>
          <span style={styles.fieldLabel}>State</span>
          <span
            style={{
              color:
                media.upload_state === 'failed'
                  ? '#B42318'
                  : media.upload_state === 'done'
                    ? '#067647'
                    : '#D97706',
            }}
          >
            {media.upload_state ?? '—'}
          </span>
        </div>
        {media.file_size_bytes ? (
          <div style={styles.photoMetaRow}>
            <span style={styles.fieldLabel}>Size</span>
            <span>{formatBytes(media.file_size_bytes)}</span>
          </div>
        ) : null}
        {media.original_signed_url ? (
          <a
            href={media.original_signed_url}
            target="_blank"
            rel="noreferrer"
            style={styles.fullLink}
          >
            Open full-resolution →
          </a>
        ) : null}
      </div>
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
    marginBottom: 24,
    flexWrap: 'wrap',
  },
  h1: {
    fontSize: 24,
    fontWeight: 600,
    margin: '0 0 6px',
  },
  subtitle: {
    fontSize: 13,
    color: '#6B7280',
    margin: '0 0 8px',
  },
  flagRow: {
    display: 'flex',
    gap: 6,
    flexWrap: 'wrap',
  },
  flag: {
    fontSize: 11,
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    background: '#EEF2FF',
    color: '#1D3095',
    padding: '3px 8px',
    borderRadius: 4,
  },
  flagWarn: {
    fontSize: 11,
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    background: '#FEF3C7',
    color: '#92400E',
    padding: '3px 8px',
    borderRadius: 4,
  },
  jobLink: {
    fontSize: 13,
    color: '#1D3095',
    textDecoration: 'none',
    border: '1px solid #1D3095',
    borderRadius: 8,
    padding: '8px 14px',
  },
  metaGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
    gap: 12,
    marginBottom: 24,
    padding: 16,
    background: '#F7F8FA',
    borderRadius: 12,
  },
  metaCell: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  metaValue: {
    fontSize: 14,
    fontWeight: 500,
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    color: '#6B7280',
  },
  descBlock: {
    marginBottom: 24,
  },
  desc: {
    fontSize: 14,
    color: '#0B0E14',
    margin: '4px 0 0',
    lineHeight: 1.5,
  },
  h2: {
    fontSize: 16,
    fontWeight: 600,
    margin: '24px 0 12px',
  },
  photoGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
    gap: 16,
    marginBottom: 24,
  },
  photoCard: {
    border: '1px solid #E2E5EB',
    borderRadius: 12,
    overflow: 'hidden',
    background: '#FFFFFF',
  },
  photoBtn: {
    display: 'block',
    width: '100%',
    aspectRatio: '4 / 3',
    border: 'none',
    padding: 0,
    cursor: 'pointer',
    background: '#F7F8FA',
  },
  photoImg: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    display: 'block',
  },
  photoMissing: {
    width: '100%',
    aspectRatio: '4 / 3',
    background: '#F7F8FA',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#9CA3AF',
    fontSize: 13,
  },
  audioBlock: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: 20,
    background: '#F7F8FA',
  },
  audioGlyph: {
    fontSize: 36,
  },
  audioPlayer: {
    width: '100%',
  },
  audioMissing: {
    color: '#9CA3AF',
    fontSize: 13,
  },
  transcriptBlock: {
    marginTop: 8,
    paddingTop: 8,
    borderTop: '1px solid #F3F4F6',
  },
  transcript: {
    fontSize: 13,
    color: '#0B0E14',
    lineHeight: 1.5,
    margin: '4px 0 0',
  },
  photoMeta: {
    padding: 12,
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  photoMetaRow: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: 12,
    color: '#4B5563',
  },
  fullLink: {
    fontSize: 12,
    color: '#1D3095',
    marginTop: 6,
    textDecoration: 'none',
  },
  empty: {
    padding: 32,
    textAlign: 'center',
    color: '#6B7280',
  },
  error: {
    background: '#FEF2F2',
    border: '1px solid #B42318',
    color: '#B42318',
    padding: 12,
    borderRadius: 8,
    fontSize: 13,
  },
  lightboxWrap: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0,0,0,0.85)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    cursor: 'zoom-out',
  },
  lightboxImg: {
    maxWidth: '95vw',
    maxHeight: '95vh',
    objectFit: 'contain',
  },
  lightboxClose: {
    position: 'absolute',
    top: 16,
    right: 16,
    background: 'rgba(255,255,255,0.2)',
    color: '#FFFFFF',
    border: 'none',
    fontSize: 32,
    width: 44,
    height: 44,
    borderRadius: 22,
    cursor: 'pointer',
    fontWeight: 300,
  },
};

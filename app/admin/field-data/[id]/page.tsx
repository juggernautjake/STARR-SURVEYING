// app/admin/field-data/[id]/page.tsx — Per-data-point detail with full
// photo gallery, GPS metadata, and creator info.
'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { useSession } from 'next-auth/react';

import {
  parseAnnotations,
  strokeToPath,
  strokeWidthPx,
} from '@/lib/photoAnnotationRenderer';

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
  transcription_status: string | null;
  transcription_error: string | null;
  transcription_completed_at: string | null;
  transcription_cost_cents: number | null;
  storage_signed_url: string | null;
  thumbnail_signed_url: string | null;
  original_signed_url: string | null;
  annotated_signed_url: string | null;
  /** TEXT-encoded JSON document of pen-stroke annotations from the
   *  mobile annotator. Rendered as an SVG overlay on the photo +
   *  inside the lightbox; original photo bytes never modified. */
  annotations: string | null;
  uploaded_by_email: string | null;
  uploaded_by_name: string | null;
}

interface NoteRow {
  id: string;
  body: string;
  note_template: string | null;
  structured_payload: Record<string, unknown> | null;
  is_current: boolean;
  user_email: string;
  created_at: string;
  updated_at: string | null;
  voice_transcript_media_id: string | null;
}

interface FileRow {
  id: string;
  name: string;
  description: string | null;
  storage_path: string;
  signed_url: string | null;
  content_type: string | null;
  file_size_bytes: number | null;
  upload_state: string | null;
  created_at: string;
  uploaded_at: string | null;
  uploaded_by_email: string | null;
  uploaded_by_name: string | null;
}

interface DetailResponse {
  point: PointRow;
  media: MediaRow[];
  notes: NoteRow[];
  files: FileRow[];
}

const NOTE_TEMPLATE_LABELS: Record<string, string> = {
  offset_shot: 'Offset shot',
  monument_found: 'Monument found',
  hazard: 'Hazard',
  correction: 'Correction',
};

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

/** 0..360° → cardinal abbreviation. 16-point scale (N, NNE, NE, …)
 *  is overkill for the scan-and-glance use case; 8-point hits the
 *  "rebar's NW face" sweet spot without crowding the badge. */
function cardinalFromDegrees(deg: number): string {
  const d = ((deg % 360) + 360) % 360;
  const idx = Math.round(d / 45) % 8;
  return ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][idx];
}

/** "273° W" with a north-anchored arrow that rotates to the bearing.
 *  Returned as a JSX node so the SVG can sit inline with the text in
 *  the meta cell + photo card without extra wrapper divs. */
function HeadingBadge({ deg }: { deg: number | null }) {
  if (deg == null) return <>—</>;
  const rounded = Math.round(deg);
  const cardinal = cardinalFromDegrees(deg);
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <svg
        width="12"
        height="12"
        viewBox="0 0 12 12"
        style={{ transform: `rotate(${deg}deg)`, flexShrink: 0 }}
        aria-hidden="true"
      >
        <path
          d="M6 1 L9 9 L6 7 L3 9 Z"
          fill="currentColor"
          stroke="currentColor"
          strokeWidth="0.5"
          strokeLinejoin="round"
        />
      </svg>
      <span>
        {rounded}° {cardinal}
      </span>
    </span>
  );
}

/** "Uploaded by X · Apr 27 14:22" — shared across photo/audio/video/file
 *  cards so author attribution is consistent everywhere. Falls back to
 *  email when the display name is empty, then to "Unknown" when the
 *  registered_users row was missing (legacy uploads or deleted users). */
function uploaderLine(
  email: string | null,
  name: string | null,
  iso: string | null
): string {
  const who = name || email || 'Unknown';
  return `Uploaded by ${who} · ${formatTimestamp(iso)}`;
}

export default function FieldDataDetailPage() {
  const { data: session } = useSession();
  const params = useParams();
  const id = typeof params?.id === 'string' ? params.id : null;

  const [data, setData] = useState<DetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  // Lightbox tracks the full media row (not just the URL) so the
  // SVG annotation overlay can render alongside the image. Open via
  // the photo card's tap; close via tap on the backdrop.
  const [lightboxMedia, setLightboxMedia] = useState<MediaRow | null>(
    null
  );

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
          value={<HeadingBadge deg={point.device_compass_heading} />}
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
        Notes{' '}
        {data.notes.length > 0 ? `(${data.notes.length})` : ''}
      </h2>
      {data.notes.length === 0 ? (
        <div style={styles.empty}>No notes attached to this point.</div>
      ) : (
        <div style={styles.noteList}>
          {data.notes.map((n) => (
            <NoteCardItem key={n.id} note={n} />
          ))}
        </div>
      )}

      <h2 style={styles.h2}>
        Files{' '}
        {data.files.length > 0 ? `(${data.files.length})` : ''}
      </h2>
      {data.files.length === 0 ? (
        <div style={styles.empty}>No files attached to this point.</div>
      ) : (
        <div style={styles.noteList}>
          {data.files.map((f) => (
            <FileCardItem key={f.id} file={f} />
          ))}
        </div>
      )}

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
              onOpenLightbox={() => setLightboxMedia(m)}
            />
          ))}
        </div>
      )}

      {lightboxMedia ? (
        <Lightbox
          media={lightboxMedia}
          onDismiss={() => setLightboxMedia(null)}
        />
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

/**
 * Single-row note card. Shows the per-template tag (when set), the
 * body summary (which mobile auto-derives from the structured payload
 * at insert time so the admin grep keeps working), the structured
 * payload as a key/value table, and the author + age stamp.
 */
function NoteCardItem({ note }: { note: NoteRow }) {
  const templateLabel = note.note_template
    ? (NOTE_TEMPLATE_LABELS[note.note_template] ?? note.note_template)
    : null;
  const created = new Date(note.created_at);
  const ageLabel = Number.isFinite(created.getTime())
    ? created.toLocaleString()
    : '';
  return (
    <article style={styles.noteCard}>
      <header style={styles.noteHeader}>
        {templateLabel ? (
          <span style={styles.noteTemplate}>{templateLabel}</span>
        ) : (
          <span style={styles.noteTemplateNeutral}>Free-text</span>
        )}
        <span style={styles.noteMeta}>
          {note.user_email ? `${note.user_email} · ` : ''}
          {ageLabel}
        </span>
      </header>
      <p style={styles.noteBody}>{note.body || '(no body)'}</p>
      {note.structured_payload ? (
        <dl style={styles.notePayload}>
          {Object.entries(note.structured_payload).map(([k, v]) => (
            <div key={k} style={styles.notePayloadRow}>
              <dt style={styles.notePayloadKey}>{k}</dt>
              <dd style={styles.notePayloadVal}>
                {v === null || v === undefined ? '—' : String(v)}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}
      {!note.is_current ? (
        <span style={styles.noteArchivedBadge}>archived</span>
      ) : null}
    </article>
  );
}

/**
 * Full-screen photo viewer with annotation overlay. The SVG layer
 * sits ON TOP of the contained image rect (not the whole modal —
 * resizeMode=contain leaves letterbox bars on the long axis). The
 * overlay re-measures via natural-size + container-size on each
 * load so rotations + window resizes plot strokes correctly.
 *
 * Original photo bytes are NEVER modified (plan §5.4); the
 * overlay is rendered live from the JSON in
 * `field_media.annotations`.
 */
function Lightbox({
  media,
  onDismiss,
}: {
  media: MediaRow;
  onDismiss: () => void;
}) {
  const url =
    media.original_signed_url ??
    media.storage_signed_url ??
    media.thumbnail_signed_url;
  const annotationDoc = useMemo(
    () => parseAnnotations(media.annotations),
    [media.annotations]
  );

  const containerRef = useRef<HTMLDivElement | null>(null);
  const [containerSize, setContainerSize] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const [naturalSize, setNaturalSize] = useState<{
    width: number;
    height: number;
  } | null>(null);

  // Track the container size so the overlay rect updates on resize.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const update = () => {
      const el = containerRef.current;
      if (!el) return;
      setContainerSize({
        width: el.clientWidth,
        height: el.clientHeight,
      });
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  // Compute the rect the photo actually occupies inside its
  // container when object-fit: contain is in effect.
  const overlayRect = useMemo(() => {
    if (!naturalSize || !containerSize) return null;
    const imgRatio = naturalSize.width / naturalSize.height;
    const contRatio = containerSize.width / containerSize.height;
    let drawW: number;
    let drawH: number;
    if (imgRatio > contRatio) {
      drawW = containerSize.width;
      drawH = containerSize.width / imgRatio;
    } else {
      drawW = containerSize.height * imgRatio;
      drawH = containerSize.height;
    }
    return {
      width: drawW,
      height: drawH,
      left: (containerSize.width - drawW) / 2,
      top: (containerSize.height - drawH) / 2,
    };
  }, [naturalSize, containerSize]);

  return (
    <div
      style={styles.lightboxWrap}
      onClick={onDismiss}
      role="dialog"
      aria-modal="true"
      ref={containerRef}
    >
      {url ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={url}
            alt=""
            style={styles.lightboxImg}
            onClick={(e) => e.stopPropagation()}
            onLoad={(e) => {
              const t = e.target as HTMLImageElement;
              setNaturalSize({
                width: t.naturalWidth,
                height: t.naturalHeight,
              });
            }}
          />
          {/* SVG annotation overlay positioned on top of the image's
              actual rect (not the whole container — letterbox bars
              would otherwise render strokes off-image). */}
          {annotationDoc && overlayRect ? (
            <svg
              width={overlayRect.width}
              height={overlayRect.height}
              style={{
                position: 'absolute',
                top: overlayRect.top,
                left: overlayRect.left,
                pointerEvents: 'none',
              }}
            >
              {annotationDoc.items.map((item, i) => {
                if (item.type !== 'pen') return null;
                return (
                  <path
                    key={i}
                    d={strokeToPath(
                      item,
                      overlayRect.width,
                      overlayRect.height
                    )}
                    stroke={item.color}
                    strokeWidth={strokeWidthPx(
                      item.width,
                      overlayRect.width,
                      overlayRect.height
                    )}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    fill="none"
                  />
                );
              })}
            </svg>
          ) : null}
        </>
      ) : null}
      <button
        type="button"
        style={styles.lightboxClose}
        onClick={onDismiss}
        aria-label="Close lightbox"
      >
        ×
      </button>
    </div>
  );
}

/**
 * One-row card for a generic file attachment. Renders inline preview
 * for image / PDF / CSV; everything else falls back to a download
 * link. Bookkeeper can review most file types without leaving the
 * page.
 *
 * Inline-preview matrix:
 *   - image/*           → <img> at max-width 100% (capped height
 *                         so portrait scans don't blow up the
 *                         layout)
 *   - application/pdf   → <iframe> at 480 px tall
 *   - text/csv          → first 50 rows parsed + rendered as a
 *                         table (loaded asynchronously via fetch
 *                         on the signed URL)
 *   - everything else   → download link only
 */
function FileCardItem({ file }: { file: FileRow }) {
  const sizeLabel =
    file.file_size_bytes != null
      ? formatBytes(file.file_size_bytes)
      : null;
  const stateColor =
    file.upload_state === 'failed'
      ? '#B42318'
      : file.upload_state === 'done'
        ? '#067647'
        : '#D97706';

  const mime = (file.content_type ?? '').toLowerCase();
  const isImage = mime.startsWith('image/');
  const isPdf = mime === 'application/pdf';
  const isCsv =
    mime === 'text/csv' ||
    mime === 'application/csv' ||
    /\.csv$/i.test(file.name);

  return (
    <article style={styles.noteCard}>
      <header style={styles.noteHeader}>
        <span style={styles.noteTemplate}>
          {isImage ? '🖼' : isPdf ? '📄' : isCsv ? '📊' : '📎'} File
        </span>
        <span style={styles.noteMeta}>
          {uploaderLine(
            file.uploaded_by_email,
            file.uploaded_by_name,
            file.uploaded_at ?? file.created_at
          )}
        </span>
      </header>
      <p style={styles.noteBody}>{file.name || '(unnamed)'}</p>
      {file.description ? (
        <p style={{ ...styles.noteBody, fontSize: 12, color: '#4B5563' }}>
          {file.description}
        </p>
      ) : null}

      {/* Inline previews — only when the bytes are actually
          uploaded (signed_url present + state=done). Pending uploads
          fall through to the metadata-only render. */}
      {file.signed_url && file.upload_state === 'done' ? (
        isImage ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={file.signed_url}
            alt={file.name}
            style={{
              display: 'block',
              maxWidth: '100%',
              maxHeight: 320,
              objectFit: 'contain',
              borderRadius: 8,
              marginTop: 8,
              background: '#F7F8FA',
            }}
          />
        ) : isPdf ? (
          <iframe
            src={file.signed_url}
            title={file.name}
            style={{
              width: '100%',
              height: 480,
              border: '1px solid #E2E5EB',
              borderRadius: 8,
              marginTop: 8,
            }}
          />
        ) : isCsv ? (
          <CsvPreview signedUrl={file.signed_url} />
        ) : null
      ) : null}

      <div style={styles.notePayload}>
        {file.content_type ? (
          <div style={styles.notePayloadRow}>
            <dt style={styles.notePayloadKey}>type</dt>
            <dd style={styles.notePayloadVal}>{file.content_type}</dd>
          </div>
        ) : null}
        {sizeLabel ? (
          <div style={styles.notePayloadRow}>
            <dt style={styles.notePayloadKey}>size</dt>
            <dd style={styles.notePayloadVal}>{sizeLabel}</dd>
          </div>
        ) : null}
        <div style={styles.notePayloadRow}>
          <dt style={styles.notePayloadKey}>state</dt>
          <dd style={{ ...styles.notePayloadVal, color: stateColor }}>
            {file.upload_state ?? '—'}
          </dd>
        </div>
      </div>
      {file.signed_url ? (
        <a
          href={file.signed_url}
          target="_blank"
          rel="noreferrer"
          style={{
            display: 'inline-block',
            marginTop: 8,
            fontSize: 12,
            color: '#1D3095',
            textDecoration: 'none',
          }}
        >
          Download →
        </a>
      ) : null}
    </article>
  );
}

/**
 * Inline CSV preview — fetches the signed URL, parses the first 50
 * rows, renders a table. Handles both comma + tab separators and
 * quoted fields. Bookkeeper can scan the columns without
 * downloading the file.
 */
function CsvPreview({ signedUrl }: { signedUrl: string }) {
  const [rows, setRows] = useState<string[][] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(signedUrl)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.text();
      })
      .then((text) => {
        if (cancelled) return;
        const parsed = parseCsv(text, 50);
        setRows(parsed);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Preview failed');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [signedUrl]);

  if (loading) {
    return (
      <p style={{ fontSize: 12, color: '#6B7280', marginTop: 8 }}>
        Loading CSV preview…
      </p>
    );
  }
  if (error || !rows || rows.length === 0) {
    return (
      <p style={{ fontSize: 12, color: '#9CA3AF', marginTop: 8 }}>
        Preview unavailable. Use Download to inspect.
      </p>
    );
  }
  const header = rows[0];
  const body = rows.slice(1);
  return (
    <div
      style={{
        marginTop: 8,
        maxHeight: 320,
        overflow: 'auto',
        border: '1px solid #E2E5EB',
        borderRadius: 8,
      }}
    >
      <table
        style={{
          width: '100%',
          borderCollapse: 'collapse',
          fontSize: 12,
        }}
      >
        <thead>
          <tr style={{ background: '#F7F8FA' }}>
            {header.map((h, i) => (
              <th
                key={i}
                style={{
                  textAlign: 'left',
                  padding: '6px 10px',
                  borderBottom: '1px solid #E2E5EB',
                  fontWeight: 600,
                  color: '#0B0E14',
                }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {body.map((r, i) => (
            <tr key={i}>
              {r.map((c, j) => (
                <td
                  key={j}
                  style={{
                    padding: '6px 10px',
                    borderBottom: '1px solid #F3F4F6',
                    color: '#4B5563',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {body.length === 49 ? (
        <p
          style={{
            fontSize: 11,
            color: '#9CA3AF',
            padding: '6px 10px',
            margin: 0,
            borderTop: '1px solid #E2E5EB',
          }}
        >
          (Preview limited to 50 rows. Download for the full file.)
        </p>
      ) : null}
    </div>
  );
}

/**
 * Tiny CSV parser handling comma OR tab separator + quoted fields
 * with embedded commas / quotes. Stops at maxRows. Adequate for
 * surveying P,N,E,Z,D coordinate dumps + Trimble exports.
 */
function parseCsv(text: string, maxRows: number): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;
  // Sniff separator from the first line — pick comma or tab,
  // whichever appears more in the first 200 chars.
  const sample = text.slice(0, 200);
  const sep =
    (sample.match(/\t/g)?.length ?? 0) >
    (sample.match(/,/g)?.length ?? 0)
      ? '\t'
      : ',';
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === sep) {
      row.push(cell);
      cell = '';
      continue;
    }
    if (ch === '\n' || ch === '\r') {
      // Skip a paired \r\n by consuming the \n that follows the \r.
      if (ch === '\r' && text[i + 1] === '\n') i += 1;
      row.push(cell);
      cell = '';
      // Drop a fully-empty row (trailing newline at EOF, etc.).
      if (!(row.length === 1 && row[0] === '')) rows.push(row);
      row = [];
      if (rows.length >= maxRows) return rows;
      continue;
    }
    cell += ch;
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    if (!(row.length === 1 && row[0] === '')) rows.push(row);
  }
  return rows;
}

function PhotoCard({
  media,
  onOpenLightbox,
}: {
  media: MediaRow;
  /** Caller is the page; it sets `lightboxMedia` to the full row so
   *  the lightbox can render the SVG annotation overlay alongside
   *  the image without a re-fetch. */
  onOpenLightbox: () => void;
}) {
  // Video uses the native <video controls> element. Single-tier in
  // v1 (no thumbnail extraction yet); poster falls back to the
  // first storage_signed_url so the gallery shows something
  // recognisable before play.
  if (media.media_type === 'video') {
    const videoUrl =
      media.original_signed_url ?? media.storage_signed_url;
    return (
      <div style={styles.photoCard}>
        <div style={styles.videoBlock}>
          {videoUrl ? (
            <video
              controls
              preload="metadata"
              poster={media.thumbnail_signed_url ?? undefined}
              style={styles.videoPlayer}
            >
              <source src={videoUrl} type="video/mp4" />
              <source src={videoUrl} type="video/quicktime" />
              Your browser does not support the video element.
            </video>
          ) : (
            <div style={styles.photoMissing}>
              {media.upload_state === 'pending'
                ? 'Uploading…'
                : 'No video available'}
            </div>
          )}
        </div>
        <div style={styles.photoMeta}>
          <div style={styles.uploaderLine}>
            {uploaderLine(
              media.uploaded_by_email,
              media.uploaded_by_name,
              media.uploaded_at ?? media.captured_at
            )}
          </div>
          <div style={styles.photoMetaRow}>
            <span style={styles.fieldLabel}>Captured</span>
            <span>{formatTimestamp(media.captured_at)}</span>
          </div>
          {media.device_compass_heading != null ? (
            <div style={styles.photoMetaRow}>
              <span style={styles.fieldLabel}>Facing</span>
              <span>
                <HeadingBadge deg={media.device_compass_heading} />
              </span>
            </div>
          ) : null}
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
          {media.file_size_bytes ? (
            <div style={styles.photoMetaRow}>
              <span style={styles.fieldLabel}>Size</span>
              <span>{formatBytes(media.file_size_bytes)}</span>
            </div>
          ) : null}
          {videoUrl ? (
            <a
              href={videoUrl}
              target="_blank"
              rel="noreferrer"
              style={styles.fullLink}
            >
              Download video →
            </a>
          ) : null}
        </div>
      </div>
    );
  }

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
          <div style={styles.uploaderLine}>
            {uploaderLine(
              media.uploaded_by_email,
              media.uploaded_by_name,
              media.uploaded_at ?? media.captured_at
            )}
          </div>
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
          {media.transcription_status ? (
            <div style={styles.photoMetaRow}>
              <span style={styles.fieldLabel}>Transcript</span>
              <span
                style={{
                  color:
                    media.transcription_status === 'failed'
                      ? '#B42318'
                      : media.transcription_status === 'done'
                        ? '#067647'
                        : '#D97706',
                }}
                title={
                  media.transcription_error
                    ? `Last error: ${media.transcription_error}`
                    : undefined
                }
              >
                {media.transcription_status === 'queued'
                  ? '⏳ queued'
                  : media.transcription_status === 'running'
                    ? '🎧 transcribing…'
                    : media.transcription_status === 'failed'
                      ? '⚠ failed'
                      : '✓ done'}
              </span>
            </div>
          ) : null}
          {media.transcription ? (
            <div style={styles.transcriptBlock}>
              <span style={styles.fieldLabel}>Transcript</span>
              <p style={styles.transcript}>{media.transcription}</p>
            </div>
          ) : media.transcription_status === 'failed' &&
            media.transcription_error ? (
            <div style={styles.transcriptBlock}>
              <span style={styles.fieldLabel}>Transcription error</span>
              <p
                style={{
                  ...styles.transcript,
                  color: '#B42318',
                  fontSize: 12,
                }}
              >
                {media.transcription_error}
              </p>
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
          onClick={() => displayUrl && onOpenLightbox()}
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
        <div style={styles.uploaderLine}>
          {uploaderLine(
            media.uploaded_by_email,
            media.uploaded_by_name,
            media.uploaded_at ?? media.captured_at
          )}
        </div>
        <div style={styles.photoMetaRow}>
          <span style={styles.fieldLabel}>Captured</span>
          <span>{formatTimestamp(media.captured_at)}</span>
        </div>
        {media.device_compass_heading != null ? (
          <div style={styles.photoMetaRow}>
            <span style={styles.fieldLabel}>Facing</span>
            <span>
              <HeadingBadge deg={media.device_compass_heading} />
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
  noteList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    marginBottom: 24,
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
  noteTemplateNeutral: {
    background: '#F3F4F6',
    color: '#6B7280',
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
  notePayload: {
    margin: 0,
    padding: 8,
    background: '#F7F8FA',
    borderRadius: 8,
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  notePayloadRow: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: 12,
  },
  notePayloadKey: {
    color: '#6B7280',
    fontWeight: 500,
    margin: 0,
    textTransform: 'capitalize',
  },
  notePayloadVal: {
    margin: 0,
    color: '#0B0E14',
    fontWeight: 500,
  },
  noteArchivedBadge: {
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
  videoBlock: {
    width: '100%',
    background: '#0B0E14',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  videoPlayer: {
    width: '100%',
    maxHeight: 360,
    display: 'block',
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
  uploaderLine: {
    fontSize: 11,
    color: '#6B7280',
    marginBottom: 6,
    fontStyle: 'italic',
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

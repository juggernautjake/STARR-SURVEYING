// app/admin/components/jobs/JobPhotoGallery.tsx — Job photo gallery
// JOB_WORKSPACE_BUILDOUT slice B.
//
// Image-only view over the existing job_files API, tagged
// section='photos' so photos stay distinct from documents. Photos are
// stored as OBJECTS in the starr-field-files bucket (2026-08-19 — they
// used to be base64 data URLs in the row, which is why the File
// Explorer could not see them), so thumbnails + the lightbox render
// from the resolved download_href. Upload via button or
// drag-and-drop; click a thumbnail to open the lightbox (prev/next /
// Esc); delete with confirm.
'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { uploadJobFileBytes } from '@/lib/jobs/upload-client';
import { MAX_JOB_FILE_BYTES } from '@/lib/jobs/file-storage';

interface Photo {
  id: string;
  file_name: string;
  file_url?: string;
  /** Resolved by `GET /api/admin/jobs/files` — a storage object, a legacy `data:` URI, or a
   *  linked document, all reduced to one thing an `<img src>` can point at. */
  download_href?: string | null;
  file_size?: number;
  mime_type?: string;
  description?: string;
  uploaded_by: string;
  uploaded_at: string;
}

interface Props {
  jobId: string;
  onCountChange?: (count: number) => void;
  /** Which medium this gallery is for (2026-08-19). Owner: *"we need to be able to upload videos as
   *  well as photos… and there is a video tab too."*
   *
   *  One component rather than a near-copy: the upload, the drag-and-drop, the delete, the keyboard
   *  navigation and the count reporting are identical, and two copies of that would drift the first
   *  time one of them was fixed. What genuinely differs is three things — the section rows are
   *  filed under, what the file input accepts, and whether a tile is an `<img>` or a `<video>`. */
  media?: MediaKind;
}

type MediaKind = 'photos' | 'videos';

const MEDIA: Record<MediaKind, {
  section: string; accept: string; title: string; blurb: string;
  addLabel: string; emptyIcon: string; empty: string; dropHint: string; fileType: string;
}> = {
  photos: {
    section: 'photos',
    accept: 'image/png,image/jpeg,image/webp,image/gif,image/heic,image/heif',
    title: 'Photos',
    blurb: 'Field photos for this job — corners, monuments, site conditions. Click a photo to enlarge; use ← → to flip through.',
    addLabel: '📷 Add Photos',
    emptyIcon: '📷',
    empty: 'No photos yet for this job.',
    dropHint: 'Drag & drop images here, or use',
    fileType: 'photo',
  },
  videos: {
    section: 'videos',
    // `video/*` as well as the named types: a phone will hand over `video/quicktime`, and some
    // Android builds send an empty type for .mkv, which a strict list would silently refuse with
    // no explanation in the file picker.
    accept: 'video/*,video/mp4,video/quicktime,video/webm',
    title: 'Videos',
    blurb: 'Field video for this job — access routes, site conditions, anything a still photo cannot explain. Click one to play it.',
    addLabel: '🎥 Add Videos',
    emptyIcon: '🎥',
    empty: 'No videos yet for this job.',
    dropHint: 'Drag & drop video here, or use',
    fileType: 'video',
  },
};

// 10 MB used to be the cap because the image was base64 IN THE ROW, and the message sent people to
// the Files tab — which had exactly the same problem, so the advice moved the cost rather than
// removing it. Photos now go to the `starr-field-files` bucket like everything else, so the real
// limit is the bucket's, and a phone photo of a monument is never the thing that hits it.
const MAX_BYTES = MAX_JOB_FILE_BYTES;
const ACCEPT = 'image/png,image/jpeg,image/webp,image/gif,image/heic,image/heif';

export default function JobPhotoGallery({ jobId, onCountChange, media = 'photos' }: Props) {
  const cfg = MEDIA[media];
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/jobs/files?job_id=${encodeURIComponent(jobId)}&section=${cfg.section}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Failed to load ${cfg.section} (${res.status})`);
      const list: Photo[] = data.files ?? [];
      setPhotos(list);
      onCountChange?.(list.length);
    } catch (e) {
      setError(e instanceof Error ? e.message : `Failed to load ${cfg.section}`);
    }
    setLoading(false);
  }, [jobId, onCountChange, cfg.section]);

  useEffect(() => { load(); }, [load]);

    const upload = useCallback(async (fileList: FileList | File[]) => {
    // A phone hands over `video/quicktime` for a .mov and occasionally an EMPTY type — so a video
    // gallery accepts anything that is not obviously an image rather than demanding `video/`, which
    // would refuse a real recording with no explanation the person could act on.
    const wanted = media === 'videos'
      ? (f: File) => f.type.startsWith('video/') || (!f.type && /\.(mp4|mov|m4v|webm|avi|mkv)$/i.test(f.name))
      : (f: File) => f.type.startsWith('image/');
    const incoming = Array.from(fileList).filter(wanted);
    if (incoming.length === 0) {
      setError(media === 'videos' ? 'Only video files can be added here.' : 'Only image files can be added here.');
      return;
    }
    const tooBig = incoming.find((f) => f.size > MAX_BYTES);
    if (tooBig) {
      setError(`"${tooBig.name}" is larger than ${Math.round(MAX_JOB_FILE_BYTES / 1024 / 1024)} MB, which is the storage limit for one file.`);
      return;
    }
    setError(null);
    setUploading(incoming.length);
    try {
      for (const file of incoming) {
        // Bytes straight to storage, then a row that points at them — the same three-step the
        // Files tab and the File Explorer use. It replaced a `FileReader` that put the whole
        // photo in a database column as base64, where the File Explorer could never see it.
        const { file_id, storage_path } = await uploadJobFileBytes(jobId, file);
        const res = await fetch('/api/admin/jobs/files', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            job_id: jobId,
            file_id,
            storage_path,
            file_name: file.name,
            file_type: cfg.fileType,
            file_size: file.size,
            mime_type: file.type,
            section: cfg.section,
          }),
        });
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          throw new Error(d.error || `Upload failed for ${file.name}`);
        }
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed');
    }
    setUploading(0);
    if (fileInput.current) fileInput.current.value = '';
  }, [jobId, load, media, cfg.section, cfg.fileType]);

  const remove = useCallback(async (id: string) => {
    if (!confirm(media === 'videos' ? 'Delete this video?' : 'Delete this photo?')) return;
    try {
      const res = await fetch(`/api/admin/jobs/files?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`Delete failed (${res.status})`);
      setLightboxIdx(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed');
    }
  }, [load]);

  // Lightbox keyboard nav
  useEffect(() => {
    if (lightboxIdx === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightboxIdx(null);
      if (e.key === 'ArrowRight') setLightboxIdx((i) => (i === null ? i : (i + 1) % photos.length));
      if (e.key === 'ArrowLeft') setLightboxIdx((i) => (i === null ? i : (i - 1 + photos.length) % photos.length));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lightboxIdx, photos.length]);

  const active = lightboxIdx !== null ? photos[lightboxIdx] : null;

  return (
    <div className="job-detail__section">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div>
          <h3>{cfg.title}</h3>
          <p className="job-detail__section-desc">
            {cfg.blurb}
          </p>
        </div>
        <button className="jobs-page__btn jobs-page__btn--primary" onClick={() => fileInput.current?.click()} disabled={uploading > 0}>
          {uploading > 0 ? `Uploading ${uploading}…` : cfg.addLabel}
        </button>
        <input
          ref={fileInput}
          type="file"
          accept={cfg.accept}
          multiple
          style={{ display: 'none' }}
          onChange={(e) => { if (e.target.files) upload(e.target.files); }}
        />
      </div>

      {error && (
        <div className="job-detail__error" role="alert" style={{ marginTop: '0.75rem' }}>{error}</div>
      )}

      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files) upload(e.dataTransfer.files); }}
        style={{
          marginTop: '1rem', padding: '1rem', borderRadius: 8,
          border: `2px dashed ${dragOver ? 'var(--color-brand-navy)' : 'var(--color-border)'}`,
          background: dragOver ? 'rgba(29,48,149,0.05)' : 'transparent',
          textAlign: 'center', color: 'var(--text-secondary, #64748b)', fontSize: '0.85rem',
        }}
      >
        {/* "Up to 10 MB each" was left over from the base64-in-the-row era and is no longer the
            limit — which matters most for video, where 10 MB is about eight seconds. */}
        {cfg.dropHint} <strong>{cfg.addLabel.replace(/^\S+\s/, '')}</strong>. Up to{' '}
        {Math.round(MAX_JOB_FILE_BYTES / 1024 / 1024)} MB each.
      </div>

      {loading && <p className="job-detail__section-desc" style={{ marginTop: '1rem' }}>Loading {cfg.section}…</p>}

      {!loading && photos.length === 0 && (
        <div className="job-detail__messages-placeholder" style={{ marginTop: '1rem' }}>
          <span>{cfg.emptyIcon}</span>
          <p>{cfg.empty}</p>
        </div>
      )}

      {photos.length > 0 && (
        <div
          style={{
            marginTop: '1rem', display: 'grid', gap: '0.5rem',
            gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
          }}
        >
          {photos.map((p, idx) => (
            <button
              key={p.id}
              onClick={() => setLightboxIdx(idx)}
              title={p.file_name}
              style={{
                padding: 0, border: '1px solid var(--color-border)', borderRadius: 8,
                overflow: 'hidden', cursor: 'pointer', background: 'var(--color-surface)', aspectRatio: '4 / 3',
              }}
            >
              {media === 'videos' ? (
                /* `preload="metadata"` fetches only the header, so a wall of tiles does not pull
                   down hundreds of megabytes of field video to show a poster frame. No `controls`
                   here — the tile's job is to open the player, and a scrubber inside a 140px
                   thumbnail is a target nobody can hit. */
                <video
                  src={(p.download_href ?? p.file_url) || undefined}
                  preload="metadata"
                  muted
                  playsInline
                  className="job-video-thumb"
                  style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', pointerEvents: 'none' }}
                />
              ) : (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={(p.download_href ?? p.file_url) || undefined} alt={p.file_name} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
              )}
            </button>
          ))}
        </div>
      )}

      {/* Lightbox */}
      {active && (
        <div
          onClick={() => setLightboxIdx(null)}
          style={{
            position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.85)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '2rem',
          }}
        >
          {media === 'videos' ? (
            /* The browser's own player: scrubbing, volume, fullscreen and picture-in-picture all
               already work, on a phone as well as a desktop. `autoPlay` because the click that
               opened this was a request to watch it. */
            <video
              src={(active.download_href ?? active.file_url) || undefined}
              onClick={(e) => e.stopPropagation()}
              controls
              autoPlay
              playsInline
              className="job-video-player"
              style={{ maxWidth: '90vw', maxHeight: '78vh', borderRadius: 6 }}
              data-testid="job-video-player"
            >
              <track kind="captions" />
            </video>
          ) : (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={(active.download_href ?? active.file_url) || undefined}
              alt={active.file_name}
              onClick={(e) => e.stopPropagation()}
              style={{ maxWidth: '90vw', maxHeight: '78vh', objectFit: 'contain', borderRadius: 6 }}
            />
          )}
          <div onClick={(e) => e.stopPropagation()} style={{ marginTop: '0.75rem', color: '#fff', textAlign: 'center', maxWidth: '90vw' }}>
            <div style={{ fontWeight: 600 }}>{active.file_name}</div>
            <div style={{ fontSize: '0.8rem', opacity: 0.8 }}>
              {lightboxIdx! + 1} of {photos.length} · uploaded by {active.uploaded_by} · {new Date(active.uploaded_at).toLocaleDateString()}
            </div>
            <div style={{ marginTop: '0.75rem', display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
              <button className="jobs-page__btn jobs-page__btn--secondary" onClick={() => setLightboxIdx((i) => (i === null ? i : (i - 1 + photos.length) % photos.length))}>← Prev</button>
              <button className="jobs-page__btn jobs-page__btn--secondary" onClick={() => setLightboxIdx((i) => (i === null ? i : (i + 1) % photos.length))}>Next →</button>
              <button className="jobs-page__btn jobs-page__btn--danger" onClick={() => remove(active.id)}>Delete</button>
              <button className="jobs-page__btn jobs-page__btn--secondary" onClick={() => setLightboxIdx(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

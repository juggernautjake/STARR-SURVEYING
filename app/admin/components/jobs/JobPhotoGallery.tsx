// app/admin/components/jobs/JobPhotoGallery.tsx — Job photo gallery
// JOB_WORKSPACE_BUILDOUT slice B.
//
// Image-only view over the existing job_files API, tagged
// section='photos' so photos stay distinct from documents. Photos
// are stored as data URLs (same as JobFileManager), so thumbnails +
// the lightbox render straight from file_url. Upload via button or
// drag-and-drop; click a thumbnail to open the lightbox (prev/next /
// Esc); delete with confirm.
'use client';
import { useCallback, useEffect, useRef, useState } from 'react';

interface Photo {
  id: string;
  file_name: string;
  file_url?: string;
  file_size?: number;
  mime_type?: string;
  description?: string;
  uploaded_by: string;
  uploaded_at: string;
}

interface Props {
  jobId: string;
  onCountChange?: (count: number) => void;
}

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB per image — base64 lives in the DB row
const ACCEPT = 'image/png,image/jpeg,image/webp,image/gif,image/heic,image/heif';

export default function JobPhotoGallery({ jobId, onCountChange }: Props) {
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
      const res = await fetch(`/api/admin/jobs/files?job_id=${encodeURIComponent(jobId)}&section=photos`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Failed to load photos (${res.status})`);
      const list: Photo[] = data.files ?? [];
      setPhotos(list);
      onCountChange?.(list.length);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load photos');
    }
    setLoading(false);
  }, [jobId, onCountChange]);

  useEffect(() => { load(); }, [load]);

  const readAsDataUrl = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as string);
      r.onerror = () => reject(new Error(`Could not read ${file.name}`));
      r.readAsDataURL(file);
    });

  const upload = useCallback(async (fileList: FileList | File[]) => {
    const incoming = Array.from(fileList).filter((f) => f.type.startsWith('image/'));
    if (incoming.length === 0) {
      setError('Only image files can be added here.');
      return;
    }
    const tooBig = incoming.find((f) => f.size > MAX_BYTES);
    if (tooBig) {
      setError(`"${tooBig.name}" is larger than 10 MB. Compress it or add it under the Files tab instead.`);
      return;
    }
    setError(null);
    setUploading(incoming.length);
    try {
      for (const file of incoming) {
        const dataUrl = await readAsDataUrl(file);
        const res = await fetch('/api/admin/jobs/files', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            job_id: jobId,
            file_name: file.name,
            file_type: 'image',
            file_url: dataUrl,
            file_size: file.size,
            mime_type: file.type,
            section: 'photos',
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
  }, [jobId, load]);

  const remove = useCallback(async (id: string) => {
    if (!confirm('Delete this photo?')) return;
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
          <h3>Photos</h3>
          <p className="job-detail__section-desc">
            Field photos for this job — corners, monuments, site conditions. Click a photo to enlarge; use ← → to flip through.
          </p>
        </div>
        <button className="jobs-page__btn jobs-page__btn--primary" onClick={() => fileInput.current?.click()} disabled={uploading > 0}>
          {uploading > 0 ? `Uploading ${uploading}…` : '📷 Add Photos'}
        </button>
        <input
          ref={fileInput}
          type="file"
          accept={ACCEPT}
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
          border: `2px dashed ${dragOver ? 'var(--brand-blue, #1D3095)' : 'var(--border, #cbd5e1)'}`,
          background: dragOver ? 'rgba(29,48,149,0.05)' : 'transparent',
          textAlign: 'center', color: 'var(--text-secondary, #64748b)', fontSize: '0.85rem',
        }}
      >
        Drag &amp; drop images here, or use <strong>Add Photos</strong>. Up to 10 MB each.
      </div>

      {loading && <p className="job-detail__section-desc" style={{ marginTop: '1rem' }}>Loading photos…</p>}

      {!loading && photos.length === 0 && (
        <div className="job-detail__messages-placeholder" style={{ marginTop: '1rem' }}>
          <span>📷</span>
          <p>No photos yet for this job.</p>
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
                padding: 0, border: '1px solid var(--border, #e2e8f0)', borderRadius: 8,
                overflow: 'hidden', cursor: 'pointer', background: 'var(--surface, #fff)', aspectRatio: '4 / 3',
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.file_url} alt={p.file_name} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
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
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={active.file_url}
            alt={active.file_name}
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: '90vw', maxHeight: '78vh', objectFit: 'contain', borderRadius: 6 }}
          />
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

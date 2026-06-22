// app/admin/receipts/new/page.tsx
//
// quick-actions-wiring-2026-06-22 — web-side receipt upload page wired
// from the "Capture Receipt" Quick Actions tile (and any link/button
// the user wants to drop in). The page exists so the admin web hub
// button is no longer a dead "Coming soon" stub.
//
// receipt-camera-capture-2026-06-22 — added device-camera capture so
// the page works as a real PWA-style camera flow on mobile (and on
// any desktop that exposes a webcam). The pattern relies on the
// standard HTML `capture="environment"` attribute on a file input
// rather than getUserMedia + a custom shutter UI, because:
//   - iOS Safari and Android Chrome BOTH honor `capture` and open the
//     rear camera directly with a familiar OS shutter UI. getUserMedia
//     on iOS requires PWA install + an inline-playable <video> dance
//     that's brittle across iOS versions.
//   - Desktop Chrome/Edge present a webcam picker when `capture` is
//     set; Safari/Firefox fall back to a file picker. Acceptable
//     graceful degradation — the "Choose a file" path is still right
//     next to the camera button for those users.
//
// UX:
//   - Two prominent action buttons: "Take a photo" (camera) +
//     "Choose a file" (gallery / disk / PDF).
//   - Optional job id (free text — bookkeeper reassigns later).
//   - Optional notes (free text).
//   - Preview of the picked image before upload (revokes its object
//     URL on unmount so the blob is GC'd).
//   - "Upload" POSTs multipart to /api/admin/receipts/upload; on
//     success navigates back to /admin/receipts so the user sees
//     their receipt at the top of the pending queue once AI
//     extraction finishes.

'use client';

import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';

const ACCEPTED_TYPES_FILE = 'image/*,application/pdf';
const ACCEPTED_TYPES_CAMERA = 'image/*';
const MAX_BYTES = 12 * 1024 * 1024;

export default function NewReceiptPage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  // Two hidden inputs: the camera one carries `capture="environment"`
  // so mobile devices launch the rear camera; the file one is a plain
  // picker that also accepts PDFs.
  const cameraRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [jobId, setJobId] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Object URL for the preview — revoke on change/unmount so the
  // browser doesn't leak the blob.
  const previewUrl = useMemo(() => {
    if (!file || !file.type.startsWith('image/')) return null;
    return URL.createObjectURL(file);
  }, [file]);
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    setError(null);
    const f = e.target.files?.[0] ?? null;
    // Reset both inputs after every change so picking the same file
    // twice in a row still re-fires `onChange`.
    if (cameraRef.current) cameraRef.current.value = '';
    if (fileRef.current && fileRef.current !== e.target) fileRef.current.value = '';
    if (!f) { setFile(null); return; }
    if (f.size > MAX_BYTES) {
      setError(`That file is ${(f.size / 1024 / 1024).toFixed(1)} MB — please pick something under 12 MB.`);
      setFile(null);
      return;
    }
    setFile(f);
  }

  function openCamera() {
    setError(null);
    cameraRef.current?.click();
  }
  function openFilePicker() {
    setError(null);
    fileRef.current?.click();
  }
  function clearFile() {
    setFile(null);
    setError(null);
    if (cameraRef.current) cameraRef.current.value = '';
    if (fileRef.current) fileRef.current.value = '';
  }

  async function onUpload() {
    if (!file || busy) return;
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.append('file', file);
      if (jobId.trim()) form.append('jobId', jobId.trim());
      if (notes.trim()) form.append('notes', notes.trim());
      const res = await fetch('/api/admin/receipts/upload', { method: 'POST', body: form });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? `Upload failed (${res.status})`);
      }
      router.push('/admin/receipts');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  if (status === 'loading') return <main style={styles.page}><p>Loading…</p></main>;
  if (!session?.user?.email) {
    return (
      <main style={styles.page}>
        <p>You need to be signed in to upload a receipt.</p>
        <Link href="/api/auth/signin">Sign in</Link>
      </main>
    );
  }

  return (
    <main style={styles.page}>
      <header style={styles.header}>
        <div>
          <h1 style={styles.title}>Capture receipt</h1>
          <p style={styles.subtitle}>
            Snap a photo with your device camera, or pick a file or PDF
            from disk. We&rsquo;ll queue it for AI extraction and you&rsquo;ll
            see it land in the pending queue.
          </p>
        </div>
        <Link href="/admin/receipts" style={styles.cancelLink}>← Back to queue</Link>
      </header>

      <section style={styles.card}>
        <div style={styles.field}>
          <span style={styles.label}>Receipt photo</span>
          {/* Hidden inputs. The camera one carries `capture="environment"`
              so mobile launches the rear camera; the file one is a plain
              picker that also accepts PDFs. Both feed the same handler. */}
          <input
            ref={cameraRef}
            type="file"
            accept={ACCEPTED_TYPES_CAMERA}
            capture="environment"
            onChange={onPickFile}
            disabled={busy}
            style={styles.hiddenInput}
            aria-hidden
            tabIndex={-1}
          />
          <input
            ref={fileRef}
            type="file"
            accept={ACCEPTED_TYPES_FILE}
            onChange={onPickFile}
            disabled={busy}
            style={styles.hiddenInput}
            aria-hidden
            tabIndex={-1}
          />
          <div style={styles.captureRow}>
            <button
              type="button"
              onClick={openCamera}
              disabled={busy}
              style={styles.captureBtnPrimary}
              aria-label="Take a photo with the device camera"
            >
              <span aria-hidden style={styles.captureBtnIcon}>📷</span>
              <span>Take a photo</span>
            </button>
            <button
              type="button"
              onClick={openFilePicker}
              disabled={busy}
              style={styles.captureBtnSecondary}
              aria-label="Choose an image or PDF from your device"
            >
              <span aria-hidden style={styles.captureBtnIcon}>📁</span>
              <span>Choose a file</span>
            </button>
          </div>
          <span style={styles.hint}>
            Camera opens the rear lens on phones and tablets. Max 12 MB.
            JPEG/PNG/WebP/HEIC and PDF accepted.
          </span>
        </div>

        {previewUrl && (
          <div style={styles.previewWrap}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={previewUrl} alt="Receipt preview" style={styles.preview} />
            <button
              type="button"
              onClick={clearFile}
              disabled={busy}
              style={styles.clearBtn}
              aria-label="Remove the picked photo"
            >
              Retake / pick different
            </button>
          </div>
        )}
        {file && !previewUrl && (
          <div style={styles.previewWrap}>
            <p style={styles.fileSummary}>
              {file.name} — {(file.size / 1024).toFixed(0)} KB. Preview not
              available for this file type.
            </p>
            <button
              type="button"
              onClick={clearFile}
              disabled={busy}
              style={styles.clearBtn}
              aria-label="Remove the picked file"
            >
              Pick a different file
            </button>
          </div>
        )}

        <label style={styles.field}>
          <span style={styles.label}>Job number (optional)</span>
          <input
            type="text"
            value={jobId}
            onChange={(e) => setJobId(e.target.value)}
            placeholder="e.g. 24-103 — leave blank for office expenses"
            disabled={busy}
            style={styles.input}
          />
        </label>

        <label style={styles.field}>
          <span style={styles.label}>Notes (optional)</span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="What was this for? e.g. fuel for Henry job, lunch with client, equipment battery"
            rows={3}
            disabled={busy}
            style={styles.textarea}
          />
        </label>

        {error && <p role="alert" style={styles.error}>{error}</p>}

        <div style={styles.actions}>
          <Link href="/admin/receipts" style={styles.cancelBtn}>Cancel</Link>
          <button
            type="button"
            onClick={onUpload}
            disabled={!file || busy}
            style={{ ...styles.uploadBtn, opacity: !file || busy ? 0.55 : 1, cursor: !file || busy ? 'not-allowed' : 'pointer' }}
          >
            {busy ? 'Uploading…' : 'Upload receipt'}
          </button>
        </div>
      </section>
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    maxWidth: 720,
    margin: '0 auto',
    padding: '1.5rem clamp(1rem, 3vw, 2rem)',
    fontFamily: 'var(--font-body, system-ui, sans-serif)',
    color: 'var(--color-text-primary, #111827)',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: '1rem',
    flexWrap: 'wrap',
    marginBottom: '1.25rem',
  },
  title: { margin: 0, fontSize: '1.6rem', fontWeight: 700, letterSpacing: '-0.01em' },
  subtitle: { margin: '0.35rem 0 0', color: 'var(--color-text-secondary, #4b5563)', fontSize: '0.95rem', maxWidth: '52ch' },
  cancelLink: { fontSize: '0.9rem', color: 'var(--color-brand-navy, #1e3a8a)', textDecoration: 'none', paddingTop: '0.4rem' },
  card: {
    background: 'var(--color-bg-card, #fff)',
    border: '1px solid var(--color-border, #e5e7eb)',
    borderRadius: 14,
    padding: '1.25rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
    boxShadow: '0 4px 18px rgba(15, 23, 42, 0.05)',
  },
  field: { display: 'flex', flexDirection: 'column', gap: '0.5rem' },
  label: { fontSize: '0.9rem', fontWeight: 600 },
  hint: { fontSize: '0.78rem', color: 'var(--color-text-secondary, #6b7280)' },
  // Visually-hidden but still keyboard-reachable when its button label
  // delegates to it — clip-path keeps it off-screen without removing
  // it from the accessibility tree. `display: none` would break the
  // .click() delegation on some Safari versions.
  hiddenInput: {
    position: 'absolute',
    width: 1,
    height: 1,
    padding: 0,
    margin: -1,
    overflow: 'hidden',
    clip: 'rect(0, 0, 0, 0)',
    whiteSpace: 'nowrap',
    border: 0,
  },
  captureRow: {
    display: 'flex',
    gap: '0.6rem',
    flexWrap: 'wrap',
  },
  // Primary "Take a photo" button — green gradient so the camera path
  // reads as the encouraged action on mobile. min-width keeps both
  // buttons readable when they wrap to two lines on narrow viewports.
  captureBtnPrimary: {
    flex: '1 1 220px',
    minHeight: 56,
    padding: '0.75rem 1rem',
    borderRadius: 12,
    border: 'none',
    background: 'var(--gradient-green, linear-gradient(180deg, #10b981, #059669))',
    color: '#fff',
    fontWeight: 600,
    fontSize: '1rem',
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.5rem',
    boxShadow: '0 4px 12px rgba(16, 185, 129, 0.25)',
  },
  // Secondary "Choose a file" button — outlined navy so it still
  // reads as actionable but doesn't compete with the camera path.
  captureBtnSecondary: {
    flex: '1 1 220px',
    minHeight: 56,
    padding: '0.75rem 1rem',
    borderRadius: 12,
    border: '1.5px solid var(--color-brand-navy, #1e3a8a)',
    background: 'var(--color-bg-card, #fff)',
    color: 'var(--color-brand-navy, #1e3a8a)',
    fontWeight: 600,
    fontSize: '1rem',
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.5rem',
  },
  captureBtnIcon: { fontSize: '1.25rem', lineHeight: 1 },
  clearBtn: {
    alignSelf: 'center',
    marginTop: '0.5rem',
    padding: '0.35rem 0.85rem',
    borderRadius: 9999,
    border: '1px solid var(--color-border, #d1d5db)',
    background: 'var(--color-bg-card, #fff)',
    color: 'var(--color-text-secondary, #4b5563)',
    fontSize: '0.82rem',
    fontWeight: 600,
    cursor: 'pointer',
  },
  fileSummary: { margin: 0, fontSize: '0.85rem', color: 'var(--color-text-secondary, #4b5563)' },
  input: {
    padding: '0.55rem 0.7rem',
    borderRadius: 8,
    border: '1px solid var(--color-border, #d1d5db)',
    background: 'var(--color-bg-card, #fff)',
    fontSize: '0.95rem',
  },
  textarea: {
    padding: '0.55rem 0.7rem',
    borderRadius: 8,
    border: '1px solid var(--color-border, #d1d5db)',
    background: 'var(--color-bg-card, #fff)',
    fontSize: '0.95rem',
    resize: 'vertical',
    minHeight: 72,
    fontFamily: 'inherit',
  },
  previewWrap: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.4rem',
    background: 'var(--color-bg-subtle, #f9fafb)',
    border: '1px dashed var(--color-border, #e5e7eb)',
    borderRadius: 10,
    padding: '0.8rem 0.6rem',
  },
  preview: { maxWidth: '100%', maxHeight: 360, borderRadius: 6 },
  error: {
    margin: 0,
    padding: '0.55rem 0.7rem',
    background: '#fee2e2',
    border: '1px solid #fecaca',
    color: '#991b1b',
    borderRadius: 8,
    fontSize: '0.9rem',
  },
  actions: { display: 'flex', justifyContent: 'flex-end', gap: '0.6rem', marginTop: '0.25rem' },
  cancelBtn: {
    padding: '0.55rem 1rem',
    borderRadius: 9999,
    border: '1px solid var(--color-border, #d1d5db)',
    background: 'transparent',
    color: 'var(--color-text-secondary, #4b5563)',
    fontSize: '0.9rem',
    fontWeight: 600,
    textDecoration: 'none',
    display: 'inline-flex',
    alignItems: 'center',
  },
  uploadBtn: {
    padding: '0.55rem 1.2rem',
    borderRadius: 9999,
    border: 'none',
    background: 'var(--gradient-green, linear-gradient(180deg, #10b981, #059669))',
    color: '#fff',
    fontWeight: 600,
    fontSize: '0.95rem',
  },
};

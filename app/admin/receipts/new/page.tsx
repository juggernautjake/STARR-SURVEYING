// app/admin/receipts/new/page.tsx
//
// quick-actions-wiring-2026-06-22 — web-side receipt upload page wired
// from the "Capture Receipt" Quick Actions tile (and any link/button
// the user wants to drop in). The page exists so the admin web hub
// button is no longer a dead "Coming soon" stub.
//
// receipt-camera-getusermedia-2026-06-22 — switched from the
// `capture="environment"` file-input pattern to a real getUserMedia
// camera flow. The capture attribute is silently ignored by most
// desktop browsers (and a chunk of mobile WebViews), so users saw the
// file picker open even when they clicked "Take a photo". With
// getUserMedia we render a live <video> preview, a shutter button, and
// a flip-camera button. The capture-attribute file input is kept as a
// fallback for browsers/contexts where getUserMedia isn't available
// (iOS Safari pre-14.3 WebView, http origins without HTTPS, etc.).
//
// UX:
//   - "Take a photo" → prompts for camera permission, shows a live
//     viewfinder. Shutter button snaps the frame, converts it to a
//     JPEG File via <canvas>.toBlob, and lands it in the same preview
//     + upload flow the file picker uses.
//   - "Choose a file" → plain file picker, accepts image/* + PDF.
//   - Preview shows the picked/captured image; clear button retakes.
//   - Optional job id + notes; "Upload" POSTs to
//     /api/admin/receipts/upload.

'use client';

import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const ACCEPTED_TYPES_FILE = 'image/*,application/pdf';
const ACCEPTED_TYPES_CAMERA = 'image/*';
const MAX_BYTES = 12 * 1024 * 1024;
const CAPTURE_JPEG_QUALITY = 0.92;

type FacingMode = 'environment' | 'user';

export default function NewReceiptPage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  // Two hidden inputs. The camera one keeps `capture="environment"` so
  // we have a graceful fallback when getUserMedia is unavailable; the
  // file one is a plain picker that also accepts PDFs.
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [jobId, setJobId] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Live-camera state. cameraStream holds the active MediaStream when
  // the viewfinder is open; closing the viewfinder stops every track.
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [cameraStarting, setCameraStarting] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<FacingMode>('environment');

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

  // Attach the active MediaStream to the <video> as soon as it lands.
  // playsInline is set declaratively below so iOS Safari doesn't go
  // fullscreen.
  useEffect(() => {
    const v = videoRef.current;
    if (v && cameraStream) {
      v.srcObject = cameraStream;
      // Defensive: some Safari versions need an explicit play() after
      // srcObject assignment.
      v.play().catch(() => { /* autoplay block — viewfinder still works */ });
    }
    return () => {
      if (v) v.srcObject = null;
    };
  }, [cameraStream]);

  // Stop every track on unmount so we never strand the camera light on.
  useEffect(() => {
    return () => {
      cameraStream?.getTracks().forEach((t) => t.stop());
    };
  }, [cameraStream]);

  const stopCameraTracks = useCallback((stream: MediaStream | null) => {
    stream?.getTracks().forEach((t) => t.stop());
  }, []);

  const startCameraStream = useCallback(async (mode: FacingMode): Promise<MediaStream | null> => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      return null;
    }
    // Try the requested facing mode first; if the device only has one
    // camera (most laptops), retry with no constraint so we still get a
    // stream instead of a NotFoundError.
    try {
      return await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: mode } },
        audio: false,
      });
    } catch (firstErr) {
      if (firstErr instanceof DOMException && firstErr.name === 'OverconstrainedError') {
        return await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      }
      throw firstErr;
    }
  }, []);

  async function openCamera() {
    setError(null);
    setCameraError(null);
    // Browsers that don't expose getUserMedia at all — fall back to the
    // file input (it carries `capture="environment"` so mobile WebViews
    // still get the OS camera).
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      cameraInputRef.current?.click();
      return;
    }
    if (!window.isSecureContext) {
      setCameraError(
        'Camera capture requires a secure (HTTPS) context. Use "Choose a file" or open this page over HTTPS.',
      );
      return;
    }
    setCameraStarting(true);
    try {
      const stream = await startCameraStream(facingMode);
      if (!stream) {
        cameraInputRef.current?.click();
        return;
      }
      setCameraStream(stream);
      setCameraOpen(true);
    } catch (err) {
      const name = err instanceof DOMException ? err.name : '';
      if (name === 'NotAllowedError' || name === 'SecurityError') {
        setCameraError(
          'Camera permission denied. Grant access in your browser settings, or use "Choose a file" instead.',
        );
      } else if (name === 'NotFoundError') {
        setCameraError('No camera detected on this device. Use "Choose a file" instead.');
      } else if (name === 'NotReadableError') {
        setCameraError(
          'Camera is in use by another app. Close it and try again, or use "Choose a file".',
        );
      } else {
        const msg = err instanceof Error ? err.message : String(err);
        setCameraError(`Camera not available: ${msg}. Use "Choose a file" instead.`);
      }
    } finally {
      setCameraStarting(false);
    }
  }

  function closeCamera() {
    stopCameraTracks(cameraStream);
    setCameraStream(null);
    setCameraOpen(false);
  }

  async function switchCamera() {
    if (!cameraStream) return;
    const next: FacingMode = facingMode === 'environment' ? 'user' : 'environment';
    stopCameraTracks(cameraStream);
    setCameraStream(null);
    setFacingMode(next);
    try {
      const stream = await startCameraStream(next);
      if (!stream) throw new Error('No stream returned');
      setCameraStream(stream);
    } catch (err) {
      setCameraError(
        `Couldn${"’"}t switch cameras: ${err instanceof Error ? err.message : String(err)}.`,
      );
      closeCamera();
    }
  }

  function snapPhoto() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    if (video.videoWidth === 0 || video.videoHeight === 0) {
      setCameraError('Camera not ready yet — give it a moment and try again.');
      return;
    }
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      setCameraError('Could not get a canvas context to capture the frame.');
      return;
    }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          setCameraError('Capture failed. Please try again.');
          return;
        }
        if (blob.size > MAX_BYTES) {
          setCameraError(`Captured photo is ${(blob.size / 1024 / 1024).toFixed(1)} MB — please retry with a smaller image.`);
          return;
        }
        const captured = new File([blob], `receipt-${Date.now()}.jpg`, {
          type: 'image/jpeg',
          lastModified: Date.now(),
        });
        setFile(captured);
        closeCamera();
      },
      'image/jpeg',
      CAPTURE_JPEG_QUALITY,
    );
  }

  function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    setError(null);
    const f = e.target.files?.[0] ?? null;
    // Reset both inputs after every change so picking the same file
    // twice in a row still re-fires `onChange`.
    if (cameraInputRef.current) cameraInputRef.current.value = '';
    if (fileRef.current && fileRef.current !== e.target) fileRef.current.value = '';
    if (!f) { setFile(null); return; }
    if (f.size > MAX_BYTES) {
      setError(`That file is ${(f.size / 1024 / 1024).toFixed(1)} MB — please pick something under 12 MB.`);
      setFile(null);
      return;
    }
    setFile(f);
  }

  function openFilePicker() {
    setError(null);
    fileRef.current?.click();
  }
  function clearFile() {
    setFile(null);
    setError(null);
    if (cameraInputRef.current) cameraInputRef.current.value = '';
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
          {/* Fallback hidden inputs — used when getUserMedia is
              unavailable (older WebViews, http origins, locked-down
              MDM profiles) or when the user clicks "Choose a file". */}
          <input
            ref={cameraInputRef}
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

          {cameraOpen ? (
            <CameraViewfinder
              videoRef={videoRef}
              canvasRef={canvasRef}
              onSnap={snapPhoto}
              onCancel={closeCamera}
              onSwitch={switchCamera}
              facingMode={facingMode}
            />
          ) : (
            <>
              <div style={styles.captureRow}>
                <button
                  type="button"
                  onClick={openCamera}
                  disabled={busy || cameraStarting}
                  style={styles.captureBtnPrimary}
                  aria-label="Take a photo with the device camera"
                >
                  <span aria-hidden style={styles.captureBtnIcon}>📷</span>
                  <span>{cameraStarting ? 'Starting camera…' : 'Take a photo'}</span>
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
              {cameraError && (
                <p role="alert" style={styles.cameraError}>{cameraError}</p>
              )}
              <span style={styles.hint}>
                Camera opens a live viewfinder in your browser. You may
                need to grant camera permission the first time. Max 12 MB.
                JPEG/PNG/WebP/HEIC and PDF accepted.
              </span>
            </>
          )}
        </div>

        {previewUrl && !cameraOpen && (
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
        {file && !previewUrl && !cameraOpen && (
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

/** Inline viewfinder — live video + shutter + cancel + switch-camera.
 *  Off-DOM canvas hosts the captured frame before .toBlob hands it
 *  back to the upload flow. */
function CameraViewfinder({
  videoRef,
  canvasRef,
  onSnap,
  onCancel,
  onSwitch,
  facingMode,
}: {
  videoRef: React.MutableRefObject<HTMLVideoElement | null>;
  canvasRef: React.MutableRefObject<HTMLCanvasElement | null>;
  onSnap: () => void;
  onCancel: () => void;
  onSwitch: () => void;
  facingMode: FacingMode;
}) {
  return (
    <div style={styles.viewfinder}>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        // `user` facing → mirror so the user sees what they expect.
        // `environment` facing → no mirror.
        style={{
          ...styles.video,
          transform: facingMode === 'user' ? 'scaleX(-1)' : undefined,
        }}
      />
      <canvas ref={canvasRef} style={{ display: 'none' }} aria-hidden />
      <div style={styles.viewfinderControls}>
        <button
          type="button"
          onClick={onCancel}
          style={styles.viewfinderCancel}
          aria-label="Cancel camera"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onSnap}
          style={styles.shutterBtn}
          aria-label="Take photo"
        >
          <span aria-hidden style={styles.shutterInner} />
        </button>
        <button
          type="button"
          onClick={onSwitch}
          style={styles.viewfinderSwitch}
          aria-label="Switch camera"
          title={facingMode === 'environment' ? 'Switch to front camera' : 'Switch to rear camera'}
        >
          <span aria-hidden style={styles.viewfinderSwitchIcon}>↺</span>
        </button>
      </div>
    </div>
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
  // ── Live-camera viewfinder ──────────────────────────────────────
  viewfinder: {
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.6rem',
    background: '#0b1220',
    borderRadius: 12,
    padding: '0.6rem',
    overflow: 'hidden',
  },
  video: {
    width: '100%',
    maxHeight: 480,
    background: '#000',
    borderRadius: 8,
    objectFit: 'cover',
    display: 'block',
  },
  viewfinderControls: {
    display: 'grid',
    gridTemplateColumns: '1fr auto 1fr',
    alignItems: 'center',
    gap: '0.5rem',
    padding: '0.25rem 0.5rem 0.5rem',
  },
  viewfinderCancel: {
    justifySelf: 'start',
    padding: '0.5rem 1rem',
    borderRadius: 9999,
    border: '1px solid rgba(255,255,255,0.35)',
    background: 'transparent',
    color: '#fff',
    fontSize: '0.9rem',
    fontWeight: 600,
    cursor: 'pointer',
  },
  shutterBtn: {
    width: 72,
    height: 72,
    borderRadius: '50%',
    border: '4px solid rgba(255,255,255,0.92)',
    background: 'transparent',
    cursor: 'pointer',
    padding: 0,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 4px 12px rgba(0,0,0,0.45)',
  },
  shutterInner: {
    display: 'block',
    width: 54,
    height: 54,
    borderRadius: '50%',
    background: '#ffffff',
    transition: 'transform 80ms ease',
  },
  viewfinderSwitch: {
    justifySelf: 'end',
    width: 44,
    height: 44,
    borderRadius: '50%',
    border: '1px solid rgba(255,255,255,0.35)',
    background: 'rgba(255,255,255,0.08)',
    color: '#fff',
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewfinderSwitchIcon: { fontSize: '1.3rem', lineHeight: 1 },
  cameraError: {
    margin: '0.25rem 0 0',
    padding: '0.5rem 0.7rem',
    background: '#fff7ed',
    border: '1px solid #fed7aa',
    color: '#9a3412',
    borderRadius: 8,
    fontSize: '0.85rem',
  },
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

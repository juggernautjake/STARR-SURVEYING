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
import { MAX_JOB_FILE_BYTES, maxBytesFor, contentTypeFor } from '@/lib/jobs/file-storage';
import { backgroundUploadSupport, startBackgroundUpload, ensureNotifyPermission } from '@/lib/jobs/upload-background';
import { planSplit, describePlan, type SplitPlan } from '@/lib/jobs/video-split';
import { readVideoDuration } from '@/lib/jobs/video-split-run';
// The one viewer, shared with the Files tab and the project panel — see the lightbox below.
import FileViewer, { type ViewerFile } from './FileViewer';

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
  /** Returned by `GET /api/admin/jobs/files`; the shared viewer shows it as the type chip. */
  file_type?: string;
  /** seeds/607 — the chosen name and free tags, edited in the viewer's details rail. */
  label?: string | null;
  tags?: string[] | null;
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
  /** Live upload progress for the bar. `phase` separates "still sending bytes" from "sent, saving
   *  the record" — without it a 300 MB video sits at 100% and looks hung. */
  const [progress, setProgress] = useState<{
    index: number; total: number; name: string;
    pct: number; loaded: number; bytes: number;
    phase: 'sending' | 'finishing';
  } | null>(null);
  const [dragOver, setDragOver] = useState(false);
  /** How many files were handed to the browser to finish on its own — the banner that replaces a
   *  progress bar when the upload is no longer this page's responsibility. */
  const [handedOff, setHandedOff] = useState(0);
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  /** The camera. A SEPARATE input because `capture` is an attribute, not a runtime option — one
   *  input cannot offer both "record now" and "choose an existing recording", and on a phone those
   *  are genuinely different actions. */
  const captureInput = useRef<HTMLInputElement>(null);
  /** The oversized-video conversation: measure → confirm → cut → upload. Held in state rather than
   *  a `window.confirm` because the cut can take a while and needs a progress line. */
  const [splitState, setSplitState] = useState<{
    file: File;
    plan?: SplitPlan;
    phase: 'measuring' | 'confirm' | 'splitting';
    message: string;
  } | null>(null);

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

  // Read once on mount: it depends on the browser, which does not change mid-session, and calling
  // it during render would touch  on the server.
  const [supportNote, setSupportNote] = useState('');
  useEffect(() => { setSupportNote(backgroundUploadSupport().explanation); }, []);

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
    // ── TOO BIG FOR ONE OBJECT: ASK, THEN CUT (2026-08-19) ──────────────────────────────────────
    //
    // Owner: *"if it finds a video to be bigger than the limit, it cuts the video up into multiple
    // videos that are within the limit automatically. There should be some kind of
    // warning/notification that pops up."*
    //
    // A DOCUMENT over the cap is still just refused — there is no sensible way to cut a PDF in half.
    // A VIDEO gets a plan and a dialog, and the person decides before anything happens: three files
    // appearing unannounced where one recording was expected is its own kind of failure.
    const tooBig = incoming.find((f) => f.size > maxBytesFor(f.name, f.type));
    if (tooBig) {
      const cap = maxBytesFor(tooBig.name, tooBig.type);
      if (media !== 'videos') {
        setError(`"${tooBig.name}" is larger than ${Math.round(cap / 1024 / 1024)} MB, which is the storage limit for one file.`);
        return;
      }
      setError(null);
      setUploading(0);
      // Reading the duration needs the browser to parse the container — a moment, not a decode.
      setSplitState({ file: tooBig, phase: 'measuring', message: 'Checking how long this video is…' });
      const durationSec = await readVideoDuration(tooBig);
      const plan = planSplit({ sizeBytes: tooBig.size, durationSec, capBytes: cap, name: tooBig.name });
      if (!plan.needed || plan.parts.length === 0) {
        setSplitState(null);
        setError(describePlan(plan, tooBig.size, cap) || 'That video cannot be stored.');
        return;
      }
      setSplitState({
        file: tooBig,
        plan,
        phase: 'confirm',
        message: describePlan(plan, tooBig.size, cap),
      });
      return;
    }
    setError(null);
    setUploading(incoming.length);

    // ── BACKGROUND, WHERE THE BROWSER ALLOWS IT (2026-08-19) ────────────────────────────────────
    //
    // Owner: *"I want it so that I can leave the web app and have it still working in the background
    // … and then once it is done it can notify me."*
    //
    // Handed to the browser process via Background Fetch, which keeps going after the tab closes and
    // wakes the service worker to create the row and raise the notification. Chrome and Android
    // only — Safari does not implement it, so iOS falls through to the foreground path below and the
    // banner says so rather than promising something the platform cannot do.
    const support = backgroundUploadSupport();
    if (support.mode === 'background') {
      await ensureNotifyPermission();
      let handedOff = 0;
      for (const file of incoming) {
        try {
          const init = await fetch('/api/admin/jobs/files/upload', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ job_id: jobId, name: file.name, size_bytes: file.size, mime_type: file.type }),
          });
          if (!init.ok) throw new Error((await init.json().catch(() => ({}))).error ?? 'Could not start the upload.');
          const started = await init.json();
          const ok = await startBackgroundUpload({
            signedUrl: started.signed_url,
            file,
            contentType: contentTypeFor(file.name, file.type),
            row: {
              id: started.file_id,
              rowEndpoint: '/api/admin/jobs/files',
              rowBody: {
                job_id: jobId, file_id: started.file_id, storage_path: started.path,
                storage_bucket: started.bucket, file_name: file.name, file_type: cfg.fileType,
                file_size: file.size, mime_type: file.type, section: cfg.section,
              },
              fileName: file.name,
              sizeBytes: file.size,
              openUrl: `/admin/jobs/${jobId}`,
            },
          });
          if (ok) handedOff += 1;
          else throw new Error('handoff-declined');
        } catch (e) {
          // The signed URL is already spent for this file, so there is nothing to fall back TO for
          // it — say so plainly instead of appearing to succeed.
          if (e instanceof Error && e.message !== 'handoff-declined') {
            setError(e.message);
            setUploading(0);
            return;
          }
          break; // Background Fetch declined; fall through to the foreground path for everything.
        }
      }
      if (handedOff === incoming.length) {
        setUploading(0);
        setProgress(null);
        setHandedOff(handedOff);
        if (fileInput.current) fileInput.current.value = '';
        if (captureInput.current) captureInput.current.value = '';
        // Not reloaded here: the rows do not exist yet — the worker writes them when the transfer
        // finishes. Claiming otherwise would show an empty gallery and look like a failure.
        return;
      }
    }

    try {
      // ── UPLOADED IN PARALLEL (2026-08-19) ─────────────────────────────────────────────────────
      //
      // Owner: *"if there is anything that can be done to speed up the upload speed, please make it
      // happen."*
      //
      // One at a time was the single biggest cost, and it only became obvious once a 375 MB video
      // started arriving as NINE parts: sequentially that is nine round trips end to end, each one
      // idle while the next waits. A small pool overlaps them, so the wall-clock is roughly the
      // slowest few rather than the sum of all.
      //
      // THREE, not more. Browsers cap concurrent connections per host (~6), and the pool shares that
      // budget with the page's own requests; saturating it makes the job page itself stop responding
      // mid-upload, which looks exactly like the freeze this work set out to remove.
      const CONCURRENCY = Math.min(3, incoming.length);
      const totalBytes = incoming.reduce((a, f) => a + f.size, 0);
      // Aggregate rather than per-file: with several running at once "file 3 of 9" is meaningless,
      // while total bytes moved is the honest measure of how far along the whole thing is.
      const sent = new Map<number, number>();
      const pushProgress = (doneCount: number) => {
        const loaded = [...sent.values()].reduce((a, b) => a + b, 0);
        setProgress({
          index: Math.min(doneCount + 1, incoming.length),
          total: incoming.length,
          name: incoming.length === 1 ? incoming[0].name : `${incoming.length} files`,
          pct: totalBytes > 0 ? Math.min(100, Math.round((loaded / totalBytes) * 100)) : 0,
          loaded,
          bytes: totalBytes,
          phase: 'sending',
        });
      };
      pushProgress(0);

      let done = 0;
      let cursor = 0;
      const worker = async () => {
        for (;;) {
          const i = cursor;
          cursor += 1;
          if (i >= incoming.length) return;
          const file = incoming[i];
          // Bytes straight to storage, then a row that points at them — the same three-step the
          // Files tab and the File Explorer use.
          const { file_id, storage_path, storage_bucket } = await uploadJobFileBytes(jobId, file, (p) => {
            sent.set(i, p.loaded);
            pushProgress(done);
          });
          sent.set(i, file.size);
          const res = await fetch('/api/admin/jobs/files', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              job_id: jobId,
              file_id,
              storage_path,
              // Which bucket the bytes went to — video is not in the documents bucket, and a row
              // that does not say so is a row the download cannot find.
              storage_bucket,
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
          done += 1;
          pushProgress(done);
        }
      };

      // `Promise.all` so the FIRST failure rejects immediately rather than after every other part
      // has also finished — on a nine-part video that is minutes of pointless waiting before the
      // person is told something went wrong.
      await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
      setProgress((cur) => (cur ? { ...cur, phase: 'finishing', pct: 100 } : cur));
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed');
    }
    setUploading(0);
    setProgress(null);
    if (fileInput.current) fileInput.current.value = '';
    // The camera input too, or recording the same clip twice in a row fires no change event.
    if (captureInput.current) captureInput.current.value = '';
  }, [jobId, load, media, cfg.section, cfg.fileType]);

  /** The person said yes: cut the file, then hand the parts to the ordinary upload path. */
  const runSplit = useCallback(async () => {
    if (!splitState?.plan) return;
    const { file, plan } = splitState;
    setSplitState({ ...splitState, phase: 'splitting', message: 'Preparing to cut the video…' });
    const { splitVideo } = await import('@/lib/jobs/video-split-run');
    const outcome = await splitVideo(file, plan.parts, (p) =>
      setSplitState((s) => (s ? { ...s, message: `Cutting part ${p.part} of ${p.total}… ${p.pct}%` } : s)));
    setSplitState(null);
    if (!outcome.ok || !outcome.files) {
      setError(outcome.error ?? 'The video could not be split.');
      return;
    }
    // ── A PART CAN STILL OVERSHOOT ──────────────────────────────────────────────────────────────
    //
    // Cuts land on keyframes, not on the requested second, so a recording with sparse keyframes can
    // produce a piece larger than planned — measured at 5.0s against a 2.9s target on a stream with
    // widely spaced keyframes. Uploading it anyway would mean waiting through the transfer to be
    // refused by storage. Checked here instead, before a byte moves.
    const cap = maxBytesFor(file.name, file.type);
    const over = outcome.files.find((f) => f.size > cap);
    if (over) {
      setError(
        `The video was cut, but "${over.name}" is still ${Math.round(over.size / 1024 / 1024)} MB — over the `
        + `${Math.round(cap / 1024 / 1024)} MB limit, because this recording's keyframes are far apart. `
        + 'Please record at a lower resolution, or in shorter clips.',
      );
      return;
    }
    // The parts are ordinary Files now, so nothing downstream knows a split happened.
    await upload(outcome.files);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [splitState]);

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

  // ── NO KEYBOARD HANDLER HERE (2026-08-22) ──────────────────────────────────────────────────
  //
  // There used to be one: Escape / ArrowLeft / ArrowRight on `window`. `FileViewer` binds the same
  // three keys, and both would have fired on every press — one arrow stepping the gallery TWO
  // photos, and Escape closing through the viewer's fullscreen guard. Removed rather than guarded,
  // because two components listening for the same key on `window` is the bug, not the symptom.

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
        {/* ── TWO WAYS IN ON A PHONE, ONE ON A DESKTOP (2026-08-19) ─────────────────────────────
            Owner: *"Please make sure there is a clear and surfaced way to upload videos from mobile
            devices and pcs."*

            On a phone these are genuinely different actions and the browser cannot offer both from
            one input: `capture` opens the camera straight into record mode, and its ABSENCE opens
            the library. A single button has to pick one, so somebody who filmed the site an hour
            ago either cannot reach the recording, or cannot start a new one. Both are offered, and
            the camera one is hidden on a desktop where it would open a webcam nobody wants. */}
        <div className="job-media__actions">
          <button
            className="jobs-page__btn jobs-page__btn--primary"
            onClick={() => fileInput.current?.click()}
            disabled={uploading > 0}
            data-testid={`media-add-${media}`}
          >
            {uploading > 0 ? `Uploading ${uploading}…` : cfg.addLabel}
          </button>
          <button
            className="jobs-page__btn jobs-page__btn--secondary job-media__capture"
            onClick={() => captureInput.current?.click()}
            disabled={uploading > 0}
            data-testid={`media-capture-${media}`}
          >
            {media === 'videos' ? '🎬 Record video' : '📸 Take photo'}
          </button>
        </div>
        <input
          ref={fileInput}
          type="file"
          accept={cfg.accept}
          multiple
          style={{ display: 'none' }}
          onChange={(e) => { if (e.target.files) upload(e.target.files); }}
          data-testid={`media-input-${media}`}
        />
        {/* `capture="environment"` = the rear camera, which is the one pointed at the monument.
            Not `multiple` — a capture produces exactly one recording. */}
        <input
          ref={captureInput}
          type="file"
          accept={media === 'videos' ? 'video/*' : 'image/*'}
          capture="environment"
          style={{ display: 'none' }}
          onChange={(e) => { if (e.target.files) upload(e.target.files); }}
          data-testid={`media-capture-input-${media}`}
        />
      </div>

      {error && (
        <div className="job-detail__error" role="alert" style={{ marginTop: '0.75rem' }}>{error}</div>
      )}

      {/* ── THE LOADING BAR (2026-08-19) ────────────────────────────────────────────────────────
          Owner: *"Please add a loading bar that shows exactly how far along the uploading is."*

          The XHR progress events were already being emitted — nothing consumed them, so a 300 MB
          video showed a button reading "Uploading 1…" and no other sign of life for minutes, which
          is indistinguishable from a frozen page.

          Bytes as well as a percentage: "142 MB of 310 MB" that is moving tells you it is working;
          "46%" that has not changed in a minute does not. */}
      {/* ── HANDED TO THE BROWSER ────────────────────────────────────────────────────────────────
          There is no progress bar to show once Background Fetch owns the transfer — the OS shows its
          own, and this page may not even be open when it finishes. Saying that is more useful than
          a bar that would be lying about who is doing the work. */}
      {handedOff > 0 && (
        <div className="jup jup--handed" role="status" data-testid="upload-handed-off">
          <strong>
            {handedOff} {handedOff === 1 ? 'file is' : 'files are'} uploading in the background.
          </strong>
          <span>
            You can leave this page or lock your phone — your browser will finish it and notify you.
            It will appear here once it lands.
          </span>
          <button type="button" className="jobs-page__btn jobs-page__btn--secondary" onClick={() => { setHandedOff(0); void load(); }}>
            Refresh
          </button>
        </div>
      )}

      {/* What this browser will actually do, said before anything is chosen. iOS cannot upload in
          the background at all, and somebody who knows that keeps the page open. */}
      {!progress && handedOff === 0 && supportNote && (
        <p className="jup__note" data-testid="upload-support-note">{supportNote}</p>
      )}

      {progress && (
        <div className="jup" role="status" aria-live="polite" data-testid="upload-progress">
          <div className="jup__head">
            <span className="jup__name" title={progress.name}>{progress.name}</span>
            {progress.total > 1 && (
              <span className="jup__of">file {progress.index} of {progress.total}</span>
            )}
          </div>
          <div className="jup__track">
            <div
              className={`jup__fill${progress.phase === 'finishing' ? ' jup__fill--finishing' : ''}`}
              style={{ width: `${progress.pct}%` }}
              data-testid="upload-progress-fill"
            />
          </div>
          <div className="jup__meta">
            <span data-testid="upload-progress-pct">{progress.pct}%</span>
            <span>
              {progress.phase === 'finishing'
                ? 'Saving…'
                : `${human(progress.loaded)} of ${human(progress.bytes)}`}
            </span>
          </div>
        </div>
      )}

      {/* ── The warning the owner asked for, before anything is cut ─────────────────────────────
          Shown as a real dialog rather than a `window.confirm` because the cut itself takes time
          and needs somewhere to report progress — and because a native confirm cannot say the
          three things that matter here: how big it is, how many files it becomes, and that the
          quality is untouched. */}
      {splitState && (
        <div className="vsplit" role="alertdialog" aria-modal="true" aria-label="This video must be split" data-testid="video-split-dialog">
          <div className="vsplit__card">
            <h4 className="vsplit__title">
              {splitState.phase === 'splitting' ? 'Cutting the video…' : 'This video is too big for one file'}
            </h4>
            <p className="vsplit__msg">{splitState.message}</p>
            {splitState.phase === 'confirm' && splitState.plan && (
              <ol className="vsplit__parts">
                {splitState.plan.parts.map((p) => (
                  <li key={p.index}>{p.name} <span>{Math.round(p.durationSec)}s</span></li>
                ))}
              </ol>
            )}
            <div className="vsplit__foot">
              {splitState.phase === 'confirm' ? (
                <>
                  <button type="button" className="jobs-page__btn jobs-page__btn--secondary" onClick={() => setSplitState(null)} data-testid="video-split-cancel">
                    Cancel
                  </button>
                  <button type="button" className="jobs-page__btn jobs-page__btn--primary" onClick={() => void runSplit()} data-testid="video-split-confirm">
                    Split and upload
                  </button>
                </>
              ) : (
                <p className="vsplit__working">Please keep this page open.</p>
              )}
            </div>
          </div>
        </div>
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
              // The chosen name if there is one, so a wall of `IMG_4417.MOV` tiles becomes
              // readable on hover. The uploaded name stays in the tooltip behind it.
              title={p.label?.trim() ? `${p.label.trim()} — uploaded as ${p.file_name}` : p.file_name}
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

      {/* ── THE LIGHTBOX IS NOW THE SHARED VIEWER (2026-08-22) ────────────────────────────────
          Owner: *"I need it so that I can view the videos and pictures and files in the app in a
          viewer that works well and has all of the controls that we might want."*

          This used to be a bespoke overlay: an <img> or a <video>, Prev/Next/Delete/Close, and
          nothing else. No zoom on a photo of a monument stamp, no rotate for a sideways phone
          shot, no fullscreen, no playback speed on a six-minute walkthrough — and, once files
          could be named and discussed, nowhere to do either.

          Rebuilding those here would have made a second viewer to keep in step with the first.
          `FileViewer` already has them, treats photos and videos as the same kind of thing, and
          carries its own stylesheet so it renders correctly wherever it is mounted. Delete moved
          into it as an optional control rather than being dropped. */}
      {active && (
        <FileViewer
          file={active as ViewerFile}
          files={photos as ViewerFile[]}
          onClose={() => setLightboxIdx(null)}
          onSelect={(f) => {
            const idx = photos.findIndex((p) => p.id === f.id);
            if (idx >= 0) setLightboxIdx(idx);
          }}
          // A rename or a tag change refetches: a gallery is a handful of tiles, and the tile's
          // own caption has to agree with what the viewer now shows.
          onPatched={() => { void load(); }}
          onDelete={(f) => { void remove(f.id as string); }}
        />
      )}
    </div>
  );
}

/** Bytes as a person reads them. MB is the right unit here — a field video is never in KB, and
 *  "0.31 GB" is harder to compare against a limit stated in MB. */
function human(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1048576).toFixed(bytes < 10 * 1048576 ? 1 : 0)} MB`;
}

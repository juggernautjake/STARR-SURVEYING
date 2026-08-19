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

import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  buildBatch, runBatch, batchSummary, type BatchProgress,
} from '@/lib/finance/receipt-batch';
import {
  averageHash, findLikelyDuplicates, describeReview, missingInformation,
  type QueuedShot, type DuplicatePair,
} from '@/lib/receipts/capture-queue';
import type { BatchReviewRow } from '@/app/api/admin/receipts/batch-review/route';
import JobRefPicker, { type JobRefOption } from '@/app/admin/components/jobs/JobRefPicker';
import MyReceipts from './MyReceipts';

const ACCEPTED_TYPES_FILE = 'image/*,application/pdf';
const ACCEPTED_TYPES_CAMERA = 'image/*';
const MAX_BYTES = 12 * 1024 * 1024;
const CAPTURE_JPEG_QUALITY = 0.92;

type FacingMode = 'environment' | 'user';

export default function NewReceiptPage() {
  const { data: session, status } = useSession();
  // Two hidden inputs. The camera one keeps `capture="environment"` so
  // we have a graceful fallback when getUserMedia is unavailable; the
  // file one is a plain picker that also accepts PDFs.
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [file, setFile] = useState<File | null>(null);
  // A picked JOB, not a typed string. The old field asked for a "Job number" and posted whatever
  // was typed into `receipts.job_id` — a UUID column — so the one value it named was the one value
  // it rejected. See JobRefPicker for the rest of the story, including what now happens when the
  // job does not exist yet.
  const [job, setJob] = useState<JobRefOption | null>(null);
  const [notes, setNotes] = useState('');
  // ── A NOTE PER RECEIPT, not one per batch (owner, 2026-08-18) ────────────────────────────────
  // *"They can write individual notes for each receipt they capture."* The box at the bottom of the
  // form applies to the whole stack, which is right for "all of these are the Henry job" and useless
  // for "this one is the $27.89 lunch". Both now exist: the shared note is the default and a
  // per-photo note is appended to it.
  //
  // Keyed by shot id rather than by index, because removing photo 2 must not silently slide photo
  // 3's note onto photo 4 — which is how a note ends up attached to the wrong receipt, and a note on
  // the wrong receipt is worse than no note at all now that the AI weighs it.
  const [shotNotes, setShotNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // R8 — bumped after every successful upload so the "your receipts" list below refetches. That
  // list IS the confirmation now; see the note on `finishUpload`.
  const [refreshKey, setRefreshKey] = useState(0);
  const [sentMsg, setSentMsg] = useState<string | null>(null);

  // Only a bookkeeper can open /admin/receipts. Since R1 opened CAPTURE to everyone, the links to
  // the approval queue became dead ends for most of the people now using this page — middleware
  // bounces a `field_crew` or `employee` account straight back to /admin/me. So the queue links are
  // shown to the roles that can actually follow them, and everyone else gets their own receipts
  // list instead, which is the thing they were really looking for.
  const roles = (session?.user?.roles ?? []) as string[];
  const isBookkeeper = roles.some((r) => r === 'admin' || r === 'developer' || r === 'tech_support');

  // ── F4 — bulk capture ────────────────────────────────────────────────────────────────────────
  // A separate queue rather than a list-shaped `file`, because the two flows genuinely differ: the
  // single path previews one image and navigates away on success, while the batch path has to keep
  // a row per file and stay on screen so failures remain visible and retryable. Collapsing them
  // would mean the single flow inherits a progress list it never needs, and the batch flow inherits
  // a preview that only makes sense for one photo.
  const [batchFiles, setBatchFiles] = useState<File[]>([]);
  const [batch, setBatch] = useState<BatchProgress | null>(null);
  const bulkRef = useRef<HTMLInputElement>(null);

  // ── Rapid fire ───────────────────────────────────────────────────────────────────────────────
  //
  // Owner, 2026-08-12: *"the in app camera should stay open and allow for the user to take more
  // pictures."* The camera already existed and closed after every shot, which turns a fortnight of
  // fuel receipts into fourteen rounds of open-permission-aim-snap-close.
  //
  // Metadata travels alongside `batchFiles` rather than inside it, because a `File` cannot carry a
  // perceptual hash or a thumbnail URL. The two arrays are kept the same length and in the same
  // order — every mutation below touches both, so an index means the same photo in each.
  const [shots, setShots] = useState<Array<QueuedShot & { url: string }>>([]);
  const shotSeq = useRef(0);

  /** Pairs of photos that look like the same piece of paper. Advisory: nothing is ever removed for
   *  you — two $5 coffees on the same day are both real. */
  const duplicates: DuplicatePair[] = useMemo(() => findLikelyDuplicates(shots), [shots]);

  /** What the AI made of the batch once it landed. Null until a batch has been sent. */
  const [review, setReview] = useState<BatchReviewRow[] | null>(null);
  /**
   * `waiting` while extractions are outstanding, `read` once every one has landed, and `gave_up`
   * when the poll hit its deadline with work still queued.
   *
   * Three states rather than a boolean, because the first version had two and said *"The AI has read
   * them."* when it had merely stopped asking — a receipt that was still queued was reported as
   * fully read, which is the one thing this panel exists to be trusted about.
   */
  const [reviewState, setReviewState] = useState<'idle' | 'waiting' | 'read' | 'gave_up'>('idle');

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
        video: {
          facingMode: { ideal: mode },
          // ── ASK FOR THE RESOLUTION. Owner, 2026-08-18: *"the AI is not doing a very good job of
          // actually reading the receipt."* ────────────────────────────────────────────────────
          //
          // This request carried NO resolution constraint until now, so every browser handed back
          // its default — 640×480 — and every receipt photographed through this page was stored at
          // VGA. Measured against the live bucket on 2026-08-18: the six most recent receipts were
          // 480×640 without exception, about 0.3 megapixels, from phones with 12-megapixel cameras.
          //
          // At that size the last four of a card number is a handful of pixels per digit and the
          // strokes that separate an 8 from a 3 were never captured. No prompt, no tiling and no
          // second opinion can recover detail the photograph does not contain — every other
          // accuracy measure in the deep reader is downstream of this one line.
          //
          // `ideal`, never `exact`: a laptop webcam that cannot do 4K must degrade to what it has
          // rather than throw OverconstrainedError and leave somebody with no camera at all.
          width: { ideal: 3840 },
          height: { ideal: 2160 },
        },
        audio: false,
      });
    } catch (firstErr) {
      if (firstErr instanceof DOMException && firstErr.name === 'OverconstrainedError') {
        // Even the fallback asks. `ideal` cannot over-constrain, so if we somehow land here the
        // resolution hint is still the right thing to carry — dropping it was how the default got
        // taken in the first place.
        return await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 3840 }, height: { ideal: 2160 } },
          audio: false,
        });
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

  /**
   * The 8×8 grey thumbnail an average hash is computed from.
   *
   * Drawn from the SAME canvas the JPEG came from, so the hash describes the frame that was actually
   * queued — re-decoding the blob afterwards would be slower and could disagree with it.
   *
   * Returns null rather than throwing on a tainted or unavailable context: a missing hash costs one
   * un-checked duplicate, and losing the photograph over it would cost the receipt.
   */
  function lumaThumbnail(source: HTMLCanvasElement): number[] | null {
    try {
      const small = document.createElement('canvas');
      small.width = 8;
      small.height = 8;
      const c = small.getContext('2d');
      if (!c) return null;
      c.drawImage(source, 0, 0, 8, 8);
      const d = c.getImageData(0, 0, 8, 8).data;
      const out: number[] = [];
      for (let i = 0; i < 64; i += 1) {
        const p = i * 4;
        out.push(0.299 * d[p] + 0.587 * d[p + 1] + 0.114 * d[p + 2]);
      }
      return out;
    } catch {
      return null;
    }
  }

  /** Add a photo to the queue, keeping `batchFiles` and `shots` aligned. */
  function enqueue(file: File, hash: string | null) {
    shotSeq.current += 1;
    const id = `shot-${shotSeq.current}`;
    setBatchFiles((prev) => [...prev, file]);
    setShots((prev) => [
      ...prev,
      { id, fileName: file.name, hash, bytes: file.size, takenAt: Date.now(), url: URL.createObjectURL(file) },
    ]);
    // A queue that has changed is a queue whose previous verdict no longer applies.
    setBatch(null);
    setReview(null);
  }

  /** Drop one photo from the queue. The object URL is revoked here rather than on unmount, because a
   *  long rapid-fire session would otherwise hold every discarded frame in memory. */
  function removeShot(id: string) {
    const index = shots.findIndex((s) => s.id === id);
    if (index < 0) return;
    setShotNotes((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    URL.revokeObjectURL(shots[index].url);
    setShots((prev) => prev.filter((s) => s.id !== id));
    setBatchFiles((prev) => prev.filter((_, i) => i !== index));
    setBatch(null);
    setReview(null);
  }

  function clearQueue() {
    shots.forEach((s) => URL.revokeObjectURL(s.url));
    setShots([]);
    setBatchFiles([]);
    setBatch(null);
    setReview(null);
  }

  /**
   * Take the shot — and stay in the viewfinder.
   *
   * The camera used to close here. Keeping it open is the entire point of the owner's request: the
   * person is holding a stack of paper, and the next action after photographing one receipt is
   * photographing the next, not navigating back to a button that reopens the camera.
   */
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
    const hash = averageHash(lumaThumbnail(canvas) ?? []);
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
        // Clear any stale error from an earlier shot: the last thing that happened was a success,
        // and leaving "Camera not ready yet" on screen under a fresh thumbnail is a lie.
        setCameraError(null);
        setError(null);
        setSentMsg(null);
        enqueue(captured, hash);
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

  /** Hash a file the person picked rather than photographed, so the camera roll gets the same
   *  duplicate check the viewfinder does. PDFs and anything undecodable hash to null, which the
   *  matcher treats as "cannot tell" rather than "not a duplicate". */
  async function hashPickedFile(f: File): Promise<string | null> {
    if (!f.type.startsWith('image/') || typeof createImageBitmap !== 'function') return null;
    try {
      const bitmap = await createImageBitmap(f);
      const c = document.createElement('canvas');
      c.width = 8;
      c.height = 8;
      const ctx = c.getContext('2d');
      if (!ctx) return null;
      ctx.drawImage(bitmap, 0, 0, 8, 8);
      bitmap.close?.();
      const d = ctx.getImageData(0, 0, 8, 8).data;
      const luma: number[] = [];
      for (let i = 0; i < 64; i += 1) {
        const p = i * 4;
        luma.push(0.299 * d[p] + 0.587 * d[p + 1] + 0.114 * d[p + 2]);
      }
      return averageHash(luma);
    } catch {
      return null;
    }
  }

  /** F4 — pick many at once. `multiple` on the input; everything else is the queue.
   *
   *  Appends rather than replaces, so a person can photograph three receipts and then add two from
   *  the camera roll without the first three vanishing. */
  async function onPickBulk(e: React.ChangeEvent<HTMLInputElement>) {
    setError(null);
    const picked = Array.from(e.target.files ?? []);
    if (bulkRef.current) bulkRef.current.value = '';
    if (picked.length === 0) return;
    for (const f of picked) {
      // Awaited one at a time on purpose: the hash is only used to warn about repeats, and racing
      // twenty decodes to produce a warning fractionally sooner is not worth the memory spike on a
      // phone holding twenty full-size photographs.
      enqueue(f, await hashPickedFile(f));
    }
  }

  /** F4 — run the queue against the same single-file endpoint, one at a time.
   *
   *  Reuses `/api/admin/receipts/upload` untouched: it already stores the photo and inserts a
   *  `receipts` row in `pending` with `extraction_status = 'queued'`, so a bulk upload produces
   *  exactly the same rows a one-at-a-time upload does and the worker cannot tell them apart. */
  async function onUploadBatch() {
    if (busy || batchFiles.length === 0) return;
    setBusy(true);
    setError(null);
    const items = buildBatch(batchFiles);
    const result = await runBatch(
      items,
      async (i) => {
        const form = new FormData();
        form.append('file', batchFiles[i]);
        if (job) form.append('jobId', job.id);
        // Shared note first, then this photo's own. Joined rather than replaced: somebody who typed
        // "Henry job" once for the stack and "$27.89" on one photo means both, and dropping either
        // loses information the reader is about to be judged on.
        const own = (shotNotes[shots[i]?.id ?? ''] ?? '').trim();
        const combined = [notes.trim(), own].filter(Boolean).join(' — ');
        if (combined) form.append('notes', combined);
        const res = await fetch('/api/admin/receipts/upload', { method: 'POST', body: form });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body?.error ?? `Upload failed (${res.status})`);
        }
        const json = await res.json().catch(() => ({}));
        // The route returns `{ receipt: inserted }`. Its own header comment says `{ id, photo_url }`
        // and is stale — checked against the code rather than trusted, because a wrong id here would
        // silently produce rows the batch could not link to. Falls back to `id` in case the shape
        // changes back.
        const receiptId = json?.receipt?.id ?? json?.id;
        kickExtraction(receiptId);
        return { receiptId };
      },
      setBatch,
    );
    setBusy(false);

    // Ask the AI what it made of the stack. Everything the browser could check — two shots of the
    // same slip — was checked before the upload; this is the half that only exists once the model
    // has read the paper: the same purchase photographed on two different days, or a total nobody
    // could make out.
    const uploadedIds = result.items
      .map((it) => it.receiptId)
      .filter((v): v is string => typeof v === 'string');
    if (uploadedIds.length > 0) void pollBatchReview(uploadedIds);

    // Only celebrate when there is nothing left to look at. A partial batch keeps its rows on
    // screen — hiding exactly the ones that need a person is the failure the batch UI exists to
    // prevent.
    if (result.allSucceeded) {
      finishUpload(`Sent ${batchFiles.length} receipt${batchFiles.length === 1 ? '' : 's'}.`);
    }
  }

  /**
   * Wait for the extractions and then show what they found.
   *
   * Polled rather than awaited at upload time: Vision takes five to fifteen seconds per receipt, and
   * a person who has just sent twenty photos should not be staring at a spinner for four minutes.
   * The queue is already filed and safe — this is a courtesy pass over it.
   *
   * Gives up after a fixed number of tries and says so, rather than spinning forever. A receipt whose
   * extraction is slow is not lost; it appears in "your receipts" below when it lands, and the hourly
   * cron sweeps anything that never started.
   */
  async function pollBatchReview(ids: string[]) {
    setReviewState('waiting');
    const started = Date.now();
    const DEADLINE_MS = 90_000;
    const INTERVAL_MS = 3_000;

    while (Date.now() - started < DEADLINE_MS) {
      await new Promise((r) => setTimeout(r, INTERVAL_MS));
      try {
        const res = await fetch(`/api/admin/receipts/batch-review?ids=${ids.join(',')}`);
        if (!res.ok) break;
        const json = (await res.json()) as { receipts?: BatchReviewRow[] };
        const rows = json.receipts ?? [];
        // Show whatever has landed so far, so the first receipt's answer is not held hostage by the
        // twentieth. Rows still being read simply have nothing to say yet.
        setReview(rows);
        const settled = (r: BatchReviewRow) => r.extraction_status === 'done' || r.extraction_status === 'failed';
        if (rows.length > 0 && rows.every(settled)) {
          setReviewState('read');
          return;
        }
      } catch {
        break;
      }
    }
    // Reached only by the deadline or a failed request — NOT by every receipt being read. Saying so
    // is the difference between a panel a bookkeeper can rely on and one that quietly reports a
    // still-queued receipt as fully checked.
    setReviewState('gave_up');
  }

  /**
   * R8 — what happens after a successful upload.
   *
   * It used to be `router.push('/admin/receipts')`, and R1 turned that into a trap: capture is now
   * open to every member of staff, but the approval queue is not. A `field_crew` or `employee`
   * account finishing an upload was thrown at a page middleware bounces them off, landing on
   * /admin/me with no confirmation that anything had been filed at all — the upload looked like it
   * had failed.
   *
   * Staying put is better for the bookkeeper too: receipts arrive in handfuls, and the common next
   * action after filing one is filing the next.
   */
  function finishUpload(message: string) {
    setSentMsg(message);
    setFile(null);
    // The thumbnails go, but `review` is deliberately NOT cleared — the AI's answer about this batch
    // arrives seconds after the photos are gone, and clearing it here would throw away the
    // duplicate-and-missing-information pass the owner asked for at the moment it becomes useful.
    shots.forEach((s) => URL.revokeObjectURL(s.url));
    setShots([]);
    setBatchFiles([]);
    setBatch(null);
    setNotes('');
    // The job is deliberately KEPT. A stack of receipts is nearly always for the same job, and
    // re-picking it for each one is the kind of small friction that ends with everything filed
    // against no job at all.
    setRefreshKey((k) => k + 1);
  }

  /**
   * Ask the server to read the receipt, without waiting for it.
   *
   * The upload inserts the row as `extraction_status = 'queued'`, which used to mean "a worker on a
   * droplet will get to this" — and on Vercel no such worker exists, so in practice it meant never.
   * This is the request that actually starts the AI.
   *
   * Deliberately NOT awaited. Vision takes five to fifteen seconds; blocking the upload button on it
   * would make a batch of twenty receipts a five-minute wait, and the person has no reason to watch.
   * The queue shows extraction state per row, and `/api/cron/receipt-extraction` sweeps anything a
   * closed tab or a dropped request left behind — so the worst case of this failing silently is a
   * receipt whose fields appear within the hour instead of within seconds.
   */
  function kickExtraction(receiptId: string | undefined) {
    if (!receiptId) return;
    void fetch(`/api/admin/receipts/${receiptId}/extract`, { method: 'POST' }).catch(() => {
      /* swept by cron — see above */
    });
  }

  async function onUpload() {
    if (!file || busy) return;
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.append('file', file);
      if (job) form.append('jobId', job.id);
      if (notes.trim()) form.append('notes', notes.trim());
      const res = await fetch('/api/admin/receipts/upload', { method: 'POST', body: form });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? `Upload failed (${res.status})`);
      }
      const json = await res.json().catch(() => ({}));
      kickExtraction(json?.receipt?.id ?? json?.id);
      finishUpload(
        json?.converted
          ? 'Sent. Your iPhone photo was converted to JPEG so everyone can open it.'
          : 'Sent. The AI is reading it now.',
      );
      setBusy(false);
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
          {/* F7b — this described one receipt at a time, which was the whole story before F4 added
              the batch picker. The bulk control carried a tooltip, but a tooltip is only found by
              someone already reaching for it: a person holding a fortnight of fuel receipts would
              read this and start uploading them one at a time. */}
          <p style={styles.subtitle}>
            Snap a photo with your device camera, or pick files from disk &mdash;
            <strong> one, or a whole batch at once</strong>. Photos and PDFs only.
            Each is queued for AI extraction separately, so a file that fails
            doesn&rsquo;t stop the rest, and every one that fails says why.
            They land in the pending queue for approval.
          </p>
        </div>
        {/* Shown only to the roles middleware will actually let through — see `isBookkeeper`. */}
        {isBookkeeper ? (
          <Link href="/admin/receipts" style={styles.cancelLink}>← Back to queue</Link>
        ) : null}
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
          {/* F4 — the bulk picker. A third input rather than adding `multiple` to the one above,
              so the single-receipt flow keeps its preview-one-image behaviour unchanged. */}
          <input
            ref={bulkRef}
            type="file"
            accept={ACCEPTED_TYPES_FILE}
            multiple
            onChange={onPickBulk}
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
              queued={shots.length}
              lastThumb={shots.length > 0 ? shots[shots.length - 1].url : null}
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
                {/* F4 — the whole point of the slice: a stack of receipts in one go. */}
                <button
                  type="button"
                  onClick={() => { setError(null); bulkRef.current?.click(); }}
                  disabled={busy}
                  style={styles.captureBtnSecondary}
                  aria-label="Choose several receipts or invoices to upload at once"
                  title="Pick many photos or PDFs at once. Each one is uploaded and queued for extraction separately, so one bad file doesn't stop the others."
                >
                  <span aria-hidden style={styles.captureBtnIcon}>🗂️</span>
                  <span>Upload several at once</span>
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

        {/* ── The review grid ──────────────────────────────────────────────────────────────────
            *"The user will be able to review the photos, and the AI will determine if there are any
            duplicates."* Thumbnails rather than filenames: `receipt-1755042.jpg` tells nobody which
            receipt it is, and a person cannot decide whether to keep a photo they cannot see. */}
        {shots.length > 0 && !cameraOpen && (
          <div style={styles.reviewWrap}>
            <p style={styles.batchSummary} role="status">{describeReview(shots, duplicates)}</p>
            <ul style={styles.reviewGrid}>
              {shots.map((s, i) => {
                const dupe = duplicates.find((d) => d.id === s.id);
                const dupeIndex = dupe ? shots.findIndex((x) => x.id === dupe.duplicateOfId) : -1;
                return (
                  <li
                    key={s.id}
                    style={{ ...styles.reviewCell, ...(dupe ? styles.reviewCellDupe : {}) }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={s.url} alt={`Photo ${i + 1}`} style={styles.reviewThumb} />
                    {/* The badge is a suggestion. Nothing is removed for you — two $5 coffees on the
                        same day are both real, and a queue that drops the second loses a receipt. */}
                    {dupe && dupeIndex >= 0 && (
                      <span style={styles.dupeBadge}>Looks like photo {dupeIndex + 1}</span>
                    )}
                    {/* This photo's own note. Worth the space it takes: on a faded receipt the total
                        somebody types here is regularly the only evidence that can settle a digit
                        the photograph does not contain. The placeholder asks for the total first
                        because that is the field it rescues most often. */}
                    <input
                      type="text"
                      value={shotNotes[s.id] ?? ''}
                      onChange={(e) => setShotNotes((prev) => ({ ...prev, [s.id]: e.target.value }))}
                      disabled={busy}
                      placeholder="Note for this one — total, place, job…"
                      aria-label={`Note for photo ${i + 1}`}
                      style={styles.shotNote}
                    />
                    <button
                      type="button"
                      onClick={() => removeShot(s.id)}
                      disabled={busy}
                      style={styles.reviewRemove}
                      aria-label={`Remove photo ${i + 1}`}
                      title="Remove this photo"
                    >
                      ✕
                    </button>
                  </li>
                );
              })}
            </ul>
            <div style={styles.reviewActions}>
              <button type="button" onClick={openCamera} disabled={busy || cameraStarting} style={styles.clearBtn}>
                📷 Take more
              </button>
              <button type="button" onClick={clearQueue} disabled={busy} style={styles.clearBtn}>
                Discard all
              </button>
            </div>
          </div>
        )}

        {/* ── What the AI made of the batch ────────────────────────────────────────────────────
            The half of "duplicates and missing information" that only exists after the model has
            read the paper. Arrives seconds to a minute after the upload; the receipts are already
            filed, so this is a chance to fix things while the paper is still in somebody's hand. */}
        {review && review.length > 0 && (
          <div style={styles.reviewWrap}>
            <p style={styles.batchSummary} role="status">
              {reviewState === 'waiting'
                ? 'The AI is reading them…'
                : reviewState === 'read'
                  ? 'The AI has read them.'
                  // Nothing is lost: the receipts are filed, and the hourly sweep picks up anything
                  // whose extraction never started. What would be lost is trust in this panel.
                  : 'Some are still being read — they’ll appear under “your receipts” below when they land.'}
            </p>
            <ul style={styles.batchList}>
              {review.map((r) => {
                const asks = missingInformation(r);
                const clean = asks.length === 0 && r.review_flags.length === 0 && !r.duplicateOf;
                return (
                  <li
                    key={r.id}
                    style={{
                      ...styles.aiRow,
                      ...(clean && r.extraction_status === 'done' ? styles.batchRowDone
                        : r.duplicateOf || asks.length > 0 ? styles.batchRowFailed : {}),
                    }}
                  >
                    <strong style={styles.aiRowTitle}>
                      {r.vendor_name
                        ?? (r.extraction_status === 'done' || r.extraction_status === 'failed'
                          // Read, and the shop name was not on the paper or not legible. Saying
                          // "still reading" here would send somebody back to wait for an answer
                          // that has already arrived.
                          ? 'Receipt'
                          : 'Still reading…')}
                      {r.total_cents != null ? ` — $${(r.total_cents / 100).toFixed(2)}` : ''}
                    </strong>
                    {r.duplicateOf && (
                      <span style={styles.aiRowNote}>
                        Possible duplicate of {r.duplicateOf.vendor_name ?? 'a receipt'}
                        {r.duplicateOf.total_cents != null ? ` for $${(r.duplicateOf.total_cents / 100).toFixed(2)}` : ''}
                        {' '}you already filed — same shop, same amount, same day. Both may be real; check before approving.
                      </span>
                    )}
                    {asks.map((a) => (<span key={a} style={styles.aiRowNote}>{a}</span>))}
                    {r.review_flags.map((f) => (<span key={f} style={styles.aiRowNote}>{f}</span>))}
                    {clean && r.extraction_status === 'done' && (
                      <span style={styles.aiRowNote}>Read cleanly — nothing needs clarifying.</span>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {/* F4 — the batch panel. Stays on screen after the run, because navigating away on a
            partial batch hides exactly the rows that need a person. */}
        {batch && batch.total > 0 && (
          <div style={styles.previewWrap}>
            <p style={styles.batchSummary} role="status">
              {batchSummary(batch)}
            </p>
            <ul style={styles.batchList}>
              {batch.items.map((it) => (
                <li
                  key={it.id}
                  style={{
                    ...styles.batchRow,
                    ...(it.status === 'done' ? styles.batchRowDone
                      : it.status === 'failed' || it.status === 'rejected' ? styles.batchRowFailed
                        : it.status === 'uploading' ? styles.batchRowUploading : {}),
                  }}
                >
                  <span style={styles.batchName}>
                    {it.fileName}
                  </span>
                  {/* The reason travels with the row. "3 uploads failed" does not tell anyone which
                      three, and a person cannot re-photograph an unnamed receipt. */}
                  <span style={styles.batchStatus}>
                    {it.status === 'done' ? 'Uploaded'
                      : it.status === 'uploading' ? 'Uploading…'
                        : it.status === 'queued' ? 'Waiting'
                          : it.error ?? 'Failed'}
                  </span>
                </li>
              ))}
            </ul>
            {!busy && (
              <button
                type="button"
                onClick={() => { setBatch(null); setBatchFiles([]); }}
                style={styles.clearBtn}
              >
                Clear list
              </button>
            )}
          </div>
        )}

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

        <div style={styles.field}>
          <JobRefPicker
            value={job}
            onChange={setJob}
            label="Job (optional)"
            disabled={busy}
            clearLabel="No job — office / overhead expense"
            hint="Search by job number, name, client or address. Working a job the office hasn’t entered yet? Create it here and the receipt files straight into it."
          />
        </div>

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
        {/* R8 — the confirmation that replaced the redirect. `role="status"` so a screen reader
            announces it: the page no longer navigates, so nothing else signals that the upload
            worked. */}
        {sentMsg && !error ? (
          <p role="status" style={styles.sent}>✓ {sentMsg}</p>
        ) : null}

        <div style={styles.actions}>
          {isBookkeeper ? (
            <Link href="/admin/receipts" style={styles.cancelBtn}>Cancel</Link>
          ) : null}
          {/* F4 — one button, two flows. Which one runs is decided by what the person picked, so
              there is no mode to set and get wrong. A finished batch disables it rather than
              re-uploading everything, which would duplicate every receipt that already landed. */}
          {(() => {
            const bulk = batchFiles.length > 0;
            const bulkDone = bulk && (batch?.finished ?? false);
            const disabled = busy || (bulk ? bulkDone : !file);
            return (
              <button
                type="button"
                onClick={bulk ? onUploadBatch : onUpload}
                disabled={disabled}
                style={{ ...styles.uploadBtn, opacity: disabled ? 0.55 : 1, cursor: disabled ? 'not-allowed' : 'pointer' }}
              >
                {busy
                  ? 'Uploading…'
                  : bulk
                    // "Upload 1 receipts" — harmless when the batch path was only ever reached by
                    // the multi-file picker, and newly common now that one photograph from the
                    // rapid-fire camera goes through the same queue.
                    ? (bulkDone ? 'Batch finished' : `Upload ${batchFiles.length} receipt${batchFiles.length === 1 ? '' : 's'}`)
                    : 'Upload receipt'}
              </button>
            );
          })()}
        </div>
      </section>

      {/* R8 — the other half of R1. Renders nothing at all until you have filed something, so a
          first-time user sees only the capture form. */}
      <MyReceipts refreshKey={refreshKey} />
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
  queued,
  lastThumb,
}: {
  videoRef: React.MutableRefObject<HTMLVideoElement | null>;
  canvasRef: React.MutableRefObject<HTMLCanvasElement | null>;
  onSnap: () => void;
  onCancel: () => void;
  onSwitch: () => void;
  facingMode: FacingMode;
  /** How many photos are waiting. The camera no longer closes on the shutter, so this is the only
   *  thing telling the person the last shot was actually taken. */
  queued: number;
  /** The most recent frame, shown small in the corner — the phone-camera convention, and the
   *  cheapest possible proof that what was captured is the receipt and not the table. */
  lastThumb: string | null;
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
      {queued > 0 && (
        <p style={styles.shotCount} role="status" aria-live="polite">
          {queued} photo{queued === 1 ? '' : 's'} queued — keep shooting, then press Done.
        </p>
      )}
      <canvas ref={canvasRef} style={{ display: 'none' }} aria-hidden />
      <div style={styles.viewfinderControls}>
        {/* Two different exits, because they mean opposite things. "Done" keeps the queue and takes
            you to the review grid; "Cancel" is only offered while there is nothing to lose. */}
        {queued > 0 ? (
          <button
            type="button"
            onClick={onCancel}
            style={styles.viewfinderDone}
            aria-label={`Finish and review ${queued} photos`}
          >
            Done ({queued})
          </button>
        ) : (
          <button
            type="button"
            onClick={onCancel}
            style={styles.viewfinderCancel}
            aria-label="Cancel camera"
          >
            Cancel
          </button>
        )}
        <button
          type="button"
          onClick={onSnap}
          style={styles.shutterBtn}
          aria-label="Take photo"
        >
          <span aria-hidden style={styles.shutterInner} />
        </button>
        <div style={styles.viewfinderRight}>
          {lastThumb && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={lastThumb} alt="Last photo taken" style={styles.lastThumb} />
          )}
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
  // F4 — batch rows. Named entries rather than inline hex so the colours can be reached by a token,
  // a media query, the print stylesheet and a contrast audit — which is what the inline-style-hex
  // ratchet exists to enforce, and which the first version of this panel broke (0 → 4).
  batchList: { listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '.35rem' },
  batchRow: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: '.75rem',
    fontSize: '.85rem',
    padding: '.35rem .5rem',
    borderRadius: 6,
    background: 'var(--color-bg-subtle, #f3f4f6)',
  },
  batchRowDone:      { background: 'var(--color-success-bg, #e7f6ec)' },
  batchRowFailed:    { background: 'var(--color-danger-bg, #fdecec)' },
  batchRowUploading: { background: 'var(--color-info-bg, #eaf0fb)' },
  batchName: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  batchStatus: { flexShrink: 0, fontWeight: 600 },
  batchSummary: { fontWeight: 600, margin: '0 0 .5rem' },
  // ── Rapid-fire review grid ──────────────────────────────────────
  reviewWrap: {
    background: 'var(--color-bg-subtle, #f9fafb)',
    border: '1px dashed var(--color-border, #e5e7eb)',
    borderRadius: 10,
    padding: '0.8rem',
  },
  // auto-fill so one photo does not stretch across the whole card and twenty stay thumb-sized.
  reviewGrid: {
    listStyle: 'none', margin: 0, padding: 0,
    display: 'grid', gap: '0.5rem',
    gridTemplateColumns: 'repeat(auto-fill, minmax(92px, 1fr))',
  },
  reviewCell: {
    position: 'relative',
    borderRadius: 8,
    overflow: 'hidden',
    border: '2px solid transparent',
    background: 'var(--color-bg-card, #fff)',
  },
  reviewCellDupe: { border: '2px solid var(--color-warning, #f59e0b)' },
  reviewThumb: { display: 'block', width: '100%', aspectRatio: '3 / 4', objectFit: 'cover' },
  dupeBadge: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    background: 'var(--color-warning, #f59e0b)', color: '#1f2937',
    fontSize: '0.62rem', fontWeight: 700, textAlign: 'center', padding: '0.15rem 0.2rem',
  },
  // The per-photo note. Full width under the thumbnail, and 36px tall so it is a real tap target
  // for somebody standing at a truck with a handful of receipts.
  shotNote: {
    display: 'block',
    width: '100%',
    minHeight: 36,
    padding: '6px 8px',
    // Bare `var()`, no literal fallback. In a style OBJECT a fallback hex is just a hard-coded
    // colour with extra steps — unreachable by a design token, by the print stylesheet and by every
    // skin, which is exactly what the inline-hex ratchet counts. The older styles in this file
    // predate that rule; new ones do not get to inherit it.
    border: '1px solid var(--color-border)',
    borderTop: 'none',
    background: 'var(--color-surface)',
    color: 'var(--color-text-primary)',
    fontFamily: 'inherit',
    fontSize: '0.72rem',
    boxSizing: 'border-box',
  },
  // 34px so it stays a comfortable tap target on a phone held in one hand over a stack of paper.
  reviewRemove: {
    position: 'absolute', top: 4, right: 4,
    width: 34, height: 34, borderRadius: '50%',
    border: 'none', background: 'rgba(15, 23, 42, 0.72)', color: '#fff',
    fontSize: '0.9rem', lineHeight: 1, cursor: 'pointer',
  },
  reviewActions: { display: 'flex', gap: '0.5rem', justifyContent: 'center', marginTop: '0.6rem' },
  aiRow: {
    display: 'flex', flexDirection: 'column', gap: '.2rem',
    fontSize: '.85rem', padding: '.5rem .6rem', borderRadius: 6,
    background: 'var(--color-bg-subtle, #f3f4f6)',
  },
  aiRowTitle: { fontWeight: 700 },
  aiRowNote: { fontSize: '.8rem', lineHeight: 1.35 },
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
  // Rapid fire: the count that replaced the camera closing. With the viewfinder staying open, this
  // and the corner thumbnail are the only signals that the shutter did anything.
  shotCount: {
    margin: '0.4rem 0 0',
    textAlign: 'center',
    color: '#fff',
    fontSize: '0.82rem',
    fontWeight: 600,
  },
  viewfinderDone: {
    justifySelf: 'start',
    padding: '0.5rem 1rem',
    borderRadius: 9999,
    border: 'none',
    background: 'var(--gradient-green, linear-gradient(180deg, #10b981, #059669))',
    color: '#fff',
    fontSize: '0.9rem',
    fontWeight: 700,
    cursor: 'pointer',
  },
  viewfinderRight: { justifySelf: 'end', display: 'inline-flex', alignItems: 'center', gap: '0.5rem' },
  lastThumb: {
    width: 40, height: 40, borderRadius: 6, objectFit: 'cover',
    border: '2px solid rgba(255,255,255,0.75)',
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
  sent: { fontSize: '0.9rem', color: '#065F46', margin: 0 },
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

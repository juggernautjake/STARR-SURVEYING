'use client';

// app/admin/components/files/useFileThumbnails.ts — make the previews a folder is missing, lazily.
//
// Owner, 2026-09-19: "so that we can see a thumbnail of each document/pdf/photo/video easily."
//
// The generators themselves are not here. They live in app/admin/map/components/thumbnails.ts,
// written for the map's file panel, and they are table-agnostic — a URL, a kind, and whether it is
// a PDF is everything they need. This is the queue around them, and the queue is the part that has
// to be different, for one reason:
//
// ── MAKING A PREVIEW COSTS THE WHOLE FILE ───────────────────────────────────────────────────────
//
// To draw a PDF's first page you must download the PDF. To grab a video's poster you must fetch far
// enough into the video to decode a frame. So generating previews for a folder of two hundred
// documents means two hundred signed URLs and two hundred downloads — which is precisely the
// pattern that froze this site earlier the same day, when the map panel pointed every tile at a
// full-size original.
//
// The difference is that this cost is paid ONCE PER FILE EVER, for everybody, rather than on every
// page load. That makes it worth paying — but only carefully:
//
//   1. NOTHING IS GENERATED UNTIL IT IS ON SCREEN. The caller reports which files are visible; only
//      those are queued. Scrolling past a folder of a thousand documents generates previews for the
//      dozen you actually looked at.
//   2. TWO AT A TIME. A third parallel PDF render is a third parallel main-thread decode, and the
//      panel has to stay draggable while this happens.
//   3. THE SIGNED URL IS FETCHED WHEN ITS TURN COMES, not when it is queued. A file that scrolls
//      out of view before a worker reaches it costs nothing at all.
//   4. ONE ATTEMPT PER FILE, PER SESSION, EVER. A failure posts `failed`, which is what stops this
//      browser — and everybody else's — spending fifteen seconds on the same unopenable scan
//      forever. `triedRef` is the within-session half of that promise.
//   5. IT STOPS DEAD ON UNMOUNT. One AbortController for the queue.

import { useCallback, useEffect, useRef } from 'react';
import {
  pdfThumb, videoThumb, imageThumb, isPdfFile, needsThumb, withDeadline,
  THUMB_WORKERS, THUMB_TIMEOUT_MS,
} from '@/app/admin/map/components/thumbnails';
import { imageIsItsOwnThumb } from '@/lib/jobs/file-thumbnails';
import type { MediaKind } from '@/lib/jobs/property-map';
import type { MountNode } from '@/lib/files/mount-node';

/** What the generators need, once a file's turn has come. */
export interface ThumbTarget {
  id: string;
  name: string;
  mime: string | null;
  sizeBytes: number | null;
  kind: MediaKind;
  thumbState?: MountNode['thumb_state'];
}

/** Which of the four kinds a node is, for the generator's sake. Deliberately NOT `fileKind` from
 *  the viewer model: that answers "how do I display this" (pdf / image / text / other) and the
 *  generators want "what is it" (image / video / audio / document). */
export function kindOfNode(mime: string | null, name: string): MediaKind {
  const m = (mime ?? '').toLowerCase();
  const n = name.toLowerCase();
  if (m.startsWith('image/') || /\.(jpe?g|png|gif|webp|heic|heif|bmp|tiff?)$/.test(n)) return 'image';
  if (m.startsWith('video/') || /\.(mp4|mov|m4v|avi|mkv|webm)$/.test(n)) return 'video';
  if (m.startsWith('audio/') || /\.(mp3|m4a|wav|aac|ogg)$/.test(n)) return 'audio';
  return 'document';
}

/** Is this one worth a browser's time?
 *
 *  A SMALL image is not: it is already being shown as its own tile, and replacing a 60 KB photo
 *  with a 40 KB copy of it saves nobody anything. The threshold is the same one the map panel uses,
 *  and lives with the rest of the preview policy rather than here. */
export function wantsThumb(t: ThumbTarget): boolean {
  if (t.thumbState === 'ok') return false;
  if (imageIsItsOwnThumb(t.kind, t.sizeBytes)) return false;
  return needsThumb(t.thumbState ?? 'pending', t.kind, t.mime, t.name);
}

interface Options {
  /** Off entirely in a view that shows no pictures — a list of names needs no previews made. */
  enabled: boolean;
  /** Resolve a file's viewing URL. The Explorer already has one of these; it is passed in so this
   *  hook does not need to know how a mount signs things. */
  resolveUrl: (id: string) => Promise<string | null>;
  /** A preview landed (or definitively did not), so the caller can re-render that one tile. */
  onResult: (id: string, thumbUrl: string | null, state: NonNullable<MountNode['thumb_state']>) => void;
}

export function useFileThumbnails({ enabled, resolveUrl, onResult }: Options) {
  const queueRef = useRef<ThumbTarget[]>([]);
  const triedRef = useRef<Set<string>>(new Set());
  const workersRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  // The callbacks are held in refs so a worker loop started minutes ago is not pinned to the
  // render that started it — and so that changing them does not restart the queue.
  const resolveRef = useRef(resolveUrl);
  const resultRef = useRef(onResult);
  resolveRef.current = resolveUrl;
  resultRef.current = onResult;

  const run = useCallback(async (t: ThumbTarget, signal: AbortSignal): Promise<void> => {
    const url = await resolveRef.current(t.id);
    if (signal.aborted) return;
    if (!url) {
      // No bytes to look at. Not the file's fault and not worth recording as a failure — the row
      // may simply not have been signable this second.
      return;
    }

    let dataUrl: string | null = null;
    let state: NonNullable<MountNode['thumb_state']> = 'failed';
    try {
      dataUrl = await withDeadline(
        isPdfFile({ mimeType: t.mime, name: t.name })
          ? pdfThumb(url, signal)
          : t.kind === 'video'
            ? videoThumb(url, signal)
            : imageThumb(url, signal),
        THUMB_TIMEOUT_MS,
        signal,
      );
      if (dataUrl) state = 'ok';
    } catch {
      dataUrl = null;
    }
    if (signal.aborted) return;

    // Posted either way. A failure recorded is what stops the next person's browser trying again.
    const res = await fetch('/api/admin/files/thumbnail', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ node_id: t.id, ...(dataUrl ? { data_url: dataUrl } : { state: 'failed' }) }),
      signal,
    }).catch(() => null);
    if (signal.aborted) return;

    // Shown immediately from the data URL rather than waiting for a round trip to fetch back the
    // copy that was just uploaded — it is the same picture.
    if (res?.ok && dataUrl) resultRef.current(t.id, dataUrl, 'ok');
    else if (res?.ok) resultRef.current(t.id, null, state);
  }, []);

  const pump = useCallback(() => {
    if (!enabled) return;
    if (!abortRef.current || abortRef.current.signal.aborted) abortRef.current = new AbortController();
    const signal = abortRef.current.signal;

    while (workersRef.current < THUMB_WORKERS && queueRef.current.length > 0) {
      const next = queueRef.current.shift();
      if (!next) break;
      workersRef.current += 1;
      void run(next, signal).finally(() => {
        workersRef.current -= 1;
        if (!signal.aborted) pump();
      });
    }
  }, [enabled, run]);

  /** Queue whatever of these still needs a preview. Safe to call on every scroll: a file already
   *  tried, already queued or already previewed is dropped here rather than doing work twice. */
  const request = useCallback((targets: ThumbTarget[]) => {
    if (!enabled) return;
    let added = 0;
    for (const t of targets) {
      if (triedRef.current.has(t.id)) continue;
      if (!wantsThumb(t)) continue;
      triedRef.current.add(t.id);
      queueRef.current.push(t);
      added += 1;
    }
    if (added > 0) pump();
  }, [enabled, pump]);

  useEffect(() => () => {
    abortRef.current?.abort();
    abortRef.current = null;
    queueRef.current = [];
    workersRef.current = 0;
    // Cleared with the rest: under React's development double-mount the first pass is aborted, and
    // a set that survived it would leave a freshly mounted panel never queueing anything at all.
    triedRef.current.clear();
  }, []);

  return { request };
}

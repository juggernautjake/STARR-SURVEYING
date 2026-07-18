// mobile/lib/uploadNotify.ts — the PURE notification-content composer for the upload queue (C6). The owner
// wants a local notification when each file finishes (and the next one starts), when the whole queue is done,
// and when an upload fails. The runtime fires these through expo-notifications; keeping the wording + the
// "should we even notify?" decision pure makes them testable off-device and consistent (the same reason
// queueOrder / uploadStatus / uploadMode / uploadFailureChoices are pure modules).

export type UploadNotifyEvent =
  | { kind: 'item-done'; name: string; remaining: number } // one file finished; `remaining` still queued
  | { kind: 'all-done'; count: number } // the whole queue drained
  | { kind: 'failed'; name: string; canRetry?: boolean }; // a file gave up

export interface UploadNotification {
  title: string;
  body: string;
}

/** How chatty the notifications are — the owner can pick per-file pings or just a single done/failure ping. */
export type UploadNotifyLevel = 'each' | 'summary';

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;

/**
 * The notification content for an upload event, or null when this event shouldn't fire one at the chosen
 * verbosity. In 'summary' mode, per-file 'item-done' pings are suppressed (only the final all-done / failures
 * notify); in 'each' mode, every file's completion pings too.
 */
export function uploadNotification(ev: UploadNotifyEvent, level: UploadNotifyLevel = 'each'): UploadNotification | null {
  switch (ev.kind) {
    case 'item-done': {
      if (level === 'summary') return null; // summary mode waits for all-done
      // The last file completing is really "all done" — say so instead of "0 more".
      if (ev.remaining <= 0) return { title: 'Uploads complete', body: `Uploaded ${ev.name}. That was the last one — everything is in the job cloud.` };
      return { title: 'Uploaded', body: `${ev.name} is in the job cloud. ${plural(ev.remaining, 'file')} still uploading…` };
    }
    case 'all-done':
      return { title: 'Uploads complete', body: `${plural(ev.count, 'file')} uploaded to the job cloud.` };
    case 'failed':
      return { title: 'Upload failed', body: `${ev.name} couldn't upload.${ev.canRetry ? ' Tap to retry.' : ''}` };
  }
}

/** Convenience: does this event notify at the given verbosity? */
export function shouldNotify(ev: UploadNotifyEvent, level: UploadNotifyLevel = 'each'): boolean {
  return uploadNotification(ev, level) !== null;
}

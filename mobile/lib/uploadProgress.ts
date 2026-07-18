// mobile/lib/uploadProgress.ts — the PURE math behind the upload queue's progress bar (C3). The owner wants
// "a loading bar for how close the current item is to being done uploading." The runtime feeds this the
// bytes-sent / bytes-total from the upload task's progress callback; keeping the math pure makes the bar
// consistent + testable off-device (like the other upload engines). A non-positive total means the size
// isn't known yet → an indeterminate bar.

export interface UploadProgress {
  /** 0..1, clamped — drive a progress bar's width from this. */
  fraction: number;
  /** 0..100, rounded. */
  percent: number;
  /** True when the total size isn't known yet (show an indeterminate/pulsing bar). */
  indeterminate: boolean;
  /** A short label: "45%", or "…" while indeterminate, "100%" when done. */
  label: string;
}

/** Progress for one file from its bytes-sent / bytes-total. */
export function uploadProgress(sent: number, total: number): UploadProgress {
  const s = Number(sent);
  const t = Number(total);
  if (!Number.isFinite(t) || t <= 0) {
    return { fraction: 0, percent: 0, indeterminate: true, label: '…' };
  }
  const fraction = Math.max(0, Math.min(1, (Number.isFinite(s) ? s : 0) / t));
  const percent = Math.round(fraction * 100);
  return { fraction, percent, indeterminate: false, label: `${percent}%` };
}

/** Human byte size, e.g. "2.3 MB". Base-1024, one decimal for MB/GB. */
export function formatBytes(n: number): string {
  const b = Number(n);
  if (!Number.isFinite(b) || b < 0) return '—';
  if (b < 1024) return `${Math.round(b)} B`;
  const kb = b / 1024;
  if (kb < 1024) return `${Math.round(kb)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  return `${(mb / 1024).toFixed(1)} GB`;
}

/** A "2.3 MB of 5.0 MB" caption beneath the bar (blank if the total isn't known). */
export function uploadSizeCaption(sent: number, total: number): string {
  const t = Number(total);
  if (!Number.isFinite(t) || t <= 0) return '';
  return `${formatBytes(sent)} of ${formatBytes(t)}`;
}

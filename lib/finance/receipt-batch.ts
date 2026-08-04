// lib/finance/receipt-batch.ts — FINANCE_TAX_AND_INTAKE Slice F4.
//
// Upload a stack of receipt photos in one go.
//
// ── WHAT THIS IS AND IS NOT ─────────────────────────────────────────────────────────────────────
// The extraction pipeline is already per-receipt and is reused untouched: `/api/admin/receipts/upload`
// takes one file, stores it, and inserts a `receipts` row in `pending` with `extraction_status =
// 'queued'` for the worker. So "bulk" needs no new API and no new pipeline. What it needs is the
// part that is easy to get wrong — the queue, the progress, and the failure handling.
//
// ── THE RULE: ONE BAD PHOTO IN TWENTY MUST NOT SINK THE BATCH, OR VANISH FROM IT ────────────────
// Two failure modes, and the second is worse than the first:
//
//   1. `Promise.all` over twenty uploads rejects on the first failure, and the caller has no idea
//      which of the other nineteen landed. The obvious fix.
//   2. Swallowing the error so the batch "succeeds" — nineteen receipts filed and one gone, with a
//      green tick over the whole thing. Nobody re-photographs a receipt they were told was uploaded.
//
// So every item ends in a terminal state of its own, failures are kept and named alongside the
// successes, and the batch reports both counts. A batch with failures is never reported as complete
// success — `allSucceeded` is a separate question from `finished`.

export type BatchItemStatus = 'queued' | 'uploading' | 'done' | 'failed' | 'rejected';

export interface BatchItem {
  /** Stable per-item id so a UI row keeps its identity as the status changes. */
  id: string;
  fileName: string;
  sizeBytes: number;
  status: BatchItemStatus;
  /** Set on `done` — the created receipt's id, so the UI can link to it. */
  receiptId?: string;
  /** Set on `failed` or `rejected`. Always a sentence a person can act on. */
  error?: string;
}

export interface BatchProgress {
  items: readonly BatchItem[];
  /** Items in a terminal state (`done` / `failed` / `rejected`). */
  settled: number;
  total: number;
  succeeded: number;
  failed: number;
  /** True when nothing is left queued or uploading. */
  finished: boolean;
  /** True only when the batch finished AND nothing failed. Deliberately separate from `finished`:
   *  conflating them is how nineteen-of-twenty gets a green tick. */
  allSucceeded: boolean;
}

/** 12 MiB — matches the single-upload route and the mobile downscale ceiling. */
export const MAX_RECEIPT_BYTES = 12 * 1024 * 1024;

const ACCEPTED = /^(image\/|application\/pdf$)/;

export interface BatchFile {
  name: string;
  size: number;
  type: string;
}

/** Why a file was refused before any upload was attempted. Rejecting early is kinder than failing
 *  late: the person is still standing at the picker with the folder open. */
export function rejectionReason(file: BatchFile): string | null {
  if (file.size === 0) return 'The file is empty.';
  if (file.size > MAX_RECEIPT_BYTES) {
    return `${(file.size / 1024 / 1024).toFixed(1)} MB is over the 12 MB limit.`;
  }
  if (!ACCEPTED.test(file.type || '')) {
    return 'Only photos and PDFs can be uploaded as receipts.';
  }
  return null;
}

/** Build the initial queue. Files that cannot be uploaded are included as `rejected` rather than
 *  dropped — a file that silently disappears between the picker and the list is indistinguishable
 *  from one the person forgot to select. */
export function buildBatch(files: readonly BatchFile[], makeId: (i: number) => string = (i) => `item-${i}`): BatchItem[] {
  return files.map((f, i) => {
    const reason = rejectionReason(f);
    return {
      id: makeId(i),
      fileName: f.name,
      sizeBytes: f.size,
      status: reason ? 'rejected' : 'queued',
      ...(reason ? { error: reason } : {}),
    } as BatchItem;
  });
}

export function progressOf(items: readonly BatchItem[]): BatchProgress {
  const settled = items.filter((i) => i.status === 'done' || i.status === 'failed' || i.status === 'rejected').length;
  const succeeded = items.filter((i) => i.status === 'done').length;
  const failed = items.filter((i) => i.status === 'failed' || i.status === 'rejected').length;
  const finished = settled === items.length;
  return {
    items,
    settled,
    total: items.length,
    succeeded,
    failed,
    finished,
    allSucceeded: finished && failed === 0 && items.length > 0,
  };
}

export type UploadOne = (index: number) => Promise<{ receiptId?: string }>;

/**
 * Run the queue, one item at a time, reporting after every change.
 *
 * **Sequential on purpose.** These are 12 MB photos from a phone on site; firing twenty at once
 * competes for the same uplink, makes every one slower, and turns a flaky connection into twenty
 * simultaneous failures instead of one. Sequential also makes the progress honest — "4 of 20" means
 * four are actually filed.
 *
 * Never throws. A rejected upload marks its own item `failed` and the queue moves on, because the
 * whole point is that item nine does not decide the fate of items ten through twenty.
 */
export async function runBatch(
  initial: readonly BatchItem[],
  uploadOne: UploadOne,
  onProgress?: (p: BatchProgress) => void,
): Promise<BatchProgress> {
  const items: BatchItem[] = initial.map((i) => ({ ...i }));
  const report = () => onProgress?.(progressOf(items.map((i) => ({ ...i }))));
  report();

  for (let i = 0; i < items.length; i++) {
    // Already rejected at validation, or somehow terminal — skip without touching it.
    if (items[i].status !== 'queued') continue;

    items[i] = { ...items[i], status: 'uploading' };
    report();

    try {
      const res = await uploadOne(i);
      items[i] = { ...items[i], status: 'done', receiptId: res?.receiptId };
    } catch (err) {
      items[i] = {
        ...items[i],
        status: 'failed',
        // Kept per-item and never collapsed into one batch-level message: "3 uploads failed" does
        // not tell you which three, and a person cannot re-photograph an unnamed receipt.
        error: err instanceof Error ? err.message : String(err),
      };
    }
    report();
  }

  return progressOf(items);
}

/** The items worth retrying — failures only. A rejected file will fail validation again, so
 *  offering to retry it would just repeat the same refusal. */
export function retryableItems(items: readonly BatchItem[]): BatchItem[] {
  return items.filter((i) => i.status === 'failed');
}

/** One line for the top of the panel. Says what happened, including the part that did not work. */
export function batchSummary(p: BatchProgress): string {
  if (p.total === 0) return 'No files selected.';
  if (!p.finished) return `Uploading ${p.settled + 1} of ${p.total}…`;
  if (p.failed === 0) return `All ${p.total} uploaded and queued for extraction.`;
  if (p.succeeded === 0) return `None uploaded — all ${p.total} failed. Nothing was filed.`;
  return `${p.succeeded} of ${p.total} uploaded. ${p.failed} still need attention.`;
}

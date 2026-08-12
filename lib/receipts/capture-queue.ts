// lib/receipts/capture-queue.ts — photographing a stack of receipts without closing the camera.
//
// Owner, 2026-08-12: *"we can rapid fire take pictures of receipts. Whenever we take a picture of a
// receipt, it should be saved and queued, but the in app camera should stay open and allow for the
// user to take more pictures. Each picture will be queued for upload all at once. The user will be
// able to review the photos, and the AI will determine if there are any duplicates or if any
// information is missing and needs clarification."*
//
// The camera already existed; it just closed after every shot, which turns a fortnight of fuel
// receipts into fourteen rounds of open-permission-aim-snap-close. Keeping it open is a change to the
// page. What lives here is everything that ISN'T the page — so it can be tested without a camera.
//
// ── THE TWO QUESTIONS ASKED AT DIFFERENT MOMENTS ─────────────────────────────────────────────────
//
// "Are any of these duplicates?" has two answers and they arrive hours apart:
//
//   **Before upload**, all we have is pixels. Two shots taken four seconds apart of the same slip are
//   nearly the same image, and an average hash catches that instantly, in the browser, while the
//   person is still holding the receipts and can act on it. What it CANNOT catch is the same purchase
//   photographed twice on different days, or once as a card slip and once as an itemised bill.
//
//   **After extraction**, we have a vendor, a total and a date, and `computeDedupFingerprint` catches
//   exactly those. What it cannot do is arrive in time to stop the upload.
//
// Neither is a superset of the other, so both exist, and neither ever DELETES anything. A duplicate
// is a suggestion — two $5 coffees at the same shop on the same day are both real, and a queue that
// silently drops the second one loses a receipt with no trace that it did.

/** One photo waiting to be sent. */
export interface QueuedShot {
  id: string;
  fileName: string;
  /** 64-bit average hash as 16 hex characters, or null when the frame could not be hashed. */
  hash: string | null;
  bytes: number;
  takenAt: number;
}

/**
 * Turn 64 grey levels (an 8×8 thumbnail of the frame) into an average hash.
 *
 * Each bit says "is this cell brighter than the picture's mean?". That makes the hash indifferent to
 * exposure and to the overall lighting of a kitchen table versus a truck cab, and sensitive to where
 * the dark ink actually sits — which is the thing that differs between two receipts and does not
 * differ between two photos of one receipt.
 *
 * Deliberately not a cryptographic hash: the entire point is that similar inputs give similar
 * outputs. A SHA of two frames of the same slip shares nothing.
 */
export function averageHash(luma: ArrayLike<number>): string | null {
  if (luma.length !== 64) return null;
  let sum = 0;
  for (let i = 0; i < 64; i += 1) sum += luma[i];
  const mean = sum / 64;

  let hex = '';
  for (let nibble = 0; nibble < 16; nibble += 1) {
    let v = 0;
    for (let bit = 0; bit < 4; bit += 1) {
      if (luma[nibble * 4 + bit] > mean) v |= 1 << (3 - bit);
    }
    hex += v.toString(16);
  }
  return hex;
}

/** How many of the 64 bits differ. 0 means the two frames are identical to the hash. */
export function hammingDistance(a: string, b: string): number {
  if (a.length !== b.length) return Number.POSITIVE_INFINITY;
  let d = 0;
  for (let i = 0; i < a.length; i += 1) {
    let x = parseInt(a[i], 16) ^ parseInt(b[i], 16);
    while (x) { d += x & 1; x >>= 1; }
  }
  return d;
}

/**
 * Below this many differing bits, two frames are the same piece of paper.
 *
 * Tuned to be tight rather than helpful. A missed duplicate costs one extra row in a queue somebody
 * is already reviewing; a false one tells a person that two DIFFERENT receipts are the same, and the
 * obvious response to that is to delete one of them. The expensive error is the confident wrong
 * answer, so the threshold sits where only near-identical frames pass.
 */
export const DUPLICATE_BIT_THRESHOLD = 6;

export interface DuplicatePair {
  /** The later shot — the one a person would remove. */
  id: string;
  /** The earlier shot it appears to repeat. */
  duplicateOfId: string;
  distance: number;
}

/**
 * Which shots in the queue look like photographs of something already photographed.
 *
 * Each shot is reported against the FIRST earlier shot it matches, so three photos of one receipt
 * produce two pairs both pointing at the original rather than a chain — a person removing the
 * original should not be told the survivors are duplicates of a photo that is no longer there.
 */
export function findLikelyDuplicates(shots: readonly QueuedShot[]): DuplicatePair[] {
  const pairs: DuplicatePair[] = [];
  for (let i = 0; i < shots.length; i += 1) {
    const later = shots[i];
    if (!later.hash) continue;
    for (let j = 0; j < i; j += 1) {
      const earlier = shots[j];
      if (!earlier.hash) continue;
      const distance = hammingDistance(later.hash, earlier.hash);
      if (distance <= DUPLICATE_BIT_THRESHOLD) {
        pairs.push({ id: later.id, duplicateOfId: earlier.id, distance });
        break;
      }
    }
  }
  return pairs;
}

/** What the extractor managed to read back, as far as this module cares. */
export interface ExtractedSummary {
  vendor_name?: string | null;
  transaction_at?: string | null;
  total_cents?: number | null;
  category?: string | null;
  extraction_status?: string | null;
  ai_extras?: { review_flags?: string[] } | null;
}

/**
 * What a person still has to supply before this receipt can be filed.
 *
 * Only the four fields a receipt is USELESS without. Deliberately not a completeness score over every
 * column: a receipt with no subtotal and no tip is perfectly filable, and asking about them would
 * bury the one case that matters — a total nobody can read.
 *
 * Phrased as questions to the person, because that is what they are. "vendor_name: null" is a
 * description of a database row; "Which shop was this from?" is something somebody can answer while
 * the receipt is still in their hand.
 */
export function missingInformation(r: ExtractedSummary): string[] {
  const asks: string[] = [];
  if (r.extraction_status === 'failed') {
    // One sentence, and no further complaints: every field is missing, and listing them all as
    // separate questions would read as four problems rather than one.
    return ['The AI could not read this photo at all — retake it, or type the details in by hand.'];
  }
  if (r.extraction_status !== 'done') return [];

  if (!r.vendor_name) asks.push('Which shop or supplier was this from?');
  if (!r.transaction_at) asks.push('What date was this purchase?');
  if (r.total_cents == null) asks.push('What was the total? The amount was not legible.');
  if (!r.category) asks.push('What kind of expense is this — fuel, meals, supplies?');
  return asks;
}

/** One line summarising a finished batch, for a person who is not going to read a table. */
export function describeReview(
  shots: readonly QueuedShot[],
  duplicates: readonly DuplicatePair[],
): string {
  const n = shots.length;
  if (n === 0) return 'No photos yet — the camera stays open, so keep shooting.';
  const photos = `${n} photo${n === 1 ? '' : 's'}`;
  if (duplicates.length === 0) return `${photos} ready to send.`;
  const d = duplicates.length;
  // Never "N duplicates removed" — nothing is removed, and saying so would be a claim about an
  // action nobody took.
  return `${photos} ready to send — ${d} look${d === 1 ? 's' : ''} like a repeat of another shot. Check before sending.`;
}

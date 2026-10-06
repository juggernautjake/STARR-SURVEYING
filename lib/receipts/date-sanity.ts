// lib/receipts/date-sanity.ts — a receipt date the year of which cannot be right.
//
// Found 2026-10-06 in the live data: five receipts photographed in Aug–Sep 2026 carried dates of
// 2000, 2009, 2016, 2017 and 2020. Faded thermal paper, a "26" read as "16" or "20". Nothing said
// so — the receipt simply sorted itself years into the past, out of every report for its month.
//
// The fix is a flag, not a correction. The month and day are usually right and the year usually
// wrong, but "usually" is not good enough to rewrite somebody's expense date silently; a person
// holding the paper settles it in a second.

/** A review flag when `transactionIso` cannot be the date of a receipt uploaded at `uploadedIso`,
 *  else null. More than a year before the upload, or more than a day after it. */
export function implausibleDateFlag(transactionIso: string | null | undefined, uploadedIso: string): string | null {
  if (!transactionIso) return null;
  const t = Date.parse(transactionIso);
  const u = Date.parse(uploadedIso);
  if (!Number.isFinite(t) || !Number.isFinite(u)) return null;
  const DAY = 86_400_000;
  if (t > u + DAY) {
    return `The date reads ${fmt(t)}, after the receipt was uploaded — check the date on the paper.`;
  }
  if (t < u - 366 * DAY) {
    return `The date reads ${fmt(t)}, more than a year before it was uploaded — the year was probably misread. Check it on the paper.`;
  }
  return null;
}

function fmt(ms: number): string {
  return new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/Chicago' });
}

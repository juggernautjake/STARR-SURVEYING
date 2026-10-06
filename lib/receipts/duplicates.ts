// lib/receipts/duplicates.ts — is this the same receipt twice?
//
// Owner, 2026-10-06: "We especially need our system to be able to spot duplicate entries of the same
// receipt and it should flag the receipts and let the user review them together and decide what to
// do … It should look at receipt date, place, total, items purchased, etc."
//
// What existed before this: an exact `vendor|total|UTC-day` fingerprint (whose own comment claimed
// "Lowe's #1234" and "LOWES STORE 1234" matched — they did not), and a same-purchase check for a bill
// and its card slip. Both compared only one employee's own receipts, neither looked at line items or
// the printed receipt number, and nothing let a person compare the two and decide.
//
// This module is PURE — no database, no clock — so every rule below is tested against real shapes
// from the live data (__tests__/receipts/duplicates.test.ts). The scanner that feeds it rows and
// stores what it says lives in duplicate-scan.ts.
//
// ── THE SIGNALS ─────────────────────────────────────────────────────────────────────────────────
//   · same stored photo                        → certain (one file filed twice)
//   · same printed receipt number + same total → certain
//   · total: exact / within a few cents (a misread) / different
//   · date: same calendar day (Central) / ±1 day / further
//   · place: business names compared after removing store numbers, "store", "inc"… and allowing a
//     one-letter misread (CEFCO / GEFCO, Chick-fil-A / Chik-fil-A)
//   · items: how many line items appear on both at the same price
//   · time of day, when both receipts printed one: an hour apart is two purchases, not one
//   · receipt numbers that BOTH exist and DIFFER: strong evidence of two different receipts
//   · card last four that both have and differ: evidence of two different purchases
//
// ── WHAT IT WILL NOT FLAG ───────────────────────────────────────────────────────────────────────
// Two people buying the same $8.20 coffee at the same chain three days apart. Two CEFCO receipts
// for $9.03 with different receipt numbers. A bill and its card slip (that is "same purchase", a
// different relationship, handled by same-purchase.ts). Real repeats are common in this business —
// the same breakfast taco at the same gas station — and a check that cries wolf gets ignored.

export interface DupReceipt {
  id: string;
  user_id: string | null;
  vendor_name: string | null;
  transaction_at: string | null;
  total_cents: number | null;
  payment_last4: string | null;
  receipt_number: string | null;
  photo_url: string | null;
  items: Array<{ description: string | null; amount_cents: number | null }>;
}

export type DupConfidence = 'certain' | 'likely' | 'possible';

export interface DupVerdict {
  confidence: DupConfidence;
  /** 0–100, for ordering the review queue. */
  score: number;
  /** Plain sentences, shown to the person deciding. */
  reasons: string[];
  /** Per-field comparison, for the side-by-side view. */
  matches: {
    date: 'same' | 'adjacent' | 'different' | 'unknown';
    place: 'same' | 'similar' | 'different' | 'unknown';
    total: 'same' | 'near' | 'different' | 'unknown';
    items: 'same' | 'overlap' | 'different' | 'unknown';
    receiptNumber: 'same' | 'different' | 'unknown';
    card: 'same' | 'different' | 'unknown';
    sameSubmitter: boolean;
  };
}

// ── normalisers ──────────────────────────────────────────────────────────────────────────────────

const STOP = new Set(['store', 'stores', 'inc', 'llc', 'co', 'company', 'the', 'of', 'and', 'restaurant',
  'gas', 'station', 'drive', 'in', 'location', 'no', 'number', 'welcome', 'to', 'our', 'tx', 'texas']);

/** Business name → comparable tokens: lower case, no accents/punctuation, no store numbers. */
export function vendorTokens(name: string | null | undefined): string[] {
  if (!name) return [];
  return name
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['’`]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter((t) => t && !STOP.has(t) && !/^\d+$/.test(t));
}

/** Edit distance, for one-letter misreads. */
function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const dp = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i += 1) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const tmp = dp[j];
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[b.length];
}

const similar = (a: string, b: string) =>
  a === b || (Math.min(a.length, b.length) >= 4 && levenshtein(a, b) / Math.max(a.length, b.length) <= 0.2);

/** 'same' when one name's words are all in the other's (allowing a misread letter), 'similar' when
 *  they share a distinctive word, 'different' otherwise, 'unknown' when either is missing. */
export function comparePlace(a: string | null, b: string | null): DupVerdict['matches']['place'] {
  const ta = vendorTokens(a);
  const tb = vendorTokens(b);
  if (ta.length === 0 || tb.length === 0) return 'unknown';
  const joinedA = ta.join('');
  const joinedB = tb.join('');
  if (similar(joinedA, joinedB)) return 'same';
  const [small, big] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  const hits = small.filter((t) => big.some((u) => similar(t, u))).length;
  if (hits === small.length) return 'same';
  if (hits > 0 && small.some((t) => t.length >= 4 && big.some((u) => similar(t, u)))) return 'similar';
  return 'different';
}

/** `YYYY-MM-DD` in Central — receipts print local dates. */
export function centralDay(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(new Date(t));
}

/** Did this timestamp carry a real time of day, or is it a date-only value stored at noon/midnight UTC? */
function hasClockTime(iso: string | null | undefined): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return false;
  const h = d.getUTCHours();
  const m = d.getUTCMinutes();
  return !((h === 0 || h === 12) && m === 0);
}

const normNumber = (s: string | null | undefined) => (s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

/** A receipt number worth trusting: at least 4 characters and at least 3 digits ("hebg" is noise). */
function usableNumber(s: string | null | undefined): string | null {
  const n = normNumber(s);
  return n.length >= 4 && (n.match(/\d/g) ?? []).length >= 3 ? n : null;
}

const itemWords = (d: string | null) => vendorTokens(d).join(' ');

/** Fraction of line items that appear on both receipts at the same price (0–1), or null if either
 *  has none. Matched one-to-one so two identical coffees on one receipt don't match one on the other twice. */
export function itemOverlap(a: DupReceipt['items'], b: DupReceipt['items']): number | null {
  const ia = a.filter((x) => x.amount_cents != null);
  const ib = b.filter((x) => x.amount_cents != null);
  if (ia.length === 0 || ib.length === 0) return null;
  const used = new Set<number>();
  let matched = 0;
  for (const x of ia) {
    const wx = itemWords(x.description);
    const k = ib.findIndex((y, idx) => !used.has(idx) && y.amount_cents === x.amount_cents
      && (wx === '' || itemWords(y.description) === '' || similar(wx.replace(/ /g, ''), itemWords(y.description).replace(/ /g, ''))
        || wx.split(' ').some((w) => w.length >= 4 && itemWords(y.description).includes(w))));
    if (k >= 0) { used.add(k); matched += 1; }
  }
  return (2 * matched) / (ia.length + ib.length);
}

const dollars = (c: number) => `$${(c / 100).toFixed(2)}`;

// ── the verdict ──────────────────────────────────────────────────────────────────────────────────

/** Compare two receipts. Null when they are not plausibly the same receipt. */
export function compareReceipts(a: DupReceipt, b: DupReceipt): DupVerdict | null {
  if (a.id === b.id) return null;

  const dayA = centralDay(a.transaction_at);
  const dayB = centralDay(b.transaction_at);
  const dayGap = dayA && dayB ? Math.round(Math.abs(Date.parse(`${dayA}T12:00:00Z`) - Date.parse(`${dayB}T12:00:00Z`)) / 86_400_000) : null;
  const date: DupVerdict['matches']['date'] = dayGap == null ? 'unknown' : dayGap === 0 ? 'same' : dayGap === 1 ? 'adjacent' : 'different';

  const totalDiff = a.total_cents != null && b.total_cents != null ? Math.abs(a.total_cents - b.total_cents) : null;
  const total: DupVerdict['matches']['total'] = totalDiff == null ? 'unknown' : totalDiff === 0 ? 'same' : totalDiff <= 10 ? 'near' : 'different';

  const place = comparePlace(a.vendor_name, b.vendor_name);

  const overlap = itemOverlap(a.items, b.items);
  const items: DupVerdict['matches']['items'] = overlap == null ? 'unknown' : overlap >= 0.8 ? 'same' : overlap >= 0.5 ? 'overlap' : 'different';

  const na = usableNumber(a.receipt_number);
  const nb = usableNumber(b.receipt_number);
  const receiptNumber: DupVerdict['matches']['receiptNumber'] = na && nb ? (na === nb ? 'same' : 'different') : 'unknown';

  const card: DupVerdict['matches']['card'] = a.payment_last4 && b.payment_last4 ? (a.payment_last4 === b.payment_last4 ? 'same' : 'different') : 'unknown';
  const sameSubmitter = !!a.user_id && a.user_id === b.user_id;

  const matches = { date, place, total, items, receiptNumber, card, sameSubmitter };
  const reasons: string[] = [];
  const who = sameSubmitter ? '' : ' Submitted by two different people.';

  // ── certain ─────────────────────────────────────────────────────────────────────────────────
  if (a.photo_url && a.photo_url === b.photo_url) {
    return { confidence: 'certain', score: 100, reasons: ['The same photo file was submitted twice.' + who], matches };
  }
  if (receiptNumber === 'same' && (total === 'same' || total === 'near' || total === 'unknown')) {
    reasons.push(`Same receipt number (${a.receipt_number})${total === 'same' && a.total_cents != null ? ` and the same total, ${dollars(a.total_cents)}` : ''}.`);
    if (date === 'different') reasons.push('The dates differ — one was probably misread.');
    return { confidence: 'certain', score: 98, reasons: [reasons.join(' ') + who], matches };
  }

  // ── evidence of two different receipts ────────────────────────────────────────────────────────
  // Both printed a receipt number and they differ: two transactions, however alike. Only the photo
  // check above outranks this.
  if (receiptNumber === 'different') return null;
  if (place === 'different') return null;
  if (total === 'different' || total === 'unknown') return null;

  // Time of day only means something within one day.
  const timesKnown = date === 'same' && hasClockTime(a.transaction_at) && hasClockTime(b.transaction_at);
  const minutesApart = timesKnown ? Math.abs(Date.parse(a.transaction_at!) - Date.parse(b.transaction_at!)) / 60_000 : null;
  const cardDiffers = card === 'different';

  const placeTxt = place === 'unknown' ? 'one has no business name' : place === 'same' ? `same place (${a.vendor_name ?? b.vendor_name})` : `similar place (${a.vendor_name} / ${b.vendor_name})`;
  const totalTxt = total === 'same' ? `same total (${dollars(a.total_cents!)})` : `totals ${totalDiff}¢ apart (${dollars(a.total_cents!)} / ${dollars(b.total_cents!)}) — a likely misread`;
  const itemTxt = items === 'same' ? 'the same items' : items === 'overlap' ? 'mostly the same items' : null;

  // ── Different days ──────────────────────────────────────────────────────────────────────────
  // Calibrated on the live receipts (2026-10-06): the crew buys the same coffee at the same CEFCO for
  // the same $9.03 on different days, with the same two line items. "Same items, different dates" is
  // therefore an ordinary week, not a misread. The misread that DOES happen is the YEAR — 2026 read
  // as 2016/2017/2020 on faded paper — so only same month-and-day in different years counts.
  if (date === 'different') {
    const yearOnly = dayA && dayB && dayA.slice(5) === dayB.slice(5);
    if (!(yearOnly && total === 'same' && place !== 'unknown' && items !== 'different')) return null;
    return {
      confidence: 'likely',
      score: 78,
      reasons: [`${cap(placeTxt)}, ${totalTxt}${itemTxt ? `, ${itemTxt}` : ''}, and the same month and day — only the year differs (${dayA} / ${dayB}). The year was probably misread.${who}`],
      matches,
    };
  }
  // No date on one of them: only an exact total with the same items is worth a look.
  if (date === 'unknown' && !(total === 'same' && items === 'same' && place !== 'unknown')) return null;
  // A few cents apart is a misread total only on the SAME day; on different days it is a different
  // purchase of the same thing.
  if (total === 'near' && date !== 'same') return null;

  let score = 0;
  score += total === 'same' ? 35 : 22;
  score += date === 'same' ? 30 : date === 'adjacent' ? 15 : 8;
  score += place === 'same' ? 20 : place === 'similar' ? 12 : 4;
  score += items === 'same' ? 20 : items === 'overlap' ? 10 : items === 'different' ? -25 : 0;
  if (cardDiffers) score -= 20;
  if (minutesApart != null && minutesApart > 45) score -= 25;
  if (!sameSubmitter) score -= 5;

  const parts = [cap(placeTxt), totalTxt];
  parts.push(date === 'same' ? 'same day' : date === 'adjacent' ? `one day apart (${dayA} / ${dayB})` : 'one has no date');
  if (itemTxt) parts.push(itemTxt);
  reasons.push(parts.join(', ') + '.');
  if (items === 'different') reasons.push('But the items bought are different.');
  if (cardDiffers) reasons.push(`But paid with different cards (…${a.payment_last4} / …${b.payment_last4}).`);
  if (minutesApart != null && minutesApart > 45) reasons.push(`But printed ${Math.round(minutesApart)} minutes apart — could be two separate purchases.`);
  if (who) reasons.push(who.trim());

  let confidence: DupConfidence | null =
    score >= 85 ? 'certain' : score >= 65 ? 'likely' : score >= 50 ? 'possible' : null;
  if (confidence && date === 'unknown') confidence = 'possible';
  if (!confidence) return null;
  // "Certain" is reserved for proof (same photo, same receipt number, or everything incl. items).
  const capped: DupConfidence = confidence === 'certain' && items !== 'same' ? 'likely' : confidence;
  return { confidence: capped, score: Math.max(0, Math.min(100, score)), reasons, matches };
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** The pair key stored in the database: the two ids in a fixed order, so A–B and B–A are one row. */
export function pairKey(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

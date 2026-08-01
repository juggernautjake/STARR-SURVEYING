// lib/integrations/google-ads/offline.ts — offline conversion uploads, as CSV. A7.
//
// Ships value with **zero Google API access and no developer-token wait**, which is the point: token
// approval is the slowest step in this project and it is entirely outside our control. A CSV that someone
// drags into Google Ads → Goals → Conversions → Uploads closes the loop today, and A8's API path later
// reuses every row-building function here.
//
// ── WHAT WAS VERIFIED, AND WHEN — read this before trusting the format ──────────────────────────────
//
// **Read from Google's own documentation on 2026-08-01**
// (support.google.com/google-ads/answer/7012522, "Set up offline conversions using Google Click ID"):
//
//   · *"After creating a new conversion action, wait 4-6 hours before uploading conversions for that
//     conversion action. If you upload conversions during the first 4-6 hours, it might take 2 days for
//     those conversions to appear on your reports."* — this is about a NEW ACTION, not about each click.
//   · Google's own GCLID-capture sample uses a **90-day expiry** (`90 * 24 * 60 * 60 * 1000`), which
//     matches the click window `lib/leads/attribution.ts` already assumes.
//   · Data Manager's import lookback is **90 days** for file-based sources (GCS, S3, HTTP, SFTP, Sheets)
//     and **14 days** for several database connectors. Only the file path matters here.
//
// **NOT verified today, and flagged rather than asserted:** the exact CSV column HEADERS. Google's help
// page describes the process without printing the header row, and the deeper reference it points to is
// behind a different path. The headers below are the long-standing published set, but they are the one
// thing in this module that could be subtly wrong in a way that fails at upload time.
//
// **How to settle it in two minutes, before the first real upload:** in Google Ads go to Goals →
// Conversions → Uploads → *Upload a file*, and use "Download template". That template IS the authority,
// and it is account-specific. If it disagrees with `CLICK_COLUMNS` or `ENHANCED_COLUMNS` below, the
// template wins — change the constant and update this note with the date.
//
// Saying that plainly is better than a comment claiming a source it does not have. A format that is
// merely probably right, presented as certain, is how a whole quarter of conversions gets rejected by a
// header nobody re-checked.
//
// ── WHY THE ORDER ID IS OUR DEDUPE KEY ──────────────────────────────────────────────────────────────
//
// Ground rule G3: exports are idempotent and replayable. Google treats `Order ID` as the identity of a
// conversion, so re-uploading a row with an Order ID it has already seen is ignored rather than counted
// twice. Using the lifecycle event's own dedupe key means "re-running yesterday's export" is safe by
// construction rather than by anyone remembering not to.

/** Rows we can build. The click path is exact; the enhanced path is for leads with no click at all. */
export type UploadFormat = 'click' | 'enhanced';

/**
 * The click-based column set. See the header for what is and is not verified.
 * Order matters — Google matches on position as well as name in some importers.
 */
export const CLICK_COLUMNS = [
  'Google Click ID',
  'Conversion Name',
  'Conversion Time',
  'Conversion Value',
  'Conversion Currency',
  'Order ID',
] as const;

/**
 * Enhanced Conversions for Leads: no `gclid` at all, matched on hashed identifiers instead.
 *
 * This is the path that covers the biggest hole in the whole plan (Finding 6): at a surveying firm a
 * large share of enquiries arrive by PHONE, and a phone lead has no click to key on. It can still be
 * matched if the customer's email or number is one Google knows.
 */
export const ENHANCED_COLUMNS = [
  'Email',
  'Phone Number',
  'Conversion Name',
  'Conversion Time',
  'Conversion Value',
  'Conversion Currency',
  'Order ID',
] as const;

/** The business's timezone. Central, because that is where the surveys are and where the office books. */
export const UPLOAD_TIMEZONE = 'America/Chicago';

export interface ConversionRow {
  /** One of `gclid` / `gbraid` / `wbraid`, or null for the enhanced path. */
  clickId?: string | null;
  hashedEmail?: string | null;
  hashedPhone?: string | null;
  /** The Google conversion action name. Must match the account's spelling EXACTLY, including case. */
  conversionName: string;
  occurredAt: string | Date;
  valueCents?: number | null;
  currency?: string;
  /** Our lifecycle dedupe key. See the header. */
  orderId: string;
}

/**
 * Format an instant the way Google's importer expects: `YYYY-MM-DD HH:MM:SS±HH:MM`.
 *
 * The OFFSET is included rather than relying on the `Parameters:TimeZone` header line, and that is
 * deliberate: an explicit offset is unambiguous across a daylight-saving boundary, whereas a bare local
 * time plus a timezone name has to be interpreted — and the hour that repeats every autumn is exactly
 * when a conversion lands an hour out and nobody can explain why.
 */
export function formatConversionTime(at: string | Date, timeZone: string = UPLOAD_TIMEZONE): string {
  const d = at instanceof Date ? at : new Date(at);
  if (Number.isNaN(d.getTime())) throw new Error(`Unparseable conversion time: ${String(at)}`);

  // `en-CA` gives ISO-ordered date parts, which saves reassembling them by hand.
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00';
  // `hour12: false` yields "24" for midnight in some runtimes; Google wants "00".
  const hour = get('hour') === '24' ? '00' : get('hour');

  const offset = tzOffset(d, timeZone);
  return `${get('year')}-${get('month')}-${get('day')} ${hour}:${get('minute')}:${get('second')}${offset}`;
}

/** The UTC offset of a zone at a given instant, as `±HH:MM`. Computed from the instant rather than
 *  hardcoded, so daylight saving is handled by the platform instead of by a constant that is wrong for
 *  half the year. */
function tzOffset(at: Date, timeZone: string): string {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone, timeZoneName: 'longOffset', year: 'numeric',
  });
  const name = dtf.formatToParts(at).find((p) => p.type === 'timeZoneName')?.value ?? '';
  // "GMT-05:00" → "-05:00"; plain "GMT" (i.e. UTC) → "+00:00".
  const m = name.match(/GMT([+-]\d{2}:\d{2})/);
  return m ? m[1] : '+00:00';
}

/** Cents → the decimal string Google expects. Null/absent becomes `0`, which is what an unvalued
 *  conversion means to the importer — it is a required column. */
export function formatValue(cents: number | null | undefined): string {
  if (typeof cents !== 'number' || !Number.isFinite(cents)) return '0';
  return (cents / 100).toFixed(2);
}

/** Escape one CSV field. Quotes anything containing a comma, quote or newline — a `scope_notes` with a
 *  comma in it would otherwise shift every column after it and corrupt the upload silently. */
export function csvField(value: string | null | undefined): string {
  const s = value == null ? '' : String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** One row, as an ordered array matching the chosen column set. */
export function buildRow(row: ConversionRow, format: UploadFormat): string[] {
  const time = formatConversionTime(row.occurredAt);
  const value = formatValue(row.valueCents);
  const currency = row.currency ?? 'USD';

  if (format === 'click') {
    return [row.clickId ?? '', row.conversionName, time, value, currency, row.orderId];
  }
  return [row.hashedEmail ?? '', row.hashedPhone ?? '', row.conversionName, time, value, currency, row.orderId];
}

/** Can this row actually be uploaded in this format? Rows that cannot are EXCLUDED and counted rather
 *  than written blank — a CSV full of rows with no identifier is rejected wholesale by Google, so one
 *  unusable row would take the whole upload down with it. */
export function isUploadable(row: ConversionRow, format: UploadFormat): boolean {
  if (format === 'click') return Boolean(row.clickId);
  return Boolean(row.hashedEmail || row.hashedPhone);
}

export interface CsvResult {
  csv: string;
  /** How many rows were written. */
  included: number;
  /** How many were dropped for having no usable identifier — reported, never silently discarded. */
  skipped: number;
}

/**
 * Build the whole file.
 *
 * The `Parameters:TimeZone` line is emitted even though every timestamp already carries an explicit
 * offset. It costs one line, it is what Google's own template does, and an importer that reads it will
 * agree with the offsets rather than contradict them.
 */
export function buildCsv(rows: ConversionRow[], format: UploadFormat): CsvResult {
  const columns = format === 'click' ? CLICK_COLUMNS : ENHANCED_COLUMNS;
  const usable = rows.filter((r) => isUploadable(r, format));

  const lines = [
    `Parameters:TimeZone=${UPLOAD_TIMEZONE}`,
    columns.join(','),
    ...usable.map((r) => buildRow(r, format).map(csvField).join(',')),
  ];

  return {
    csv: `${lines.join('\n')}\n`,
    included: usable.length,
    skipped: rows.length - usable.length,
  };
}

/**
 * Is this conversion still inside Google's click window?
 *
 * Rows outside it are rejected at upload, and a rejected row is worse than an absent one: it produces an
 * error report someone has to interpret, and it makes a good upload look broken. Filtering here means the
 * file we hand over is one Google will accept in full.
 */
export const CLICK_WINDOW_DAYS = 90;

export function withinClickWindow(
  clickAt: string | Date | null | undefined,
  conversionAt: string | Date,
  windowDays: number = CLICK_WINDOW_DAYS,
): boolean {
  if (!clickAt) return true; // no recorded click time — the enhanced path, where this does not apply
  const from = new Date(clickAt).getTime();
  const to = new Date(conversionAt).getTime();
  if (Number.isNaN(from) || Number.isNaN(to)) return false; // unreadable is not "inside"
  return to >= from && to - from <= windowDays * 24 * 60 * 60 * 1000;
}

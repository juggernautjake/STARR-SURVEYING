// lib/integrations/google-ads/spend.ts — ad spend, so "cost per lead" has a denominator. A11.
//
// The owner asked for true lead costs. Without spend we have conversions and no denominator: "we got 14
// leads" is not a number anyone can act on; "14 leads at $63 each, 3 jobs at $294 each" is.
//
// ── THREE THINGS THE GOOGLE ADS API DOES THAT QUIETLY BREAK NAIVE PARSERS ───────────────────────────
//
// Read off `developers.google.com/google-ads/api/docs/reporting` and the proto3 JSON mapping on
// **2026-08-01**, and each of these is encoded in `parseSpendRows` with a test:
//
//   1. **`searchStream` returns an ARRAY of chunks**, not one object. Reading `body.results` gets you
//      nothing; reading only `body[0].results` gets you the first few hundred rows and silently drops the
//      rest — which looks like "we spent less last month".
//   2. **int64 fields arrive as JSON STRINGS.** `costMicros` is `"12340000"`, not `12340000`. Summing
//      those with `+` concatenates them, and a month of spend becomes a 200-character number or `NaN`.
//   3. **`metrics.conversions` is a double, `metrics.costMicros` is micros.** Mixing the two units is how
//      a cost-per-conversion figure comes out a million times too big.
//
// ── COST IS STORED IN MICROS, EXACTLY AS REPORTED ──────────────────────────────────────────────────
//
// Converting on the way in makes every future disagreement with the Ads UI a rounding argument nobody can
// settle. Division happens at the point of display, once.

/** Google reports money in millionths of the account currency. $12.34 → 12_340_000. */
export const MICROS_PER_UNIT = 1_000_000;

export interface SpendRow {
  spendDate: string;          // YYYY-MM-DD
  campaignId: string | null;
  campaignName: string | null;
  adGroupId: string | null;
  adGroupName: string | null;
  impressions: number;
  clicks: number;
  costMicros: number;
  conversions: number;
  conversionValueMicros: number;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The GAQL for daily spend at ad-group grain.
 *
 * Dates are validated rather than escaped, because GAQL has no parameter binding — the only safe input is
 * one that cannot contain anything but a date. A rejected bad date is a bug report; an interpolated one
 * is a query someone else gets to write.
 */
export function buildSpendQuery(from: string, to: string): string {
  if (!DATE_RE.test(from) || !DATE_RE.test(to)) {
    throw new Error(`Spend query needs YYYY-MM-DD dates, got "${from}".."${to}"`);
  }
  if (from > to) throw new Error(`Spend query range is backwards: "${from}".."${to}"`);
  return [
    'SELECT segments.date, campaign.id, campaign.name, ad_group.id, ad_group.name,',
    'metrics.impressions, metrics.clicks, metrics.cost_micros,',
    'metrics.conversions, metrics.conversions_value',
    'FROM ad_group',
    `WHERE segments.date BETWEEN '${from}' AND '${to}'`,
  ].join(' ');
}

/** int64-as-string is the proto3 JSON mapping. `Number("12340000")` is right; `+` on it is not. */
function int64(v: unknown): number {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  if (typeof v === 'string') { const n = Number(v); return Number.isFinite(n) ? n : 0; }
  return 0;
}

function float(v: unknown): number {
  const n = typeof v === 'string' ? Number(v) : typeof v === 'number' ? v : 0;
  return Number.isFinite(n) ? n : 0;
}

interface RawResult {
  segments?: { date?: string };
  campaign?: { id?: string | number; name?: string };
  adGroup?: { id?: string | number; name?: string };
  metrics?: Record<string, unknown>;
}

/**
 * Flatten a `searchStream` response into rows.
 *
 * Accepts the array-of-chunks shape AND a single object, because the non-streaming `search` endpoint
 * returns the latter and someone will eventually point this at it.
 */
export function parseSpendRows(body: unknown): SpendRow[] {
  // See gotcha 1. An array of chunks; each chunk has its own `results`.
  const chunks: unknown[] = Array.isArray(body) ? body : body ? [body] : [];
  const rows: SpendRow[] = [];

  for (const chunk of chunks) {
    const results = (chunk as { results?: unknown[] } | null)?.results;
    if (!Array.isArray(results)) continue;
    for (const raw of results as RawResult[]) {
      const date = raw?.segments?.date;
      // A row with no date cannot be stored at the grain the unique index enforces, and guessing one
      // would attribute spend to the wrong day.
      if (typeof date !== 'string' || !DATE_RE.test(date)) continue;
      const m = raw.metrics ?? {};
      rows.push({
        spendDate: date,
        campaignId: raw.campaign?.id != null ? String(raw.campaign.id) : null,
        campaignName: raw.campaign?.name ?? null,
        adGroupId: raw.adGroup?.id != null ? String(raw.adGroup.id) : null,
        adGroupName: raw.adGroup?.name ?? null,
        impressions: int64(m.impressions),
        clicks: int64(m.clicks),
        costMicros: int64(m.costMicros),
        conversions: float(m.conversions),
        // `conversionsValue` is a DOUBLE in currency units, unlike costMicros. Converting here keeps one
        // unit in the table; rounding is explicit rather than whatever the DB would have done.
        conversionValueMicros: Math.round(float(m.conversionsValue) * MICROS_PER_UNIT),
      });
    }
  }
  return rows;
}

/** Micros → whole currency units, for display only. */
export function toUnits(micros: number): number {
  return micros / MICROS_PER_UNIT;
}

/**
 * Cost per whatever. **Returns null when the count is zero**, and that is the entire point of the
 * function: spend with no leads is not a cost-per-lead of zero, and it is not infinity — it is a question
 * with no answer, and the dashboard must say so rather than print a number.
 */
export function costPer(costMicros: number, count: number): number | null {
  if (!Number.isFinite(count) || count <= 0) return null;
  return toUnits(costMicros) / count;
}

/** Sum a set of rows. Separate from the parser so a filtered subset totals the same way. */
export function totalSpend(rows: Array<Pick<SpendRow, 'costMicros'>>): number {
  return rows.reduce((sum, r) => sum + r.costMicros, 0);
}

/**
 * Fold API rows to the table's grain: one row per (date, campaign, ad group).
 *
 * The API already returns that grain, but a re-import overlapping an existing range must UPDATE rather
 * than add — the unique index enforces it, and this key is what the upsert conflicts on.
 */
export function grainKey(r: Pick<SpendRow, 'spendDate' | 'campaignId' | 'adGroupId'>, platform = 'google_ads'): string {
  return [r.spendDate, platform, r.campaignId ?? '', r.adGroupId ?? ''].join('|');
}

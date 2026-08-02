// lib/field-live/feed.ts — one feed, two capture paths, and no lying about which (audit §3d, 8p).
//
// The owner's ask was *"when a data collector stores a point, that point shows up on the app shortly
// thereafter"*. §3d's researched answer: no vendor emits an event when a surveyor presses Store, so
// collector points arrive on the next sync — seconds to minutes with signal, hours without. Step 4
// of the recommended sequence is the one path with no vendor in the loop:
//
//   *"Our own mobile app as the true-instant path … a point can appear ACTUALLY instantly."*
//
// Both paths now write two clocks (seed 522 for the collector, seed 527 for the phone). This module
// is the single place that merges them, and the single place that decides what the reader is told
// about each one.
//
// ── WHY THE SOURCES CANNOT BE FLATTENED INTO "A POINT" ──────────────────────────────────────────
//
// They are not the same measurement. A phone point is a device GPS fix — metres of accuracy, in
// lat/lon, good for "there is a fence corner about here, with three photos of it". A collector point
// is a survey-grade observation in northing/easting, good for a plat that a licensed surveyor seals.
// Merging them into one undifferentiated list would put a ±4 m phone fix next to a 0.02 ft shot with
// nothing to tell them apart, and the person reading the list is deciding whether to drive back out.
//
// So every item carries its `source`, its `precision` band, and — for phone points — the accuracy the
// device itself reported. A feed that shows the two together is useful. A feed that shows them as
// interchangeable is dangerous.
//
// ── THE TWO CLOCKS, AGAIN, AND WHY LAG IS COMPUTED HERE ─────────────────────────────────────────
//
// `measuredAt` is when it was shot; `receivedAt` is when we first saw it. The feed is ORDERED by
// received (it answers "what is new"), and every row displays measured (it answers "when was this").
// Presenting one as the other is the defect seed 522's column comments exist to prevent, and the
// most likely place to commit it is a UI that has only one date to hand — so `lagSeconds` is part of
// the item rather than something a component works out, and it is null when measured is unknown
// rather than zero. Zero would read as "arrived instantly".

export type FieldPointSource = 'phone' | 'instrument';

/** What the numbers are worth. Not a formatting concern — it is the whole reason the sources stay
 *  distinguishable, so it is part of the model. */
export type PrecisionBand = 'survey_grade' | 'device_gps';

export interface PhonePointRow {
  id: string;
  job_id: string | null;
  name: string;
  description: string | null;
  code_category: string | null;
  device_lat: number | null;
  device_lon: number | null;
  device_accuracy_m: number | null;
  /** The DEVICE clock at capture. Named created_at for history — see seed 527. */
  created_at: string;
  received_at: string | null;
  created_by_email?: string | null;
  media_count?: number | null;
}

export interface InstrumentPointRow {
  id: string;
  job_id: string | null;
  point_name: string;
  code: string | null;
  description: string | null;
  northing: number;
  easting: number;
  elevation: number | null;
  unit: string;
  measured_at: string | null;
  received_at: string;
  batch_id?: string | null;
  format?: string | null;
}

export interface FieldFeedItem {
  id: string;
  source: FieldPointSource;
  precision: PrecisionBand;
  jobId: string | null;
  jobLabel?: string | null;
  name: string;
  description: string | null;
  /** Category for a phone point, instrument code for a collector point. Same slot, both optional. */
  code: string | null;
  /** When it was shot. Null only for collector formats that record no per-point time. */
  measuredAt: string | null;
  /** When this server first saw it. Always present — it is what the feed is ordered by. */
  receivedAt: string;
  /** receivedAt − measuredAt. Null when measured is unknown; never 0 as a stand-in. */
  lagSeconds: number | null;
  /** Phone: lat/lon. Collector: northing/easting. Never mixed — the units are not the same axes. */
  coords:
    | { kind: 'latlon'; lat: number | null; lon: number | null; accuracyM: number | null }
    | { kind: 'grid'; northing: number; easting: number; elevation: number | null; unit: string };
  who: string | null;
  mediaCount: number | null;
  batchId: string | null;
}

function lag(measuredAt: string | null, receivedAt: string): number | null {
  if (!measuredAt) return null;
  const m = Date.parse(measuredAt);
  const r = Date.parse(receivedAt);
  if (!Number.isFinite(m) || !Number.isFinite(r)) return null;
  // Negative lag is possible and is NOT clamped to zero: a phone whose clock is ahead produces one,
  // and silently flooring it would hide a device-time problem that makes a whole day's ordering
  // wrong. The UI decides how to say "this phone's clock looks off"; the arithmetic stays honest.
  return Math.round((r - m) / 1000);
}

export function phoneToFeedItem(row: PhonePointRow, jobLabel?: string | null): FieldFeedItem {
  // A row written before seed 527 has no arrival time. created_at is the same fallback the seed
  // backfilled with, applied here so a mid-deploy read cannot produce an item with no order key.
  const receivedAt = row.received_at ?? row.created_at;
  return {
    id: row.id,
    source: 'phone',
    precision: 'device_gps',
    jobId: row.job_id,
    jobLabel: jobLabel ?? null,
    name: row.name,
    description: row.description,
    code: row.code_category,
    measuredAt: row.created_at,
    receivedAt,
    lagSeconds: lag(row.created_at, receivedAt),
    coords: {
      kind: 'latlon',
      lat: row.device_lat,
      lon: row.device_lon,
      accuracyM: row.device_accuracy_m ?? null,
    },
    who: row.created_by_email ?? null,
    mediaCount: row.media_count ?? 0,
    batchId: null,
  };
}

export function instrumentToFeedItem(row: InstrumentPointRow, jobLabel?: string | null): FieldFeedItem {
  return {
    id: row.id,
    source: 'instrument',
    precision: 'survey_grade',
    jobId: row.job_id,
    jobLabel: jobLabel ?? null,
    name: row.point_name,
    description: row.description,
    code: row.code,
    measuredAt: row.measured_at,
    receivedAt: row.received_at,
    lagSeconds: lag(row.measured_at, row.received_at),
    coords: {
      kind: 'grid',
      northing: row.northing,
      easting: row.easting,
      elevation: row.elevation,
      unit: row.unit,
    },
    who: null,
    mediaCount: null,
    batchId: row.batch_id ?? null,
  };
}

/** Merge both sources into one arrival-ordered feed.
 *
 *  Ordered by `receivedAt` DESC because the question this feed answers is "what has come in", and
 *  ordering it by measured time would make a batch of this morning's shots, uploaded at 6pm, appear
 *  below points captured after them. Ties break on id so the order is stable across polls — an
 *  unstable sort makes rows jump under the reader's cursor every fifteen seconds. */
export function mergeFieldFeed(
  phone: FieldFeedItem[],
  instrument: FieldFeedItem[],
  limit?: number,
): FieldFeedItem[] {
  const all = [...phone, ...instrument].sort((a, b) => {
    const d = Date.parse(b.receivedAt) - Date.parse(a.receivedAt);
    if (d !== 0) return d;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
  return typeof limit === 'number' ? all.slice(0, limit) : all;
}

/** How many items arrived after the caller's cursor. The cursor is a `receivedAt` the client already
 *  saw — never a client clock, because a browser an hour behind would ask for an hour of history on
 *  every poll and report all of it as new. */
export function countSince(items: FieldFeedItem[], cursorIso: string | null): number {
  if (!cursorIso) return 0;
  const cursor = Date.parse(cursorIso);
  if (!Number.isFinite(cursor)) return 0;
  return items.filter((i) => Date.parse(i.receivedAt) > cursor).length;
}

export interface FeedFreshness {
  /** Seconds since the most recent arrival, or null when the feed is empty. */
  secondsSinceLastArrival: number | null;
  /** The most recent arrival's source — what is actually feeding us right now. */
  lastSource: FieldPointSource | null;
  phoneCount: number;
  instrumentCount: number;
}

/** A one-line summary of where points are coming from, computed rather than assumed.
 *
 *  `now` is a parameter, not a clock read, for the reason every other rollup in this repo takes one:
 *  a function that reads the clock cannot be tested at a chosen moment. */
export function summariseFreshness(items: FieldFeedItem[], now: Date): FeedFreshness {
  const phoneCount = items.filter((i) => i.source === 'phone').length;
  const newest = items[0] ?? null;
  return {
    secondsSinceLastArrival: newest
      ? Math.max(0, Math.round((now.getTime() - Date.parse(newest.receivedAt)) / 1000))
      : null,
    lastSource: newest?.source ?? null,
    phoneCount,
    instrumentCount: items.length - phoneCount,
  };
}

/** The sentence the UI shows above the feed.
 *
 *  Written here, not in the component, because it is the promise §3d says not to over-state:
 *  *"Do not promise 'instant, any brand.' Promise 'Trimble near-live; everything else lands on sync
 *  or import.'"* A component that composes this string from parts will eventually compose one that
 *  says "live" about a path that is not. */
export function feedPromise(freshness: FeedFreshness): string {
  if (freshness.secondsSinceLastArrival === null) {
    return 'Nothing has arrived yet. Points from the crew’s phones appear here within seconds; points from a data collector appear when its job syncs or its file is imported.';
  }
  if (freshness.lastSource === 'phone') {
    return 'The most recent point came from a phone — that path is live, with no vendor cloud in between.';
  }
  return 'The most recent point came from a data collector, so it arrived on that job’s sync rather than at the moment it was shot.';
}

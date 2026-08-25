// One feed, two capture paths (audit §3d item 8p — "our own mobile app as the true-instant path").
//
// §3d's constraint, which every assertion here defends: *"points arrive late, in bursts, and out of
// order, hours after they were shot. A design that assumes ordered near-real-time arrival will look
// perfect in town and lose data in the field."*

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  countSince,
  feedPromise,
  instrumentToFeedItem,
  mergeFieldFeed,
  phoneToFeedItem,
  summariseFreshness,
  type InstrumentPointRow,
  type PhonePointRow,
} from '@/lib/field-live/feed';

const ROOT = process.cwd();
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const phone = (over: Partial<PhonePointRow> = {}): PhonePointRow => ({
  id: 'p1',
  job_id: 'job-1',
  name: 'IR03',
  description: 'iron rod found',
  code_category: 'IR',
  device_lat: 31.06,
  device_lon: -97.46,
  device_accuracy_m: 4.2,
  created_at: '2026-08-01T14:00:00.000Z',
  received_at: '2026-08-01T14:00:03.000Z',
  ...over,
});

const instrument = (over: Partial<InstrumentPointRow> = {}): InstrumentPointRow => ({
  id: 'i1',
  job_id: 'job-1',
  point_name: '1001',
  code: 'BC',
  description: 'boundary corner',
  northing: 10_234.55,
  easting: 3_120.18,
  elevation: 812.4,
  unit: 'USSurveyFoot',
  measured_at: '2026-08-01T09:15:00.000Z',
  received_at: '2026-08-01T18:40:00.000Z',
  ...over,
});

describe('the two sources stay distinguishable', () => {
  it('never presents a phone fix and a survey shot as the same kind of number', () => {
    const p = phoneToFeedItem(phone());
    const i = instrumentToFeedItem(instrument());
    expect(p.precision).toBe('device_gps');
    expect(i.precision).toBe('survey_grade');
    // Different axes, so different shapes — there is no path that renders a lat as a northing.
    expect(p.coords.kind).toBe('latlon');
    expect(i.coords.kind).toBe('grid');
  });

  it('carries the phone’s own accuracy, because “about here” has a radius', () => {
    const p = phoneToFeedItem(phone({ device_accuracy_m: 12 }));
    expect(p.coords).toMatchObject({ accuracyM: 12 });
  });
});

describe('the two clocks', () => {
  it('reports how long a collector point took to reach us', () => {
    const i = instrumentToFeedItem(instrument());
    expect(i.lagSeconds).toBe(9 * 3600 + 25 * 60); // 09:15 shot → 18:40 arrival
  });

  it('says “unknown”, not “instant”, when the format recorded no shot time', () => {
    // LandXML has no per-point timestamp. Zero would read as "arrived the moment it was shot".
    const i = instrumentToFeedItem(instrument({ measured_at: null }));
    expect(i.measuredAt).toBeNull();
    expect(i.lagSeconds).toBeNull();
  });

  it('does not clamp a device clock that is ahead of ours', () => {
    // A phone with automatic time off produces this, and flooring it to zero hides the fact that a
    // whole day's ordering is suspect.
    const p = phoneToFeedItem(phone({ created_at: '2026-08-01T14:05:00.000Z', received_at: '2026-08-01T14:00:00.000Z' }));
    expect(p.lagSeconds).toBe(-300);
  });

  it('treats a pre-seed-527 row (no arrival time) as having arrived when it was captured', () => {
    const p = phoneToFeedItem(phone({ received_at: null }));
    expect(p.receivedAt).toBe('2026-08-01T14:00:00.000Z');
    expect(p.lagSeconds).toBe(0);
  });
});

describe('the merged feed', () => {
  const items = mergeFieldFeed(
    [
      phoneToFeedItem(phone({ id: 'p-late', created_at: '2026-08-01T17:00:00.000Z', received_at: '2026-08-01T17:00:02.000Z' })),
      phoneToFeedItem(phone({ id: 'p-early', created_at: '2026-08-01T08:00:00.000Z', received_at: '2026-08-01T08:00:01.000Z' })),
    ],
    [instrumentToFeedItem(instrument({ id: 'i-batch' }))], // shot 09:15, arrived 18:40
  );

  it('orders by arrival, not by shot time — that is the question it answers', () => {
    // The collector batch was SHOT before the 17:00 phone point and ARRIVED after it. Ordering by
    // measured time would bury this morning's uploaded work below points captured after it.
    expect(items.map((i) => i.id)).toEqual(['i-batch', 'p-late', 'p-early']);
  });

  it('is stable across polls, so rows do not jump under the cursor', () => {
    const a = mergeFieldFeed(
      [phoneToFeedItem(phone({ id: 'b', received_at: '2026-08-01T12:00:00.000Z' }))],
      [instrumentToFeedItem(instrument({ id: 'a', received_at: '2026-08-01T12:00:00.000Z' }))],
    );
    const b = mergeFieldFeed(
      [phoneToFeedItem(phone({ id: 'b', received_at: '2026-08-01T12:00:00.000Z' }))],
      [instrumentToFeedItem(instrument({ id: 'a', received_at: '2026-08-01T12:00:00.000Z' }))],
    );
    expect(a.map((i) => i.id)).toEqual(b.map((i) => i.id));
  });

  it('counts what is new against a server-issued cursor', () => {
    expect(countSince(items, '2026-08-01T12:00:00.000Z')).toBe(2); // i-batch + p-late
    expect(countSince(items, null)).toBe(0);
    expect(countSince(items, 'not a date')).toBe(0);
  });
});

describe('what the reader is told', () => {
  const now = new Date('2026-08-01T18:41:00.000Z');

  it('says the phone path is live only when a phone point actually arrived last', () => {
    const phoneLast = summariseFreshness([phoneToFeedItem(phone())], now);
    expect(feedPromise(phoneLast)).toContain('no vendor cloud');

    const collectorLast = summariseFreshness([instrumentToFeedItem(instrument())], now);
    // §3d: "Do not promise 'instant, any brand.'"
    expect(feedPromise(collectorLast)).toContain('sync');
    expect(feedPromise(collectorLast)).not.toContain('live');
  });

  it('does not call an empty feed healthy', () => {
    const empty = summariseFreshness([], now);
    expect(empty.secondsSinceLastArrival).toBeNull();
    expect(feedPromise(empty)).toContain('Nothing has arrived yet');
  });

  it('counts each source, so “quiet” can be told apart from “one path is down”', () => {
    const f = summariseFreshness([phoneToFeedItem(phone()), instrumentToFeedItem(instrument())], now);
    expect(f.phoneCount).toBe(1);
    expect(f.instrumentCount).toBe(1);
  });
});

describe('the wiring, which is the part that was missing', () => {
  it('renders the collector arrivals that the ingest API had no UI for', () => {
    const page = read('app/admin/jobs/_tabs/FieldDataTab.tsx');
    expect(page).toContain('CollectorArrivals');
    expect(page).toContain('LiveFieldFeed');
    expect(read('app/admin/jobs/_tabs/CollectorArrivals.tsx')).toContain('/api/admin/field-ingest');
  });

  it('polls on the server’s cursor rather than the browser’s clock', () => {
    const feed = read('app/admin/jobs/_tabs/LiveFieldFeed.tsx');
    expect(feed).toContain('cursorRef');
    expect(feed).not.toMatch(/since=\$\{new Date\(\)/);
    // A tab left open on a truck seat should not poll all afternoon.
    expect(feed).toContain('visibilitychange');
  });

  it('gives the phone points a server-set arrival clock', () => {
    const seed = read('seeds/527_phone_points_two_clocks.sql');
    expect(seed).toContain('received_at');
    // Backfilled from created_at, not now(): now() would put the entire history inside "the last
    // hour" for an hour. And only NULLs, so a re-run cannot rewrite genuinely-late arrivals.
    expect(seed).toContain('WHERE received_at IS NULL');
  });
});

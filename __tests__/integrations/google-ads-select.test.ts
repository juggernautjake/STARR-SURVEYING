// __tests__/integrations/google-ads-select.test.ts — WHICH events become an upload. A8.
//
// This is the half of the nightly cron that can be wrong without producing an error. Uploading a
// conversion twice inflates the numbers Google bids on; dropping one deflates them. Both look like a
// successful run.
import { describe, it, expect } from 'vitest';
import { selectConversions, type SelectableEvent, type SelectableLead } from '@/lib/integrations/google-ads/select';
import { payloadHash } from '@/lib/integrations/google-ads/client';
import type { Milestone } from '@/lib/pipeline/events';

const RESOURCE = 'customers/1234567890/conversionActions/555';
const allConfigured = (): string | null => RESOURCE;

const ev = (over: Partial<SelectableEvent> = {}): SelectableEvent => ({
  id: 'evt-1',
  milestone: 'job_created' as Milestone,
  occurred_at: '2026-06-10T15:00:00.000Z',
  value_cents: 480_000,
  lead_id: 'lead-1',
  ...over,
});

const clicked = (over: Partial<SelectableLead> = {}): Map<string, SelectableLead> =>
  new Map([['lead-1', { gclid: 'Cj0-abc', first_seen_at: '2026-06-01T12:00:00.000Z', ...over }]]);

const run = (events: SelectableEvent[], leads = clicked(), uploadedKeys = new Set<string>(), resourceFor = allConfigured) =>
  selectConversions({ events, leads, uploadedKeys, resourceFor });

describe('selectConversions — the happy path', () => {
  it('builds a payload with the click, the action, the value in DOLLARS and our dedupe key', () => {
    const { payloads, eventIds } = run([ev()]);
    expect(payloads).toHaveLength(1);
    expect(payloads[0]).toMatchObject({
      gclid: 'Cj0-abc',
      conversionAction: RESOURCE,
      // Cents in our books, dollars on the wire. Sending 480000 would report a $480,000 survey.
      conversionValue: 4800,
      currencyCode: 'USD',
      orderId: 'job_created:evt-1',
    });
    // The log needs to know which event each payload came from, positionally.
    expect(eventIds).toEqual(['evt-1']);
  });

  it('formats the time the way A7 formats it — one formatter, not two', () => {
    // Two formatters eventually disagree about a timezone, and the same conversion shows up in Ads an
    // hour apart looking like a duplicate.
    expect(payloadsOf(run([ev()]))[0].conversionDateTime).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/);
  });

  it('carries gbraid and wbraid, not only gclid', () => {
    // iOS app and web-to-app traffic never carries a gclid. Handling only gclid quietly loses a whole
    // traffic class rather than failing.
    const gbraid = run([ev()], new Map([['lead-1', { gbraid: 'Gb-1', first_seen_at: '2026-06-01T12:00:00.000Z' }]]));
    expect(gbraid.payloads[0]).toMatchObject({ gbraid: 'Gb-1' });
    expect(gbraid.payloads[0].gclid).toBeUndefined();

    const wbraid = run([ev()], new Map([['lead-1', { wbraid: 'Wb-1', first_seen_at: '2026-06-01T12:00:00.000Z' }]]));
    expect(wbraid.payloads[0]).toMatchObject({ wbraid: 'Wb-1' });
  });

  it('omits the value entirely rather than sending 0 when there is none', () => {
    // A reported $0 conversion is a real, different claim from an unvalued one — it tells Smart Bidding
    // the job was worth nothing.
    const { payloads } = run([ev({ value_cents: null })]);
    expect(payloads[0]).not.toHaveProperty('conversionValue');
  });
});

function payloadsOf(sel: ReturnType<typeof selectConversions>) { return sel.payloads; }

describe('selectConversions — every skip is counted SEPARATELY', () => {
  it('counts an unconfigured conversion action', () => {
    // The only skip reason that is a mistake to fix rather than a fact to accept.
    const { payloads, skipped } = run([ev()], clicked(), new Set(), () => null);
    expect(payloads).toHaveLength(0);
    expect(skipped).toEqual({ noAction: 1, noClick: 0, outOfWindow: 0, alreadyUploaded: 0 });
  });

  it('counts a lead with no click id at all', () => {
    const { skipped } = run([ev()], new Map([['lead-1', { first_seen_at: '2026-06-01T12:00:00.000Z' }]]));
    expect(skipped.noClick).toBe(1);
  });

  it('counts an event whose lead row is missing entirely', () => {
    expect(run([ev()], new Map()).skipped.noClick).toBe(1);
    expect(run([ev({ lead_id: null })]).skipped.noClick).toBe(1);
  });

  it('counts a click older than the 90-day window', () => {
    // Google will reject it. Sending it anyway produces an error report someone has to interpret and
    // makes a good upload look broken.
    const stale = clicked({ first_seen_at: '2026-01-01T12:00:00.000Z' });
    const { payloads, skipped } = run([ev()], stale);
    expect(payloads).toHaveLength(0);
    expect(skipped.outOfWindow).toBe(1);
  });

  it('does not conflate the four reasons', () => {
    // "12 of 40 uploaded" is the start of an investigation, not a report.
    const resourceFor = (m: Milestone) => (m === 'quoted' ? null : RESOURCE);
    const leads = new Map<string, SelectableLead>([
      ['lead-1', { gclid: 'Cj0-abc', first_seen_at: '2026-06-01T12:00:00.000Z' }],
      ['lead-old', { gclid: 'Cj0-old', first_seen_at: '2026-01-01T12:00:00.000Z' }],
      ['lead-nc', { first_seen_at: '2026-06-01T12:00:00.000Z' }],
    ]);
    const { payloads, skipped } = selectConversions({
      events: [
        ev({ id: 'a' }),
        ev({ id: 'b', milestone: 'quoted' as Milestone }),
        ev({ id: 'c', lead_id: 'lead-old' }),
        ev({ id: 'd', lead_id: 'lead-nc' }),
      ],
      leads, uploadedKeys: new Set(), resourceFor,
    });
    expect(payloads).toHaveLength(1);
    expect(skipped).toEqual({ noAction: 1, noClick: 1, outOfWindow: 1, alreadyUploaded: 0 });
  });
});

describe('selectConversions — "again" versus "corrected"', () => {
  it('skips a payload that already landed identically', () => {
    const first = run([ev()]);
    const key = `evt-1:${payloadHash(first.payloads[0])}`;
    const second = run([ev()], clicked(), new Set([key]));
    expect(second.payloads).toHaveLength(0);
    expect(second.skipped.alreadyUploaded).toBe(1);
  });

  it('RE-SENDS the same event when its value changed — that is an adjustment, not a duplicate', () => {
    // The quote became a final amount. Keyed per-event this would be suppressed forever and Ads would
    // keep bidding on the estimate; keyed per-payload it goes as a restatement (A9).
    const first = run([ev()]);
    const key = `evt-1:${payloadHash(first.payloads[0])}`;
    const corrected = run([ev({ value_cents: 520_000 })], clicked(), new Set([key]));
    expect(corrected.payloads).toHaveLength(1);
    expect(corrected.payloads[0].conversionValue).toBe(5200);
    expect(corrected.skipped.alreadyUploaded).toBe(0);
  });

  it('keeps the order id stable across re-sends so Google can match them', () => {
    // Order ID is the dedupe key on Google's side; a new one per attempt would make an adjustment look
    // like a brand new conversion and double-count the job.
    expect(run([ev()]).payloads[0].orderId).toBe(run([ev({ value_cents: 999 })]).payloads[0].orderId);
  });
});

describe('selectConversions — nothing to do', () => {
  it('returns empty rather than throwing on no events', () => {
    const { payloads, eventIds, skipped } = run([]);
    expect(payloads).toHaveLength(0);
    expect(eventIds).toHaveLength(0);
    expect(skipped).toEqual({ noAction: 0, noClick: 0, outOfWindow: 0, alreadyUploaded: 0 });
  });

  it('keeps payloads and eventIds the same length, always', () => {
    // They are paired positionally by the log writer; a drift here would attribute Google's error text
    // to the wrong lead.
    const leads = new Map<string, SelectableLead>([
      ['lead-1', { gclid: 'Cj0-abc', first_seen_at: '2026-06-01T12:00:00.000Z' }],
      ['lead-nc', { first_seen_at: '2026-06-01T12:00:00.000Z' }],
    ]);
    const sel = selectConversions({
      events: [ev({ id: 'a' }), ev({ id: 'b', lead_id: 'lead-nc' }), ev({ id: 'c' })],
      leads, uploadedKeys: new Set(), resourceFor: allConfigured,
    });
    expect(sel.payloads.length).toBe(sel.eventIds.length);
    expect(sel.eventIds).toEqual(['a', 'c']);
  });
});

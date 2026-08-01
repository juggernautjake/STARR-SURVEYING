// __tests__/integrations/google-ads-client.test.ts — the Ads API upload path (A8).
//
// The module is inert until credentials arrive, so what can be tested is exactly the part that is
// hardest to test later: RESPONSE PARSING. `uploadClickConversions` with `partialFailure: true` returns
// **HTTP 200 with a body describing which rows were rejected** — a caller that checks only the status
// code sees success and has uploaded nothing. That is the default way this API disappoints people, and it
// is impossible to exercise against the live service without a token.
import { describe, it, expect } from 'vitest';
import {
  ADS_API_VERSION, CREDENTIAL_HELP, NEW_ACTION_WARMUP_HOURS,
  credentialProblem, isActionWarm, parseUploadResponse, payloadHash, type ClickConversion,
} from '@/lib/integrations/google-ads/client';

const conversion = (over: Partial<ClickConversion> = {}): ClickConversion => ({
  gclid: 'Cj0-abc',
  conversionAction: 'customers/123/conversionActions/456',
  conversionDateTime: '2026-03-12 10:04:05-05:00',
  conversionValue: 4800,
  orderId: 'job_created:jobs:abc',
  ...over,
});

describe('parseUploadResponse — a 200 is not success', () => {
  it('reports rows rejected inside a partialFailureError', () => {
    const body = {
      partialFailureError: {
        details: [{
          errors: [{
            errorCode: { conversionUploadError: 'EXPIRED_EVENT' },
            message: 'The click occurred too long ago.',
            location: { fieldPathElements: [{ fieldName: 'conversions', index: 1 }] },
          }],
        }],
      },
      results: [{ gclid: 'a' }, {}, { gclid: 'c' }],
    };
    const out = parseUploadResponse(body, 3);
    expect(out.attempted).toBe(3);
    // Rejected rows come back as EMPTY objects rather than being absent, so counting `results` is not
    // counting successes.
    expect(out.uploaded).toBe(2);
    expect(out.failures).toHaveLength(1);
    expect(out.failures[0]).toMatchObject({ index: 1, code: 'EXPIRED_EVENT' });
  });

  it('keeps GOOGLE\'S OWN error text, not a paraphrase', () => {
    // A paraphrased error is a support ticket: the operator cannot search for it, and Google's own words
    // are what the help pages are written against.
    const body = {
      partialFailureError: { details: [{ errors: [{
        errorCode: { conversionUploadError: 'UNPARSEABLE_GCLID' },
        message: 'The gclid is malformed.',
        location: { fieldPathElements: [{ fieldName: 'conversions', index: 0 }] },
      }] }] },
      results: [{}],
    };
    expect(parseUploadResponse(body, 1).failures[0].message).toBe('The gclid is malformed.');
  });

  it('treats a clean response as all uploaded', () => {
    const out = parseUploadResponse({ results: [{ gclid: 'a' }, { gclid: 'b' }] }, 2);
    expect(out.uploaded).toBe(2);
    expect(out.failures).toHaveLength(0);
  });

  it('falls back to attempted-minus-failures when results are absent', () => {
    const out = parseUploadResponse({ partialFailureError: { details: [{ errors: [{
      errorCode: { conversionUploadError: 'X' }, message: 'm', location: { fieldPathElements: [{ index: 0 }] },
    }] }] } }, 5);
    expect(out.uploaded).toBe(4);
  });

  it('survives a shape it does not recognise instead of throwing', () => {
    // A parser that throws on an unexpected body turns a partial upload into a crashed cron.
    for (const body of [null, undefined, {}, { results: null }, { partialFailureError: {} }]) {
      expect(() => parseUploadResponse(body, 1)).not.toThrow();
    }
    expect(parseUploadResponse(null, 1).uploaded).toBe(1);
  });

  it('reports index -1 rather than 0 when Google does not say which row', () => {
    // Defaulting to 0 would blame the first conversion for someone else's failure.
    const out = parseUploadResponse({ partialFailureError: { details: [{ errors: [{
      errorCode: { conversionUploadError: 'INTERNAL' }, message: 'boom',
    }] }] }, results: [{}] }, 1);
    expect(out.failures[0].index).toBe(-1);
  });
});

describe('credentials — say WHICH piece is missing', () => {
  it('names the missing developer token first', () => {
    const before = { dev: process.env.GOOGLE_ADS_DEVELOPER_TOKEN, cust: process.env.GOOGLE_ADS_CUSTOMER_ID };
    delete process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
    delete process.env.GOOGLE_ADS_CUSTOMER_ID;
    expect(credentialProblem()).toBe('missing-developer-token');

    process.env.GOOGLE_ADS_DEVELOPER_TOKEN = 'test-token';
    expect(credentialProblem()).toBe('missing-customer-id');

    process.env.GOOGLE_ADS_CUSTOMER_ID = '1234567890';
    expect(credentialProblem()).toBeNull();

    // Restore, because env is process-global and a later test file would inherit it.
    if (before.dev === undefined) delete process.env.GOOGLE_ADS_DEVELOPER_TOKEN; else process.env.GOOGLE_ADS_DEVELOPER_TOKEN = before.dev;
    if (before.cust === undefined) delete process.env.GOOGLE_ADS_CUSTOMER_ID; else process.env.GOOGLE_ADS_CUSTOMER_ID = before.cust;
  });

  it('has actionable help for every problem, not just a code', () => {
    // These are read by whoever is trying to turn the integration on. "not-connected" alone helps nobody.
    for (const [key, help] of Object.entries(CREDENTIAL_HELP)) {
      expect(help.length, key).toBeGreaterThan(40);
    }
    expect(CREDENTIAL_HELP['missing-developer-token']).toMatch(/API Center/);
    expect(CREDENTIAL_HELP['refresh-failed']).toMatch(/[Rr]econnect/);
  });
});

describe('payloadHash — "again" versus "corrected"', () => {
  it('is stable for an identical payload', () => {
    expect(payloadHash(conversion())).toBe(payloadHash(conversion()));
  });

  it('CHANGES when the value changes', () => {
    // This is what lets a retry tell a pointless re-send from a genuine adjustment (A9).
    expect(payloadHash(conversion())).not.toBe(payloadHash(conversion({ conversionValue: 5200 })));
  });

  it('changes when the time or the click changes', () => {
    expect(payloadHash(conversion())).not.toBe(payloadHash(conversion({ conversionDateTime: '2026-03-13 10:04:05-05:00' })));
    expect(payloadHash(conversion())).not.toBe(payloadHash(conversion({ gclid: 'other' })));
  });
});

describe('the API version is pinned', () => {
  it('is an explicit version, never "latest"', () => {
    // An un-pinned version silently changes payload shape under you. Reviewing a bump should be a
    // decision, not a surprise.
    expect(ADS_API_VERSION).toMatch(/^v\d+$/);
  });
});

describe('isActionWarm — the 4-6 hour rule governs the ACTION, not the click', () => {
  const now = Date.parse('2026-08-01T12:00:00.000Z');

  it('is cold for a newly created action', () => {
    expect(NEW_ACTION_WARMUP_HOURS).toBe(6);
    expect(isActionWarm('2026-08-01T09:00:00.000Z', now)).toBe(false);
  });

  it('is warm once the window has passed', () => {
    expect(isActionWarm('2026-08-01T05:00:00.000Z', now)).toBe(true);
  });

  it('assumes WARM when the age is unknown, rather than blocking uploads', () => {
    // Most actions are established. Treating "unknown" as cold would stop a working integration for a
    // fact we simply do not record.
    expect(isActionWarm(null, now)).toBe(true);
    expect(isActionWarm('nonsense', now)).toBe(true);
  });
});

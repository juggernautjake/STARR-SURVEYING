// __tests__/integrations/google-ads-client.test.ts — the Ads API upload path (A8).
//
// The module is inert until credentials arrive, so what can be tested is exactly the part that is
// hardest to test later: RESPONSE PARSING. `uploadClickConversions` with `partialFailure: true` returns
// **HTTP 200 with a body describing which rows were rejected** — a caller that checks only the status
// code sees success and has uploaded nothing. That is the default way this API disappoints people, and it
// is impossible to exercise against the live service without a token.
import { describe, it, expect } from 'vitest';
import {
  ADS_API_VERSION, CONVERSION_ACTION_ENV, CREDENTIAL_HELP, NEW_ACTION_WARMUP_HOURS,
  conversionActionStatus, credentialProblem, isActionWarm, parseUploadResponse, payloadHash,
  type ClickConversion,
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
  /** Env is process-global; a leaked variable changes a later test file's answers. */
  const ENV_KEYS = [
    'GOOGLE_ADS_DEVELOPER_TOKEN', 'GOOGLE_ADS_CUSTOMER_ID',
    'GOOGLE_ADS_RESOURCE_INQUIRY', 'GOOGLE_ADS_RESOURCE_QUOTED',
    'GOOGLE_ADS_RESOURCE_JOB_WON', 'GOOGLE_ADS_RESOURCE_JOB_PAID',
  ];
  function withCleanEnv(fn: () => void) {
    const before: Record<string, string | undefined> = {};
    for (const k of ENV_KEYS) { before[k] = process.env[k]; delete process.env[k]; }
    try { fn(); } finally {
      for (const k of ENV_KEYS) {
        if (before[k] === undefined) delete process.env[k];
        else process.env[k] = before[k];
      }
    }
  }

  it('names each missing piece in the order it has to be fixed', () => {
    withCleanEnv(() => {
      expect(credentialProblem()).toBe('missing-developer-token');

      process.env.GOOGLE_ADS_DEVELOPER_TOKEN = 'test-token';
      expect(credentialProblem()).toBe('missing-customer-id');

      // 2026-08-06 — this used to return null here, and that was the bug. With the token and the
      // customer id set the admin screen said "connected" and the nightly job reported success,
      // while `selectConversions` skipped EVERY event for want of a conversion action. An upload
      // job whose entire output is skips must not look healthy.
      process.env.GOOGLE_ADS_CUSTOMER_ID = '1234567890';
      expect(credentialProblem()).toBe('missing-conversion-actions');

      process.env.GOOGLE_ADS_RESOURCE_INQUIRY = 'customers/1234567890/conversionActions/1';
      expect(credentialProblem()).toBeNull();
    });
  });

  it('reports partial conversion-action config rather than treating it as fine', () => {
    // The dangerous middle state: one action configured, three not. Nothing errors, the job
    // succeeds, and Google is told about leads but never told any of them got paid — so
    // value-based bidding is trained on the cheapest milestone only.
    withCleanEnv(() => {
      process.env.GOOGLE_ADS_RESOURCE_INQUIRY = 'customers/1/conversionActions/1';
      process.env.GOOGLE_ADS_RESOURCE_JOB_PAID = 'customers/1/conversionActions/4';

      const status = conversionActionStatus();
      expect(status.configured).toEqual(['inquiry_received', 'payment_received']);
      expect(status.missing).toEqual(['quoted', 'job_created']);
    });
  });

  it('every milestone the cron can upload has a variable naming its action', () => {
    // The mapping in the cron route and the check here must cover the same milestones. One added to
    // the route and not to `CONVERSION_ACTION_ENV` is a milestone that silently never uploads and
    // never appears as missing either.
    expect(Object.keys(CONVERSION_ACTION_ENV).sort()).toEqual(
      ['inquiry_received', 'job_created', 'payment_received', 'quoted'],
    );
  });

  it('the new problem has help text that names what to do', () => {
    expect(CREDENTIAL_HELP['missing-conversion-actions']).toMatch(/GOOGLE_ADS_RESOURCE_INQUIRY/);
    expect(CREDENTIAL_HELP['missing-conversion-actions']).toMatch(/resource/i);
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

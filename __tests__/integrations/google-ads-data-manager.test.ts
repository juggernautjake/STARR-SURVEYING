// Offline conversions on the Data Manager API — the only path open to this account.
//
// Measured 2026-08-16: with the permission problem fixed, `ConversionUploadService` returned 200 and
// rejected the row — *"New integrations for uploading click conversions should use the Data Manager
// API. Usage of ConversionUploadService.UploadClickConversions is limited to existing users."*
//
// Field shapes read off Google's own upgrade guide the same day. The three worth a test each are the
// three that fail SILENTLY when wrong: a resource name where a numeric id belongs (files against the
// wrong conversion action, or nothing), micros where currency units belong (a $5.23 job reported as
// $5,230,000), and the Ads timestamp format where RFC 3339 belongs (differs by one character).

import { describe, it, expect } from 'vitest';
import {
  DATA_MANAGER_ENDPOINT, DATA_MANAGER_SCOPE,
  buildIngestRequest, conversionActionId, isScopeProblem, toRfc3339,
} from '@/lib/integrations/google-ads/data-manager';

const base = {
  conversionAction: 'customers/7071902603/conversionActions/7712337565',
  conversionDateTime: '2026-08-16 14:35:00-05:00',
  orderId: 'lead-1',
  gclid: 'Cj0KCQ-example',
};

describe('the endpoint and scope are the documented ones', () => {
  it('posts to events:ingest on datamanager.googleapis.com', () => {
    expect(DATA_MANAGER_ENDPOINT).toBe('https://datamanager.googleapis.com/v1/events:ingest');
  });

  it('and the scope is NOT the adwords one', () => {
    // "The Data Manager API requires credentials with a different scope than the Google Ads API."
    expect(DATA_MANAGER_SCOPE).toBe('https://www.googleapis.com/auth/datamanager');
    expect(DATA_MANAGER_SCOPE).not.toContain('adwords');
  });
});

describe('conversionActionId — a resource name is not a destination id', () => {
  it('takes the numeric id out of a resource name', () => {
    // Google: "Set to the numeric ID of the conversion action. Don't use the resource name."
    expect(conversionActionId('customers/7071902603/conversionActions/7712337565')).toBe('7712337565');
  });

  it('passes a bare numeric id through, so either env format works', () => {
    expect(conversionActionId('7712337565')).toBe('7712337565');
  });

  it('returns null rather than guessing', () => {
    // A wrong destination id does not error — it files the conversion against somebody else's action.
    for (const bad of ['Lead - Inquiry', 'customers/123/conversionActions/', '', null, undefined]) {
      expect(conversionActionId(bad), String(bad)).toBeNull();
    }
  });
});

describe('toRfc3339 — the two formats differ by one character', () => {
  it('converts the Ads API format', () => {
    expect(toRfc3339('2026-08-16 14:35:00-05:00')).toBe('2026-08-16T14:35:00-05:00');
  });

  it('leaves an already-RFC-3339 value alone', () => {
    expect(toRfc3339('2026-08-16T14:35:00-05:00')).toBe('2026-08-16T14:35:00-05:00');
  });
});

describe('buildIngestRequest', () => {
  const dest = { operatingAccountId: '7071902603' };

  it('names the operating account as a GOOGLE_ADS account', () => {
    const { request } = buildIngestRequest([base], dest);
    expect(request.destinations[0]).toMatchObject({
      operatingAccount: { accountType: 'GOOGLE_ADS', accountId: '7071902603' },
      productDestinationId: '7712337565',
    });
  });

  it('puts the value in CURRENCY UNITS, not micros', () => {
    const { request } = buildIngestRequest([{ ...base, conversionValue: 5.23 }], dest);
    expect(request.events[0].conversionValue).toBe(5.23);
    expect(request.events[0].currency).toBe('USD');
  });

  it('omits the value entirely when there is none', () => {
    // Sending 0 asserts the job was worth nothing, which is a different claim from "not priced yet".
    const { request } = buildIngestRequest([base], dest);
    expect('conversionValue' in (request.events[0] as object)).toBe(false);
  });

  it('maps orderId to transactionId, which is what makes a re-upload an update', () => {
    const { request } = buildIngestRequest([base], dest);
    expect(request.events[0].transactionId).toBe('lead-1');
  });

  it('carries whichever click id is present, and no empty ones', () => {
    const { request } = buildIngestRequest([{ ...base, gclid: null, wbraid: 'W-1' }], dest);
    expect(request.events[0].adIdentifiers).toEqual({ wbraid: 'W-1' });
  });

  it('makes ONE destination per conversion action, not one for the batch', () => {
    // productDestinationId lives on the destination, so a single destination would file every event
    // against one action — quietly turning "Job - Paid" into "Lead - Inquiry".
    const { request } = buildIngestRequest([
      base,
      { ...base, orderId: 'job-1', conversionAction: 'customers/7071902603/conversionActions/7712337574' },
    ], dest);
    expect(request.destinations).toHaveLength(2);
    expect(new Set(request.destinations.map((d) => d.productDestinationId)))
      .toEqual(new Set(['7712337565', '7712337574']));
    // and each event points at its own destination
    const refs = request.events.map((e) => (e.destinationReferences as string[])[0]);
    expect(new Set(refs).size).toBe(2);
  });

  it('reports unresolvable rows WITH their index instead of dropping them', () => {
    // A conversion that vanishes between our table and Google is this integration's signature bug.
    const { request, unresolved } = buildIngestRequest(
      [base, { ...base, orderId: 'bad', conversionAction: 'Lead - Inquiry' }], dest);
    expect(request.events).toHaveLength(1);
    expect(unresolved).toHaveLength(1);
    expect(unresolved[0].index).toBe(1);
    expect(unresolved[0].conversion.orderId).toBe('bad');
  });

  it('passes validateOnly through, so a live check creates nothing', () => {
    const { request } = buildIngestRequest([base], dest, { validateOnly: true });
    expect(request.validateOnly).toBe(true);
    expect(buildIngestRequest([base], dest).request.validateOnly).toBeUndefined();
  });
});

describe('loginAccount — the field that broke this integration for nine days', () => {
  it('is omitted when no login account is configured', () => {
    const { request } = buildIngestRequest([base], { operatingAccountId: '7071902603' });
    expect('loginAccount' in (request.destinations[0] as object)).toBe(false);
  });

  it('is REFUSED when it equals the operating account — a manager that is itself is not a manager', () => {
    // This is the exact shape the broken GOOGLE_ADS_LOGIN_CUSTOMER_ID had: manager 7539170249
    // managed only itself, and every call was answered USER_PERMISSION_DENIED.
    const { request } = buildIngestRequest([base], {
      operatingAccountId: '7071902603', loginAccountId: '7071902603',
    });
    expect('loginAccount' in (request.destinations[0] as object)).toBe(false);
  });

  it('is sent when a genuinely different manager is configured', () => {
    const { request } = buildIngestRequest([base], {
      operatingAccountId: '7071902603', loginAccountId: '123-456-7890',
    });
    expect(request.destinations[0].loginAccount).toEqual({ accountType: 'GOOGLE_ADS', accountId: '1234567890' });
  });
});

describe('isScopeProblem — "not set up yet" is not "broken"', () => {
  it('recognises the states a person can fix by reconnecting or enabling the API', () => {
    for (const m of [
      'Request had insufficient authentication scopes.',
      'ACCESS_TOKEN_SCOPE_INSUFFICIENT',
      'Data Manager API has not been used in project 123 before or it is disabled',
      'PERMISSION_DENIED',
    ]) expect(isScopeProblem(m), m).toBe(true);
  });

  it('does not swallow a real rejection as "not set up"', () => {
    // Falling back to the closed API on a real error would upload the same conversions twice.
    for (const m of ['INVALID_ARGUMENT: transactionId is required', 'Quota exceeded']) {
      expect(isScopeProblem(m), m).toBe(false);
    }
  });
});

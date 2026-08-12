// lib/integrations/google-ads/access-level.ts — "are we Basic-access verified?" A6.
//
// Owner, 2026-08-11: *"I think we should be google ad basic verified or whatever it is. Please
// check."*
//
// ── WHY THIS IS A PROBE AND NOT A LOOKUP ────────────────────────────────────────────────────────
//
// The answer is not in this repo and not in an environment variable. Google's developer-token
// approval state lives in the Ads console, and there is no API that reports "your token has Basic
// access" — the ONLY way to know is to make a call and read which way it fails.
//
// So the question gets answered empirically, and the classification is the whole value: an
// unapproved token, a wrong customer id, and an unlinked account all look like "it did not work"
// to somebody staring at a dashboard, and each needs a completely different fix.
//
// ── THE STATES ARE DELIBERATELY DISTINGUISHED ───────────────────────────────────────────────────
//
//   working              — the query returned. Whatever level the token has, it is enough.
//   test-access-only     — DEVELOPER_TOKEN_NOT_APPROVED. The token works against test accounts and
//                          is refused against this real one. THIS is the "not Basic yet" answer.
//   token-not-configured — no developer token at all.
//   not-connected        — no OAuth refresh token; nobody has linked the Ads account.
//   wrong-customer       — the id is not an account this login can reach.
//   unknown              — something else. Reported verbatim rather than guessed at.

import { ADS_API_VERSION, CREDENTIAL_HELP, credentialProblem, runReportQuery } from './client';

export type AdsAccessState =
  | 'working'
  | 'test-access-only'
  | 'token-not-configured'
  | 'not-connected'
  | 'wrong-customer'
  | 'unknown';

export interface AdsAccessReport {
  state: AdsAccessState;
  /** One line for the page. Written for somebody who has not read Google's docs. */
  summary: string;
  /** What to do next. Empty when the answer is "nothing — it works". */
  action: string;
  /** Google's own message, kept verbatim. A classifier that hides the raw error is impossible to
   *  debug when it guesses wrong. */
  raw?: string;
}

/** The cheapest legitimate query: one field, one row. Enough to make Google authenticate the token
 *  against the real account, which is the only thing being asked. */
const PROBE_QUERY = 'SELECT customer.id FROM customer LIMIT 1';

export async function checkAdsAccess(): Promise<AdsAccessReport> {
  const problem = credentialProblem();
  if (problem === 'missing-developer-token') {
    return {
      state: 'token-not-configured',
      summary: 'No Google Ads developer token is configured on this deployment.',
      action: 'Apply for one in the Ads account under Tools → API Center, then set GOOGLE_ADS_DEVELOPER_TOKEN.',
    };
  }
  if (problem) {
    return {
      state: 'unknown',
      summary: CREDENTIAL_HELP[problem],
      action: 'Set the missing configuration, then check again.',
    };
  }

  const result = await runReportQuery(PROBE_QUERY);
  if (!('error' in result)) {
    return {
      state: 'working',
      summary: 'Connected. The developer token is approved for this account, so live reporting works.',
      action: '',
    };
  }

  const err = result.error;
  const upper = err.toUpperCase();

  // The answer the owner actually asked for. Google returns this specific code when a token that
  // only has Test access is pointed at a production account.
  if (upper.includes('DEVELOPER_TOKEN_NOT_APPROVED') || upper.includes('NOT_APPROVED')) {
    return {
      state: 'test-access-only',
      summary:
        'The developer token still has TEST access — it works against Google test accounts but is '
        + 'refused against this real one. So we are not Basic-access approved yet.',
      action:
        'Chase the Basic Access application in the Ads console (Tools → API Center). Until it is '
        + 'approved, spend and conversion figures here come from the manual entries, not the API.',
      raw: err,
    };
  }

  if (upper.includes('DEVELOPER_TOKEN_PROHIBITED')) {
    return {
      state: 'test-access-only',
      summary: 'Google has refused this developer token for this account outright.',
      action: 'Check the token belongs to the manager account that owns this customer id.',
      raw: err,
    };
  }

  // `getAccessToken` returns this help text when no refresh token has been stored — i.e. nobody has
  // ever completed the OAuth consent flow.
  if (err === CREDENTIAL_HELP['not-connected'] || upper.includes('NOT-CONNECTED') || upper.includes('INVALID_GRANT')) {
    return {
      state: 'not-connected',
      summary: 'Nobody has linked the Google Ads account yet, so there is no permission to read it.',
      action: 'Use "Connect Google Ads" and sign in with an account that can see the ad account.',
      raw: err,
    };
  }

  // Found by probing the live account on 2026-08-11, and worth its own state because the fix is
  // the opposite of what the message suggests. Google says "the caller does not have permission",
  // which reads as an account problem — but the same query with the `login-customer-id` header
  // REMOVED returned 200 with real data. A login-customer-id that is not a manager of the target
  // account turns a working connection into a permission error.
  if (upper.includes('USER_PERMISSION_DENIED') && process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID) {
    return {
      state: 'wrong-customer',
      summary:
        'Google refused the request, and the likely cause is GOOGLE_ADS_LOGIN_CUSTOMER_ID: that '
        + 'header is only for a manager account that owns the target customer. When it names an '
        + 'account that does not manage this one, an otherwise working connection is refused.',
      action:
        'Unset GOOGLE_ADS_LOGIN_CUSTOMER_ID unless the ad account really sits under that manager '
        + 'account, then check again.',
      raw: err,
    };
  }

  if (upper.includes('CUSTOMER_NOT_FOUND') || upper.includes('USER_PERMISSION_DENIED')) {
    return {
      state: 'wrong-customer',
      summary: 'The configured customer id is not an account this login can reach.',
      action: 'Check GOOGLE_ADS_CUSTOMER_ID against the 10-digit number in the Ads UI, and set GOOGLE_ADS_LOGIN_CUSTOMER_ID only if it is under a manager account.',
      raw: err,
    };
  }

  // The failure that had been live in production and that nothing recognised: the pinned API
  // version expired. Retired versions 404 with an HTML page; deprecated-but-present ones return
  // UNSUPPORTED_VERSION. Both mean the same thing to whoever has to fix it.
  if (upper.includes('UNSUPPORTED_VERSION') || upper.includes('<!DOCTYPE HTML') || upper.includes('ERROR 404')) {
    return {
      state: 'unknown',
      summary:
        `The Google Ads API version this app calls (${ADS_API_VERSION}) has been retired by Google, `
        + 'so every request fails before credentials are even considered.',
      action: 'Bump ADS_API_VERSION in lib/integrations/google-ads/client.ts to the current version.',
      raw: err,
    };
  }

  return {
    state: 'unknown',
    summary: 'Google refused the request for a reason this check does not recognise.',
    action: 'The exact message is below — it is the thing to search for.',
    raw: err,
  };
}

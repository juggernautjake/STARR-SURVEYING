// lib/integrations/google-ads/client.ts — the Ads API upload path. A8.
//
// **Built now, inert until credentials arrive.** Owner, 2026-08-01: *"make google integration prepared and
// we will track our ad campaign tokens when we get them."* Every function here refuses cleanly and says
// exactly what is missing rather than throwing an opaque error — because the day someone pastes a
// developer token in, the useful message is "connect an Ads account", not `TypeError: undefined`.
//
// A7's CSV path exists precisely so nothing was blocked waiting for this.
//
// ── THE OAUTH SHAPE IS COPIED, NOT INVENTED ─────────────────────────────────────────────────────────
//
// `lib/integrations/google-calendar.ts` already does refresh-token OAuth against Google in this codebase,
// with bare `fetch` and no SDK, and it works. The plan says to copy it and not invent a second one, and
// that is right: two subtly different token stores are two places to get refresh-expiry wrong, and the
// one that breaks is always the one nobody has looked at in six months.
//
// ── partial_failure IS THE WHOLE REASON THIS IS CAREFUL ─────────────────────────────────────────────
//
// `uploadClickConversions` with `partialFailure: true` returns **HTTP 200 with a body describing which
// rows were rejected**. A caller that checks only the status code sees success and moves on, having
// uploaded nothing. That is not a hypothetical: it is the default way this API disappoints people.
//
// So the response parser treats `partialFailureError` as a first-class outcome, records Google's own
// error text per row, and reports how many actually landed — never "ok".

import { supabaseAdmin } from '@/lib/supabase';
import crypto from 'node:crypto';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
/** Pinned deliberately. Google Ads is a versioned API and an un-pinned "latest" silently changes payload
 *  shape under you; the version is a thing to review on purpose, not to drift. */
export const ADS_API_VERSION = 'v18';
export const ADS_SCOPE = 'https://www.googleapis.com/auth/adwords';

export interface AdsCredentials {
  developerToken: string;
  customerId: string;
  loginCustomerId?: string | null;
  accessToken: string;
}

export type CredentialProblem =
  | 'missing-developer-token'
  | 'missing-customer-id'
  | 'missing-conversion-actions'
  | 'not-connected'
  | 'refresh-failed';

/** Human-readable, because these are read by whoever is trying to turn it on. */
export const CREDENTIAL_HELP: Record<CredentialProblem, string> = {
  'missing-developer-token':
    'No GOOGLE_ADS_DEVELOPER_TOKEN. Apply for one in the Ads account under Tools → API Center; approval takes a few days.',
  'missing-customer-id':
    'No GOOGLE_ADS_CUSTOMER_ID. It is the 10-digit number at the top right of the Ads UI, without dashes.',
  'missing-conversion-actions':
    'No conversion actions configured. Create them in Google Ads under Goals → Conversions (Import → Manual/API), then set '
    + 'GOOGLE_ADS_RESOURCE_INQUIRY / _QUOTED / _JOB_WON / _JOB_PAID to their RESOURCE names '
    + '(customers/…/conversionActions/…), not their display names.',
  'not-connected':
    'No Google Ads account has been connected yet — nothing has authorised this app to upload on its behalf.',
  'refresh-failed':
    'The stored refresh token was rejected. Reconnect the Ads account; a refresh token is revoked when the password changes or access is withdrawn.',
};

/** The four milestones that can be reported to Ads, and the variable naming each one's action.
 *
 *  Kept beside `credentialProblem` rather than in the cron route so the check and the mapping cannot
 *  drift — a milestone added to one and not the other is a milestone that silently never uploads. */
export const CONVERSION_ACTION_ENV = {
  inquiry_received: 'GOOGLE_ADS_RESOURCE_INQUIRY',
  quoted: 'GOOGLE_ADS_RESOURCE_QUOTED',
  job_created: 'GOOGLE_ADS_RESOURCE_JOB_WON',
  payment_received: 'GOOGLE_ADS_RESOURCE_JOB_PAID',
} as const;

/** Which milestones are configured and which are not.
 *
 *  ── WHY THIS IS SEPARATE FROM `credentialProblem` (2026-08-06) ──────────────────────────────────
 *
 *  PARTIAL configuration is the dangerous state, and it is not an error. With the token, the customer
 *  id and OAuth all present, the admin screen said "connected" and the nightly job reported success —
 *  while `selectConversions` skipped every event whose milestone had no resource name, counting them
 *  into `skipped.noAction`, which was surfaced nowhere. Set only `_INQUIRY` and the account learns
 *  about leads and never hears that any of them became paid work, which is precisely the value-based
 *  bidding the whole pipeline exists to feed.
 *
 *  So: none configured is a hard problem, some configured is a warning worth naming, and the screen
 *  gets told which is which. */
export function conversionActionStatus(): {
  configured: string[];
  missing: string[];
} {
  const configured: string[] = [];
  const missing: string[] = [];
  for (const [milestone, key] of Object.entries(CONVERSION_ACTION_ENV)) {
    if (process.env[key]) configured.push(milestone);
    else missing.push(milestone);
  }
  return { configured, missing };
}

/** Are we able to upload at all? Returns the SPECIFIC missing piece, so the admin screen can say which. */
export function credentialProblem(): CredentialProblem | null {
  if (!process.env.GOOGLE_ADS_DEVELOPER_TOKEN) return 'missing-developer-token';
  if (!process.env.GOOGLE_ADS_CUSTOMER_ID) return 'missing-customer-id';
  // Every upload names a conversion action. With none configured there is nothing to send an event
  // AS, so the job would run, skip all of its work, and report a clean success.
  if (conversionActionStatus().configured.length === 0) return 'missing-conversion-actions';
  return null;
}

interface ConnectionRow {
  customer_id: string;
  login_customer_id: string | null;
  access_token: string | null;
  refresh_token: string | null;
  token_expires_at: string | null;
}

/**
 * A usable access token, refreshing when it has expired.
 *
 * Sixty seconds of slack on the expiry: a token that expires "in ten seconds" will expire mid-request,
 * and the failure looks like an auth problem rather than a timing one.
 */
export async function getAccessToken(): Promise<{ token: string } | { error: CredentialProblem }> {
  const { data } = await supabaseAdmin
    .from('google_ads_connections')
    .select('customer_id, login_customer_id, access_token, refresh_token, token_expires_at')
    .limit(1)
    .maybeSingle();

  const conn = data as ConnectionRow | null;
  if (!conn?.refresh_token) return { error: 'not-connected' };

  const expiresAt = conn.token_expires_at ? Date.parse(conn.token_expires_at) : 0;
  if (conn.access_token && expiresAt > Date.now() + 60_000) return { token: conn.access_token };

  try {
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID ?? '',
        client_secret: process.env.GOOGLE_CLIENT_SECRET ?? '',
        refresh_token: conn.refresh_token,
        grant_type: 'refresh_token',
      }),
    });
    if (!res.ok) return { error: 'refresh-failed' };
    const json = await res.json() as { access_token?: string; expires_in?: number };
    if (!json.access_token) return { error: 'refresh-failed' };

    await supabaseAdmin
      .from('google_ads_connections')
      .update({
        access_token: json.access_token,
        token_expires_at: new Date(Date.now() + (json.expires_in ?? 3600) * 1000).toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('customer_id', conn.customer_id);

    return { token: json.access_token };
  } catch {
    return { error: 'refresh-failed' };
  }
}

export interface ClickConversion {
  /** One of gclid/gbraid/wbraid. */
  gclid?: string;
  gbraid?: string;
  wbraid?: string;
  /** The Ads resource name of the conversion action. */
  conversionAction: string;
  /** `YYYY-MM-DD HH:MM:SS±HH:MM` — the same format A7's CSV uses, from the same formatter. */
  conversionDateTime: string;
  conversionValue?: number;
  currencyCode?: string;
  /** Our lifecycle dedupe key. Google uses it to ignore a re-send. */
  orderId: string;
}

/** A stable fingerprint of what we sent, so a retry can tell "again" from "corrected". */
export function payloadHash(c: ClickConversion): string {
  const canonical = JSON.stringify({
    id: c.gclid ?? c.gbraid ?? c.wbraid ?? '',
    a: c.conversionAction,
    t: c.conversionDateTime,
    v: c.conversionValue ?? 0,
    o: c.orderId,
  });
  return crypto.createHash('sha256').update(canonical).digest('hex').slice(0, 32);
}

export interface UploadOutcome {
  attempted: number;
  uploaded: number;
  failures: Array<{ index: number; code: string; message: string }>;
  /** Set when the whole request failed, as opposed to individual rows. */
  fatal?: string;
}

/**
 * Parse the response. EXPORTED AND PURE, because this is the part that is easy to get wrong and
 * impossible to test against the live API without a token.
 *
 * `partialFailureError` arrives inside an HTTP 200. Its `details` carry a `GoogleAdsFailure` whose
 * `errors[].location.fieldPathElements` name the failing row index — which is the only way to say WHICH
 * conversion was rejected rather than "some of them".
 */
export function parseUploadResponse(body: unknown, attempted: number): UploadOutcome {
  const failures: UploadOutcome['failures'] = [];
  const b = body as {
    partialFailureError?: { details?: Array<{ errors?: Array<Record<string, unknown>> }>; message?: string };
    results?: unknown[];
  } | null;

  const details = b?.partialFailureError?.details ?? [];
  for (const detail of details) {
    for (const err of detail.errors ?? []) {
      const location = err.location as { fieldPathElements?: Array<{ fieldName?: string; index?: number }> } | undefined;
      const idx = location?.fieldPathElements?.find((f) => typeof f.index === 'number')?.index ?? -1;
      const errorCode = err.errorCode as Record<string, string> | undefined;
      failures.push({
        index: idx,
        // The error code is a single-key object like `{ conversionUploadError: 'EXPIRED_EVENT' }`.
        code: errorCode ? Object.values(errorCode)[0] ?? 'UNKNOWN' : 'UNKNOWN',
        // GOOGLE'S OWN WORDS. A paraphrase here is a support ticket later.
        message: String(err.message ?? 'No message'),
      });
    }
  }

  // `results` contains one entry per row; rejected rows come back EMPTY rather than absent, so counting
  // the array is not the same as counting successes.
  const results = Array.isArray(b?.results) ? b!.results! : [];
  const succeeded = results.filter((r) => r && typeof r === 'object' && Object.keys(r).length > 0).length;

  return {
    attempted,
    // Prefer the observed successes; fall back to attempted-minus-failures when `results` is absent.
    uploaded: results.length ? succeeded : Math.max(0, attempted - failures.length),
    failures,
  };
}

/**
 * Upload conversions. Returns an outcome; never throws.
 *
 * `partialFailure: true` is not optional — without it, ONE bad row rejects the entire batch, which for a
 * nightly job means a single expired click costs you the night's conversions.
 */
export async function uploadClickConversions(conversions: ClickConversion[]): Promise<UploadOutcome> {
  if (!conversions.length) return { attempted: 0, uploaded: 0, failures: [] };

  const problem = credentialProblem();
  if (problem) return { attempted: conversions.length, uploaded: 0, failures: [], fatal: CREDENTIAL_HELP[problem] };

  const auth = await getAccessToken();
  if ('error' in auth) {
    return { attempted: conversions.length, uploaded: 0, failures: [], fatal: CREDENTIAL_HELP[auth.error] };
  }

  const customerId = (process.env.GOOGLE_ADS_CUSTOMER_ID ?? '').replace(/\D/g, '');
  const url = `https://googleads.googleapis.com/${ADS_API_VERSION}/customers/${customerId}:uploadClickConversions`;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${auth.token}`,
        'developer-token': process.env.GOOGLE_ADS_DEVELOPER_TOKEN ?? '',
        ...(process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID
          ? { 'login-customer-id': process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID.replace(/\D/g, '') }
          : {}),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        conversions: conversions.map((c) => ({
          ...(c.gclid ? { gclid: c.gclid } : {}),
          ...(c.gbraid ? { gbraid: c.gbraid } : {}),
          ...(c.wbraid ? { wbraid: c.wbraid } : {}),
          conversionAction: c.conversionAction,
          conversionDateTime: c.conversionDateTime,
          ...(typeof c.conversionValue === 'number' ? { conversionValue: c.conversionValue } : {}),
          currencyCode: c.currencyCode ?? 'USD',
          orderId: c.orderId,
        })),
        // See the doc comment. One bad row must not cost the whole night.
        partialFailure: true,
      }),
    });

    const body = await res.json().catch(() => null);
    if (!res.ok) {
      const message = (body as { error?: { message?: string } } | null)?.error?.message ?? `HTTP ${res.status}`;
      return { attempted: conversions.length, uploaded: 0, failures: [], fatal: message };
    }
    return parseUploadResponse(body, conversions.length);
  } catch (e) {
    return {
      attempted: conversions.length,
      uploaded: 0,
      failures: [],
      fatal: e instanceof Error ? e.message : 'Upload failed',
    };
  }
}

// ── ADJUSTMENTS (A9) ────────────────────────────────────────────────────────────────────────────────
//
// Read off `developers.google.com/google-ads/api/docs/conversions/upload-adjustments` on **2026-08-01**,
// quoting the requirements that shape this code:
//
//   • *"You must specify the order_id in the ConversionAdjustment ... [if] the original conversion you
//     are adjusting was assigned an order_id."* Ours always are — so `orderId` is REQUIRED here, not
//     optional, and the `gclid_date_time_pair` alternative is deliberately not offered.
//   • *"The adjustment fails with a CONVERSION_NOT_FOUND error if the conversion was never imported, or
//     was imported, but discarded due to being deemed invalid or spam."* This is why the planner refuses
//     to adjust anything without a successful upload log row.
//   • *"You cannot change the ConversionAction assigned to a conversion with an adjustment. Instead, use
//     a RETRACTION to remove the previous conversion and import a new conversion."*
//   • *"the partial_failure attribute ... should always be set to true."*
//   • *"Wait 4 to 6 hours after creating the conversion action before adjusting its conversions to avoid
//     a TOO_RECENT_CONVERSION_ACTION error."* — `isActionWarm` below governs this.

export type AdjustmentType = 'RESTATEMENT' | 'RETRACTION';

export interface ConversionAdjustment {
  conversionAction: string;
  /** Required: the original conversion carried an order id, so Google matches on it. */
  orderId: string;
  adjustmentType: AdjustmentType;
  /** `YYYY-MM-DD HH:MM:SS±HH:MM`. WHEN we decided, not when the conversion happened. */
  adjustmentDateTime: string;
  /** RESTATEMENT only. In dollars. Omitted for a RETRACTION — a retraction has no value. */
  restatementValue?: number;
  currencyCode?: string;
}

/** Same fingerprint idea as `payloadHash`, over the fields an adjustment can differ in. */
export function adjustmentHash(a: ConversionAdjustment): string {
  const canonical = JSON.stringify({
    o: a.orderId, a: a.conversionAction, k: a.adjustmentType, v: a.restatementValue ?? null,
  });
  return crypto.createHash('sha256').update(canonical).digest('hex').slice(0, 32);
}

/**
 * Upload restatements and retractions. Returns an outcome; never throws.
 *
 * The response shape is the same `partialFailureError` + `results` pair as `uploadClickConversions`, so
 * `parseUploadResponse` is reused rather than duplicated — one parser, one place to be wrong.
 */
export async function uploadConversionAdjustments(adjustments: ConversionAdjustment[]): Promise<UploadOutcome> {
  if (!adjustments.length) return { attempted: 0, uploaded: 0, failures: [] };

  const problem = credentialProblem();
  if (problem) return { attempted: adjustments.length, uploaded: 0, failures: [], fatal: CREDENTIAL_HELP[problem] };

  const auth = await getAccessToken();
  if ('error' in auth) {
    return { attempted: adjustments.length, uploaded: 0, failures: [], fatal: CREDENTIAL_HELP[auth.error] };
  }

  const customerId = (process.env.GOOGLE_ADS_CUSTOMER_ID ?? '').replace(/\D/g, '');
  const url = `https://googleads.googleapis.com/${ADS_API_VERSION}/customers/${customerId}:uploadConversionAdjustments`;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${auth.token}`,
        'developer-token': process.env.GOOGLE_ADS_DEVELOPER_TOKEN ?? '',
        ...(process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID
          ? { 'login-customer-id': process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID.replace(/\D/g, '') }
          : {}),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        conversionAdjustments: adjustments.map((a) => ({
          conversionAction: a.conversionAction,
          orderId: a.orderId,
          adjustmentType: a.adjustmentType,
          adjustmentDateTime: a.adjustmentDateTime,
          // A RETRACTION carries no value. Sending `restatementValue: 0` alongside RETRACTION is a
          // different statement — "it happened and was worth nothing" — and Google ignores it anyway.
          ...(a.adjustmentType === 'RESTATEMENT' && typeof a.restatementValue === 'number'
            ? { restatementValue: { adjustedValue: a.restatementValue, currencyCode: a.currencyCode ?? 'USD' } }
            : {}),
        })),
        partialFailure: true,
      }),
    });

    const body = await res.json().catch(() => null);
    if (!res.ok) {
      const message = (body as { error?: { message?: string } } | null)?.error?.message ?? `HTTP ${res.status}`;
      return { attempted: adjustments.length, uploaded: 0, failures: [], fatal: message };
    }
    return parseUploadResponse(body, adjustments.length);
  } catch (e) {
    return {
      attempted: adjustments.length,
      uploaded: 0,
      failures: [],
      fatal: e instanceof Error ? e.message : 'Adjustment upload failed',
    };
  }
}

// ── REPORTING (A11) ─────────────────────────────────────────────────────────────────────────────────

/**
 * Run a GAQL query and return the RAW body for `spend.ts` to parse.
 *
 * Raw on purpose: `searchStream` answers with an **array of chunks**, and the parser's job includes
 * knowing that. Flattening here would put that knowledge in two places, and the version that forgets is
 * the one that silently returns only the first few hundred rows.
 */
export async function runReportQuery(query: string): Promise<{ body: unknown } | { error: string }> {
  const problem = credentialProblem();
  if (problem) return { error: CREDENTIAL_HELP[problem] };

  const auth = await getAccessToken();
  if ('error' in auth) return { error: CREDENTIAL_HELP[auth.error] };

  const customerId = (process.env.GOOGLE_ADS_CUSTOMER_ID ?? '').replace(/\D/g, '');
  const url = `https://googleads.googleapis.com/${ADS_API_VERSION}/customers/${customerId}/googleAds:searchStream`;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${auth.token}`,
        'developer-token': process.env.GOOGLE_ADS_DEVELOPER_TOKEN ?? '',
        ...(process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID
          ? { 'login-customer-id': process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID.replace(/\D/g, '') }
          : {}),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query }),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      return { error: (body as { error?: { message?: string } } | null)?.error?.message ?? `HTTP ${res.status}` };
    }
    return { body };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Report query failed' };
  }
}

/**
 * The 4–6 hour rule, read off Google's documentation on 2026-08-01: *"After creating a new conversion
 * action, wait 4-6 hours before uploading conversions for that conversion action."*
 *
 * Worth being precise about what it governs, because it is easy to misremember as a per-click delay: it
 * is about the ACTION being newly created, not about each conversion. Uploading sooner does not lose the
 * data — Google says it "might take 2 days to appear" — so this is a warning, not a gate.
 */
export const NEW_ACTION_WARMUP_HOURS = 6;

export function isActionWarm(actionCreatedAt: string | Date | null | undefined, now = Date.now()): boolean {
  if (!actionCreatedAt) return true; // unknown age — assume an established action rather than blocking
  const created = new Date(actionCreatedAt).getTime();
  if (Number.isNaN(created)) return true;
  return now - created >= NEW_ACTION_WARMUP_HOURS * 60 * 60 * 1000;
}

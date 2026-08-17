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
import {
  DATA_MANAGER_ENDPOINT, buildIngestRequest, isScopeProblem,
} from './data-manager';
import crypto from 'node:crypto';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
/** Pinned deliberately. Google Ads is a versioned API and an un-pinned "latest" silently changes payload
 *  shape under you; the version is a thing to review on purpose, not to drift. */
/**
 * ── v18 WAS DEAD, AND EVERY GOOGLE ADS CALL IN THIS PRODUCT WITH IT (A6, 2026-08-11) ────────────
 *
 * Google retires Ads API versions on a schedule, and the URL carries the version. Probed against the
 * live account on 2026-08-11:
 *
 *   v18, v19  → HTML 404. The path does not exist any more.
 *   v20, v21  → 400 UNSUPPORTED_VERSION, "deprecated. Requests to this version will be blocked."
 *   v22       → 200 with real data.
 *
 * So the nightly spend import and the conversion upload had been failing on a dead URL — not on
 * credentials, not on approval. Nothing surfaced it because the cron logs a failure and moves on.
 *
 * **This constant is a maintenance obligation, not a setting.** It needs bumping roughly yearly, and
 * the symptom of forgetting is silent: an HTML 404 that no error handler here recognises as
 * "your version expired". `checkAdsAccess()` now classifies exactly that, so the marketing page
 * says so in words the next time it happens.
 */
export const ADS_API_VERSION = 'v22';
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
  const reporting = reportingProblem();
  if (reporting) return reporting;
  // Every upload names a conversion action. With none configured there is nothing to send an event
  // AS, so the job would run, skip all of its work, and report a clean success.
  if (conversionActionStatus().configured.length === 0) return 'missing-conversion-actions';
  return null;
}

/**
 * Are we able to READ reports? A strictly smaller requirement than uploading, and keeping the two
 * apart is the whole reason this function exists.
 *
 * Found on 2026-08-12 while checking A3 end to end: `runReportQuery` gated on `credentialProblem`,
 * which also demands a conversion action. So an account that had never configured one could not see
 * its own spend, clicks or impressions — and the refusal it got back told it to go and create
 * conversion actions, which have nothing to do with reading a report.
 *
 * Uploading writes conversions INTO the ad account and must name the action each one counts as.
 * Reporting reads numbers OUT, and Google asks for nothing but the token, the customer and consent.
 * A gate copied from the stricter operation to the looser one is invisible while both are configured
 * and turns the dashboard blank the moment one is not.
 */
export function reportingProblem(): CredentialProblem | null {
  if (!process.env.GOOGLE_ADS_DEVELOPER_TOKEN) return 'missing-developer-token';
  if (!process.env.GOOGLE_ADS_CUSTOMER_ID) return 'missing-customer-id';
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
 * Send the batch through `datamanager.googleapis.com`.
 *
 * Returns `null` — meaning "I did not handle this, try the old path" — ONLY when the Data Manager
 * scope has not been granted or the API is not enabled. Any other outcome, success or failure, is
 * returned, because falling back after a real rejection would upload the same conversions twice
 * through two APIs and file them against the account under two different mechanisms.
 */
async function uploadViaDataManager(
  conversions: ClickConversion[],
  customerId: string,
  token: string,
): Promise<UploadOutcome | null> {
  const { request, unresolved } = buildIngestRequest(
    conversions.map((c) => ({
      gclid: c.gclid, gbraid: c.gbraid, wbraid: c.wbraid,
      conversionAction: c.conversionAction,
      conversionDateTime: c.conversionDateTime,
      conversionValue: c.conversionValue,
      currencyCode: c.currencyCode,
      orderId: c.orderId,
    })),
    {
      operatingAccountId: customerId,
      loginAccountId: process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID ?? null,
    },
  );

  // A conversion whose action id cannot be resolved is a configuration fault, not a transient one,
  // and it is reported per-row rather than sinking the batch.
  const unresolvedFailures = unresolved.map(({ index, conversion }) => ({
    index,
    code: 'CONVERSION_ACTION_UNREADABLE',
    message: `Could not read a conversion action id from "${conversion.conversionAction}" — set the `
      + 'GOOGLE_ADS_RESOURCE_* variable to a resource name or a numeric id.',
  }));

  if (!request.events.length) {
    return unresolvedFailures.length
      ? { attempted: conversions.length, uploaded: 0, failures: unresolvedFailures }
      : { attempted: conversions.length, uploaded: 0, failures: [] };
  }

  let res: Response;
  try {
    res = await fetch(DATA_MANAGER_ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });
  } catch (e) {
    return {
      attempted: conversions.length, uploaded: 0, failures: unresolvedFailures,
      fatal: e instanceof Error ? e.message : 'Data Manager request failed',
    };
  }

  const body = await res.json().catch(() => null) as { error?: { message?: string } } | null;
  if (!res.ok) {
    const message = body?.error?.message ?? `HTTP ${res.status}`;
    // Not yet set up is the EXPECTED state until somebody reconnects, and it must not look like a
    // broken integration — it is a button somebody has to press.
    if (isScopeProblem(message)) return null;
    return { attempted: conversions.length, uploaded: 0, failures: unresolvedFailures, fatal: message };
  }

  return {
    attempted: conversions.length,
    uploaded: request.events.length,
    failures: unresolvedFailures,
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

  // ── THE DATA MANAGER API IS THE ONLY PATH OPEN TO THIS ACCOUNT ────────────────────────────────
  //
  // Measured 2026-08-16: with the permission problem fixed, `ConversionUploadService` answered 200
  // and rejected the row — *"New integrations for uploading click conversions should use the Data
  // Manager API. Usage of ConversionUploadService.UploadClickConversions is limited to existing
  // users."* This account was not an existing user, so that service can never work for it.
  //
  // The old call is kept below it, not deleted, because it is the fallback for the case Google's
  // message describes: an account that IS an existing user. If Data Manager reports that nobody has
  // granted its scope yet, falling back gets today's conversions in rather than losing them while a
  // person is asked to click Reconnect.
  const viaDataManager = await uploadViaDataManager(conversions, customerId, auth.token);
  if (viaDataManager) return viaDataManager;

  const url = `https://googleads.googleapis.com/${ADS_API_VERSION}/customers/${customerId}:uploadClickConversions`;

  const payload = {
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
  };

  try {
    // `postWithLoginRetry`, not a bare fetch. `runReportQuery` grew this retry on 2026-08-11 and the
    // upload paths did not, which is exactly why READS kept working while every conversion upload
    // failed — 45 of 45, for nine days, with `last_error: "The caller does not have permission"`.
    //
    // Probed live on 2026-08-16: `GOOGLE_ADS_LOGIN_CUSTOMER_ID` is 7539170249, a manager account that
    // manages ONLY ITSELF; the real ad account 7071902603 was never linked under it. Sending that
    // header says "reach this account through that manager", which is not true, so Google refuses.
    // The identical request without the header returns 200.
    //
    // Fixing the variable is the real cure and is being done separately. This makes the integration
    // survive the next time somebody sets it wrong, because the failure mode is silent money: the
    // bidding just never learns.
    const res = await postWithLoginRetry(url, auth.token, payload);
    if ('error' in res) {
      return { attempted: conversions.length, uploaded: 0, failures: [], fatal: res.error };
    }
    return parseUploadResponse(res.body, conversions.length);
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

  const payload = {
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
  };

  try {
    // Same retry as the conversion upload above, for the same reason: an adjustment that cannot be
    // sent means a job that was won or paid never reaches the bidding, which is the half of the
    // signal that carries the money.
    const res = await postWithLoginRetry(url, auth.token, payload);
    if ('error' in res) {
      return { attempted: adjustments.length, uploaded: 0, failures: [], fatal: res.error };
    }
    return parseUploadResponse(res.body, adjustments.length);
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
export interface ReportSuccess {
  body: unknown;
  /** Set when the query only succeeded after dropping `login-customer-id`. See below. */
  warning?: string;
}

/**
 * POST to the Ads API, and if a bad `login-customer-id` is the reason it was refused, send it again
 * without that header.
 *
 * ── WHY THE WRITE PATHS NEEDED THIS TOO ─────────────────────────────────────────────────────────
 *
 * `runReportQuery` below grew exactly this retry on 2026-08-11. The two UPLOAD paths did not, and
 * that asymmetry is the whole reason the integration looked half-alive for nine days: spend imports
 * kept arriving (the read retried and succeeded), while every conversion upload failed —
 * 45 of 45, `last_error: "The caller does not have permission"`, `last_uploaded_at: null`.
 *
 * Probed live 2026-08-16: `GOOGLE_ADS_LOGIN_CUSTOMER_ID` = 7539170249, a manager account that
 * manages ONLY ITSELF. The ad account 7071902603 was never linked beneath it, and the signed-in user
 * has direct Admin access to it anyway — so the header was not merely wrong, it was unnecessary.
 * With it: `USER_PERMISSION_DENIED`. Without it: 200, twelve conversion actions, both campaigns.
 *
 * The header is optional by design — it is required only when reaching an account THROUGH a manager.
 * It is also the single most commonly misconfigured value in this integration, and the cost of it
 * being wrong is silent: nothing errors on a page, the bidding simply never learns.
 */
async function postWithLoginRetry(
  url: string,
  token: string,
  payload: unknown,
): Promise<{ body: unknown; warning?: string } | { error: string }> {
  const loginCustomerId = (process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID ?? '').replace(/\D/g, '');

  const attempt = async (withLogin: boolean) => {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'developer-token': process.env.GOOGLE_ADS_DEVELOPER_TOKEN ?? '',
        ...(withLogin && loginCustomerId ? { 'login-customer-id': loginCustomerId } : {}),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    const body = await res.json().catch(() => null);
    if (res.ok) return { ok: true as const, body };
    const message = (body as { error?: { message?: string } } | null)?.error?.message
      ?? `HTTP ${res.status}`;
    return { ok: false as const, error: message };
  };

  const first = await attempt(true);
  if (first.ok) return { body: first.body };

  if (loginCustomerId && /USER_PERMISSION_DENIED|not have permission/i.test(first.error)) {
    const second = await attempt(false);
    if (second.ok) {
      return {
        body: second.body,
        warning:
          `GOOGLE_ADS_LOGIN_CUSTOMER_ID (${loginCustomerId}) does not manage this ad account — the `
          + 'upload only succeeded once that header was dropped. Unset it, or set it to the manager '
          + 'account that really owns the account.',
      };
    }
  }
  return { error: first.error };
}

/**
 * The `login-customer-id` header identifies a MANAGER account acting on behalf of the customer. It is
 * optional: it is required only when the authenticated user reaches the ad account *through* a manager.
 *
 * On 2026-08-11, probing production found `GOOGLE_ADS_LOGIN_CUSTOMER_ID` naming an account that does
 * not manage `7071902603`. Google's answer to that is `USER_PERMISSION_DENIED` — "the caller does not
 * have permission" — which reads as a broken account link and sends whoever debugs it to re-do the
 * OAuth flow. The identical query with the header REMOVED returned 200 with real data.
 *
 * So the retry exists because the header is the kind of configuration that is wrong far more often
 * than it is needed, and the cost of being wrong is the entire integration going dark silently. A
 * bounded, one-shot retry that drops an optional header turns that into a working import plus a
 * warning — and the warning is not swallowed: `checkAdsAccess` probes the header deliberately and the
 * advertising page still says the variable is wrong.
 */
export async function runReportQuery(query: string): Promise<ReportSuccess | { error: string }> {
  // reportingProblem, NOT credentialProblem: reading a report does not need a conversion action.
  const problem = reportingProblem();
  if (problem) return { error: CREDENTIAL_HELP[problem] };

  const auth = await getAccessToken();
  if ('error' in auth) return { error: CREDENTIAL_HELP[auth.error] };

  const customerId = (process.env.GOOGLE_ADS_CUSTOMER_ID ?? '').replace(/\D/g, '');
  const url = `https://googleads.googleapis.com/${ADS_API_VERSION}/customers/${customerId}/googleAds:searchStream`;
  const loginCustomerId = (process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID ?? '').replace(/\D/g, '');

  const attempt = async (withLogin: boolean): Promise<{ ok: true; body: unknown } | { ok: false; error: string }> => {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${auth.token}`,
        'developer-token': process.env.GOOGLE_ADS_DEVELOPER_TOKEN ?? '',
        ...(withLogin && loginCustomerId ? { 'login-customer-id': loginCustomerId } : {}),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query }),
    });
    if (res.ok) return { ok: true, body: await res.json().catch(() => null) };
    // Not every failure is JSON: a retired API version answers with an HTML 404 page, and reading
    // `.error.message` off that yields `HTTP 404` with the actual explanation thrown away.
    const text = await res.text().catch(() => '');
    let message = `HTTP ${res.status}`;
    try {
      const parsed = JSON.parse(text) as { error?: { message?: string } } | Array<{ error?: { message?: string } }>;
      const first = Array.isArray(parsed) ? parsed[0] : parsed;
      message = first?.error?.message ?? message;
    } catch {
      if (text) message = `${message}: ${text.slice(0, 300)}`;
    }
    return { ok: false, error: message };
  };

  try {
    const first = await attempt(true);
    if (first.ok) return { body: first.body };

    if (loginCustomerId && /USER_PERMISSION_DENIED|not have permission/i.test(first.error)) {
      const second = await attempt(false);
      if (second.ok) {
        return {
          body: second.body,
          warning:
            `GOOGLE_ADS_LOGIN_CUSTOMER_ID (${loginCustomerId}) does not manage this ad account — the `
            + 'request only succeeded once that header was dropped. Unset it, or set it to the manager '
            + 'account that really owns the account.',
        };
      }
    }
    return { error: first.error };
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

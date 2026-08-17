// lib/integrations/google-ads/oauth.ts
//
// The consent handshake that authorises this app to upload conversions on the firm's behalf.
//
// ── WHY THIS EXISTS (2026-08-06) ────────────────────────────────────────────────────────────────
//
// `google_ads_connections` was read by `getAccessToken()` and updated by the nightly cron, and
// **written by nothing**. Grepped the whole repo: no insert, no upsert. So the row could only ever
// have been created by hand in the database, and until it was, `getAccessToken()` returned
// `not-connected` forever — while `/admin/marketing/uploads` displayed help text for exactly that
// state with no way to act on it.
//
// The owner asked whether the credentials could be filled in by automating a browser. They should
// not be, and this is the reason they do not need to be: a refresh token is not a value anybody
// should be copying out of one window and pasting into another. It is issued by Google, to us,
// after the account owner clicks "Allow" on Google's own consent screen — so it never appears on
// screen, never passes through a clipboard, and nobody has to be trusted with it.
//
// Deliberately mirrors `lib/integrations/google-calendar.ts`, which has been doing this correctly
// for months. Same shape, different scope.

/** Ads uses one scope for everything — reporting and uploads alike. */
export const ADS_OAUTH_SCOPE = 'https://www.googleapis.com/auth/adwords';

/**
 * The Data Manager API is a SEPARATE scope, and the Ads scope does not imply it.
 *
 * Google closed `ConversionUploadService.UploadClickConversions` to new integrations — measured on
 * 2026-08-16, an otherwise valid upload came back *"New integrations for uploading click conversions
 * should use the Data Manager API"*. Offline conversions now go to `datamanager.googleapis.com`, and
 * its own documentation is explicit: *"The Data Manager API requires credentials with a different
 * scope than the Google Ads API."*
 *
 * Requesting both here means a person who reconnects gets an integration that can read reports AND
 * upload conversions. Asking for only one of the two is how you get a connection that looks healthy
 * and silently cannot do half its job — which is exactly the state this integration spent nine days
 * in for a different reason.
 */
export const DATA_MANAGER_OAUTH_SCOPE = 'https://www.googleapis.com/auth/datamanager';

/** What the consent screen asks for. Space-separated, per OAuth 2.0. */
export const REQUESTED_OAUTH_SCOPES = `${ADS_OAUTH_SCOPE} ${DATA_MANAGER_OAUTH_SCOPE}`;

/** Short-lived CSRF nonce cookie, set when the flow starts and read by the callback.
 *
 *  Lives here rather than in the route that sets it: a `route.ts` may export ONLY Next's handler
 *  names, and exporting a constant from one compiles and type-checks fine while breaking the
 *  production build. Caught by `__tests__/admin/route-exports` the day this was written. */
export const ADS_OAUTH_COOKIE = 'gads_oauth_state';

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';

export interface AdsTokens {
  access_token: string;
  /** Absent when the user has authorised before and Google decides not to reissue — see below. */
  refresh_token?: string;
  expires_in: number;
  scope: string;
}

/** Where Google sends the browser after consent. Derived, not configured, so the value registered in
 *  the Google Cloud console and the value we send are the same string in every environment. */
export function adsRedirectUri(baseUrl: string): string {
  return `${baseUrl.replace(/\/$/, '')}/api/admin/marketing/google-ads/callback`;
}

export function buildAdsAuthUrl(redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID ?? '',
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: REQUESTED_OAUTH_SCOPES,
    // `offline` is what makes Google issue a refresh token at all — without it the connection dies
    // in an hour and every nightly run after the first fails.
    access_type: 'offline',
    // `consent` forces the refresh token to be REISSUED. Google omits it on a repeat authorisation
    // unless asked, so a reconnect after a revoked token would otherwise hand back an access token
    // and no way to renew it — the connection would appear to work and break again by morning.
    prompt: 'consent',
    // Include the granted scopes in the response so the callback can verify what was actually
    // approved rather than assuming the request was honoured in full.
    include_granted_scopes: 'true',
    state,
  });
  return `${AUTH_URL}?${params.toString()}`;
}

export async function exchangeAdsCode(code: string, redirectUri: string): Promise<AdsTokens> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID ?? '',
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? '',
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });
  if (!res.ok) {
    // The body carries Google's own reason (`redirect_uri_mismatch`, `invalid_client`, …), which is
    // the only thing that makes this diagnosable. Surfaced, not swallowed.
    throw new Error(`Google token exchange failed (${res.status}): ${await res.text()}`);
  }
  return res.json() as Promise<AdsTokens>;
}

/** Did the user actually grant the Ads scope?
 *
 *  Google's consent screen lets someone approve a subset of what was asked for. Storing a connection
 *  that cannot call the Ads API would produce a green "connected" badge and a nightly 403. */
export function grantedAdsScope(scope: string | undefined | null): boolean {
  return (scope ?? '').split(/\s+/).includes(ADS_OAUTH_SCOPE);
}

/** Did they also grant Data Manager — the scope offline conversion uploads now need?
 *
 *  Deliberately a SEPARATE question from `grantedAdsScope`, and deliberately not fatal. Google's
 *  consent screen lets someone approve a subset, and a connection with Ads but not Data Manager is
 *  genuinely useful: reporting, spend import and the whole marketing dashboard work. Only offline
 *  conversions do not. Folding the two into one boolean would either reject a working connection or
 *  claim uploads work when they cannot. */
export function grantedDataManagerScope(scope: string | undefined | null): boolean {
  return (scope ?? '').split(/\s+/).includes(DATA_MANAGER_OAUTH_SCOPE);
}

/** The numeric customer id, digits only.
 *
 *  Ads shows it as `123-456-7890` and the API rejects the dashes. People copy what they see, so this
 *  normalises rather than validating and complaining. */
export function normaliseCustomerId(raw: string): string {
  return (raw ?? '').replace(/\D/g, '');
}

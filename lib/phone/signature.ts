// lib/phone/signature.ts — slice P0b of
// docs/planning/in-progress/PHONE_CALLS_AND_VOICEMAIL_2026-08-14.md
//
// Twilio webhooks arrive at a URL anybody can reach. Nothing about the request proves it came from
// Twilio except this signature, so every `/api/twilio/*` route validates before it does anything —
// and "anything" here is not academic. A forged POST to the voice webhook could create call records,
// and a forged POST to the callback route could make the firm's Twilio account dial a number of the
// caller's choosing, at the firm's expense. That is an open relay, not a spurious row.
//
// ── THE ALGORITHM ───────────────────────────────────────────────────────────────────────────────
//
// Twilio builds the signed string as: the full request URL, then every POST parameter appended as
// key immediately followed by value, in order of the keys sorted lexicographically. HMAC-SHA1 that
// with the account's auth token, base64 it, and that is `X-Twilio-Signature`.
//
// There are no separators between the appended pairs. That is not a mistake in this comment — the
// concatenation really is `urlkey1value1key2value2`, and adding a separator produces a signature
// that never matches for any input, i.e. a webhook that is 100% down rather than obviously broken.
//
// ── THE PART THAT SILENTLY BREAKS IN PRODUCTION ─────────────────────────────────────────────────
//
// Twilio signs the URL *it* requested. Behind Vercel's proxy, `req.url` is frequently not that URL:
// the protocol arrives as http even though the caller used https, and the host can be the internal
// deployment host rather than the domain configured in the Twilio console. The signature then fails
// for every legitimate request, which looks exactly like an attack and is in fact a config bug.
//
// So the URL is reconstructed from an explicitly configured public base when one is set, and the
// forwarded headers otherwise, and `validateTwilioSignature` accepts a *list* of candidate URLs. In
// exchange for that flexibility, the candidates it is given must all be URLs we would be willing to
// serve — they are, since we build them ourselves from our own config.
import crypto from 'crypto';

/**
 * The exact string Twilio signs, for a form-encoded POST.
 *
 * `params` are the decoded form fields. Values are appended raw, not re-encoded.
 */
export function buildSignatureBase(url: string, params: Record<string, string>): string {
  const keys = Object.keys(params).sort();
  let out = url;
  for (const key of keys) out += key + params[key];
  return out;
}

/** The base64 HMAC-SHA1 Twilio would have sent for this URL and these params. */
export function signTwilioRequest(
  authToken: string,
  url: string,
  params: Record<string, string>,
): string {
  return crypto
    .createHmac('sha1', authToken)
    .update(Buffer.from(buildSignatureBase(url, params), 'utf-8'))
    .digest('base64');
}

/**
 * Constant-time compare that does not leak length through an early return.
 *
 * `crypto.timingSafeEqual` throws on a length mismatch, which is itself a timing signal and, worse,
 * an exception in the middle of a webhook. Both sides are hashed to a fixed width first.
 */
function safeEqual(a: string, b: string): boolean {
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

export interface SignatureCheck {
  valid: boolean;
  /** Which candidate URL matched — worth logging, since a mismatch here is the usual config bug. */
  matchedUrl: string | null;
  reason: string | null;
}

/**
 * True when `signature` is a signature this account could have produced for one of `candidateUrls`.
 *
 * Every candidate is checked even after one matches, so the time taken does not reveal which URL
 * was right.
 */
export function validateTwilioSignature(opts: {
  authToken: string | null | undefined;
  signature: string | null | undefined;
  candidateUrls: string[];
  params: Record<string, string>;
}): SignatureCheck {
  const { authToken, signature, candidateUrls, params } = opts;

  // No token configured means we cannot validate. That is a refusal, never a pass: a deployment
  // missing its token would otherwise accept every forged request, and it would do so silently.
  if (!authToken) return { valid: false, matchedUrl: null, reason: 'no_auth_token' };
  if (!signature) return { valid: false, matchedUrl: null, reason: 'no_signature' };
  if (candidateUrls.length === 0) return { valid: false, matchedUrl: null, reason: 'no_candidate_url' };

  let matched: string | null = null;
  for (const url of candidateUrls) {
    if (safeEqual(signTwilioRequest(authToken, url, params), signature)) matched = matched ?? url;
  }
  return matched
    ? { valid: true, matchedUrl: matched, reason: null }
    : { valid: false, matchedUrl: null, reason: 'signature_mismatch' };
}

/**
 * The URLs Twilio might have signed for this request, most-trusted first.
 *
 * When `publicBaseUrl` is configured it is the only candidate that matters, but the forwarded-header
 * reconstruction is kept as a fallback so a deployment that has not set it yet still works rather
 * than rejecting every call with a signature error that reads like an attack.
 */
export function candidateWebhookUrls(opts: {
  requestUrl: string;
  forwardedProto?: string | null;
  forwardedHost?: string | null;
  publicBaseUrl?: string | null;
}): string[] {
  const { requestUrl, forwardedProto, forwardedHost, publicBaseUrl } = opts;
  const out: string[] = [];
  const push = (u: string | null) => {
    if (u && !out.includes(u)) out.push(u);
  };

  let parsed: URL | null = null;
  try {
    parsed = new URL(requestUrl);
  } catch {
    parsed = null;
  }
  const pathAndQuery = parsed ? `${parsed.pathname}${parsed.search}` : requestUrl;

  if (publicBaseUrl) push(`${publicBaseUrl.replace(/\/+$/, '')}${pathAndQuery}`);
  // `x-forwarded-host` can legitimately carry a comma-separated chain; the first entry is the
  // original client-facing host.
  const host = forwardedHost?.split(',')[0]?.trim() || parsed?.host || null;
  const proto = forwardedProto?.split(',')[0]?.trim() || 'https';
  if (host) push(`${proto}://${host}${pathAndQuery}`);
  push(requestUrl);
  return out;
}

/** Form-encoded body → the flat param map Twilio signed. */
export function paramsFromFormBody(body: string): Record<string, string> {
  const out: Record<string, string> = {};
  // `URLSearchParams` decodes `+` as space and percent-escapes correctly, which is what Twilio
  // signed before encoding.
  for (const [k, v] of new URLSearchParams(body)) out[k] = v;
  return out;
}

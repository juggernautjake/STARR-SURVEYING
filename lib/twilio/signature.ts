// lib/twilio/signature.ts — is this webhook really from Twilio?
//
// Twilio signs every webhook: HMAC-SHA1 over the exact URL it requested plus the POST parameters
// (sorted by name, concatenated as name+value), keyed with the account's auth token, base64. The
// signature arrives in `X-Twilio-Signature`. Anyone can POST TwiML-shaped forms at a public route;
// only Twilio can produce this header. Every receptionist route checks it before doing anything.
//
// The URL must match byte-for-byte what Twilio called, including the query string and scheme.
// Behind Vercel the request object's own URL is the internal one, so callers rebuild it from the
// forwarded headers (`publicUrlOf`).
import { createHmac, timingSafeEqual } from 'node:crypto';

export function twilioSignature(url: string, params: Record<string, string>, authToken: string): string {
  const data = url + Object.keys(params).sort().map((k) => k + params[k]).join('');
  return createHmac('sha1', authToken).update(data).digest('base64');
}

export function validTwilioSignature(
  url: string,
  params: Record<string, string>,
  header: string | null | undefined,
  authToken: string | undefined = process.env.TWILIO_AUTH_TOKEN,
): boolean {
  if (!authToken || !header) return false;
  const expected = Buffer.from(twilioSignature(url, params, authToken));
  const given = Buffer.from(header);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

/** The URL Twilio actually requested, rebuilt from the proxy headers Vercel sets. */
export function publicUrlOf(request: Request): string {
  const u = new URL(request.url);
  const proto = request.headers.get('x-forwarded-proto') ?? u.protocol.replace(':', '');
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host') ?? u.host;
  return `${proto}://${host}${u.pathname}${u.search}`;
}

/** Parse the form-encoded body Twilio sends. */
export async function twilioParams(request: Request): Promise<Record<string, string>> {
  const raw = await request.text();
  return Object.fromEntries(new URLSearchParams(raw));
}

// lib/twilio/access-token.ts — a Twilio Voice access token, without the SDK.
//
// The browser's Voice SDK needs a short-lived JWT signed with a Twilio API key. Twilio's format
// ("twilio-fpa;v=1") is an ordinary HS256 JWT with a `grants` claim; twenty lines of node:crypto
// cover it, which is fewer than the dependency it replaces. Used only by the developer page's
// "call from this browser" button; the account SID and API key come from the environment.
import { createHmac } from 'node:crypto';

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}

export function voiceAccessTokenConfigured(env: Record<string, string | undefined> = process.env): boolean {
  return Boolean(env.TWILIO_ACCOUNT_SID && env.TWILIO_API_KEY_SID && env.TWILIO_API_KEY_SECRET && env.TWILIO_TWIML_APP_SID);
}

/** A token that lets `identity` place calls through the TwiML App, for `ttlSeconds` (max one hour). */
export function voiceAccessToken(identity: string, ttlSeconds = 3600, env: Record<string, string | undefined> = process.env, now = Date.now()): string {
  const accountSid = env.TWILIO_ACCOUNT_SID ?? '';
  const keySid = env.TWILIO_API_KEY_SID ?? '';
  const secret = env.TWILIO_API_KEY_SECRET ?? '';
  const appSid = env.TWILIO_TWIML_APP_SID ?? '';
  if (!accountSid || !keySid || !secret || !appSid) throw new Error('Twilio voice token: TWILIO_ACCOUNT_SID, TWILIO_API_KEY_SID, TWILIO_API_KEY_SECRET and TWILIO_TWIML_APP_SID are required');
  const iat = Math.floor(now / 1000);
  const ttl = Math.max(60, Math.min(3600, ttlSeconds));
  const header = { typ: 'JWT', alg: 'HS256', cty: 'twilio-fpa;v=1' };
  const payload = {
    jti: `${keySid}-${iat}`,
    iss: keySid,
    sub: accountSid,
    iat,
    nbf: iat,
    exp: iat + ttl,
    grants: {
      identity,
      voice: { outgoing: { application_sid: appSid }, incoming: { allow: false } },
    },
  };
  const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
  const sig = createHmac('sha256', secret).update(signingInput).digest();
  return `${signingInput}.${b64url(sig)}`;
}

/** Twilio identities: letters, digits and a few symbols. An email address is the natural identity
 *  for a signed-in admin, minus what Twilio rejects. */
export function voiceIdentityFor(email: string): string {
  return email.toLowerCase().replace(/[^a-z0-9_.@-]/g, '_').slice(0, 121);
}

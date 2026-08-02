// lib/voice/tokens.ts — the links that stand in for a client login.
//
// A client of Andrew's never creates an account. They get a URL, and that URL is the whole of their
// authorisation to see a contract or pay an invoice. That makes the token generation in this file a
// security boundary, not a convenience — so it is small, it is in one place, and it says out loud
// what it is doing.
//
// ── WHY 32 BYTES ────────────────────────────────────────────────────────────────────────────────
//
// 256 bits from `crypto.randomBytes`, base64url-encoded to 43 characters. That is not "long enough
// to be annoying"; it is the point at which guessing is not a threat model anyone has to think about
// again. Shorter tokens invite a rate-limit discussion, a lockout mechanism, and a bug in one of
// them. `Math.random()` would be catastrophic here and is worth naming: it is seeded predictably and
// its output is recoverable from a handful of samples, so a client who received two invoice links
// could compute everyone else's.

import crypto from 'node:crypto';

const TOKEN_BYTES = 32;

/** A fresh, unguessable URL token. */
export function generateToken(): string {
  return crypto.randomBytes(TOKEN_BYTES).toString('base64url');
}

/**
 * A token with a short human-readable prefix, e.g. `inv_Xh3…`.
 *
 * The prefix is for support, not security: when Andrew is looking at a link a client pasted into an
 * email, `con_` versus `inv_` tells him instantly what kind of thing it opens. It adds no entropy and
 * is not treated as a secret.
 */
export function generatePrefixedToken(prefix: string): string {
  const safe = prefix.replace(/[^a-z]/gi, '').toLowerCase().slice(0, 4) || 'tok';
  return `${safe}_${generateToken()}`;
}

/**
 * Constant-time token comparison.
 *
 * Every token here is looked up by an indexed database equality, which is already constant-time as
 * far as an attacker on the wire can observe. This exists for the paths that compare in application
 * code — verifying a token from a header against one already loaded — where a `===` on strings
 * short-circuits at the first differing byte and leaks the prefix one character at a time.
 */
export function tokensMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

/** Shape check before hitting the database — rejects obvious junk without a query. */
export function looksLikeToken(value: unknown): value is string {
  return typeof value === 'string' && /^([a-z]{2,4}_)?[A-Za-z0-9_-]{20,120}$/.test(value);
}

/**
 * SHA-256 of a contract body, hex.
 *
 * Stored with a signature so that "this is what I signed" is checkable later. Whitespace is
 * normalised first: a signed contract that fails its own hash because an editor rewrapped a
 * paragraph is a hash that gets ignored, and an ignored integrity check is worse than none — it
 * looks like protection while providing none.
 */
export function hashContractBody(body: string): string {
  const normalized = String(body ?? '')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+$/gm, '')
    .trim();
  return crypto.createHash('sha256').update(normalized, 'utf8').digest('hex');
}

/** True when a contract's stored text still matches the hash captured at signing. */
export function contractBodyIntact(body: string, storedHash: string | null | undefined): boolean {
  if (!storedHash) return true; // never signed — nothing to contradict
  return hashContractBody(body) === storedHash;
}

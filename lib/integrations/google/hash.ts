// lib/integrations/google/hash.ts — Enhanced Conversions hashing, to Google's rules exactly.
//
// G2-2 of docs/planning/in-progress/GOOGLE_INTEGRATION_2026-07-31.md.
//
// ── WHY THIS IS ITS OWN MODULE WITH ITS OWN TESTS ───────────────────────────────────────────────────
//
// **A wrong hash fails silently.** Google accepts the upload, reports success, matches nothing, and the
// account shows a healthy-looking zero. There is no error to find and nothing in our logs is wrong. The
// only defence is getting the normalization right up front and pinning it, so the rules are here, pure,
// and asserted against Google's own published examples.
//
// The rules, from Google's Enhanced Conversions documentation:
//   · EMAIL — lowercase, strip leading/trailing whitespace. For gmail.com and googlemail.com ONLY,
//     also remove dots from the local part and drop anything after a `+`.
//   · PHONE — E.164: a leading `+`, country code, digits only, no spaces or punctuation.
//   · Then SHA-256, hex, lowercase.
//
// ── THE GMAIL RULE IS THE ONE PEOPLE GET WRONG, IN BOTH DIRECTIONS ─────────────────────────────────
//
// `J.Smith+quotes@gmail.com` and `jsmith@gmail.com` are the same mailbox, so Google normalizes them to
// the same hash — and if we do not, the match is missed for exactly the customers who are organised
// enough to use address tagging. But applying dot-stripping to EVERY domain is equally wrong: at most
// providers `j.smith@company.com` and `jsmith@company.com` are different people, and hashing them the
// same asks Google to match a conversion to the wrong human being.
//
// ── PHONE NUMBERS ARE ASSUMED US ────────────────────────────────────────────────────────────────────
//
// This is a Central Texas surveying firm; every number in the database is US. A 10-digit number gets
// `+1`, an 11-digit number starting `1` gets a `+`, and anything already `+`-prefixed is left alone. A
// number that cannot be read that way returns null rather than a guess: an unmatched conversion costs
// nothing, while a WRONG match teaches the bidding model about a customer who does not exist.

import crypto from 'node:crypto';

const GMAIL_DOMAINS = new Set(['gmail.com', 'googlemail.com']);

/** SHA-256, hex, lowercase — the encoding Google expects. */
function sha256(value: string): string {
  return crypto.createHash('sha256').update(value, 'utf8').digest('hex');
}

/**
 * Normalize an email to Google's rules. Returns null when there is nothing usable — a lead with no
 * email is ordinary, not an error.
 */
export function normalizeEmail(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed || !trimmed.includes('@')) return null;

  const at = trimmed.lastIndexOf('@');
  let local = trimmed.slice(0, at);
  const domain = trimmed.slice(at + 1);
  if (!local || !domain || !domain.includes('.')) return null;

  if (GMAIL_DOMAINS.has(domain)) {
    // Dots are meaningless in a Gmail local part and `+tag` is an alias of the same mailbox. Applied
    // ONLY here — at most other providers these are genuinely different addresses.
    const plus = local.indexOf('+');
    if (plus > -1) local = local.slice(0, plus);
    local = local.replace(/\./g, '');
    if (!local) return null;
  }

  return `${local}@${domain}`;
}

/**
 * Normalize a phone number to E.164, assuming US. Returns null rather than guessing.
 */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // An explicit international number is trusted as given, minus formatting.
  if (trimmed.startsWith('+')) {
    const digits = trimmed.slice(1).replace(/\D/g, '');
    // 8 is the shortest plausible national number; 15 is E.164's hard maximum.
    return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
  }

  const digits = trimmed.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  // Extensions, partial numbers, "call the office", a fax line typed into the phone box — all of these
  // reach here, and none of them should become a confident hash.
  return null;
}

/** Hashed email for Enhanced Conversions, or null when there is nothing to hash. */
export function hashEmail(raw: string | null | undefined): string | null {
  const normalized = normalizeEmail(raw);
  return normalized ? sha256(normalized) : null;
}

/** Hashed phone for Enhanced Conversions, or null when there is nothing to hash. */
export function hashPhone(raw: string | null | undefined): string | null {
  const normalized = normalizePhone(raw);
  return normalized ? sha256(normalized) : null;
}

/** Both, for a lead. Kept together because the uploader always wants the pair, and because a lead with
 *  NEITHER is the case that must be recorded as `skipped` rather than retried forever. */
export function hashIdentifiers(
  input: { email?: string | null; phone?: string | null },
): { hashedEmail: string | null; hashedPhone: string | null; usable: boolean } {
  const hashedEmail = hashEmail(input.email);
  const hashedPhone = hashPhone(input.phone);
  return { hashedEmail, hashedPhone, usable: Boolean(hashedEmail || hashedPhone) };
}

// lib/format/phone.ts
//
// phone-format-2026-06-22 — display helper for North-American phone
// numbers. Raw 10-digit strings get punctuated to "(XXX) XXX-XXXX";
// 11-digit strings with a leading 1 become "+1 (XXX) XXX-XXXX". Any
// other shape (international, partial, with letters, mid-typing, etc.)
// passes through unchanged so we never mangle a valid number we just
// don't recognize. Pure + free of side effects so callers can use it
// from anywhere (server, client, mobile).
//
// The companion `phoneHref(value)` returns the `tel:` URL — keeps the
// raw digits so the dialer parses cleanly even if the visible label
// is punctuated.

/** Format a phone number for display. Returns the original string
 *  when the shape isn't recognized. Treats null/undefined as ''. */
export function formatPhone(raw: string | null | undefined): string {
  if (!raw) return '';
  const s = String(raw).trim();
  if (s.length === 0) return s;

  // Strip everything except digits + a leading + so we can tell US
  // 10-digit, US 1-prefixed 11-digit, and international apart.
  const hasPlus = s.startsWith('+');
  const digits = s.replace(/\D+/g, '');

  // Explicit international (+ prefix): hand back as-is — the caller's
  // input is the canonical display.
  if (hasPlus && !/^1\d{10}$/.test(digits)) return s;

  // US/Canada 10-digit.
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }

  // US/Canada 11-digit (country code 1).
  if (digits.length === 11 && digits.startsWith('1')) {
    return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }

  // Anything else (partial entry, foreign without +, etc.) — leave
  // the user's typing intact rather than guessing.
  return s;
}

/** Build the `tel:` URL for a phone number. Keeps the raw digits so
 *  the OS dialer parses cleanly. Returns null when the input is empty
 *  or doesn't contain any digits. */
export function phoneHref(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = String(raw).trim();
  const hasPlus = s.startsWith('+');
  const digits = s.replace(/\D+/g, '');
  if (digits.length === 0) return null;
  return `tel:${hasPlus ? '+' : ''}${digits}`;
}

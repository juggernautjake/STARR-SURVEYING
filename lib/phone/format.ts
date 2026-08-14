// lib/phone/format.ts — shared formatting for the phone system.
//
// Server-side counterpart to the same function in app/admin/phone/call-types.ts. Kept separate
// rather than imported across the boundary because that file is part of a `'use client'` module
// graph, and pulling it into a server path is how `@/lib/auth` once dragged `node:async_hooks` into
// a client bundle and broke the production build for two commits.

/**
 * A US number as a person reads it.
 *
 * Falls back to the raw string: an unparseable number is still the only record of who rang, and
 * hiding it for tidiness loses the actual information.
 */
export function formatPhoneForHumans(e164: string | null | undefined): string {
  if (!e164) return 'an unknown number';
  const digits = e164.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) {
    return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return e164;
}

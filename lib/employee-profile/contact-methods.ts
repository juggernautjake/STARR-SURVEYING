// lib/employee-profile/contact-methods.ts
//
// Slice EP2 — pure helpers shared by the API route + the
// ProfilePanel section. Validation, normalization, and the kind
// constants. Tested directly without rendering React.

/** The three contact kinds the user can add per the spec. */
export const CONTACT_KINDS = ['phone', 'email', 'address'] as const;
export type ContactKind = typeof CONTACT_KINDS[number];

export interface ContactMethodInput {
  kind: ContactKind;
  value: string;
  label?: string | null;
  is_primary?: boolean;
}

export type ContactValidationResult =
  | { ok: true; value: string; label: string | null }
  | { ok: false; error: string };

/** Validate + normalize a contact value against its kind. Phones
 *  collapse internal whitespace and keep digits + common symbols.
 *  Emails are lowercased + checked against a liberal regex.
 *  Addresses are free-form trimmed text. */
export function validateContact(kind: ContactKind, raw: string): ContactValidationResult {
  if (typeof raw !== 'string') return { ok: false, error: 'Contact value is required.' };
  const trimmed = raw.trim();
  if (!trimmed) return { ok: false, error: 'Contact value is required.' };
  if (kind === 'phone') {
    // Liberal phone shape — at least 7 chars of digits + symbols
    // commonly typed by surveyors. Strip spaces between groups so
    // "555 123 4567" and "555-123-4567" both normalize cleanly.
    const value = trimmed.replace(/\s+/g, ' ');
    if (!/^[+()\-\d\s.]{7,}$/.test(value)) {
      return { ok: false, error: 'Phone numbers need at least 7 digits.' };
    }
    return { ok: true, value, label: null };
  }
  if (kind === 'email') {
    const value = trimmed.toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      return { ok: false, error: 'That email looks malformed.' };
    }
    return { ok: true, value, label: null };
  }
  // address — free form. Cap at a generous 1000 chars so a
  // pasted essay doesn't bloat the row.
  if (trimmed.length > 1000) {
    return { ok: false, error: 'Address is too long (max 1000 chars).' };
  }
  return { ok: true, value: trimmed, label: null };
}

/** Normalize a label (trim, blank → null). Pure + exported so the
 *  API + the form can share the contract. */
export function normalizeLabel(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const t = input.trim();
  return t === '' ? null : t.slice(0, 80);
}

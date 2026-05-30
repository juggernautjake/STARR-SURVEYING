// lib/contacts/labels.ts
//
// contacts plan Slice 1 — the default catalog of contact labels the
// user named, plus a normalize helper so we store consistent keys in
// the DB regardless of how the surveyor typed it ("Recurring
// Customer" / "recurring customer" / "RECURRING" → "recurring").
//
// Dependency-free → unit-tested in node.

export interface ContactLabelDef {
  /** Storage key (snake-case, no spaces). The contacts.labels TEXT[]
   *  column holds these strings. */
  id: string;
  /** Display label rendered in the UI. */
  label: string;
  /** A short helper string the new-contact form shows on hover. */
  description: string;
  /** Tailwind-y semantic color hint mapped to a CSS var by the chip
   *  renderer. Same vocabulary the quick-actions catalog uses. */
  tint?: 'accent' | 'success' | 'warning' | 'info' | 'danger' | 'neutral';
}

/** The seven labels the user explicitly named, in the user's order. */
export const CONTACT_LABELS: ReadonlyArray<ContactLabelDef> = [
  {
    id: 'potential_customer',
    label: 'Potential customer',
    description: 'A lead — haven\'t worked together yet.',
    tint: 'info',
  },
  {
    id: 'current_customer',
    label: 'Current customer',
    description: 'Actively working on a job for this person.',
    tint: 'success',
  },
  {
    id: 'recurring_customer',
    label: 'Recurring customer',
    description: 'Comes back regularly — realtor / repeat client.',
    tint: 'accent',
  },
  {
    id: 'former_customer',
    label: 'Former customer',
    description: 'Past client — keep them on file.',
    tint: 'neutral',
  },
  {
    id: 'employee',
    label: 'Employee',
    description: 'On the team.',
    tint: 'success',
  },
  {
    id: 'student',
    label: 'Student',
    description: 'Learning the trade through Starr.',
    tint: 'info',
  },
  {
    id: 'teacher',
    label: 'Teacher',
    description: 'Instructor or mentor.',
    tint: 'warning',
  },
];

const KNOWN_BY_ID = new Set(CONTACT_LABELS.map((l) => l.id));

/** Find a catalog entry by its storage id. */
export function findContactLabel(id: string): ContactLabelDef | undefined {
  return CONTACT_LABELS.find((l) => l.id === id);
}

/** Normalize a user-entered label into a storage key:
 *    - lower-case + trim
 *    - inner whitespace + dashes collapsed to a single underscore
 *    - strip everything else (so a typo'd "Realtor!" → "realtor")
 *  A blank or all-punctuation input returns null so the caller can
 *  drop it without writing junk to the DB.
 */
export function normalizeLabel(raw: string): string | null {
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed) return null;
  // Replace runs of whitespace + dashes with a single underscore, then
  // strip any non-alphanumeric/underscore chars.
  const cleaned = trimmed
    .replace(/[\s-]+/g, '_')
    .replace(/[^a-z0-9_]/g, '');
  if (!cleaned) return null;
  // Collapse runs of underscores so "current  customer" → "current_customer"
  // rather than "current__customer".
  return cleaned.replace(/_+/g, '_').replace(/^_+|_+$/g, '') || null;
}

/** True for any of the catalog ids — useful for filtering UI chips so
 *  catalog-known labels render with the right tint and user-coined
 *  ones fall back to the neutral chip style. */
export function isKnownLabel(id: string): boolean {
  return KNOWN_BY_ID.has(id);
}

/** The roles a contact can play on a job (the `role` column on
 *  job_contacts). Free-form on the DB side; this is the suggested set
 *  the picker offers. */
export const JOB_CONTACT_ROLES: ReadonlyArray<{ id: string; label: string }> = [
  { id: 'client', label: 'Client' },
  { id: 'realtor', label: 'Realtor' },
  { id: 'agent', label: 'Agent' },
  { id: 'buyer', label: 'Buyer' },
  { id: 'seller', label: 'Seller' },
  { id: 'lender', label: 'Lender' },
  { id: 'attorney', label: 'Attorney' },
  { id: 'engineer', label: 'Engineer' },
  { id: 'contractor', label: 'Contractor' },
  { id: 'other', label: 'Other' },
];

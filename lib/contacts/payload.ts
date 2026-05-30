// lib/contacts/payload.ts
//
// contacts plan Slice 2 — pure helpers for shaping the POST/PUT body
// the contacts CRUD routes accept. Centralizing the trim + normalize
// + label cleanup here keeps the route handlers thin and lets a single
// spec lock the contract.
//
// Dependency-free → unit-tested in node.

import { normalizeLabel } from './labels';

export interface ContactInputFields {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  company?: string | null;
  title?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  labels?: ReadonlyArray<string> | null;
  notes?: string | null;
}

/** Sanitized contact insert/update payload. Every text field is
 *  trimmed; empty strings become null so the DB doesn't store '' as a
 *  distinct value from "not set". Labels are normalized + de-duped. */
export interface SanitizedContact {
  name?: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  title: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  labels: string[];
  notes: string | null;
}

const TEXT_FIELDS = [
  'email', 'phone', 'company', 'title',
  'address', 'city', 'state', 'zip', 'notes',
] as const;

function nullableText(v: string | null | undefined): string | null {
  const trimmed = v?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : null;
}

/** Normalize + dedupe a raw label list into the catalog-friendly
 *  storage keys. Empty / all-punctuation entries are dropped. */
export function sanitizeLabels(raw: ReadonlyArray<string> | null | undefined): string[] {
  if (!raw || raw.length === 0) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const label of raw) {
    const key = normalizeLabel(label);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
}

/**
 * Sanitize a POST/PUT body into the row shape the contacts table
 * accepts. Returns `{ ok: true, value }` on success, or `{ ok: false,
 * error }` when the body fails validation (e.g., missing name on
 * insert). The route decides whether to require `name` by passing
 * `{ requireName: true }` for the create case; PATCH-style partial
 * updates can omit it.
 */
export function sanitizeContactInput(
  input: ContactInputFields,
  opts: { requireName?: boolean } = {},
): { ok: true; value: SanitizedContact } | { ok: false; error: string } {
  const name = input.name?.trim();
  if (opts.requireName && (!name || name.length === 0)) {
    return { ok: false, error: 'name is required' };
  }

  const value: SanitizedContact = {
    email: nullableText(input.email),
    phone: nullableText(input.phone),
    company: nullableText(input.company),
    title: nullableText(input.title),
    address: nullableText(input.address),
    city: nullableText(input.city),
    state: nullableText(input.state),
    zip: nullableText(input.zip),
    labels: sanitizeLabels(input.labels),
    notes: nullableText(input.notes),
  };
  if (name) value.name = name;
  return { ok: true, value };
}

export interface JobLinkPayload {
  job_id: string;
  role: string;
  notes: string | null;
}

/** Validate the body for POST /api/admin/contacts/{id}/jobs. */
export function sanitizeJobLinkInput(input: {
  job_id?: string | null;
  role?: string | null;
  notes?: string | null;
}): { ok: true; value: JobLinkPayload } | { ok: false; error: string } {
  const job_id = input.job_id?.trim();
  if (!job_id) return { ok: false, error: 'job_id is required' };
  const role = input.role?.trim() || 'client';
  return { ok: true, value: { job_id, role, notes: nullableText(input.notes) } };
}

// Re-export for routes that only need the text-field allow-list at runtime.
export { TEXT_FIELDS };

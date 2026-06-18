// lib/leads/intake.ts — public-form → leads-table intake.
//
// The public contact form at `/app/api/contact/route.ts` was email-only
// before this slice: a customer query produced two Resend emails (one to
// the business inbox, one to the customer) and that was it. The `/admin/leads`
// page existed (and the `leads` table existed at `seeds/292_leads.sql`),
// but nothing ever populated the table from the public form. Surveyors
// saw queries in their inbox but not in the office UI.
//
// This module is the bridge:
//
//   * `buildLeadRowFromForm` maps the form's normalized shape onto a
//     `leads` row. Pure — easy to unit-test without touching Supabase.
//   * `insertLeadFromForm` runs the INSERT via `supabaseAdmin` and never
//     throws to the caller: the email send is the legal record, the
//     table is a UI convenience, so an INSERT failure must NEVER turn a
//     successful form submit into a 500 the customer sees.
//   * `INTAKE_ROUTING_ROLES` is the single source of truth for which
//     employee roles get the "new query" bell-icon notification. Q2
//     (the notify slice) reads this.
//
// Source-locked at `__tests__/leads/intake.test.ts`.

import type { SupabaseClient } from '@supabase/supabase-js';
import { notifyMany } from '@/lib/notifications';

/** Roles that get an in-app notification when a public query arrives.
 *  Centralized so future role additions stay in lockstep. */
export const INTAKE_ROUTING_ROLES = [
  'admin',
  'employee',
  'equipment_manager',
  'field_crew',
] as const;
export type IntakeRoutingRole = (typeof INTAKE_ROUTING_ROLES)[number];

/** Shape of the form data the public route hands us. Kept as a separate
 *  loose-typed structure (rather than the route's `NormalizedData`) so
 *  the helper stays portable to other intake surfaces (e.g. a future
 *  pricing-calculator API that doesn't share the same shape). */
export interface LeadIntakeInput {
  name: string;
  email: string;
  phone?: string;
  company?: string;
  /** Human-readable address (already joined "<street>, <city>") OR
   *  just the street; the helper does NOT re-join. The caller is the
   *  one with route-specific knowledge of the form fields. */
  propertyAddress?: string;
  /** Two-letter US state, defaults to 'TX' inside the `leads` schema. */
  state?: string;
  city?: string;
  serviceType?: string;
  /** Free-text project notes the customer typed. */
  projectDetails?: string;
  /** Numeric acreage estimate when present (calculator path supplies it). */
  estimatedAcreage?: number;
  /** UUID-ish reference number the route already generates (`SS-…-XXX`)
   *  — stored at the head of `notes` so the surveyor can correlate
   *  an inbox email with its DB row. */
  referenceNumber: string;
  /** Discriminator the caller passes so source attribution is honest.
   *  Today: `'Website'` for the contact form, `'Pricing Calculator'`
   *  for the calculator path. */
  source: string;
  /** When true, the calculator's rush flag — surfaces as escalation in
   *  the notification (Q2 reads this). Pure-data side, no behavior. */
  isRush?: boolean;
  /** lead-attachments-2026-06-18 — summary of any files the customer
   *  attached to the public form. Stored as JSONB on the lead row so
   *  the admin detail page can list them. The contact route still
   *  emails the bytes via Resend; persisting bytes to Supabase storage
   *  is a follow-up slice. */
  attachments?: ReadonlyArray<{ name: string; size: number; storage_path?: string }>;
}

/** Output shape — every column in the `leads` table the helper writes.
 *  Columns it doesn't set fall back to schema defaults (`status='new'`,
 *  `state='TX'`, timestamps, etc.). */
export interface LeadRow {
  name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  source: string;
  status: 'new';
  notes: string;
  property_address: string | null;
  city: string | null;
  state: string;
  survey_type: string | null;
  estimated_acreage: number | null;
  created_by: 'website-form';
  /** lead-attachments-2026-06-18 — empty array when the customer
   *  attached no files. Always non-null so the JSONB column's NOT
   *  NULL constraint holds. */
  attachments: ReadonlyArray<{ name: string; size: number; storage_path?: string }>;
}

/** Pure mapper — takes the route's normalized payload, produces a
 *  `leads` row ready for INSERT. Empty optional fields collapse to
 *  null so the schema's "absent" semantics apply (vs. an empty
 *  string which a status filter might treat as a real value). */
export function buildLeadRowFromForm(input: LeadIntakeInput): LeadRow {
  const cleanString = (v: string | undefined): string | null => {
    const trimmed = v?.trim() ?? '';
    return trimmed === '' ? null : trimmed;
  };

  // Prefix the customer-supplied notes with the reference number so
  // the surveyor can find the matching email in their inbox without
  // copy-pasting addresses. If the customer left projectDetails blank
  // the notes are just the reference (still useful as a paper trail).
  const noteParts: string[] = [`Ref: ${input.referenceNumber}`];
  const details = cleanString(input.projectDetails);
  if (details) noteParts.push(details);

  return {
    name: input.name.trim(),
    email: cleanString(input.email),
    phone: cleanString(input.phone),
    company: cleanString(input.company),
    source: input.source,
    status: 'new',
    notes: noteParts.join('\n\n'),
    property_address: cleanString(input.propertyAddress),
    city: cleanString(input.city),
    state: (cleanString(input.state) ?? 'TX').toUpperCase(),
    survey_type: cleanString(input.serviceType),
    estimated_acreage:
      typeof input.estimatedAcreage === 'number' && Number.isFinite(input.estimatedAcreage)
        ? input.estimatedAcreage
        : null,
    created_by: 'website-form',
    // lead-attachments-2026-06-18 — copy through the file summaries
    // the route built from the multipart payload. Always an array
    // (empty when no files) so the JSONB column stays NOT NULL.
    attachments: (input.attachments ?? []).map((a) => ({
      name: a.name,
      size: a.size,
      ...(a.storage_path ? { storage_path: a.storage_path } : {}),
    })),
  };
}

// ────────────────────────────────────────────────────────────────────
// Q2 — notify intake-role employees
// ────────────────────────────────────────────────────────────────────

/** Returns every distinct email address in `registered_users` whose
 *  `roles` array intersects `INTAKE_ROUTING_ROLES`. Excludes banned
 *  and unapproved users so a new query doesn't ping someone whose
 *  access was revoked. */
export async function findIntakeRecipients(
  client: Pick<SupabaseClient, 'from'>,
): Promise<string[]> {
  try {
    const { data, error } = await client
      .from('registered_users')
      .select('email, roles, is_approved, is_banned')
      .overlaps('roles', INTAKE_ROUTING_ROLES as unknown as string[]);
    if (error || !data) {
      console.error('[leads.intake] findIntakeRecipients failed:', error);
      return [];
    }
    const out = new Set<string>();
    for (const row of data) {
      const r = row as { email: string; is_approved: boolean; is_banned: boolean };
      if (r.is_banned) continue;
      if (r.is_approved === false) continue;
      if (typeof r.email === 'string' && r.email.length > 0) out.add(r.email.toLowerCase());
    }
    return Array.from(out);
  } catch (err) {
    console.error('[leads.intake] findIntakeRecipients threw:', err);
    return [];
  }
}

/** Fire the "new lead" in-app notification to every intake-role
 *  employee. Same safe-insert contract as `insertLeadFromForm` —
 *  errors are swallowed so a notification glitch can't 500 the
 *  customer's form submission. */
export async function notifyIntakeRecipients(
  client: Pick<SupabaseClient, 'from'>,
  args: {
    leadId: string;
    input: LeadIntakeInput;
  },
): Promise<{ recipientCount: number }> {
  const recipients = await findIntakeRecipients(client);
  if (recipients.length === 0) return { recipientCount: 0 };

  const { input, leadId } = args;
  const bodyParts: string[] = [];
  if (input.serviceType) bodyParts.push(input.serviceType);
  if (input.propertyAddress) bodyParts.push(input.propertyAddress);
  bodyParts.push(`Ref: ${input.referenceNumber}`);
  if (input.isRush) bodyParts.push('🔥 RUSH');

  try {
    await notifyMany(recipients, {
      type: 'lead.new',
      title: `New customer query: ${input.name}`,
      body: bodyParts.join(' · '),
      icon: 'mail',
      // Slice S1 — point the bell-icon deep link at the focused detail
      // page (responsive single-screen view) rather than the list-with-
      // outlined-card. The list page still respects `?focus=<id>` if
      // a user reuses old links from their email archive.
      link: `/admin/leads/${leadId}`,
      source_type: 'leads',
      source_id: leadId,
      escalation_level: input.isRush ? 'high' : 'normal',
    });
  } catch (err) {
    console.error('[leads.intake] notifyMany threw:', err);
  }
  return { recipientCount: recipients.length };
}

/** Insert a lead row. Returns the new lead's `id` on success, or `null`
 *  when the INSERT failed (the caller logs + continues; the email send
 *  remains the legal record of the customer query). */
export async function insertLeadFromForm(
  client: Pick<SupabaseClient, 'from'>,
  input: LeadIntakeInput,
): Promise<{ id: string } | null> {
  const row = buildLeadRowFromForm(input);
  try {
    const { data, error } = await client
      .from('leads')
      .insert(row)
      .select('id')
      .single();
    if (error || !data) {
      console.error('[leads.intake] INSERT failed:', error);
      return null;
    }
    return { id: data.id as string };
  } catch (err) {
    // Never throw to the caller — the customer's form post must succeed
    // off the email send alone. UI-side leads visibility is a polish
    // surface, not a legal one.
    console.error('[leads.intake] INSERT threw:', err);
    return null;
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// lead-attachments-storage-2026-06-18 — file-bytes path
// ──────────────────────────────────────────────────────────────────────────────

/** Private Supabase Storage bucket created by seeds/318. */
export const LEAD_ATTACHMENTS_BUCKET = 'lead-attachments';

/** Update an existing lead row's `attachments` column. Used by the
 *  contact route to backfill storage paths once the file upload to the
 *  Supabase bucket finishes (the upload key needs the lead.id, so we
 *  do this in two passes: INSERT first, then PATCH the attachments).
 *  Errors are swallowed — failure here drops back to the
 *  metadata-only attachments saved at insert time. */
export async function updateLeadAttachments(
  client: Pick<SupabaseClient, 'from'>,
  leadId: string,
  attachments: ReadonlyArray<{ name: string; size: number; storage_path?: string }>,
): Promise<boolean> {
  try {
    const { error } = await client
      .from('leads')
      .update({ attachments })
      .eq('id', leadId);
    if (error) {
      console.error('[leads.intake] updateLeadAttachments failed:', error);
      return false;
    }
    return true;
  } catch (err) {
    console.error('[leads.intake] updateLeadAttachments threw:', err);
    return false;
  }
}

/** Pure helper — slug-ify a customer-supplied filename so it's safe in a
 *  storage path. Keeps the extension and the basic ASCII run; replaces
 *  anything else with `_`. Empty / unparseable names fall back to
 *  `attachment`. */
export function sanitizeAttachmentFilename(name: string | null | undefined): string {
  const raw = (name ?? '').trim();
  if (raw.length === 0) return 'attachment';
  // Strip directory traversal + control chars + reserved fs chars.
  const safe = raw
    .replace(/[\\/]+/g, '_')
    .replace(/\.{2,}/g, '.')
    .replace(/[^A-Za-z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return safe.length === 0 ? 'attachment' : safe;
}

/** Pure helper — build the storage object path for a single attachment.
 *  Pattern: `<leadId>/<uuid>-<safe-name>`. The UUID prefix prevents
 *  collisions when the same customer sends two files with the same name. */
export function buildAttachmentStoragePath(
  leadId: string,
  uuid: string,
  filename: string,
): string {
  return `${leadId}/${uuid}-${sanitizeAttachmentFilename(filename)}`;
}

/** Minimal Storage surface — keeps the upload helper testable without
 *  pulling the full SupabaseClient into vitest. */
interface StorageBucketSurface {
  upload: (
    path: string,
    data: ArrayBuffer | Buffer | Uint8Array,
    options?: { contentType?: string; upsert?: boolean },
  ) => Promise<{ data: unknown; error: { message: string } | null }>;
  createSignedUrl: (path: string, expiresInSeconds: number) =>
    Promise<{ data: { signedUrl: string } | null; error: { message: string } | null }>;
}

interface StorageSurface {
  from: (bucket: string) => StorageBucketSurface;
}

/** Upload every attachment in `files` to the lead-attachments bucket and
 *  return a parallel array of `{name, size, storage_path}` summaries.
 *  Errors are swallowed per-file: a failed upload omits its storage_path
 *  but keeps the name/size so the admin page can still surface the
 *  filename.
 *
 *  LR2 of lead-reply-expansion-2026-06-18.md — the `pathPrefix` arg
 *  (optional) overrides the leadId-based prefix so the reply route
 *  can store its files under `replies/<reply_id>/...` instead of
 *  alongside the intake attachments. Defaults to `leadId` (existing
 *  intake call sites are unchanged). */
export async function uploadLeadAttachments(
  storage: StorageSurface,
  leadId: string,
  files: ReadonlyArray<{ name: string; size: number; bytes: ArrayBuffer | Buffer | Uint8Array; contentType?: string }>,
  makeUuid: () => string = () => crypto.randomUUID(),
  pathPrefix?: string,
): Promise<Array<{ name: string; size: number; storage_path?: string }>> {
  if (files.length === 0) return [];
  const bucket = storage.from(LEAD_ATTACHMENTS_BUCKET);
  const prefix = pathPrefix ?? leadId;
  const out: Array<{ name: string; size: number; storage_path?: string }> = [];
  for (const f of files) {
    const path = buildAttachmentStoragePath(prefix, makeUuid(), f.name);
    try {
      const { error } = await bucket.upload(path, f.bytes, {
        contentType: f.contentType ?? 'application/octet-stream',
        upsert: false,
      });
      if (error) {
        console.error('[leads.intake] upload failed for', f.name, error);
        out.push({ name: f.name, size: f.size });
      } else {
        out.push({ name: f.name, size: f.size, storage_path: path });
      }
    } catch (err) {
      console.error('[leads.intake] upload threw for', f.name, err);
      out.push({ name: f.name, size: f.size });
    }
  }
  return out;
}

/** Sign each `storage_path` in `attachments` with a short-lived URL so
 *  the admin page can render a download link without exposing the bucket.
 *  Errors per-file: a failed sign drops `storage_path` so the page falls
 *  back to the info-styled chip. Default expiry: 1 hour. */
export async function signLeadAttachmentUrls(
  storage: StorageSurface,
  attachments: ReadonlyArray<{ name: string; size: number; storage_path?: string }>,
  expiresInSeconds: number = 3600,
): Promise<Array<{ name: string; size: number; storage_path?: string }>> {
  const bucket = storage.from(LEAD_ATTACHMENTS_BUCKET);
  const out: Array<{ name: string; size: number; storage_path?: string }> = [];
  for (const a of attachments) {
    if (!a.storage_path) {
      out.push({ name: a.name, size: a.size });
      continue;
    }
    try {
      const { data, error } = await bucket.createSignedUrl(a.storage_path, expiresInSeconds);
      if (error || !data?.signedUrl) {
        console.error('[leads.intake] sign failed for', a.name, error);
        out.push({ name: a.name, size: a.size });
      } else {
        out.push({ name: a.name, size: a.size, storage_path: data.signedUrl });
      }
    } catch (err) {
      console.error('[leads.intake] sign threw for', a.name, err);
      out.push({ name: a.name, size: a.size });
    }
  }
  return out;
}

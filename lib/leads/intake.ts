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
import { hasAttribution, type Attribution } from './attribution';
import { upsertCustomer } from '@/lib/customers/identity';
import { recordMilestone } from '@/lib/pipeline/events';

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
  /** G1-2 — where the visitor came from, captured on their FIRST page and
   *  posted along with the form. Absent for phone/referral/walk-in leads,
   *  which is the majority: never treat its absence as an error. */
  attribution?: Attribution | null;
  /** A13 — what the customer picked from "How Did You Hear About Us?".
   *
   *  The form has asked this since launch and the answer went into the notification email and NOWHERE
   *  ELSE. Every submission answered the attribution question and the answer was deleted on arrival.
   *
   *  Self-reported and weak, and that is exactly why it is worth keeping: a phone or referral lead
   *  carries no click, so this is the only signal it has at all. It is an internal dimension only —
   *  never uploaded to Google, because "she saw us on Facebook" is not a conversion signal. */
  howHeard?: string;
  /** Salted hash of the submitting IP, computed by the route (which is the
   *  only layer that can see it). Never the raw address. */
  clientIpHash?: string | null;
  clientUserAgent?: string | null;
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
  /** A13 — the customer's own answer. Null when they skipped the dropdown, which is common. */
  how_heard: string | null;
  created_by: 'website-form';
  /** lead-attachments-2026-06-18 — empty array when the customer
   *  attached no files. Always non-null so the JSONB column's NOT
   *  NULL constraint holds. */
  attachments: ReadonlyArray<{ name: string; size: number; storage_path?: string }>;
  /** G1-3 attribution columns. Every one nullable, and NULL is the normal case — a phone lead, a
   *  referral and a walk-in have none of them. Written as `null` rather than omitted so the mapper's
   *  output is the full row shape and a missing column is a type error rather than a silent gap. */
  gclid: string | null;
  gbraid: string | null;
  wbraid: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_term: string | null;
  utm_content: string | null;
  landing_page: string | null;
  referrer: string | null;
  first_seen_at: string | null;
  client_user_agent: string | null;
  client_ip_hash: string | null;
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
    how_heard: cleanString(input.howHeard),
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
    // G1-2 — attribution, carried through untouched.
    //
    // `hasAttribution` guards the whole block rather than each field, and that is the point: a payload
    // with nothing identifying in it writes THIRTEEN nulls, not thirteen empty strings. An empty string
    // is a value — "did this lead come from an ad" would answer yes for every walk-in the moment one
    // query used `IS NOT NULL`.
    ...emptyAttributionColumns(),
    ...(hasAttribution(input.attribution)
      ? {
        gclid: cleanString(input.attribution!.gclid),
        gbraid: cleanString(input.attribution!.gbraid),
        wbraid: cleanString(input.attribution!.wbraid),
        utm_source: cleanString(input.attribution!.utm_source),
        utm_medium: cleanString(input.attribution!.utm_medium),
        utm_campaign: cleanString(input.attribution!.utm_campaign),
        utm_term: cleanString(input.attribution!.utm_term),
        utm_content: cleanString(input.attribution!.utm_content),
        landing_page: cleanString(input.attribution!.landing_page),
        referrer: cleanString(input.attribution!.referrer),
        first_seen_at: cleanString(input.attribution!.first_seen_at),
      }
      : {}),
    // These two come from the REQUEST, not the form, so they are recorded even for a lead with no
    // click identifiers — they are how a duplicate submission is spotted later.
    client_user_agent: cleanString(input.clientUserAgent ?? undefined),
    client_ip_hash: cleanString(input.clientIpHash ?? undefined),
  };
}

/** All thirteen attribution columns as null. Spread FIRST so the block above overwrites only what it
 *  actually has — which is what makes "no attribution" write nulls instead of leaving columns missing
 *  from the insert object entirely. */
function emptyAttributionColumns() {
  return {
    gclid: null, gbraid: null, wbraid: null,
    utm_source: null, utm_medium: null, utm_campaign: null, utm_term: null, utm_content: null,
    landing_page: null, referrer: null, first_seen_at: null,
    client_user_agent: null, client_ip_hash: null,
  } satisfies Pick<
    LeadRow,
    'gclid' | 'gbraid' | 'wbraid' | 'utm_source' | 'utm_medium' | 'utm_campaign' | 'utm_term'
    | 'utm_content' | 'landing_page' | 'referrer' | 'first_seen_at' | 'client_user_agent' | 'client_ip_hash'
  >;
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
    // A3 — give the enquiry a CUSTOMER before the lead row is written, so a returning landowner is
    // recognisable the moment their enquiry lands rather than after someone notices the name.
    //
    // `upsertCustomer` never throws and returns null on any failure, which is the behaviour this function
    // already relies on for its own insert: the email send is the legal record, everything else is
    // enrichment, and a customer-matching problem must never turn a successful form submit into a 500 the
    // customer sees. A lead with a null `customer_id` is a lead the backfill can pick up later.
    const customer = await upsertCustomer({
      name: input.name,
      email: input.email,
      phone: input.phone,
      company: input.company,
      address: input.propertyAddress,
    });

    const { data, error } = await client
      .from('leads')
      .insert({ ...row, customer_id: customer?.id ?? null })
      .select('id')
      .single();
    if (error || !data) {
      console.error('[leads.intake] INSERT failed:', error);
      return null;
    }

    // A4 — milestone 1. The front of the stream, and the only one written at INSERT rather than derived
    // from a status change (which is why `milestoneForLeadStatus('new')` deliberately returns null — it
    // would otherwise record this a second time every time someone reverted a lead to new).
    await recordMilestone({
      milestone: 'inquiry_received',
      leadId: data.id as string,
      customerId: customer?.id ?? null,
      actor: 'website-form',
      sourceTable: 'leads',
      sourceId: data.id as string,
      // The campaign travels WITH the milestone, so the funnel can group by campaign without joining
      // back to the lead — and so it stays true even if the lead row is later edited.
      metadata: input.attribution
        ? { utm_campaign: input.attribution.utm_campaign ?? null, utm_source: input.attribution.utm_source ?? null }
        : {},
    });

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

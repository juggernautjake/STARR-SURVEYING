// lib/leads/carry-over.ts — slice J4 of
// docs/planning/completed/JOB_LIFECYCLE_AND_BRIEFINGS_2026-08-14.md
//
// > **Done when:** converting a lead carries its contacts, quote and attachments onto the job, and
// > the job links back to the lead it came from.
//
// ── WHAT THE CONVERSION ALREADY DID, AND WHAT IT DROPPED ────────────────────────────────────────
//
// `buildJobDraftFromLead` prefills the form well: name, address, acreage, the client's contact
// details, the quote amount, the notes. `origin_lead_id` and `customer_id` ride along, and the job
// page links back. That is the part everybody could see working.
//
// Three things fell on the floor, all of them invisible because their absence looks like an empty
// panel rather than an error:
//
//   1. **The customer's files.** `leads.attachments` holds whatever they uploaded on the contact
//      form — very often the deed or the old plat, i.e. the single most useful document on the job.
//      It stayed in the `lead-attachments` bucket, reachable only from the lead detail page, which
//      nobody opens again after conversion. The crew's file list started empty on a job whose
//      customer had already sent the plat.
//   2. **What was actually agreed.** `leads.quote_amount` is a MIRROR of the live quote's number
//      (see lib/leads/quotes.ts). The accepted quote's `scope_notes` — the sentence describing what
//      that money buys — is the thing that gets argued about in month three, and it was not carried.
//   3. **The contact record.** `customer_id` landed on the job row, so the join was there in the
//      database, and the job's Contacts panel reads `job_contacts`, which had no row. The job knew
//      who the client was and the screen for showing that was empty.
//
// ── WHY IT IS A LIB AND NOT INLINE IN THE ROUTE ─────────────────────────────────────────────────
//
// There are TWO paths from a lead to a job: an admin converting one by hand, and a customer
// accepting a proposal (`app/api/public/proposal/[token]/route.ts`, which creates the job itself).
// Fixing only the one somebody was looking at is how the second path stays broken for a year.
//
// Best-effort by design: a job that exists with no attachments carried is recoverable, and a
// conversion that 500s because a file copy failed loses the job the customer just accepted.

import { supabaseAdmin } from '@/lib/supabase';
import { LEAD_ATTACHMENTS_BUCKET } from '@/lib/leads/intake';

export interface CarryOverResult {
  filesCarried: number;
  contactLinked: boolean;
  scopeCarried: boolean;
  /** Anything that failed, named. Returned rather than thrown so the caller can log a conversion
   *  that half-worked — the state this used to leave silently. */
  problems: string[];
}

interface LeadAttachment { name?: string; size?: number; storage_path?: string }

/**
 * Decide which of a lead's attachments are worth copying onto the job.
 *
 * Pure, so the rule is testable without storage. An attachment with no `storage_path` is a summary
 * row from before the bytes were stored (the intake helper writes name+size first and patches the
 * path in a second pass) — copying one produces a `job_files` row pointing at nothing, which
 * renders as a broken download rather than as a missing file.
 */
export function attachmentsWorthCarrying(
  raw: unknown,
): { name: string; storage_path: string; size: number | null }[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: { name: string; storage_path: string; size: number | null }[] = [];
  for (const item of raw as LeadAttachment[]) {
    const path = typeof item?.storage_path === 'string' ? item.storage_path.trim() : '';
    if (!path || seen.has(path)) continue;
    seen.add(path);
    out.push({
      // A file with no name still gets carried — the bytes are the point, and the path's basename
      // is a better label than dropping the customer's deed for want of a title.
      name: (typeof item.name === 'string' && item.name.trim()) || path.split('/').pop() || 'attachment',
      storage_path: path,
      size: typeof item.size === 'number' && Number.isFinite(item.size) ? item.size : null,
    });
  }
  return out;
}

/**
 * Move everything a lead knows onto the job it became.
 *
 * Idempotent where it can be: re-running does not duplicate the contact link, and files are matched
 * on the source path so a retry after a partial failure copies only what is missing.
 */
export async function carryLeadOntoJob(args: {
  leadId: string;
  jobId: string;
  orgId?: string | null;
  actorEmail: string;
}): Promise<CarryOverResult> {
  const { leadId, jobId, actorEmail } = args;
  const result: CarryOverResult = { filesCarried: 0, contactLinked: false, scopeCarried: false, problems: [] };

  const { data: lead, error: leadErr } = await supabaseAdmin
    .from('leads')
    .select('id, name, email, phone, company, attachments, customer_id, notes')
    .eq('id', leadId)
    .maybeSingle();
  if (leadErr || !lead) {
    result.problems.push(`Could not read the lead: ${leadErr?.message ?? 'not found'}.`);
    return result;
  }
  const leadRow = lead as {
    id: string; name: string | null; email: string | null; phone: string | null;
    company: string | null; attachments: unknown; customer_id: string | null;
  };

  // ── 1. the customer's files ────────────────────────────────────────────────────────────────────
  const attachments = attachmentsWorthCarrying(leadRow.attachments);
  if (attachments.length > 0) {
    // Which of them are already on the job, so a retry does not duplicate. `description` carries the
    // provenance and is what this matches on — there is no column for "copied from".
    const { data: already } = await supabaseAdmin
      .from('job_files').select('description').eq('job_id', jobId).eq('section', 'from-customer');
    const have = new Set(
      ((already ?? []) as { description: string | null }[])
        .map((f) => f.description ?? '')
        .filter(Boolean),
    );

    for (const att of attachments) {
      const provenance = `Sent by the customer with their enquiry (lead ${leadId}) · ${att.storage_path}`;
      if (have.has(provenance)) continue;

      // Copied inside storage, not re-uploaded through this process: `copy` is a server-side move of
      // the object, so a 40 MB plat costs no bandwidth here and cannot be truncated by a timeout.
      // The lead's copy stays where it is — the lead detail page still shows what the customer sent,
      // and a conversion is not a reason to remove the record of the enquiry.
      const destination = `jobs/${jobId}/from-customer/${att.storage_path.split('/').pop()}`;
      const { error: copyErr } = await supabaseAdmin.storage
        .from(LEAD_ATTACHMENTS_BUCKET)
        .copy(att.storage_path, destination);
      if (copyErr && !/exists/i.test(copyErr.message)) {
        result.problems.push(`Could not copy “${att.name}”: ${copyErr.message}`);
        continue;
      }

      const { error: rowErr } = await supabaseAdmin.from('job_files').insert({
        job_id: jobId,
        file_name: att.name,
        name: att.name,
        file_type: 'document',
        storage_path: destination,
        file_size_bytes: att.size,
        // Its own section, so the crew can tell what the customer sent from what the office
        // produced. That distinction matters on a boundary job: the customer's old plat is
        // evidence, and the firm's plat is a deliverable.
        section: 'from-customer',
        description: provenance,
        uploaded_by: actorEmail,
        upload_state: 'done',
      });
      if (rowErr) {
        result.problems.push(`Copied “${att.name}” but could not file it on the job: ${rowErr.message}`);
        continue;
      }
      result.filesCarried += 1;
    }
  }

  // ── 2. the contact ─────────────────────────────────────────────────────────────────────────────
  //
  // ── customers AND contacts ARE DIFFERENT TABLES ──────────────────────────────────────────────
  //
  // `leads.customer_id` is an FK to `customers` (seed 503) — the billing identity behind the /pay
  // portal. `job_contacts.contact_id` is an FK to `contacts` (seed 305) — the address book the job
  // page's Contacts panel renders. They are two different ideas that both mean "the client", and
  // writing the customer id into the contact column looked obviously right and fails the foreign
  // key outright. It is written down here because the next person will reach for `customer_id` too.
  //
  // So the person is matched into the address book by email, and added if they are not there. Email
  // rather than name: two people called "James Wright" are two contacts, and one person with their
  // name typed differently on two enquiries is one.
  const contactEmail = leadRow.email?.trim().toLowerCase() ?? '';
  const contactName = leadRow.name?.trim() ?? '';
  if (contactName) {
    let contactId: string | null = null;

    if (contactEmail) {
      const { data: found } = await supabaseAdmin
        .from('contacts').select('id').ilike('email', contactEmail).limit(1).maybeSingle();
      contactId = (found as { id: string } | null)?.id ?? null;
    }

    if (!contactId) {
      const { data: created, error: createErr } = await supabaseAdmin
        .from('contacts')
        .insert({
          name: contactName,
          email: leadRow.email?.trim() || null,
          phone: leadRow.phone?.trim() || null,
          company: leadRow.company?.trim() || null,
          labels: ['current_customer'],
          notes: `Added automatically when their enquiry became a job.`,
          created_by: actorEmail,
        })
        .select('id')
        .single();
      if (createErr) result.problems.push(`Could not add the customer to the address book: ${createErr.message}`);
      else contactId = (created as { id: string }).id;
    }

    if (contactId) {
      // `job_contacts` has a UNIQUE on (job_id, contact_id, role), so a re-run collides rather than
      // duplicating. `ignoreDuplicates` makes that a no-op instead of an error the caller has to
      // pattern-match on a Postgres code to recognise.
      const { error: linkErr } = await supabaseAdmin
        .from('job_contacts')
        .upsert(
          {
            job_id: jobId,
            contact_id: contactId,
            role: 'client',
            notes: 'Carried over from the lead this job came from.',
            // NOT NULL on this table. Omitting it fails the insert, and the failure would have been
            // swallowed into `problems` and read as "the contact panel is just empty".
            created_by: actorEmail,
          },
          { onConflict: 'job_id,contact_id,role', ignoreDuplicates: true },
        );
      if (linkErr) result.problems.push(`Could not link the customer to the job: ${linkErr.message}`);
      else result.contactLinked = true;
    }
  }

  // ── 3. what was agreed ─────────────────────────────────────────────────────────────────────────
  //
  // `leads.quote_amount` is a mirror of the live quote's number and is already on the job. The
  // sentence describing what that money buys is not, and it is what gets argued about in month
  // three. Written to `jobs.deliverables`, which is the free-text "what this job hands over" field
  // the Overview tab already renders — rather than a new column nothing would read.
  const { data: quotes } = await supabaseAdmin
    .from('lead_quotes')
    .select('id, version, amount_cents, status, scope_notes')
    .eq('lead_id', leadId)
    .order('version', { ascending: false });
  const accepted = ((quotes ?? []) as Array<{ status: string; scope_notes: string | null; amount_cents: number; version: number }>)
    .find((q) => q.status === 'accepted');
  if (accepted?.scope_notes?.trim()) {
    const { data: job } = await supabaseAdmin.from('jobs').select('deliverables').eq('id', jobId).maybeSingle();
    const current = (job as { deliverables: string | null } | null)?.deliverables?.trim() ?? '';
    const carried = `Agreed in the accepted quote (v${accepted.version}, `
      + `$${(accepted.amount_cents / 100).toLocaleString('en-US')}):\n${accepted.scope_notes.trim()}`;
    // Only if there is nothing there. Overwriting somebody's typed scope with the quote's would be
    // a conversion silently editing a job that has been worked on.
    if (!current) {
      const { error: scopeErr } = await supabaseAdmin
        .from('jobs').update({ deliverables: carried }).eq('id', jobId);
      if (scopeErr) result.problems.push(`Could not carry the agreed scope: ${scopeErr.message}`);
      else result.scopeCarried = true;
    }
  }

  return result;
}

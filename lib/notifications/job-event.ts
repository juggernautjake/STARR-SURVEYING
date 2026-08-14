// lib/notifications/job-event.ts — slices N1 and N2 of
// docs/planning/in-progress/JOB_LIFECYCLE_AND_BRIEFINGS_2026-08-14.md
//
// Owner, 2026-08-14: *"Every time something happens with a job that someone is assigned to, they
// should get a notification about that thing."*
//
// ── WHY ONE FUNCTION AND NOT A `notify()` AT EACH SITE ──────────────────────────────────────────
//
// There are already a dozen routes that mutate a job — stage, files, photos, team, instructions,
// deliverables, receipts, schedule — and exactly ONE of them notified anybody: the stage change.
// The obvious repair is to sprinkle `notify()` through the other eleven.
//
// That produces eleven definitions of "who is on this job". They agree on the day they are written
// and drift the first time somebody adds a `state` column to `job_team`, at which point two routes
// disagree about whether a crew member who declined still gets told. The bug is unfindable because
// each site looks correct on its own.
//
// So: one resolver, one notifier, and a source-scan test (N5) that fails the build when a route
// writes to a job table without going through here.
//
// ── WHAT "ON THIS JOB" MEANS ────────────────────────────────────────────────────────────────────
//
// Active `job_team` membership plus the lead RPLS. Deliberately NOT everyone who ever touched it:
//   · `removed_at` set  → they are off the job; telling them is a leak, not a courtesy.
//   · `declined_at` set → they said no. Continuing to notify them is how notifications get muted.
//   · the actor         → they just did the thing.
//
// The lead RPLS is included even without a `job_team` row, because they are accountable for the job
// whether or not anybody remembered to add them to the crew list.

import { supabaseAdmin } from '@/lib/supabase';
import { notifyMany } from '@/lib/notifications';

/** A row of `job_team`, narrowed to what recipient resolution needs. */
export interface JobTeamMemberRow {
  user_email: string | null;
  removed_at?: string | null;
  declined_at?: string | null;
}

/**
 * Who should hear about something happening on this job.
 *
 * Pure — the database read is the caller's, so the rule can be tested without one. De-duped
 * case-insensitively, keeping first-seen casing, because `Hank@…` and `hank@…` are one person and
 * two notifications.
 */
export function jobRecipients(
  team: ReadonlyArray<JobTeamMemberRow>,
  leadRplsEmail: string | null | undefined,
  actorEmail: string | null | undefined,
): string[] {
  const actor = actorEmail?.trim().toLowerCase() ?? '';
  const seen = new Set<string>();
  const out: string[] = [];

  const add = (raw: string | null | undefined) => {
    const email = raw?.trim();
    if (!email) return;
    const key = email.toLowerCase();
    if (key === actor || seen.has(key)) return;
    seen.add(key);
    out.push(email);
  };

  for (const m of team) {
    // A member who has left or declined is not on the job. Both are checked because they are
    // different exits and only one of them was in the original stage-change helper.
    if (m.removed_at || m.declined_at) continue;
    add(m.user_email);
  }
  add(leadRplsEmail);
  return out;
}

/** The things that can happen to a job. Adding one here is the whole cost of notifying about it. */
export type JobEventKind =
  | 'stage_changed'
  | 'file_uploaded'
  | 'photo_uploaded'
  | 'instructions_changed'
  | 'deliverable_created'
  | 'deliverable_sealed'
  | 'deliverable_issued'
  | 'briefing_published'
  | 'briefing_appended'
  | 'team_changed'
  | 'receipt_linked'
  | 'payment_recorded'
  | 'schedule_changed';

export interface JobEvent {
  kind: JobEventKind;
  /** One line, already in the past tense and naming the thing. Shown as the notification title. */
  title: string;
  /** Optional detail. Kept short — this lands on a phone banner. */
  body?: string;
  /** Where the notification takes you. Defaults to the job. */
  link?: string;
  /** `briefing_published` is the one event that is genuinely an announcement. Everything else is
   *  ambient, and marking it all `high` is how a phone gets ignored. See D5 in the plan. */
  escalation?: 'low' | 'normal' | 'high';
}

/**
 * Tell everyone on a job that something happened.
 *
 * Never throws. A notification that fails must not fail the thing it is reporting — an upload that
 * 500s because a push could not be delivered is a worse bug than a silent upload, and this is called
 * from inside routes whose real work has already committed by the time it runs.
 */
export async function notifyJobEvent(
  jobId: string,
  event: JobEvent,
  actorEmail: string | null | undefined,
): Promise<{ notified: number }> {
  try {
    const [{ data: job }, { data: team }] = await Promise.all([
      supabaseAdmin.from('jobs').select('job_number, name, lead_rpls_email').eq('id', jobId).maybeSingle(),
      supabaseAdmin.from('job_team').select('user_email, removed_at, declined_at').eq('job_id', jobId),
    ]);
    if (!job) return { notified: 0 };

    const recipients = jobRecipients(
      (team ?? []) as JobTeamMemberRow[],
      (job as { lead_rpls_email: string | null }).lead_rpls_email,
      actorEmail,
    );
    if (recipients.length === 0) return { notified: 0 };

    const number = (job as { job_number: string | null }).job_number ?? '';
    const jobName = (job as { name: string | null }).name ?? 'a job';

    await notifyMany(recipients, {
      type: `job_${event.kind}`,
      // The job is named in the title because a phone banner shows the title and little else, and
      // "A file was uploaded" about an unnamed job is a notification you have to open to triage.
      title: `${number ? `${number} · ` : ''}${jobName} — ${event.title}`,
      body: event.body,
      link: event.link ?? `/admin/jobs/${jobId}`,
      source_type: 'job',
      source_id: jobId,
      escalation_level: event.escalation ?? 'normal',
      // NO `thread_id`. The intent was to group a day's activity on one job rather than stack twelve
      // banners, and `thread_id` looked like the field for it — but it is a FK to
      // `admin_discussion_threads`, so a job id fails the constraint. `source_type`/`source_id`
      // already identify the job and are what a grouping view should read.
      //
      // Both wrong guesses were invisible until `notifyMany` was made to check the error it gets
      // back: this reported "notified 2" and wrote nothing, twice, before the log existed.
    });
    return { notified: recipients.length };
  } catch (err) {
    console.warn('[notifyJobEvent] could not notify', {
      jobId, kind: event.kind, error: err instanceof Error ? err.message : String(err),
    });
    return { notified: 0 };
  }
}

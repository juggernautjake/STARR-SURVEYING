// lib/jobs/crew.ts — pure derivation of a job's crew + lead RPLS from its job_team rows.
//
// The Work Mode field hub (B2) shows "who's on this job": the lead RPLS overseeing it and the rest of
// the crew. That split is pure data-shaping over `job_team`, so it lives here — unit-testable off the
// component, and shared by any surface that needs the same answer.

export interface JobTeamMember {
  user_email?: string | null;
  user_name?: string | null;
  role?: string | null;
}
export interface JobCrewInput {
  job_team?: JobTeamMember[] | null;
  /** Fallback RPLS when no team member carries the lead_rpls role (email-only assignment). */
  lead_rpls_email?: string | null;
}

/** Everyone on the job EXCEPT the lead RPLS — the crew working under them. */
export function jobCrew(job: JobCrewInput): JobTeamMember[] {
  return (job.job_team ?? []).filter((m) => (m.role ?? '') !== 'lead_rpls');
}

/** The lead RPLS overseeing the job: the team member with role `lead_rpls` (by name), else the job's
 *  `lead_rpls_email` fallback, else null when nobody is assigned. */
export function jobRpls(job: JobCrewInput): string | null {
  return (job.job_team ?? []).find((m) => (m.role ?? '') === 'lead_rpls')?.user_name || job.lead_rpls_email || null;
}

/** A readable crew line ("Ana, Ben"), name preferred over email, blanks skipped. Empty when no crew. */
export function crewNames(crew: JobTeamMember[]): string {
  return crew.map((m) => m.user_name || m.user_email).filter(Boolean).join(', ');
}

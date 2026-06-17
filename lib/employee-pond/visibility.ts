// lib/employee-pond/visibility.ts
//
// employee-pond Slice E12 — role-based + per-user privacy contract.
// Source of truth for "who can see what" across every employee-
// facing surface (the pond viewer, the existing list page, the
// future activity-history page).
//
// Pure helpers — no Supabase, no React. Every consuming surface
// calls `filterEmployeeView({ viewer, target, targetPrivacy })`
// and renders only what's returned. Source-locked at
// `__tests__/employee-pond/e12-visibility.test.ts`.

import type { UserRole } from '@/lib/auth';

/** Roles that see EVERY field on every employee. The user
 *  themselves is always implicitly in this group for their own
 *  profile. */
export const ADMIN_VISIBILITY_ROLES = [
  'admin',
  'developer',
  'tech_support',
  'equipment_manager',
] as const satisfies readonly UserRole[];

/** Fields that are ALWAYS admin-only regardless of the target
 *  user's privacy toggles. Salary + payout history are pay-data
 *  the user can't elect to share with co-workers. */
export const ALWAYS_ADMIN_ONLY_FIELDS = [
  'hourly_rate',
  'annual_salary',
  'payout_history',
] as const;

/** Per-user privacy toggle bag. Mirrors the boolean columns on
 *  `seeds/295_employee_privacy.sql`; the helper uses the defaults
 *  declared below when no DB row exists for the target user. */
export interface EmployeePrivacy {
  show_full_name_to_employees: boolean;
  show_email_to_employees: boolean;
  show_phone_to_employees: boolean;
  show_dob_to_employees: boolean;
  show_gender_to_employees: boolean;
  show_address_to_employees: boolean;
  show_hire_date_to_employees: boolean;
  show_job_title_to_employees: boolean;
  show_employment_type_to_employees: boolean;
  show_photos_to_employees: boolean;
  show_jobs_history_to_employees: boolean;
  show_hours_to_employees: boolean;
  show_bonuses_to_employees: boolean;
}

/** Default privacy posture for a brand-new user (no DB row yet).
 *  Contact + employment-context fields default visible; personal
 *  identifiers + pay-adjacent fields default private. */
export const DEFAULT_EMPLOYEE_PRIVACY: EmployeePrivacy = {
  show_full_name_to_employees: true,
  show_email_to_employees: true,
  show_phone_to_employees: true,
  show_dob_to_employees: false,
  show_gender_to_employees: false,
  show_address_to_employees: false,
  show_hire_date_to_employees: true,
  show_job_title_to_employees: true,
  show_employment_type_to_employees: true,
  show_photos_to_employees: true,
  show_jobs_history_to_employees: true,
  show_hours_to_employees: false,
  show_bonuses_to_employees: false,
};

/** Full profile the helper accepts as input. Optional fields are
 *  loose because not every employee will have every value (e.g.
 *  DOB / gender land in E11). */
export interface FullEmployeeProfile {
  email: string;
  name: string | null;
  phone?: string | null;
  date_of_birth?: string | null;
  gender?: string | null;
  address?: string | null;
  hire_date?: string | null;
  job_title?: string | null;
  employment_type?: string | null;
  avatar_url?: string | null;
  hourly_rate?: number | null;
  annual_salary?: number | null;
  bonuses_total_cents?: number | null;
  recent_hours_total?: number | null;
  jobs_history_count?: number | null;
  photos_count?: number | null;
  payout_history?: unknown;
}

/** Sanitized view returned to the caller. Email is always present
 *  (it's the key); everything else may be absent depending on the
 *  privacy + role check. */
export type VisibleEmployeeProfile = Partial<FullEmployeeProfile> & {
  email: string;
};

export interface Viewer {
  email: string;
  roles: readonly UserRole[];
}

/** True when the viewer is in `ADMIN_VISIBILITY_ROLES` or is
 *  looking at their own profile. */
export function viewerSeesEverything(viewer: Viewer, targetEmail: string): boolean {
  if (viewer.email.toLowerCase() === targetEmail.toLowerCase()) return true;
  for (const r of viewer.roles) {
    if ((ADMIN_VISIBILITY_ROLES as readonly UserRole[]).includes(r)) return true;
  }
  return false;
}

/** Pure visibility filter. Always returns at minimum
 *  `{ email, name }` (or `{ email, name: 'Employee' }` when the
 *  target hid their name) so the UI can render something
 *  meaningful. */
export function filterEmployeeView(args: {
  viewer: Viewer;
  target: FullEmployeeProfile;
  targetPrivacy?: EmployeePrivacy | null;
}): VisibleEmployeeProfile {
  const { viewer, target } = args;
  const privacy = args.targetPrivacy ?? DEFAULT_EMPLOYEE_PRIVACY;

  if (viewerSeesEverything(viewer, target.email)) {
    return { ...target };
  }

  const out: VisibleEmployeeProfile = {
    email: privacy.show_email_to_employees ? target.email : target.email, // email is the id; we never hide it
    name: privacy.show_full_name_to_employees ? target.name : 'Employee',
  };
  if (privacy.show_phone_to_employees && target.phone != null) {
    out.phone = target.phone;
  }
  if (privacy.show_dob_to_employees && target.date_of_birth != null) {
    out.date_of_birth = target.date_of_birth;
  }
  if (privacy.show_gender_to_employees && target.gender != null) {
    out.gender = target.gender;
  }
  if (privacy.show_address_to_employees && target.address != null) {
    out.address = target.address;
  }
  if (privacy.show_hire_date_to_employees && target.hire_date != null) {
    out.hire_date = target.hire_date;
  }
  if (privacy.show_job_title_to_employees && target.job_title != null) {
    out.job_title = target.job_title;
  }
  if (privacy.show_employment_type_to_employees && target.employment_type != null) {
    out.employment_type = target.employment_type;
  }
  if (privacy.show_photos_to_employees && target.avatar_url != null) {
    out.avatar_url = target.avatar_url;
  }
  if (privacy.show_jobs_history_to_employees && target.jobs_history_count != null) {
    out.jobs_history_count = target.jobs_history_count;
  }
  if (privacy.show_hours_to_employees && target.recent_hours_total != null) {
    out.recent_hours_total = target.recent_hours_total;
  }
  if (privacy.show_bonuses_to_employees && target.bonuses_total_cents != null) {
    out.bonuses_total_cents = target.bonuses_total_cents;
  }
  // Salary + payout history are ALWAYS admin-only. The helper never
  // returns them to a non-admin viewer regardless of the privacy
  // toggle the user might have flipped on their own profile.
  return out;
}

/** Convenience: hydrate a partial privacy row (e.g. from the DB)
 *  into a full struct by filling missing fields with defaults.
 *  Used by the API endpoint that returns the user's current
 *  settings + by future read-side code that joins a privacy row. */
export function hydrateEmployeePrivacy(
  partial: Partial<EmployeePrivacy> | null | undefined,
): EmployeePrivacy {
  if (!partial) return { ...DEFAULT_EMPLOYEE_PRIVACY };
  return { ...DEFAULT_EMPLOYEE_PRIVACY, ...partial };
}

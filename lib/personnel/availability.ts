// lib/personnel/availability.ts
//
// Phase F10.4-b — personnel availability engine. Mirrors the
// equipment-side `lib/equipment/availability.ts`: pure functions
// run the four §5.12.4 checks, the F10.4-c POST /assign handler
// reuses the engine inside its transaction so assessment +
// insert see the same snapshot.
//
// The four checks (any hard-block fails the person; soft-warns
// proceed but stay attached so the UI can surface them):
//
//   1. Skill check        — for each required_skills entry, does
//                            the user have an active+unexpired
//                            personnel_skills row whose
//                            skill_code matches? Hard block when
//                            the slot is template-required;
//                            soft-warn when the dispatcher is
//                            ad-hoc filling with an underqualified
//                            person.
//
//   2. Capacity overlap   — any job_team row in
//                            proposed|confirmed state whose
//                            [assigned_from, assigned_to)
//                            overlaps the requested window →
//                            hard block. Half-open '[)' semantics
//                            match seeds/241's GiST EXCLUDE so
//                            the engine and DB agree on the
//                            boundary case.
//
//   3. Unavailability     — any personnel_unavailability row
//                            with overlapping window → hard
//                            block. Carries kind (pto/sick/
//                            training/doctor/other) so the UI
//                            differentiates "ask to skip PTO"
//                            from "they're at the doctor."
//
//   4. Cert-expiry-during — for each required_skills entry, if
//      -window               the matching skill row exists but
//                            its expires_at falls inside the
//                            assignment window → soft-warn. If
//                            expires_at is BEFORE the window
//                            even starts → already covered by
//                            check #1 hard block (skill row
//                            no longer counts as active).
//
// Hard-block-on-skill is configurable: when the engine is called
// from the apply-flow (template-required slot), missing-skill
// is a block. When it's called from the freeform "assign Jacob
// to this slot" flow with `skillsAreSoft=true`, missing-skill
// degrades to a warn — the dispatcher can soft-warn-acknowledge
// in the UI and move on.

import type { SupabaseClient } from '@supabase/supabase-js';

import { supabaseAdmin } from '@/lib/supabase';

// ────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────

export type PersonnelAvailabilityCode =
  | 'missing_skill'
  | 'capacity_overlap'
  | 'unavailable'
  | 'cert_expires_in_window';

export type PersonnelAvailabilitySeverity = 'warn' | 'block';

export type PersonnelAvailabilityReason =
  | {
      code: 'missing_skill';
      severity: PersonnelAvailabilitySeverity;
      skill_code: string;
      message: string;
    }
  | {
      code: 'capacity_overlap';
      severity: 'block';
      conflicting_job_id: string;
      conflicting_assignment_id: string;
      assigned_from: string;
      assigned_to: string;
      state: string;
      message: string;
    }
  | {
      code: 'unavailable';
      severity: 'block';
      unavailability_id: string;
      kind: string;
      reason: string | null;
      unavailable_from: string;
      unavailable_to: string;
      message: string;
    }
  | {
      code: 'cert_expires_in_window';
      severity: 'warn';
      skill_code: string;
      expires_at: string;
      message: string;
    };

export interface AssessPersonOptions {
  /** ISO timestamp — inclusive lower bound. */
  windowFrom: string;
  /** ISO timestamp — exclusive upper bound. */
  windowTo: string;
  /** Skills the slot requires. Default empty. */
  requiredSkills?: string[];
  /**
   * When true, missing skills are soft-warns instead of blocks.
   * Used when the dispatcher is filling an ad-hoc slot vs. a
   * template-required slot. Default false (template-strict).
   */
  skillsAreSoft?: boolean;
  /**
   * Pass an existing client to participate in an open transaction
   * (the F10.4-c assign handler does this so the assessment sees
   * the same snapshot). Defaults to supabaseAdmin.
   */
  client?: SupabaseClient;
}

export interface PersonAssessment {
  user_email: string;
  display_name: string | null;
  hard_blocks: PersonnelAvailabilityReason[];
  soft_warns: PersonnelAvailabilityReason[];
  assignable: boolean;
}

// ────────────────────────────────────────────────────────────
// Public API
// ────────────────────────────────────────────────────────────

/**
 * Assess a single user against the requested window + skills.
 * Returns null if the email doesn't match any registered_users
 * row — caller surfaces as a typed not-found in the response.
 */
export async function assessPerson(
  userEmail: string,
  opts: AssessPersonOptions
): Promise<PersonAssessment | null> {
  const client = opts.client ?? supabaseAdmin;
  const ru = await client
    .from('registered_users')
    .select('email, name')
    .eq('email', userEmail)
    .maybeSingle();
  if (ru.error) {
    console.error('[personnel/availability] registered_users read failed', {
      userEmail,
      error: ru.error.message,
    });
    throw new Error(`assessPerson: ${ru.error.message}`);
  }
  if (!ru.data) return null;

  const row = ru.data as { email: string; name: string | null };
  const [skills, conflicts, blocks] = await Promise.all([
    loadActiveSkills(client, [row.email]),
    loadCapacityConflicts(client, [row.email], opts),
    loadUnavailabilityBlocks(client, [row.email], opts),
  ]);

  return assessRowSync(
    { user_email: row.email, display_name: row.name },
    skills.get(row.email) ?? [],
    conflicts.get(row.email) ?? [],
    blocks.get(row.email) ?? [],
    opts
  );
}

/**
 * Assess every active user that holds at least one of the
 * required skills. Used for the "find me anyone with skill X"
 * slot picker on the apply-flow. When `requiredSkills` is empty,
 * walks every active registered_users row — caller should cap
 * via filters at the UI layer.
 */
export async function assessForSkillCohort(
  opts: AssessPersonOptions
): Promise<PersonAssessment[]> {
  const client = opts.client ?? supabaseAdmin;

  // 1. Find candidate users — those with active matching skills.
  // When no skills required, fall back to every registered user.
  const candidates = await loadCandidateUsers(
    client,
    opts.requiredSkills ?? []
  );
  if (candidates.length === 0) return [];

  const emails = candidates.map((c) => c.email);
  const [skills, conflicts, blocks] = await Promise.all([
    loadActiveSkills(client, emails),
    loadCapacityConflicts(client, emails, opts),
    loadUnavailabilityBlocks(client, emails, opts),
  ]);

  return candidates.map((c) =>
    assessRowSync(
      { user_email: c.email, display_name: c.name },
      skills.get(c.email) ?? [],
      conflicts.get(c.email) ?? [],
      blocks.get(c.email) ?? [],
      opts
    )
  );
}

// ────────────────────────────────────────────────────────────
// Internals
// ────────────────────────────────────────────────────────────

interface SkillRow {
  user_email: string;
  skill_code: string;
  expires_at: string | null;
  state: string;
}

interface CapacityRow {
  id: string;
  job_id: string;
  user_email: string;
  assigned_from: string;
  assigned_to: string;
  state: string;
}

interface UnavailabilityRow {
  id: string;
  user_email: string;
  unavailable_from: string;
  unavailable_to: string;
  kind: string;
  reason: string | null;
}

interface CandidateUser {
  email: string;
  name: string | null;
}

function assessRowSync(
  user: { user_email: string; display_name: string | null },
  skills: SkillRow[],
  conflicts: CapacityRow[],
  blocks: UnavailabilityRow[],
  opts: AssessPersonOptions
): PersonAssessment {
  const hardBlocks: PersonnelAvailabilityReason[] = [];
  const softWarns: PersonnelAvailabilityReason[] = [];

  // 1. Skill + 4. cert-expiry combined — same pass.
  const required = opts.requiredSkills ?? [];
  const windowEndMs = Date.parse(opts.windowTo);
  for (const skillCode of required) {
    const match = skills.find(
      (s) => s.skill_code === skillCode && s.state === 'active'
    );
    if (!match) {
      const severity: PersonnelAvailabilitySeverity = opts.skillsAreSoft
        ? 'warn'
        : 'block';
      const reason: PersonnelAvailabilityReason = {
        code: 'missing_skill',
        severity,
        skill_code: skillCode,
        message:
          severity === 'block'
            ? `Required skill '${skillCode}' is not on file or not active.`
            : `'${skillCode}' is not on file — assigning ad-hoc.`,
      };
      if (severity === 'block') hardBlocks.push(reason);
      else softWarns.push(reason);
      continue;
    }
    // The skill is active. Cert-expiry check: if expires_at is
    // inside the window, soft-warn so the dispatcher knows to
    // remind the surveyor to renew before the window ends.
    if (match.expires_at) {
      const expiresMs = Date.parse(match.expires_at);
      if (Number.isFinite(expiresMs) && expiresMs < windowEndMs) {
        softWarns.push({
          code: 'cert_expires_in_window',
          severity: 'warn',
          skill_code: skillCode,
          expires_at: match.expires_at,
          message:
            `'${skillCode}' expires ${match.expires_at} — confirm renewal ` +
            `plans before window end.`,
        });
      }
    }
  }

  // 2. Capacity overlap
  for (const c of conflicts) {
    hardBlocks.push({
      code: 'capacity_overlap',
      severity: 'block',
      conflicting_job_id: c.job_id,
      conflicting_assignment_id: c.id,
      assigned_from: c.assigned_from,
      assigned_to: c.assigned_to,
      state: c.state,
      message:
        `Already ${c.state} on job ${c.job_id} from ${c.assigned_from} ` +
        `to ${c.assigned_to}. Available before/after that window.`,
    });
  }

  // 3. Unavailability
  for (const b of blocks) {
    hardBlocks.push({
      code: 'unavailable',
      severity: 'block',
      unavailability_id: b.id,
      kind: b.kind,
      reason: b.reason,
      unavailable_from: b.unavailable_from,
      unavailable_to: b.unavailable_to,
      message:
        `Marked ${b.kind} from ${b.unavailable_from} to ${b.unavailable_to}` +
        (b.reason ? ` — ${b.reason}.` : '.'),
    });
  }

  return {
    user_email: user.user_email,
    display_name: user.display_name,
    hard_blocks: hardBlocks,
    soft_warns: softWarns,
    assignable: hardBlocks.length === 0,
  };
}

async function loadCandidateUsers(
  client: SupabaseClient,
  requiredSkills: string[]
): Promise<CandidateUser[]> {
  if (requiredSkills.length === 0) {
    const { data, error } = await client
      .from('registered_users')
      .select('email, name')
      .order('name', { ascending: true });
    if (error) {
      console.error(
        '[personnel/availability] registered_users walk failed',
        { error: error.message }
      );
      throw new Error(`loadCandidateUsers: ${error.message}`);
    }
    return ((data ?? []) as Array<{ email: string; name: string | null }>).map(
      (r) => ({ email: r.email, name: r.name })
    );
  }

  // Find users who hold AT LEAST ONE of the required skills as
  // active. The UI's typeahead semantics surface these; the
  // engine then evaluates each one, so users missing some
  // (but not all) of the required skills come back with
  // `missing_skill` reasons attached and `assignable=false`.
  const { data, error } = await client
    .from('personnel_skills')
    .select('user_email')
    .in('skill_code', requiredSkills)
    .eq('state', 'active');
  if (error) {
    console.error(
      '[personnel/availability] candidate skills lookup failed',
      { error: error.message }
    );
    throw new Error(`loadCandidateUsers (skills): ${error.message}`);
  }

  const emails = Array.from(
    new Set(((data ?? []) as Array<{ user_email: string }>).map((r) => r.user_email))
  );
  if (emails.length === 0) return [];

  const ru = await client
    .from('registered_users')
    .select('email, name')
    .in('email', emails)
    .order('name', { ascending: true });
  if (ru.error) {
    console.error(
      '[personnel/availability] registered_users join failed',
      { error: ru.error.message }
    );
    throw new Error(`loadCandidateUsers (users): ${ru.error.message}`);
  }
  return ((ru.data ?? []) as Array<{ email: string; name: string | null }>).map(
    (r) => ({ email: r.email, name: r.name })
  );
}

async function loadActiveSkills(
  client: SupabaseClient,
  emails: string[]
): Promise<Map<string, SkillRow[]>> {
  if (emails.length === 0) return new Map();
  const { data, error } = await client
    .from('personnel_skills')
    .select('user_email, skill_code, expires_at, state')
    .in('user_email', emails)
    .eq('state', 'active');
  if (error) {
    console.error('[personnel/availability] active skills read failed', {
      error: error.message,
    });
    throw new Error(`loadActiveSkills: ${error.message}`);
  }
  const map = new Map<string, SkillRow[]>();
  for (const row of (data ?? []) as SkillRow[]) {
    const list = map.get(row.user_email) ?? [];
    list.push(row);
    map.set(row.user_email, list);
  }
  return map;
}

async function loadCapacityConflicts(
  client: SupabaseClient,
  emails: string[],
  opts: AssessPersonOptions
): Promise<Map<string, CapacityRow[]>> {
  if (emails.length === 0) return new Map();
  // Half-open '[)' overlap: A.from < B.to && A.to > B.from.
  const { data, error } = await client
    .from('job_team')
    .select(
      'id, job_id, user_email, assigned_from, assigned_to, state'
    )
    .in('user_email', emails)
    .in('state', ['proposed', 'confirmed'])
    .not('assigned_from', 'is', null)
    .not('assigned_to', 'is', null)
    .lt('assigned_from', opts.windowTo)
    .gt('assigned_to', opts.windowFrom);
  if (error) {
    console.error(
      '[personnel/availability] capacity conflicts read failed',
      { error: error.message }
    );
    throw new Error(`loadCapacityConflicts: ${error.message}`);
  }
  const map = new Map<string, CapacityRow[]>();
  for (const row of (data ?? []) as CapacityRow[]) {
    const list = map.get(row.user_email) ?? [];
    list.push(row);
    map.set(row.user_email, list);
  }
  return map;
}

async function loadUnavailabilityBlocks(
  client: SupabaseClient,
  emails: string[],
  opts: AssessPersonOptions
): Promise<Map<string, UnavailabilityRow[]>> {
  if (emails.length === 0) return new Map();
  const { data, error } = await client
    .from('personnel_unavailability')
    .select('id, user_email, unavailable_from, unavailable_to, kind, reason')
    .in('user_email', emails)
    .lt('unavailable_from', opts.windowTo)
    .gt('unavailable_to', opts.windowFrom);
  if (error) {
    console.error(
      '[personnel/availability] unavailability read failed',
      { error: error.message }
    );
    throw new Error(`loadUnavailabilityBlocks: ${error.message}`);
  }
  const map = new Map<string, UnavailabilityRow[]>();
  for (const row of (data ?? []) as UnavailabilityRow[]) {
    const list = map.get(row.user_email) ?? [];
    list.push(row);
    map.set(row.user_email, list);
  }
  return map;
}

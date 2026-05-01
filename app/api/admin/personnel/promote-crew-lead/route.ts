// app/api/admin/personnel/promote-crew-lead/route.ts
//
// POST /api/admin/personnel/promote-crew-lead
//   body: { job_id: UUID, prefer_user_email?: string }
//
// Phase F10.4-e — implements the §5.12.4 auto-promote heuristic:
// "If the dispatcher tries to confirm a job-day with no crew
// lead set, the system soft-warns and auto-promotes the most
// senior person (RPLS > LSIT > field tech > general role)."
//
// When `prefer_user_email` is supplied, the handler promotes
// that specific person (still validates membership + state).
// When omitted, it walks the active assignments and picks the
// most senior by skill rank:
//
//   1. holds active 'rpls' skill
//   2. holds active 'lsit' skill
//   3. slot_role='party_chief' (the legacy default lead)
//   4. slot_role='field_tech' or 'instrument_specialist_*'
//   5. anything else, alphabetical by name
//
// The crew-lead exactly-one-per-job partial UNIQUE in seeds/241
// catches the race where two dispatchers promote at the same
// instant — the second hits 23505 which we map to a clean
// 'crew_lead_already_set'.
//
// Response: { assignment, ranking_reason } or
//           { error, no_active_assignments: true }
//
// Auth: admin / developer / equipment_manager.

import { NextRequest, NextResponse } from 'next/server';
import type { PostgrestError } from '@supabase/supabase-js';

import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';

const UUID_RE =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

interface AssignmentRow {
  id: string;
  job_id: string;
  user_email: string;
  user_name: string | null;
  slot_role: string | null;
  state: string;
  is_crew_lead: boolean;
  assigned_from: string | null;
  assigned_to: string | null;
}

type RankingReason =
  | { code: 'already_set'; assignment_id: string }
  | { code: 'preferred'; user_email: string }
  | { code: 'rpls_holder' }
  | { code: 'lsit_holder' }
  | { code: 'party_chief_role' }
  | { code: 'field_tech_role' }
  | { code: 'alphabetical_fallback' };

export const POST = withErrorHandler(
  async (req: NextRequest) => {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userRoles = (session.user as { roles?: string[] } | undefined)
      ?.roles ?? [];
    if (
      !isAdmin(session.user.roles) &&
      !userRoles.includes('equipment_manager')
    ) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = (await req.json().catch(() => null)) as
      | { job_id?: unknown; prefer_user_email?: unknown }
      | null;
    if (!body || typeof body !== 'object') {
      return NextResponse.json(
        { error: 'Body must be a JSON object.' },
        { status: 400 }
      );
    }
    const jobId = typeof body.job_id === 'string' ? body.job_id.trim() : '';
    if (!UUID_RE.test(jobId)) {
      return NextResponse.json(
        { error: '`job_id` must be a valid UUID.' },
        { status: 400 }
      );
    }
    const preferUserEmail =
      typeof body.prefer_user_email === 'string'
        ? body.prefer_user_email.trim().toLowerCase()
        : null;

    // Fetch active assignments for the job. Already-lead is
    // surfaced before we do anything so the dispatcher gets the
    // current pick rather than a redundant promote.
    const { data: assignments, error: readErr } = await supabaseAdmin
      .from('job_team')
      .select(
        'id, job_id, user_email, user_name, slot_role, state, ' +
          'is_crew_lead, assigned_from, assigned_to'
      )
      .eq('job_id', jobId)
      .in('state', ['proposed', 'confirmed']);
    if (readErr) {
      console.error(
        '[admin/personnel/promote-crew-lead] read failed',
        { jobId, error: readErr.message }
      );
      return NextResponse.json(
        { error: readErr.message },
        { status: 500 }
      );
    }
    const rows = (assignments ?? []) as AssignmentRow[];
    if (rows.length === 0) {
      return NextResponse.json(
        {
          error:
            'No active assignments for this job — nothing to promote.',
          no_active_assignments: true,
        },
        { status: 404 }
      );
    }

    const existingLead = rows.find((r) => r.is_crew_lead);
    if (existingLead) {
      return NextResponse.json({
        assignment: existingLead,
        ranking_reason: {
          code: 'already_set',
          assignment_id: existingLead.id,
        } satisfies RankingReason,
      });
    }

    // Skill lookup for the candidates — drives the senior-most
    // ranking. We only care about active rpls / lsit holders.
    const emails = rows.map((r) => r.user_email);
    const { data: skills, error: skillsErr } = await supabaseAdmin
      .from('personnel_skills')
      .select('user_email, skill_code')
      .in('user_email', emails)
      .eq('state', 'active')
      .in('skill_code', ['rpls', 'lsit']);
    if (skillsErr) {
      console.warn(
        '[admin/personnel/promote-crew-lead] skills lookup failed',
        { error: skillsErr.message }
      );
    }
    const skillsByUser = new Map<string, Set<string>>();
    for (const s of ((skills ?? []) as Array<{
      user_email: string;
      skill_code: string;
    }>)) {
      const set = skillsByUser.get(s.user_email) ?? new Set<string>();
      set.add(s.skill_code);
      skillsByUser.set(s.user_email, set);
    }

    // Pick the winner.
    let winner: AssignmentRow | null = null;
    let reason: RankingReason | null = null;

    if (preferUserEmail) {
      const preferred = rows.find(
        (r) => r.user_email.toLowerCase() === preferUserEmail
      );
      if (!preferred) {
        return NextResponse.json(
          {
            error:
              `prefer_user_email '${preferUserEmail}' isn't on the ` +
              `active roster for this job.`,
          },
          { status: 400 }
        );
      }
      winner = preferred;
      reason = { code: 'preferred', user_email: preferUserEmail };
    } else {
      // Tier 1: RPLS holders.
      winner =
        rows.find((r) => skillsByUser.get(r.user_email)?.has('rpls')) ??
        null;
      if (winner) reason = { code: 'rpls_holder' };

      // Tier 2: LSIT holders.
      if (!winner) {
        winner =
          rows.find((r) => skillsByUser.get(r.user_email)?.has('lsit')) ??
          null;
        if (winner) reason = { code: 'lsit_holder' };
      }

      // Tier 3: party_chief role.
      if (!winner) {
        winner =
          rows.find((r) => (r.slot_role ?? '').toLowerCase() === 'party_chief') ??
          null;
        if (winner) reason = { code: 'party_chief_role' };
      }

      // Tier 4: field_tech / instrument_specialist_* role.
      if (!winner) {
        winner =
          rows.find((r) => {
            const role = (r.slot_role ?? '').toLowerCase();
            return (
              role === 'field_tech' ||
              role.startsWith('instrument_specialist_')
            );
          }) ?? null;
        if (winner) reason = { code: 'field_tech_role' };
      }

      // Tier 5: alphabetical fallback by name (or email).
      if (!winner) {
        const sorted = rows
          .slice()
          .sort((a, b) =>
            (a.user_name ?? a.user_email).localeCompare(
              b.user_name ?? b.user_email
            )
          );
        winner = sorted[0];
        reason = { code: 'alphabetical_fallback' };
      }
    }

    if (!winner || !reason) {
      // Defensive — should be unreachable given rows.length > 0.
      return NextResponse.json(
        { error: 'No promotable assignment found.' },
        { status: 500 }
      );
    }

    const { data: updated, error: updateErr } = await supabaseAdmin
      .from('job_team')
      .update({ is_crew_lead: true })
      .eq('id', winner.id)
      .eq('is_crew_lead', false)
      .select(
        'id, job_id, user_email, user_name, slot_role, state, ' +
          'is_crew_lead, assigned_from, assigned_to, updated_at'
      )
      .maybeSingle();
    if (updateErr) {
      const pgErr = updateErr as PostgrestError;
      if (pgErr.code === '23505') {
        return NextResponse.json(
          {
            error:
              'Crew lead was set by a concurrent promote. Refetch ' +
              'the job to see the current lead.',
            code: 'crew_lead_already_set',
          },
          { status: 409 }
        );
      }
      console.error(
        '[admin/personnel/promote-crew-lead] update failed',
        { error: pgErr.message, code: pgErr.code }
      );
      return NextResponse.json(
        { error: pgErr.message ?? 'Promote failed.' },
        { status: 500 }
      );
    }
    if (!updated) {
      // Lost a race — somebody else set is_crew_lead between
      // our read and write. The seeds/241 partial UNIQUE
      // ensures we couldn't have overlapping leads, so the
      // current state is authoritative.
      return NextResponse.json(
        {
          error:
            'Crew lead was set by a concurrent promote. Refetch the ' +
            'job to see the current lead.',
          code: 'crew_lead_already_set',
        },
        { status: 409 }
      );
    }

    console.log('[admin/personnel/promote-crew-lead POST] ok', {
      job_id: jobId,
      promoted: winner.user_email,
      ranking_reason: reason.code,
      actor_email: session.user.email,
    });

    return NextResponse.json({
      assignment: updated,
      ranking_reason: reason,
    });
  },
  { routeName: 'admin/personnel/promote-crew-lead#post' }
);

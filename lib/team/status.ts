// lib/team/status.ts
//
// hub-widget-excellence-14 — the /api/admin/team/status endpoint was a
// `{ members: [] }` stub awaiting a (still-unbuilt) server-side
// active-clock table. There's no live clock state on the server, but
// today's `daily_time_logs` are a real "who's working today" signal, so
// the endpoint surfaces team members who have logged time today. This
// pure helper does the roster join. Dependency-free + testable.

export interface TimeLogRow {
  user_email?: string | null;
}

export interface RosterEntry {
  user_email: string;
  user_name?: string | null;
  roles?: string[] | null;
}

export interface TeamMember {
  user_email: string;
  user_name: string | null;
  role: string | null;
  shift: string | null;
  status: 'clocked-in' | 'on-break' | 'clocked-out';
  since: string | null;
}

/**
 * Build the team-status list from today's time-log rows + the roster.
 * Anyone who logged time today is surfaced as "clocked-in" (the closest
 * real signal absent a live-clock table). De-duped by email.
 */
export function buildTeamStatus(
  todayLogs: readonly TimeLogRow[],
  roster: readonly RosterEntry[],
): TeamMember[] {
  const active: string[] = [];
  const seen = new Set<string>();
  for (const log of todayLogs) {
    const email = log.user_email?.trim();
    if (!email || seen.has(email)) continue;
    seen.add(email);
    active.push(email);
  }

  const byEmail = new Map(roster.map((r) => [r.user_email, r]));
  return active.map((email) => {
    const r = byEmail.get(email);
    return {
      user_email: email,
      user_name: r?.user_name ?? null,
      role: r?.roles && r.roles.length > 0 ? r.roles[0] : null,
      shift: null,
      status: 'clocked-in',
      since: null,
    };
  });
}

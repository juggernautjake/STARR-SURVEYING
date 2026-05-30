// lib/hub/widgets/daily-briefing/sections.ts
//
// hub-widget-excellence-15 — daily-briefing. Pure summarizers that turn
// each data source's payload into a compact { headline, detail } the
// composite renders. The widget reuses the OTHER widgets' endpoints
// (schedule, weather, team-status, assignments) per the doc guardrail —
// these helpers just condense the responses. Dependency-free → tested in
// node.

export interface SectionSummary {
  headline: string;
  detail: string;
}

export interface BriefEvent {
  title?: string | null;
  start_time?: string | null;
  all_day?: boolean | null;
}
export interface BriefMember {
  user_name?: string | null;
  user_email?: string | null;
  status?: string | null;
}
export interface BriefTask {
  title?: string | null;
  status?: string | null;
}
export interface WeatherSnap {
  temperature_f: number;
  description: string;
  location_label: string;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** Today's schedule → count + the first `maxJobs` event titles. */
export function summarizeSchedule(events: readonly BriefEvent[], maxJobs = 3): SectionSummary {
  const count = events.length;
  if (count === 0) return { headline: 'No events today', detail: '' };
  const titles = events
    .map((e) => e.title?.trim())
    .filter((t): t is string => !!t)
    .slice(0, Math.max(1, maxJobs));
  return { headline: `${plural(count, 'event')} today`, detail: titles.join(' · ') };
}

/** Crew → who's currently on the clock (clocked-in or on-break). */
export function summarizeCrew(members: readonly BriefMember[]): SectionSummary {
  const active = members.filter((m) => m.status === 'clocked-in' || m.status === 'on-break');
  if (active.length === 0) return { headline: 'No one clocked in', detail: '' };
  const names = active
    .map((m) => m.user_name?.trim() || m.user_email?.trim() || '')
    .filter(Boolean)
    .slice(0, 3)
    .join(', ');
  return { headline: `${active.length} on the clock`, detail: names };
}

/** Assignments → open tasks (anything not completed). */
export function summarizeActions(tasks: readonly BriefTask[]): SectionSummary {
  const open = tasks.filter((t) => t.status !== 'completed');
  if (open.length === 0) return { headline: 'All caught up', detail: '' };
  const first = open[0]?.title?.trim() ?? '';
  return { headline: `${plural(open.length, 'task')} due`, detail: first };
}

/** Weather snapshot → temp + description + location. */
export function summarizeWeather(snap: WeatherSnap | null): SectionSummary {
  if (!snap || typeof snap.temperature_f !== 'number') {
    return { headline: 'Weather unavailable', detail: '' };
  }
  return { headline: `${Math.round(snap.temperature_f)}° ${snap.description}`, detail: snap.location_label };
}

/** The UTC day window [today 00:00, tomorrow 00:00) as ISO strings, to
 *  match the /api/admin/schedule `from`/`to` contract. */
export function todayRange(now: Date): { from: string; to: string } {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const d = now.getUTCDate();
  return {
    from: new Date(Date.UTC(y, m, d)).toISOString(),
    to: new Date(Date.UTC(y, m, d + 1)).toISOString(),
  };
}

// lib/work-mode/clock-session.ts
//
// Lightweight client-side clock session. Persists the in-progress
// "you're clocked in" state in localStorage so the user keeps their
// session across reloads. Clocking out finalizes the entry by POSTing
// the elapsed hours + selected tags to `/api/admin/time-logs` (which
// already exists from earlier slices).
//
// A future slice can promote this to a server-persisted table
// (`active_clock_sessions`) so a user who closes their laptop without
// clocking out doesn't have to remember to do so on the next device —
// for now localStorage is sufficient for v1, the same way Cmd+K's
// recents persist (Slice 0).
//
// Slice 188 of customizable-hub-and-work-mode-2026-05-28.md.

export const CLOCK_SESSION_KEY = 'starr-clock-session';

export interface ClockSession {
  /** ISO timestamp when the user clicked Clock In. */
  startedAt: string;
  /** Optional active job id captured at clock-in. */
  jobId: string | null;
  /** Activity-tag ids selected at clock-in. */
  tagIds: string[];
}

/** Read the saved session, or null when not clocked in. SSR-safe —
 *  returns null when `window` is undefined. */
export function readClockSession(): ClockSession | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(CLOCK_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ClockSession>;
    if (!parsed.startedAt) return null;
    return {
      startedAt: parsed.startedAt,
      jobId: parsed.jobId ?? null,
      tagIds: Array.isArray(parsed.tagIds) ? parsed.tagIds : [],
    };
  } catch {
    return null;
  }
}

/** Persist a fresh session (called when the user submits ClockInModal). */
export function writeClockSession(session: ClockSession): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(CLOCK_SESSION_KEY, JSON.stringify(session));
  } catch {
    /* swallow — quota / disabled storage */
  }
  // Mirror to the server (best-effort) so the team page + the 6pm
  // still-clocked-in reminder cron can see who's on the clock. localStorage
  // stays the fast path; a failure here (offline / signed-out) is non-fatal.
  void fetch('/api/admin/clock-session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ started_at: session.startedAt, job_id: session.jobId, tag_ids: session.tagIds }),
  }).catch(() => { /* localStorage still holds it */ });
}

/** Clear the session (called on clock-out + Work Mode exit-with-clock-out). */
export function clearClockSession(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(CLOCK_SESSION_KEY);
  } catch {
    /* swallow */
  }
  void fetch('/api/admin/clock-session', { method: 'DELETE' }).catch(() => { /* best-effort */ });
}

/** Pull the open server session into localStorage when this device has none
 *  (e.g. the user clocked in on another device, or cleared site data). Local
 *  state always wins if present. Returns the active session or null.
 *  Best-effort — never throws. */
export async function hydrateClockSessionFromServer(): Promise<ClockSession | null> {
  if (typeof window === 'undefined') return null;
  const local = readClockSession();
  if (local) return local;
  try {
    const res = await fetch('/api/admin/clock-session');
    if (!res.ok) return null;
    const data = (await res.json()) as { session?: { started_at?: string; job_id?: string | null; tag_ids?: string[] } | null };
    const s = data?.session;
    if (!s?.started_at) return null;
    const session: ClockSession = {
      startedAt: s.started_at,
      jobId: s.job_id ?? null,
      tagIds: Array.isArray(s.tag_ids) ? s.tag_ids : [],
    };
    try {
      window.localStorage.setItem(CLOCK_SESSION_KEY, JSON.stringify(session));
    } catch {
      /* swallow */
    }
    return session;
  } catch {
    return null;
  }
}

/** Hours elapsed since `startedAt`, rounded to 2 decimal places.
 *  Returns 0 for unparseable / future timestamps. */
export function elapsedHours(startedAt: string, nowMs: number = Date.now()): number {
  const t = Date.parse(startedAt);
  if (!Number.isFinite(t) || t > nowMs) return 0;
  const ms = nowMs - t;
  return Math.round((ms / 3_600_000) * 100) / 100;
}

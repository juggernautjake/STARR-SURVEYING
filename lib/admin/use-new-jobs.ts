'use client';
// lib/admin/use-new-jobs.ts — which jobs this person has not looked at yet (owner, 2026-09-10).
//
// "If a job gets created, then everyone that should be notified should get a notification … the
// workcase icon on the navbar [gets] a little notification bubble that has NEW on it … Job Projects
// should have New by it as well … any job the user has not seen yet should have a NEW bubble on
// it. As soon as they open it, the notification will be cleared."
//
// The truth is the notifications table: a `job_created` row per recipient, unread until the job
// page is opened (lib/notifications.ts writes them; /api/admin/jobs/new reads and clears them).
// This hook is the one client-side reader — the rail, the flyout, the listings and the project
// page all ask it — with ONE request per page load shared between them (the same shape as
// use-feature-toggles.ts), refreshed when the tab regains focus and every minute while it is open.

import { useCallback, useEffect, useState } from 'react';

export interface NewJob {
  id: string;
  project_id: string | null;
}

export interface NewJobsState {
  /** Ids of jobs this person has not opened yet. */
  jobIds: ReadonlySet<string>;
  /** Ids of projects holding at least one such job. */
  projectIds: ReadonlySet<string>;
  /** Clear the marker for one job — called when its page opens. Optimistic; the server is told after. */
  markSeen: (jobId: string) => void;
}

const EMPTY: NewJob[] = [];
const REFRESH_MS = 60_000;

let cache: NewJob[] | null = null;
let inflight: Promise<NewJob[]> | null = null;
let fetchedAt = 0;
const listeners = new Set<(jobs: NewJob[]) => void>();
/** Jobs this session has opened — kept out of every later read, so a GET that was already in
 *  flight when the job page marked it seen cannot bring the bubble back. */
const seenThisSession = new Set<string>();

function publish(jobs: NewJob[]) {
  cache = jobs.filter((j) => !seenThisSession.has(j.id));
  fetchedAt = Date.now();
  for (const l of listeners) l(cache);
}

async function read(force = false): Promise<NewJob[]> {
  if (cache && !force && Date.now() - fetchedAt < REFRESH_MS) return cache;
  if (!inflight) {
    inflight = fetch('/api/admin/jobs/new', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => ((body?.jobs ?? []) as NewJob[]))
      // Signed out, down, slow: nothing is new, which is also what a person with no unread rows sees.
      .catch(() => EMPTY)
      .then((jobs) => { publish(jobs); return jobs; })
      .finally(() => { inflight = null; });
  }
  return inflight;
}

/** Drop the cache — after creating a job, so the creator's own lists refresh on the next read. */
export function invalidateNewJobs(): void {
  cache = null;
  fetchedAt = 0;
}

/** Clear one job everywhere at once, then tell the server. Exported for the job page. */
export function markJobSeen(jobId: string): void {
  if (seenThisSession.has(jobId)) return;
  seenThisSession.add(jobId);
  publish(cache ?? []);
  void fetch('/api/admin/jobs/new', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ job_id: jobId }),
  }).catch(() => { /* the row stays unread; the next open clears it */ });
}

export function useNewJobs(): NewJobsState {
  const [jobs, setJobs] = useState<NewJob[]>(cache ?? EMPTY);

  useEffect(() => {
    listeners.add(setJobs);
    void read();
    const onFocus = () => { void read(true); };
    const onVisible = () => { if (document.visibilityState === 'visible') void read(true); };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisible);
    const timer = window.setInterval(() => { void read(true); }, REFRESH_MS);
    return () => {
      listeners.delete(setJobs);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisible);
      window.clearInterval(timer);
    };
  }, []);

  const markSeen = useCallback((jobId: string) => markJobSeen(jobId), []);

  const jobIds = new Set(jobs.map((j) => j.id));
  const projectIds = new Set(jobs.map((j) => j.project_id).filter((p): p is string => Boolean(p)));
  return { jobIds, projectIds, markSeen };
}

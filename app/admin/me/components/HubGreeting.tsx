'use client';
// app/admin/me/components/HubGreeting.tsx
//
// Hub greeting card. Time-of-day greeting + date + clock-in status +
// the user's roles as colored pills. Lives fixed at the top of the
// hub canvas — not draggable, not removable.
//
// Slice 87 of customizable-hub-and-work-mode-2026-05-28.md.
// Slice 88 adds the Enter Work Mode button next to this component.
// hub-widget-excellence-01 Slice 2 — the old persona-selector chip
// strip (a hub-preview toggle) is replaced by RolePills, which shows
// ALL of the user's actual roles as read-only colored pills. The
// persona override still drives the nav rail (IconRail) — that store
// is untouched.

import { useEffect, useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import { isWorkModeEligible } from '@/lib/hub/work-mode-eligibility';
import { CLOCK_SESSION_KEY, readClockSession } from '@/lib/work-mode/clock-session';
import type { UserRole } from '@/lib/auth';
import RolePills from './RolePills';
import WorkModePrompt from './WorkModePrompt';
// hub-widget-excellence-01 Slice 5 — the pure greeting helpers moved to
// greeting-helpers.ts (so importing them doesn't drag in this client
// graph + next-auth). Re-exported here for back-compat with callers.
import { partOfDay, firstName, formatElapsed } from './greeting-helpers';

export { partOfDay, firstName, formatElapsed };

interface ClockState {
  clockedIn: boolean;
  startedAt?: string;
  jobLabel?: string | null;
}

function formatLongDate(date: Date): string {
  return date.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

interface HubGreetingProps {
  /** Optional override for the greeting prefix (e.g., "Howdy"). When
   *  absent the prefix is computed from time-of-day. */
  greetingPrefix?: string;
}

export default function HubGreeting({ greetingPrefix }: HubGreetingProps) {
  const { data: session } = useSession();

  const [now, setNow] = useState<Date | null>(null);
  const [clock, setClock] = useState<ClockState | null>(null);

  const roles: UserRole[] = useMemo(
    () => (session?.user?.roles ?? (session?.user?.role ? [session.user.role] : [])) as UserRole[],
    [session?.user?.roles, session?.user?.role],
  );

  // Defer time-of-day to the client so SSR doesn't drift across a
  // part-of-day boundary, and tick every 30s so the elapsed timer
  // refreshes.
  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  // Mirror the ClockInPill's localStorage-backed clock session
  // (Slice 188). The greeting picks it up on mount + on storage
  // events so opening a second tab + clocking out keeps the greeting
  // in sync.
  useEffect(() => {
    function sync() {
      const s = readClockSession();
      setClock(s
        ? { clockedIn: true, startedAt: s.startedAt, jobLabel: s.jobId }
        : { clockedIn: false });
    }
    sync();
    function onStorage(e: StorageEvent) {
      if (e.key === CLOCK_SESSION_KEY) sync();
    }
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const greeting = now ? partOfDay(now, greetingPrefix) : (greetingPrefix ?? 'Welcome');
  const name = firstName(session?.user?.name);
  const dateLine = now ? `It's ${formatLongDate(now)}.` : null;

  return (
    <section
      className="hub-panel hub-greeting"
      aria-labelledby="hub-greeting-heading"
    >
      <div className="hub-greeting__primary">
        <h1 id="hub-greeting-heading" className="hub-greeting__heading">
          {greeting}, {name}.
        </h1>
        {dateLine && <p className="hub-greeting__date">{dateLine}</p>}
        <p className="hub-greeting__clock-status">
          {clock?.clockedIn ? (
            <>
              <span className="hub-greeting__clock-dot" aria-hidden />
              You&apos;re clocked in
              {clock.jobLabel ? ` to ${clock.jobLabel}` : ''}
              {clock.startedAt ? (
                <>
                  {' — '}
                  <time dateTime={clock.startedAt}>
                    {formatElapsed(clock.startedAt)}
                  </time>
                  {' elapsed'}
                </>
              ) : null}
            </>
          ) : (
            <>You&apos;re not currently clocked in.</>
          )}
        </p>
      </div>

      <div className="hub-greeting__actions">
        {/* hub-widget-excellence-01 Slice 3 — the CTA now opens a prompt
            (pick which role you're working under) instead of routing
            straight to /admin/work-mode/start. Entering work mode is
            independent of clocking in; Slice 4 adds the clock-in step. */}
        {isWorkModeEligible(roles) && <WorkModePrompt roles={roles} />}
      </div>

      {/* hub-widget-excellence-01 Slice 2 — all of the user's roles as
          read-only colored pills (replaces the persona-preview chips). */}
      <RolePills roles={roles} />
    </section>
  );
}

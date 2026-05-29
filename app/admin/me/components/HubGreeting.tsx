'use client';
// app/admin/me/components/HubGreeting.tsx
//
// Hub greeting card. Time-of-day greeting + date + clock-in status +
// role-chip strip. Replaces the slice-2a stub that mixed greeting +
// nav toggle. Lives fixed at the top of the hub canvas — not
// draggable, not removable.
//
// Slice 87 of customizable-hub-and-work-mode-2026-05-28.md.
// Slice 88 adds the Enter Work Mode button next to this component.

import { useEffect, useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import {
  PERSONAS,
  PERSONA_ORDER,
  inferPersona,
  type Persona,
} from '@/lib/admin/personas';
import { useAdminNavStore } from '@/lib/admin/nav-store';
import { isWorkModeEligible } from '@/lib/hub/work-mode-eligibility';
import type { UserRole } from '@/lib/auth';

interface ClockState {
  clockedIn: boolean;
  startedAt?: string;
  jobLabel?: string | null;
}

export function partOfDay(date: Date, customPrefix?: string): string {
  if (customPrefix) return customPrefix;
  const h = date.getHours();
  if (h < 5) return 'Good night';
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

export function firstName(name?: string | null): string {
  if (!name) return 'there';
  const first = name.trim().split(/\s+/)[0];
  return first || 'there';
}

export function formatElapsed(startedAtIso: string, nowMs = Date.now()): string {
  const startedMs = new Date(startedAtIso).getTime();
  if (!Number.isFinite(startedMs)) return '';
  const elapsedSec = Math.max(0, Math.floor((nowMs - startedMs) / 1000));
  const h = Math.floor(elapsedSec / 3600);
  const m = Math.floor((elapsedSec % 3600) / 60);
  if (h === 0) return `${m} min`;
  return `${h}h ${m.toString().padStart(2, '0')}m`;
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
  const personaOverride = useAdminNavStore((s) => s.personaOverride);
  const setPersonaOverride = useAdminNavStore((s) => s.setPersonaOverride);

  const [now, setNow] = useState<Date | null>(null);
  const [clock, setClock] = useState<ClockState | null>(null);

  const roles: UserRole[] = useMemo(
    () => (session?.user?.roles ?? (session?.user?.role ? [session.user.role] : [])) as UserRole[],
    [session?.user?.roles, session?.user?.role],
  );
  const inferredPersona = useMemo(() => inferPersona(roles), [roles]);
  const activePersona: Persona = personaOverride ?? inferredPersona;

  // Defer time-of-day to the client so SSR doesn't drift across a
  // part-of-day boundary, and tick every 30s so the elapsed timer
  // refreshes.
  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  // Best-effort clock-in state from the existing time-logs endpoint.
  // Slice 89 swaps in a dedicated store-backed source.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch('/api/admin/time-logs/today', { cache: 'no-store' });
        if (!res.ok) return;
        const data = (await res.json()) as ClockState;
        if (!cancelled) setClock(data);
      } catch {
        /* swallow — greeting still works without clock state */
      }
    })();
    return () => { cancelled = true; };
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
        {isWorkModeEligible(roles) && (
          <button
            type="button"
            className="hub-btn hub-btn--primary hub-greeting__work-mode-btn"
            disabled
            title="Work Mode is coming soon — a focused environment for whatever you're heads-down on (field work, drafting, research, etc.). Lands in Phase 21."
            aria-label="Enter Work Mode (coming soon)"
          >
            Enter Work Mode
            <span style={{
              marginLeft: 8,
              padding: '1px 6px',
              borderRadius: 999,
              background: 'var(--theme-bg-elevated)',
              color: 'var(--theme-fg-muted)',
              fontSize: '0.65rem',
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: 0.4,
            }}>
              Soon
            </span>
          </button>
        )}
      </div>

      <ul
        className="hub-greeting__roles"
        role="list"
        aria-label="Your roles — click to preview the hub for that persona"
      >
        {PERSONA_ORDER
          .filter((id) => id === inferredPersona || personaOverride === id)
          .map((id) => {
            const active = id === activePersona;
            return (
              <li key={id}>
                <button
                  type="button"
                  className={`role-chip${active ? ' role-chip--active' : ''}`}
                  aria-pressed={active}
                  onClick={() => setPersonaOverride(active && personaOverride ? null : id)}
                >
                  {PERSONAS[id].label}
                </button>
              </li>
            );
          })}
        {personaOverride && (
          <li>
            <button
              type="button"
              className="role-chip"
              onClick={() => setPersonaOverride(null)}
              title={`Reset to inferred persona (${PERSONAS[inferredPersona].label})`}
            >
              Auto
            </button>
          </li>
        )}
      </ul>
    </section>
  );
}

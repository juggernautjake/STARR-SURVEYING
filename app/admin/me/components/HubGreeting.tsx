'use client';
// app/admin/me/components/HubGreeting.tsx
//
// Hub panel 1 (§5.1) — time-of-day greeting + clock-state stub. A live
// useTimeStore isn't in the repo yet (the team page reads clock state
// per-API-call); slice 2a renders the greeting + a placeholder clock
// card. Slice 2b wires a real clock fetch.
//
// Slice 3b/c — small "Try the new nav" toggle so users can preview
// the IconRail without flipping `adminNavV2Enabled` via the browser
// console. Phase 4's persona-override picker absorbs this into the
// proper Profile-tab settings UI.

import { useEffect, useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';

import { useAdminNavStore } from '@/lib/admin/nav-store';
import {
  PERSONAS,
  PERSONA_ORDER,
  inferPersona,
  type Persona,
} from '@/lib/admin/personas';
import type { UserRole } from '@/lib/auth';

function partOfDay(date: Date): string {
  const h = date.getHours();
  if (h < 5) return 'Good night';
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

function firstName(name?: string | null): string {
  if (!name) return 'there';
  const first = name.trim().split(/\s+/)[0];
  return first || 'there';
}

export default function HubGreeting() {
  const { data: session } = useSession();
  const navV2 = useAdminNavStore((s) => s.adminNavV2Enabled);
  const setNavV2 = useAdminNavStore((s) => s.setNavV2);
  const personaOverride = useAdminNavStore((s) => s.personaOverride);
  const setPersonaOverride = useAdminNavStore((s) => s.setPersonaOverride);
  const [now, setNow] = useState<Date | null>(null);

  const roles: UserRole[] = useMemo(
    () => (session?.user?.roles ?? (session?.user?.role ? [session.user.role] : [])) as UserRole[],
    [session?.user?.roles, session?.user?.role],
  );
  const inferredPersona = useMemo(() => inferPersona(roles), [roles]);
  const activePersona: Persona = personaOverride ?? inferredPersona;

  // Defer the time-of-day computation to the client so the SSR render
  // doesn't drift from the rehydrated render. (`new Date()` on the
  // server and the client can sit on opposite sides of a part-of-day
  // boundary.)
  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  const greeting = now ? partOfDay(now) : 'Welcome';
  const name = firstName(session?.user?.name);

  return (
    <section className="hub-panel hub-greeting">
      <div>
        <h1 className="hub-greeting__heading">
          {greeting}, {name}.
        </h1>
        <p className="hub-greeting__subtitle">
          You&apos;re not currently clocked in.
          {' '}
          <span className="hub-greeting__hint">
            Clock-state widget lands in slice 2b.
          </span>
        </p>
      </div>
      <div className="hub-greeting__actions">
        <a className="hub-btn hub-btn--primary" href="/admin/my-hours">
          Open timesheet
        </a>
        <a className="hub-btn" href="/admin/schedule">
          View schedule
        </a>
        <button
          type="button"
          className="hub-btn hub-greeting__nav-toggle"
          onClick={() => setNavV2(!navV2)}
          aria-pressed={navV2}
          title={navV2
            ? 'Currently using the new nav rail. Click to revert to the legacy sidebar.'
            : 'Try the new icon rail (preview). Reverts on click.'}
        >
          {navV2 ? 'Revert to old nav' : 'Try new nav (beta)'}
        </button>
        {navV2 ? (
          <label className="hub-greeting__persona">
            <span className="hub-greeting__persona-label">Persona</span>
            <select
              className="hub-greeting__persona-select"
              value={personaOverride ?? ''}
              onChange={(e) =>
                setPersonaOverride(e.target.value === '' ? null : (e.target.value as Persona))
              }
              aria-label="Override your persona (rail ordering)"
            >
              <option value="">Auto ({PERSONAS[inferredPersona].label})</option>
              {PERSONA_ORDER.map((id) => (
                <option key={id} value={id}>
                  {PERSONAS[id].label}
                  {id === activePersona && personaOverride ? ' (active)' : ''}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>
    </section>
  );
}

'use client';
// app/admin/components/ClockInPill.tsx
//
// Top-bar clock-in/out pill. Renders one of two states:
//   - clocked out → gray "▶ Clock In" pill, click navigates to the
//     timesheet (real clock-in modal lands in slice 178)
//   - clocked in → green "■ Clock Out · Xh YYm" pill with a live timer
//     that ticks every 30s
//
// Visible only when the user has a work-eligible role (uses the
// Slice 88 helper). Hidden for student-only / teacher-only users.
//
// Slice 89 of customizable-hub-and-work-mode-2026-05-28.md.

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { isWorkModeEligible } from '@/lib/hub/work-mode-eligibility';
import { formatElapsed } from '@/app/admin/me/components/HubGreeting';
import type { UserRole } from '@/lib/auth';

interface ClockState {
  clockedIn: boolean;
  startedAt?: string;
  jobLabel?: string | null;
}

export default function ClockInPill() {
  const { data: session } = useSession();
  const [clock, setClock] = useState<ClockState | null>(null);
  const [now, setNow] = useState<number>(Date.now());

  const roles: UserRole[] =
    (session?.user?.roles ?? (session?.user?.role ? [session.user.role] : [])) as UserRole[];

  // Best-effort fetch of clock state. Polls every 60s.
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch('/api/admin/time-logs/today', { cache: 'no-store' });
        if (!res.ok) return;
        const data = (await res.json()) as ClockState;
        if (!cancelled) setClock(data);
      } catch {
        /* swallow */
      }
    }
    load();
    const t = setInterval(load, 60_000);
    return () => { cancelled = true; clearInterval(t); };
  }, []);

  // Tick the live timer every 30s when clocked in.
  useEffect(() => {
    if (!clock?.clockedIn) return;
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, [clock?.clockedIn]);

  if (!isWorkModeEligible(roles)) return null;

  const baseStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '4px 10px',
    borderRadius: 999,
    fontSize: '0.82rem',
    fontWeight: 600,
    textDecoration: 'none',
    border: '1px solid var(--theme-border)',
    background: 'var(--theme-bg-elevated)',
    color: 'var(--theme-fg-primary)',
    lineHeight: 1.2,
  };

  if (clock?.clockedIn && clock.startedAt) {
    return (
      <Link
        href="/admin/my-hours"
        style={{
          ...baseStyle,
          background: 'color-mix(in srgb, var(--theme-success) 15%, var(--theme-bg-elevated))',
          color: 'var(--theme-success)',
          borderColor: 'color-mix(in srgb, var(--theme-success) 35%, var(--theme-border))',
        }}
        title={clock.jobLabel ? `Clocked in to ${clock.jobLabel}` : 'Currently clocked in'}
      >
        <span aria-hidden style={{ fontSize: '0.7em' }}>■</span>
        <span>Clock Out</span>
        <span aria-hidden style={{ opacity: 0.5 }}>·</span>
        <time dateTime={clock.startedAt}>{formatElapsed(clock.startedAt, now)}</time>
      </Link>
    );
  }

  return (
    <Link
      href="/admin/my-hours"
      style={baseStyle}
      title="You're not clocked in. Click to open your timesheet."
    >
      <span aria-hidden style={{ fontSize: '0.7em' }}>▶</span>
      <span>Clock In</span>
    </Link>
  );
}

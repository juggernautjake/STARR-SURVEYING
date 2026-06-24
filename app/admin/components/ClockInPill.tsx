'use client';
// app/admin/components/ClockInPill.tsx
//
// Top-bar clock-in/out pill. Opens the Slice 178/179 ClockIn /
// ClockOut modals on click instead of routing away to /admin/my-hours.
//
// State source: `lib/work-mode/clock-session` (localStorage). When
// the user clocks in, the session persists across reloads; when they
// clock out, the modal's `onSubmit` POSTs a finalized
// `daily_time_logs` row for the elapsed window + clears the session.
//
// Visible only when the user has a work-eligible role (Slice 88).
//
// Slice 89 (initial) + Slice 188 (modal wiring) of
// customizable-hub-and-work-mode-2026-05-28.md.

import React, { useCallback, useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { isWorkModeEligible } from '@/lib/hub/work-mode-eligibility';
import { formatElapsed } from '@/app/admin/me/components/greeting-helpers';
import { ClockInModal, ClockOutModal } from '@/lib/work-mode/clock-modals';
import {
  CLOCK_SESSION_KEY,
  clearClockSession,
  elapsedHours,
  hydrateClockSessionFromServer,
  readClockSession,
  writeClockSession,
  type ClockSession,
} from '@/lib/work-mode/clock-session';
import { useActivityTags } from '@/lib/work-mode/use-activity-tags';
import type { UserRole } from '@/lib/auth';

/** "4h 30m" / "45m" from a number of hours. */
function formatHoursLabel(hours: number): string {
  const mins = Math.max(0, Math.round(hours * 60));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h > 0) return m > 0 ? `${h}h ${m}m` : `${h}h`;
  return `${m}m`;
}

export default function ClockInPill() {
  const { data: session } = useSession();
  const [active, setActive] = useState<ClockSession | null>(null);
  const [now, setNow] = useState<number>(Date.now());
  const [modal, setModal] = useState<'none' | 'in' | 'out'>('none');
  // Transient "you're clocked out, here's what got logged" confirmation.
  const [confirmation, setConfirmation] = useState<string | null>(null);
  // Preloaded + cached across all clock surfaces so the modal opens with its
  // tags already present (no empty→filled reflow on open).
  const catalog = useActivityTags();

  const roles: UserRole[] =
    (session?.user?.roles ?? (session?.user?.role ? [session.user.role] : [])) as UserRole[];

  // Initial read + cross-tab sync so two tabs of the app stay in step.
  useEffect(() => {
    setActive(readClockSession());
    // Recover an open session from the server when this device has none
    // (e.g. clocked in on another device). Best-effort; local wins.
    let cancelled = false;
    void hydrateClockSessionFromServer().then((s) => {
      if (!cancelled && s) setActive(s);
    });
    function onStorage(e: StorageEvent) {
      if (e.key === CLOCK_SESSION_KEY) setActive(readClockSession());
    }
    window.addEventListener('storage', onStorage);
    return () => { cancelled = true; window.removeEventListener('storage', onStorage); };
  }, []);

  // Tick the elapsed timer every 30s while clocked in.
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, [active]);

  const handleClockInSubmit = useCallback(({ jobId, tagIds }: { jobId: string | null; tagIds: string[] }) => {
    const session: ClockSession = { startedAt: new Date().toISOString(), jobId, tagIds };
    writeClockSession(session);
    setActive(session);
    setModal('none');
  }, []);

  const handleClockOutSubmit = useCallback(async ({ perJobAllocations, tagIds, notes }: { perJobAllocations: Record<string, number>; tagIds: string[]; notes: string }) => {
    if (!active) { setModal('none'); return; }
    const totalAllocated = Object.values(perJobAllocations).reduce((sum, h) => sum + h, 0);
    const elapsed = elapsedHours(active.startedAt);
    const today = new Date().toISOString().slice(0, 10);

    // Build one entry per job allocation, or a single bucket-of-time
    // entry when the user didn't break down per job.
    const entries = totalAllocated > 0
      ? Object.entries(perJobAllocations)
          .filter(([, h]) => h > 0)
          .map(([job_id, hours]) => ({
            log_date: today,
            work_type: 'general',
            hours,
            job_id,
            description: 'Clock-out entry from top-bar pill',
            notes,
            activity_tag_ids: [...new Set([...active.tagIds, ...tagIds])],
          }))
      : [{
          log_date: today,
          work_type: 'general',
          hours: elapsed,
          job_id: active.jobId,
          description: 'Clock-out entry from top-bar pill',
          notes,
          activity_tag_ids: [...new Set([...active.tagIds, ...tagIds])],
        }];

    let ok = false;
    try {
      const res = await fetch('/api/admin/time-logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entries }),
      });
      ok = res.ok;
    } catch {
      /* swallow — clearing the session is the safer outcome than leaving the user "stuck on" */
    }

    const totalLogged = totalAllocated > 0 ? totalAllocated : elapsed;
    clearClockSession();
    setActive(null);
    setModal('none');
    // Confirm it saved so the user knows their hours were recorded.
    setConfirmation(
      ok
        ? `Clocked out — ${formatHoursLabel(totalLogged)} logged. Pending approval.`
        : `Clocked out — couldn't save your hours. Add them on the My Hours page.`,
    );
  }, [active]);

  // Auto-dismiss the clock-out confirmation.
  useEffect(() => {
    if (!confirmation) return;
    const t = setTimeout(() => setConfirmation(null), 6000);
    return () => clearTimeout(t);
  }, [confirmation]);

  if (!isWorkModeEligible(roles)) return null;

  const baseStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '4px 10px',
    borderRadius: 999,
    fontSize: '0.82rem',
    fontWeight: 600,
    border: '1px solid var(--theme-border)',
    background: 'var(--theme-bg-elevated)',
    color: 'var(--theme-fg-primary)',
    lineHeight: 1.2,
    cursor: 'pointer',
  };

  return (
    <>
      {active ? (
        <button
          type="button"
          onClick={() => setModal('out')}
          style={{
            ...baseStyle,
            background: 'color-mix(in srgb, var(--theme-success) 15%, var(--theme-bg-elevated))',
            color: 'var(--theme-success)',
            borderColor: 'color-mix(in srgb, var(--theme-success) 35%, var(--theme-border))',
          }}
          title={active.jobId ? `Clocked in to ${active.jobId}` : 'Currently clocked in'}
          aria-label="Open clock-out modal"
        >
          <span aria-hidden style={{ fontSize: '0.7em' }}>■</span>
          <span>Clock Out</span>
          <span aria-hidden style={{ opacity: 0.5 }}>·</span>
          <time dateTime={active.startedAt}>{formatElapsed(active.startedAt, now)}</time>
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setModal('in')}
          style={baseStyle}
          title="Click to clock in"
          aria-label="Open clock-in modal"
        >
          <span aria-hidden style={{ fontSize: '0.7em' }}>▶</span>
          <span>Clock In</span>
        </button>
      )}

      <ClockInModal
        open={modal === 'in'}
        onClose={() => setModal('none')}
        onSubmit={handleClockInSubmit}
        catalog={catalog}
      />

      {active && (
        <ClockOutModal
          open={modal === 'out'}
          onClose={() => setModal('none')}
          onSubmit={handleClockOutSubmit}
          catalog={catalog}
          suggestedAllocations={active.jobId ? { [active.jobId]: elapsedHours(active.startedAt) } : {}}
        />
      )}

      {confirmation && (
        <div role="status" style={confirmToastStyle}>
          <span aria-hidden style={{ fontSize: '0.9em' }}>✓</span>
          <span>{confirmation}</span>
          <button
            type="button"
            onClick={() => setConfirmation(null)}
            aria-label="Dismiss"
            style={confirmDismissStyle}
          >
            ×
          </button>
        </div>
      )}
    </>
  );
}

const confirmToastStyle: React.CSSProperties = {
  position: 'fixed',
  top: 'max(64px, calc(env(safe-area-inset-top) + 56px))',
  right: 12,
  left: 'auto',
  maxWidth: 'min(360px, calc(100vw - 24px))',
  zIndex: 70,
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '10px 12px',
  borderRadius: 8,
  background: 'color-mix(in srgb, var(--theme-success, #059669) 14%, var(--theme-bg-surface, #fff))',
  border: '1px solid var(--theme-success, #059669)',
  color: 'var(--theme-fg-primary, #0f1419)',
  fontSize: '0.85rem',
  boxShadow: '0 6px 20px rgba(0,0,0,0.14)',
};

const confirmDismissStyle: React.CSSProperties = {
  marginLeft: 'auto',
  background: 'transparent',
  border: 'none',
  color: 'var(--theme-fg-secondary, #6b7280)',
  fontSize: '1.05rem',
  lineHeight: 1,
  cursor: 'pointer',
  padding: 2,
};

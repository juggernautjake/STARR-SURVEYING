'use client';
// app/admin/components/ClockInPill.tsx
//
// Top-bar clock-in/out pill. Opens the Slice 178/179 ClockIn /
// ClockOut modals on click instead of routing away to /admin/my-hours.
//
// State source: `lib/time-tracking/clock-session` (localStorage). When
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
import { isClockEligible } from '@/lib/time-tracking/clock-eligibility';
import { formatElapsed } from '@/app/admin/me/components/greeting-helpers';
import { ClockInModal, ClockOutModal } from '@/lib/time-tracking/clock-modals';
import {
  CLOCK_SESSION_EVENT,
  CLOCK_SESSION_KEY,
  clearClockSession,
  serverStillClockedIn,
  ALREADY_CLOCKED_OUT_PROMPT,
  elapsedHours,
  hydrateClockSessionFromServer,
  readClockSession,
  writeClockSession,
  type ClockSession,
} from '@/lib/time-tracking/clock-session';
import { useActivityTags } from '@/lib/time-tracking/use-activity-tags';
import {
  PENDING_HOURS_EVENT,
  PENDING_HOURS_KEY,
  buildClockOutEntries,
  describeOutcome,
  readPendingHours,
  startPendingHoursSync,
  submitClockOut,
} from '@/lib/time-tracking/pending-hours';
import type { UserRole } from '@/lib/auth-roles';

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
  // Clock-outs saved on this device that the server has not acknowledged yet.
  const [unsent, setUnsent] = useState(0);
  // Guards the Submit button for the whole save, so a second press cannot start a second save.
  const [savingOut, setSavingOut] = useState(false);

  // The pill is on every admin page for anybody who can clock in, so it is where waiting hours get
  // retried from: on load, when the connection comes back, when the tab is shown, and every minute.
  useEffect(() => {
    const refresh = () => setUnsent(readPendingHours().length);
    refresh();
    const stop = startPendingHoursSync();
    const onStorage = (e: StorageEvent) => { if (e.key === PENDING_HOURS_KEY) refresh(); };
    window.addEventListener(PENDING_HOURS_EVENT, refresh);
    window.addEventListener('storage', onStorage);
    return () => {
      stop();
      window.removeEventListener(PENDING_HOURS_EVENT, refresh);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

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
    // Same-tab changes (the hub tile clocking out) — `storage` never fires in the tab that wrote.
    const onLocal = () => setActive(readClockSession());
    window.addEventListener('storage', onStorage);
    window.addEventListener(CLOCK_SESSION_EVENT, onLocal);
    return () => {
      cancelled = true;
      window.removeEventListener('storage', onStorage);
      window.removeEventListener(CLOCK_SESSION_EVENT, onLocal);
    };
  }, []);

  // Tick the elapsed timer every 30s while clocked in.
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, [active]);

  const handleClockInSubmit = useCallback(({ jobId, jobLabel, tagIds }: { jobId: string | null; jobLabel: string | null; tagIds: string[] }) => {
    const session: ClockSession = { startedAt: new Date().toISOString(), jobId, jobLabel, tagIds };
    writeClockSession(session);
    setActive(session);
    setModal('none');
  }, []);

  const handleClockOutSubmit = useCallback(async ({ perJobAllocations, tagIds, notes, lunchMinutes }: { perJobAllocations: Record<string, number>; tagIds: string[]; notes: string; lunchMinutes: number | null }) => {
    if (!active) { setModal('none'); return; }
    if (savingOut) return;
    setSavingOut(true);
    try {
      // Clocked out already on another device? Ask before logging the same shift twice.
      if ((await serverStillClockedIn(active)) === 'gone' && !window.confirm(ALREADY_CLOCKED_OUT_PROMPT)) {
        clearClockSession();
        setActive(null);
        setModal('none');
        setConfirmation('Clock cleared — those hours were already logged from another device.');
        return;
      }
      const entries = buildClockOutEntries({
        session: active,
        perJobAllocations,
        tagIds,
        notes,
        lunchMinutes,
        description: 'Clock-out entry from top-bar pill',
      });
      // ── SAVED ON THE DEVICE FIRST, THEN SENT (2026-10-05) ────────────────────────────────────
      //
      // This used to POST once, swallow any failure, and clear the session regardless — so a
      // clock-out with no signal was simply lost. Now the hours are written to this device before
      // anything else, retried until the server takes them, and the session is only kept when the
      // device could not store them either (then it is the only copy, so it stays).
      const outcome = await submitClockOut(entries);
      if (outcome.status !== 'failed') {
        clearClockSession();
        setActive(null);
      }
      setModal('none');
      setConfirmation(describeOutcome(outcome, formatHoursLabel(outcome.hours)));
    } finally {
      setSavingOut(false);
    }
  }, [active, savingOut]);

  // Auto-dismiss the clock-out confirmation.
  useEffect(() => {
    if (!confirmation) return;
    const t = setTimeout(() => setConfirmation(null), 6000);
    return () => clearTimeout(t);
  }, [confirmation]);

  if (!isClockEligible(roles)) return null;

  const baseStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    // M5–M8. Was 24px tall on a phone (padding 4px + a 0.82rem line), against a 40px bell and a 40px
    // avatar sitting immediately beside it. Clock-in is the control a field crew uses more than any
    // other in this bar, and it was the smallest thing in it.
    //
    // Applied unconditionally rather than behind a media query: 40px is what its two neighbours
    // already are at every width, so matching them makes the group consistent instead of introducing
    // a second size that only exists on desktop. The bar is 56px tall on mobile and 64px on desktop,
    // so 40px clears both. Height only — the width is untouched, because the top bar's horizontal
    // budget is exactly what the spill fix just finished reclaiming.
    minHeight: 40,
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
    // Keep the pill on one clean line (esp. the wider "Clock Out · 8h 30m"
    // state) and don't let the crowded mobile top bar squeeze it.
    whiteSpace: 'nowrap',
    flexShrink: 0,
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
          title={active.jobId ? `Clocked in to ${active.jobLabel ?? 'a job'}` : 'Currently clocked in'}
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

      {unsent > 0 && (
        <a
          href="/admin/hours?tab=my-time"
          title="Hours saved on this device that have not reached the server yet. They retry automatically — open My time to see them."
          style={{
            ...baseStyle,
            marginLeft: 6,
            textDecoration: 'none',
            background: 'color-mix(in srgb, var(--theme-warning, #D97706) 15%, var(--theme-bg-elevated))',
            color: 'var(--theme-warning, #D97706)',
            borderColor: 'color-mix(in srgb, var(--theme-warning, #D97706) 40%, var(--theme-border))',
          }}
        >
          <span aria-hidden>⟳</span>
          <span>{unsent} unsent</span>
        </a>
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
          startedAt={active.startedAt}
          jobLabels={active.jobId ? { [active.jobId]: active.jobLabel ?? 'Job' } : {}}
          initialTagIds={active.tagIds}
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

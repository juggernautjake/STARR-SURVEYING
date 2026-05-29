'use client';
// app/admin/work-mode/_components/WorkModeTopBar.tsx
//
// Minimal top bar for the Work Mode shell. Shows current mode +
// elapsed timer + Exit button. The Exit button opens a confirmation
// modal asking whether to clock out too (Slice 158).
//
// Slice 156 of customizable-hub-and-work-mode-2026-05-28.md.

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useWorkModeStore, timeInModeMs } from '@/lib/work-mode/work-mode-store';
import { clearClockSession, elapsedHours, readClockSession } from '@/lib/work-mode/clock-session';
import { ROLE_LABELS } from '@/lib/auth';

interface WorkModeTopBarProps {
  userName: string;
}

export default function WorkModeTopBar({ userName }: WorkModeTopBarProps) {
  const router = useRouter();
  const mode = useWorkModeStore((s) => s.mode);
  const enteredAt = useWorkModeStore((s) => s.enteredAt);
  const exitWorkMode = useWorkModeStore((s) => s.exitWorkMode);

  const [elapsed, setElapsed] = useState<string>('');
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    function tick() { setElapsed(formatElapsed(timeInModeMs(enteredAt))); }
    tick();
    const id = setInterval(tick, 30 * 1000);
    return () => clearInterval(id);
  }, [enteredAt]);

  function handleExit(clockOutToo: boolean) {
    setConfirmOpen(false);
    exitWorkMode();
    if (clockOutToo) {
      // Finalize the active clock session — POST one entry against the
      // job that was open in Work Mode (or "general" when no job), then
      // clear the local session. Best-effort: the user already wanted
      // out, so we never block on the post.
      const session = readClockSession();
      if (session) {
        const today = new Date().toISOString().slice(0, 10);
        const hours = elapsedHours(session.startedAt);
        const entry = {
          log_date: today,
          work_type: 'general',
          hours,
          job_id: session.jobId,
          description: 'Clock-out on Work Mode exit',
          notes: null,
          activity_tag_ids: session.tagIds,
        };
        void fetch('/api/admin/time-logs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ entries: [entry] }),
        }).catch(() => {});
        clearClockSession();
      }
    }
    router.push('/admin/me');
  }

  return (
    <header style={headerStyle}>
      <span style={badgeStyle}>
        {mode ? ROLE_LABELS[mode] ?? mode : 'Work Mode'} · {userName}
      </span>
      <span style={timerStyle}>{elapsed || '—'}</span>
      <button type="button" onClick={() => setConfirmOpen(true)} style={exitButtonStyle}>
        Exit Work Mode
      </button>
      {confirmOpen && (
        <div role="dialog" aria-modal style={overlayStyle} onClick={(e) => { if (e.target === e.currentTarget) setConfirmOpen(false); }}>
          <div style={modalStyle}>
            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>Exit Work Mode?</h3>
            <p style={{ margin: '8px 0 16px', fontSize: '0.85rem', color: 'var(--theme-fg-secondary)' }}>
              You&apos;ll return to the hub. Do you want to clock out at the same time?
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" onClick={() => setConfirmOpen(false)} style={cancelButtonStyle}>Stay</button>
              <button type="button" onClick={() => handleExit(false)} style={secondaryButtonStyle}>Exit only</button>
              <button type="button" onClick={() => handleExit(true)} style={dangerButtonStyle}>Exit + clock out</button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}

function formatElapsed(ms: number | null): string {
  if (ms === null || ms < 0) return '';
  const min = Math.floor(ms / 60000);
  const hr = Math.floor(min / 60);
  const remMin = min % 60;
  if (hr > 0) return `${hr}h ${remMin}m`;
  if (min > 0) return `${min}m`;
  return 'just started';
}

const headerStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  padding: 'var(--hub-spc-3, 12px) var(--hub-spc-4, 16px)',
  background: 'var(--theme-bg-surface)', borderBottom: '1px solid var(--theme-border)',
  gap: 'var(--hub-spc-3, 12px)',
};

const badgeStyle: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6,
  padding: '4px 10px', borderRadius: 6,
  background: 'var(--theme-accent)', color: 'var(--theme-accent-fg)',
  fontWeight: 600, fontSize: 'var(--hub-font-sm, 0.875rem)',
};

const timerStyle: React.CSSProperties = {
  fontSize: 'var(--hub-font-sm, 0.875rem)', color: 'var(--theme-fg-secondary)',
  flex: 1, textAlign: 'center',
};

const exitButtonStyle: React.CSSProperties = {
  padding: '6px 12px', borderRadius: 6,
  border: '1px solid var(--theme-border)', background: 'var(--theme-bg-elevated)',
  color: 'var(--theme-fg-primary)', cursor: 'pointer', fontSize: 'var(--hub-font-sm, 0.875rem)',
};

const overlayStyle: React.CSSProperties = {
  position: 'fixed', inset: 0, background: 'color-mix(in srgb, var(--theme-bg-page) 70%, transparent)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50,
};

const modalStyle: React.CSSProperties = {
  background: 'var(--theme-bg-surface)', borderRadius: 8, padding: 'var(--hub-spc-4, 16px)',
  minWidth: 320, maxWidth: 480, boxShadow: '0 12px 40px rgba(0,0,0,0.18)',
};

const cancelButtonStyle: React.CSSProperties = {
  padding: '6px 12px', borderRadius: 6, background: 'transparent', border: 'none',
  color: 'var(--theme-fg-secondary)', cursor: 'pointer', fontSize: '0.85rem',
};

const secondaryButtonStyle: React.CSSProperties = {
  padding: '6px 12px', borderRadius: 6, border: '1px solid var(--theme-border)',
  background: 'var(--theme-bg-elevated)', color: 'var(--theme-fg-primary)',
  cursor: 'pointer', fontSize: '0.85rem',
};

const dangerButtonStyle: React.CSSProperties = {
  padding: '6px 12px', borderRadius: 6, border: 'none',
  background: 'var(--theme-danger)', color: 'var(--theme-accent-fg)',
  cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600,
};

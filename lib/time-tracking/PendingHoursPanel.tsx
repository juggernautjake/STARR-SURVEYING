'use client';
// lib/time-tracking/PendingHoursPanel.tsx — clock-outs saved on this device, not yet on the server.
//
// Shown at the top of My time whenever anything is waiting. Hours that could not be sent are not a
// failure to hide: they are somebody's pay, sitting on one phone. So they are listed plainly, with
// why they have not gone, and the three things a person can do about it — send now, fix the hours,
// or (deliberately, with a confirmation) throw them away.

import { useCallback, useEffect, useState } from 'react';
import {
  PENDING_HOURS_EVENT,
  PENDING_HOURS_KEY,
  discardPendingHours,
  editPendingHours,
  flushPendingHours,
  readPendingHours,
  totalHoursOf,
  type PendingSubmission,
} from './pending-hours';

/** "Mon, Oct 5" from `YYYY-MM-DD`, as a calendar day. */
function dayLabel(d: string | undefined): string {
  return d ? new Date(`${d}T12:00:00`).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' }) : '';
}

export default function PendingHoursPanel({ onPosted }: { onPosted?: () => void }) {
  const [items, setItems] = useState<PendingSubmission[]>([]);
  const [sending, setSending] = useState(false);
  const [editing, setEditing] = useState<{ id: string; hours: string } | null>(null);

  const refresh = useCallback(() => setItems(readPendingHours()), []);

  useEffect(() => {
    refresh();
    const onStorage = (e: StorageEvent) => { if (e.key === PENDING_HOURS_KEY) refresh(); };
    window.addEventListener(PENDING_HOURS_EVENT, refresh);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(PENDING_HOURS_EVENT, refresh);
      window.removeEventListener('storage', onStorage);
    };
  }, [refresh]);

  const sendNow = async () => {
    setSending(true);
    try {
      const posted = await flushPendingHours({ includeNeedsAttention: true });
      if (posted > 0) onPosted?.();
    } finally {
      setSending(false);
      refresh();
    }
  };

  if (items.length === 0) return null;

  return (
    <section
      role="region"
      aria-label="Hours waiting to send"
      style={{
        border: '1px solid var(--theme-warning, #D97706)',
        background: 'color-mix(in srgb, var(--theme-warning, #D97706) 8%, var(--theme-bg-surface, #fff))',
        borderRadius: 10,
        padding: '12px 14px',
        margin: '0 0 16px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <strong style={{ flex: 1, minWidth: 200 }}>
          ⟳ {items.length} clock-out{items.length === 1 ? '' : 's'} saved on this device, not yet sent
        </strong>
        <button type="button" className="tl-btn tl-btn--primary" onClick={sendNow} disabled={sending}>
          {sending ? 'Sending…' : 'Send now'}
        </button>
      </div>
      <p style={{ margin: '6px 0 10px', fontSize: '0.85rem', color: 'var(--theme-fg-secondary, #6b7280)' }}>
        These retry automatically when you are online. They are kept until the server confirms it has
        them — closing this page does not lose them, but clearing this browser&apos;s data would.
      </p>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 8 }}>
        {items.map((p) => {
          const first = p.entries[0];
          const isEditing = editing?.id === p.id;
          return (
            <li
              key={p.id}
              style={{
                border: '1px solid var(--theme-border, #e5e7eb)',
                borderRadius: 8,
                padding: '8px 10px',
                background: 'var(--theme-bg-elevated, #fff)',
              }}
            >
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'baseline' }}>
                <strong>{dayLabel(first?.log_date)}</strong>
                <span>{totalHoursOf(p.entries)}h</span>
                {p.entries.length > 1 && <span>across {p.entries.length} jobs</span>}
                {first?.lunch_minutes != null && <span>· lunch {first.lunch_minutes} min</span>}
                <span style={{ marginLeft: 'auto', fontSize: '0.8rem', color: 'var(--theme-fg-secondary, #6b7280)' }}>
                  saved {new Date(p.createdAt).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                  {p.attempts > 0 && ` · ${p.attempts} attempt${p.attempts === 1 ? '' : 's'}`}
                </span>
              </div>
              {p.lastError && (
                <div
                  role={p.needsAttention ? 'alert' : undefined}
                  style={{ fontSize: '0.85rem', marginTop: 4, color: p.needsAttention ? 'var(--theme-danger, #DC2626)' : 'inherit' }}
                >
                  {p.needsAttention ? 'Needs your attention: ' : ''}{p.lastError}
                </div>
              )}
              <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                {isEditing ? (
                  <>
                    <label style={{ fontSize: '0.85rem' }}>
                      Hours{' '}
                      <input
                        type="number"
                        min={0.25}
                        max={24}
                        step={0.25}
                        value={editing.hours}
                        onChange={(e) => setEditing({ id: p.id, hours: e.target.value })}
                        style={{ width: 80 }}
                      />
                    </label>
                    <button
                      type="button"
                      className="tl-btn tl-btn--primary"
                      onClick={async () => {
                        const h = parseFloat(editing.hours);
                        if (!Number.isFinite(h) || h <= 0 || h > 24) { window.alert('Enter hours between 0 and 24.'); return; }
                        editPendingHours(p.id, h);
                        setEditing(null);
                        await sendNow();
                      }}
                    >
                      Save &amp; send
                    </button>
                    <button type="button" className="tl-btn" onClick={() => setEditing(null)}>Cancel</button>
                  </>
                ) : (
                  <>
                    {p.entries.length === 1 && (
                      <button type="button" className="tl-btn" onClick={() => setEditing({ id: p.id, hours: String(first?.hours ?? '') })}>
                        Fix hours
                      </button>
                    )}
                    <button
                      type="button"
                      className="tl-btn"
                      onClick={() => {
                        if (window.confirm(`Throw away ${totalHoursOf(p.entries)}h for ${dayLabel(first?.log_date)}? They have NOT reached the server, so this cannot be undone.`)) {
                          discardPendingHours(p.id);
                        }
                      }}
                    >
                      Discard
                    </button>
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

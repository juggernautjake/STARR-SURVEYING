'use client';
// app/admin/me/components/HubNotifications.tsx
//
// Hub panel 5 (§5.1) — SaaS-side in-app notifications. Reads from
// /api/admin/org-notifications (release / billing / support / system
// / quota / security channels). The legacy bell-icon NotificationBell
// remains for Starr-internal events; this panel is the consumer for
// the SaaS notification stream until M-10 unifies them.
//
// Phase D-6 of CUSTOMER_PORTAL.md.

import { useEffect, useState } from 'react';

interface Notification {
  id: string;
  type: string;
  severity: 'info' | 'warning' | 'critical';
  title: string;
  body: string | null;
  actionUrl: string | null;
  actionLabel: string | null;
  readAt: string | null;
  createdAt: string;
}

const TYPE_ICONS: Record<string, string> = {
  release: '🚀',
  billing: '💳',
  support: '💬',
  system:  '⚙️',
  quota:   '📊',
  security: '🔒',
};

const SEVERITY_COLORS: Record<string, string> = {
  info:     '#1D3095',
  warning:  '#D97706',
  critical: '#BD1218',
};

function timeAgo(d: string): string {
  const diff = Date.now() - new Date(d).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function HubNotifications() {
  const [notifications, setNotifications] = useState<Notification[] | null>(null);
  const [unread, setUnread] = useState(0);
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      const res = await fetch('/api/admin/org-notifications', { cache: 'no-store' });
      if (!res.ok) return;
      const data = (await res.json()) as { notifications: Notification[]; unreadCount: number };
      setNotifications(data.notifications ?? []);
      setUnread(data.unreadCount ?? 0);
    } catch {
      /* silent */
    }
  }

  useEffect(() => {
    load();
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, []);

  async function markAllRead() {
    setBusy(true);
    try {
      await fetch('/api/admin/org-notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ markAllRead: true }),
      });
      setUnread(0);
      setNotifications((cur) => (cur ?? []).map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })));
    } finally {
      setBusy(false);
    }
  }

  async function dismiss(id: string) {
    await fetch(`/api/admin/org-notifications?id=${id}`, { method: 'DELETE' });
    setNotifications((cur) => (cur ?? []).filter((n) => n.id !== id));
  }

  return (
    <section className="hub-panel hub-notifications">
      <header className="hub-panel__header">
        <h2 className="hub-panel__title">
          Notifications
          {unread > 0 && (
            <span style={{
              marginLeft: '0.5rem',
              padding: '0.1rem 0.5rem',
              background: '#1D3095',
              color: '#FFF',
              borderRadius: 999,
              fontSize: '0.72rem',
              fontWeight: 700,
            }}>
              {unread}
            </span>
          )}
        </h2>
        {unread > 0 && (
          <button
            type="button"
            className="hub-panel__link"
            onClick={markAllRead}
            disabled={busy}
            style={{ background: 'none', border: 0, cursor: 'pointer' }}
          >
            Mark all read
          </button>
        )}
      </header>

      {!notifications ? (
        <p className="hub-notifications__empty">Loading…</p>
      ) : notifications.length === 0 ? (
        <p className="hub-notifications__empty">No notifications. You&apos;re all caught up.</p>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
          {notifications.slice(0, 8).map((n) => {
            const icon = TYPE_ICONS[n.type] ?? 'ℹ️';
            const color = SEVERITY_COLORS[n.severity] ?? '#6B7280';
            const isUnread = n.readAt === null;
            return (
              <li
                key={n.id}
                style={{
                  display: 'flex',
                  gap: '0.6rem',
                  alignItems: 'flex-start',
                  padding: '0.55rem 0.7rem',
                  borderRadius: 8,
                  background: isUnread ? 'rgba(29,48,149,0.05)' : 'transparent',
                  borderLeft: isUnread ? `3px solid ${color}` : '3px solid transparent',
                }}
              >
                <span style={{ fontSize: '1.1rem', lineHeight: 1 }}>{icon}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: '0.88rem', color: '#0F1419' }}>
                    {n.title}
                  </div>
                  {n.body && (
                    <div style={{
                      fontSize: '0.82rem',
                      color: '#374151',
                      marginTop: '0.15rem',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}>
                      {n.body}
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: '0.55rem', alignItems: 'center', marginTop: '0.25rem' }}>
                    <span style={{ fontSize: '0.72rem', color: '#6B7280' }}>{timeAgo(n.createdAt)}</span>
                    {n.actionUrl && (
                      <a
                        href={n.actionUrl}
                        style={{ fontSize: '0.78rem', color: '#1D3095', textDecoration: 'none', fontWeight: 600 }}
                      >
                        {n.actionLabel ?? 'Open →'}
                      </a>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => dismiss(n.id)}
                  title="Dismiss"
                  aria-label="Dismiss notification"
                  style={{
                    background: 'none',
                    border: 0,
                    color: '#9CA3AF',
                    cursor: 'pointer',
                    fontSize: '0.9rem',
                    padding: '0 0.15rem',
                  }}
                >
                  ✕
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

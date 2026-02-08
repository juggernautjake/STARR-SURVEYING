// app/admin/components/NotificationBell.tsx — Notification bell with badge + dropdown
// Shows non-message notifications with escalation levels and routing to relevant pages.
// Message notifications are handled by the FloatingMessenger component instead.
'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useSession } from 'next-auth/react';
import Link from 'next/link';

interface Notification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  icon: string | null;
  link: string | null;
  is_read: boolean;
  created_at: string;
  escalation_level?: string;
  source_type?: string;
}

const TYPE_ICONS: Record<string, string> = {
  assignment: '📋',
  message: '💬',
  payment: '💰',
  system: '⚙️',
  reminder: '⏰',
  job_update: '🔧',
  approval: '✅',
  mention: '@',
  info: 'ℹ️',
};

const ESCALATION_COLORS: Record<string, string> = {
  low: '#10B981',
  normal: '#6B7280',
  high: '#F59E0B',
  urgent: '#EF4444',
  critical: '#7C3AED',
};

function timeAgo(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

export default function NotificationBell() {
  const { data: session } = useSession();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const dropdownRef = useRef<HTMLDivElement>(null);

  const fetchNotifications = useCallback(async () => {
    if (!session?.user?.email) return;
    try {
      const unreadParam = filter === 'unread' ? '&unread=true' : '';
      const res = await fetch(`/api/admin/notifications?limit=20${unreadParam}`);
      if (res.ok) {
        const data = await res.json();
        // Filter out message-type notifications (those go to FloatingMessenger)
        const nonMessageNotifs = (data.notifications || []).filter(
          (n: Notification) => n.source_type !== 'direct_message' && n.source_type !== 'group_message'
        );
        setNotifications(nonMessageNotifs);
        setUnreadCount(data.unread_count || 0);
      }
    } catch { /* silent */ }
  }, [session, filter]);

  // Poll every 20 seconds
  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 20000);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  async function markAllRead() {
    setLoading(true);
    try {
      await fetch('/api/admin/notifications', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'mark_all_read' }),
      });
      setUnreadCount(0);
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    } catch { /* silent */ }
    setLoading(false);
  }

  async function markRead(id: string) {
    try {
      await fetch('/api/admin/notifications', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action: 'read' }),
      });
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
      setUnreadCount(c => Math.max(0, c - 1));
    } catch { /* silent */ }
  }

  async function dismissNotification(id: string) {
    try {
      await fetch('/api/admin/notifications', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action: 'dismiss' }),
      });
      setNotifications(prev => prev.filter(n => n.id !== id));
    } catch { /* silent */ }
  }

  function handleNotificationClick(n: Notification) {
    if (!n.is_read) markRead(n.id);
    if (n.link) setOpen(false);
  }

  if (!session?.user) return null;

  return (
    <div className="notif-bell" ref={dropdownRef}>
      <button
        className="notif-bell__btn"
        onClick={() => { setOpen(!open); if (!open) fetchNotifications(); }}
        aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
      >
        <svg className="notif-bell__icon" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unreadCount > 0 && (
          <span className="notif-bell__badge">{unreadCount > 99 ? '99+' : unreadCount}</span>
        )}
      </button>

      {open && (
        <div className="notif-bell__dropdown">
          <div className="notif-bell__header">
            <h4 className="notif-bell__title">Notifications</h4>
            <div style={{ display: 'flex', gap: '.35rem', alignItems: 'center' }}>
              {/* Filter toggle */}
              <button
                className="notif-bell__mark-all"
                onClick={() => setFilter(f => f === 'all' ? 'unread' : 'all')}
                style={{ fontSize: '.68rem' }}
              >
                {filter === 'all' ? 'Unread Only' : 'Show All'}
              </button>
              {unreadCount > 0 && (
                <button className="notif-bell__mark-all" onClick={markAllRead} disabled={loading}>
                  Mark all read
                </button>
              )}
            </div>
          </div>

          <div className="notif-bell__list">
            {notifications.length === 0 ? (
              <div className="notif-bell__empty">
                <span>🔔</span>
                <p>{filter === 'unread' ? 'No unread notifications' : 'No notifications'}</p>
              </div>
            ) : (
              notifications.map(n => {
                const icon = n.icon || TYPE_ICONS[n.type] || 'ℹ️';
                const escalationColor = n.escalation_level
                  ? ESCALATION_COLORS[n.escalation_level] || ESCALATION_COLORS.normal
                  : undefined;
                const isUrgent = n.escalation_level === 'urgent' || n.escalation_level === 'critical';

                const inner = (
                  <div
                    className={`notif-bell__item ${!n.is_read ? 'notif-bell__item--unread' : ''}`}
                    onClick={() => handleNotificationClick(n)}
                    style={isUrgent ? { borderLeft: `3px solid ${escalationColor}` } : undefined}
                  >
                    <span className="notif-bell__item-icon">{icon}</span>
                    <div className="notif-bell__item-content">
                      <span className="notif-bell__item-title">{n.title}</span>
                      {n.body && <span className="notif-bell__item-body">{n.body}</span>}
                      <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center' }}>
                        <span className="notif-bell__item-time">{timeAgo(n.created_at)}</span>
                        {n.escalation_level && n.escalation_level !== 'normal' && (
                          <span style={{
                            fontSize: '.6rem',
                            fontWeight: 700,
                            color: escalationColor,
                            textTransform: 'uppercase',
                            letterSpacing: '.3px',
                          }}>
                            {n.escalation_level}
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      className="notif-bell__item-dismiss"
                      onClick={e => { e.preventDefault(); e.stopPropagation(); dismissNotification(n.id); }}
                      title="Dismiss"
                    >
                      ✕
                    </button>
                  </div>
                );

                return n.link ? (
                  <Link key={n.id} href={n.link} style={{ textDecoration: 'none', color: 'inherit' }}>
                    {inner}
                  </Link>
                ) : (
                  <div key={n.id}>{inner}</div>
                );
              })
            )}
          </div>

          {notifications.length > 0 && (
            <div className="notif-bell__footer">
              <Link href="/admin/assignments" className="notif-bell__view-all" onClick={() => setOpen(false)}>
                View All Assignments
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

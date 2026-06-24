// app/admin/notifications/page.tsx — Notifications inbox (doc 06, slice N2).
// A full, filterable, paginated list of the current user's alerts so they're
// reachable beyond the bell dropdown. Mobile-first stacked cards, no overflow
// at 390px. Filters: read/unread, escalation, source type, date, text search.
'use client';

import './NotificationsInbox.css';
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
  assignment: '📋', message: '💬', payment: '💰', system: '⚙️',
  reminder: '⏰', job_update: '🔧', approval: '✅', mention: '@', info: 'ℹ️',
};
const ESCALATION_COLORS: Record<string, string> = {
  low: '#10B981', normal: '#6B7280', high: '#F59E0B', urgent: '#DC2626', critical: '#7C3AED',
};
const ESCALATIONS = ['low', 'normal', 'high', 'urgent', 'critical'];
const DATE_RANGES: { key: string; label: string; days: number | null }[] = [
  { key: 'all', label: 'Any time', days: null },
  { key: 'today', label: 'Today', days: 1 },
  { key: '7d', label: 'Last 7 days', days: 7 },
  { key: '30d', label: 'Last 30 days', days: 30 },
];
const PAGE_SIZE = 25;

function fmtSourceType(s?: string): string {
  if (!s) return 'Other';
  return s.replace(/[_-]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}
function fmtWhen(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ', ' +
    d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function NotificationsInboxPage() {
  const { data: session } = useSession();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);

  // Filters
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [escalation, setEscalation] = useState('');
  const [sourceType, setSourceType] = useState('');
  const [dateRange, setDateRange] = useState('all');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Accumulated source-type options for the dropdown (grows as pages load).
  const [sourceTypes, setSourceTypes] = useState<string[]>([]);

  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => { setDebouncedSearch(search); setPage(0); }, 350);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [search]);

  const load = useCallback(async () => {
    if (!session?.user?.email) return;
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('limit', String(PAGE_SIZE));
      params.set('offset', String(page * PAGE_SIZE));
      if (unreadOnly) params.set('unread', 'true');
      if (escalation) params.set('escalation', escalation);
      if (sourceType) params.set('source_type', sourceType);
      if (debouncedSearch) params.set('q', debouncedSearch);
      const dr = DATE_RANGES.find(d => d.key === dateRange);
      if (dr?.days) params.set('since', new Date(Date.now() - dr.days * 86400000).toISOString());

      const res = await fetch(`/api/admin/notifications?${params}`);
      if (res.ok) {
        const data = await res.json();
        const rows: Notification[] = data.notifications || [];
        setNotifications(rows);
        setTotal(data.total || 0);
        setSourceTypes(prev => {
          const next = new Set(prev);
          rows.forEach(r => { if (r.source_type) next.add(r.source_type); });
          return Array.from(next).sort();
        });
      }
    } catch { /* show empty */ }
    setLoading(false);
  }, [session, page, unreadOnly, escalation, sourceType, dateRange, debouncedSearch]);

  useEffect(() => { load(); }, [load]);

  async function markRead(id: string) {
    try {
      await fetch('/api/admin/notifications', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action: 'read' }),
      });
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
    } catch { /* silent */ }
  }
  async function dismiss(id: string) {
    try {
      await fetch('/api/admin/notifications', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action: 'dismiss' }),
      });
      setNotifications(prev => prev.filter(n => n.id !== id));
      setTotal(t => Math.max(0, t - 1));
    } catch { /* silent */ }
  }
  async function markAllRead() {
    try {
      await fetch('/api/admin/notifications', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'mark_all_read' }),
      });
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    } catch { /* silent */ }
  }

  function resetFilters() {
    setUnreadOnly(false); setEscalation(''); setSourceType(''); setDateRange('all');
    setSearch(''); setDebouncedSearch(''); setPage(0);
  }

  if (!session?.user) return null;

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const hasFilters = unreadOnly || !!escalation || !!sourceType || dateRange !== 'all' || !!debouncedSearch;

  return (
    <div className="notif-inbox" data-testid="notif-inbox">
      <header className="notif-inbox__header">
        <h1 className="notif-inbox__title">Notifications</h1>
        <button className="notif-inbox__mark-all" onClick={markAllRead}>Mark all read</button>
      </header>

      {/* Filters */}
      <div className="notif-inbox__filters">
        <input
          className="notif-inbox__search"
          placeholder="Search alerts…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <div className="notif-inbox__filter-row">
          <label className="notif-inbox__chk">
            <input type="checkbox" checked={unreadOnly} onChange={e => { setUnreadOnly(e.target.checked); setPage(0); }} />
            Unread only
          </label>
          <select className="notif-inbox__select" value={escalation} onChange={e => { setEscalation(e.target.value); setPage(0); }}>
            <option value="">Any priority</option>
            {ESCALATIONS.map(e => <option key={e} value={e}>{e[0].toUpperCase() + e.slice(1)}</option>)}
          </select>
          <select className="notif-inbox__select" value={sourceType} onChange={e => { setSourceType(e.target.value); setPage(0); }}>
            <option value="">Any source</option>
            {sourceTypes.map(s => <option key={s} value={s}>{fmtSourceType(s)}</option>)}
          </select>
          <select className="notif-inbox__select" value={dateRange} onChange={e => { setDateRange(e.target.value); setPage(0); }}>
            {DATE_RANGES.map(d => <option key={d.key} value={d.key}>{d.label}</option>)}
          </select>
          {hasFilters && (
            <button className="notif-inbox__clear" onClick={resetFilters}>Clear</button>
          )}
        </div>
      </div>

      {/* List */}
      {loading ? (
        <p className="notif-inbox__empty">Loading…</p>
      ) : notifications.length === 0 ? (
        <p className="notif-inbox__empty">{hasFilters ? 'No alerts match these filters.' : 'No notifications.'}</p>
      ) : (
        <ul className="notif-inbox__list">
          {notifications.map(n => {
            const icon = n.icon || TYPE_ICONS[n.type] || 'ℹ️';
            const escColor = n.escalation_level ? ESCALATION_COLORS[n.escalation_level] : undefined;
            const isUrgent = n.escalation_level === 'urgent' || n.escalation_level === 'critical';
            const Row = (
              <div
                className={`notif-inbox__row${!n.is_read ? ' notif-inbox__row--unread' : ''}`}
                style={isUrgent ? { borderLeft: `4px solid ${escColor}` } : undefined}
                onClick={() => { if (!n.is_read) markRead(n.id); }}
              >
                <span className="notif-inbox__icon">{icon}</span>
                <div className="notif-inbox__body">
                  <div className="notif-inbox__row-title">{n.title}</div>
                  {n.body && <div className="notif-inbox__row-text">{n.body}</div>}
                  <div className="notif-inbox__meta">
                    <span>{fmtWhen(n.created_at)}</span>
                    {n.source_type && <span className="notif-inbox__tag">{fmtSourceType(n.source_type)}</span>}
                    {n.escalation_level && n.escalation_level !== 'normal' && (
                      <span className="notif-inbox__tag" style={{ color: escColor, borderColor: escColor }}>
                        {n.escalation_level}
                      </span>
                    )}
                  </div>
                </div>
                <button
                  className="notif-inbox__dismiss"
                  aria-label="Dismiss"
                  onClick={e => { e.preventDefault(); e.stopPropagation(); dismiss(n.id); }}
                >✕</button>
              </div>
            );
            return (
              <li key={n.id}>
                {n.link ? <Link href={n.link} className="notif-inbox__link">{Row}</Link> : Row}
              </li>
            );
          })}
        </ul>
      )}

      {/* Pagination */}
      {total > PAGE_SIZE && (
        <div className="notif-inbox__pager">
          <button disabled={page === 0} onClick={() => setPage(p => Math.max(0, p - 1))}>‹ Prev</button>
          <span>Page {page + 1} of {totalPages}</span>
          <button disabled={page + 1 >= totalPages} onClick={() => setPage(p => p + 1)}>Next ›</button>
        </div>
      )}
    </div>
  );
}

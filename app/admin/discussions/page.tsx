// app/admin/discussions/page.tsx — Admin discussion threads listing page
'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface Thread {
  id: string;
  title: string;
  description: string | null;
  thread_type: string;
  escalation_level: string;
  status: string;
  page_path: string | null;
  page_title: string | null;
  created_by: string;
  created_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
}

const ESCALATION_COLORS: Record<string, string> = {
  low: '#10B981', medium: '#F59E0B', high: '#EF4444', critical: '#7C3AED',
};

const ESCALATION_ICONS: Record<string, string> = {
  low: 'ℹ️', medium: '⚠️', high: '🔴', critical: '🚨',
};

const STATUS_LABELS: Record<string, string> = {
  open: 'Open', in_progress: 'In Progress', resolved: 'Resolved', closed: 'Closed', wont_fix: "Won't Fix",
};

const TYPE_LABELS: Record<string, string> = {
  factual_error: 'Factual Error', improvement: 'Improvement', bug: 'Bug',
  content_review: 'Content Review', compliance: 'Compliance', general: 'General',
};

export default function DiscussionsPage() {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('open');

  useEffect(() => { fetchThreads(); }, [statusFilter]);

  async function fetchThreads() {
    setLoading(true);
    try {
      const url = statusFilter === 'all'
        ? '/api/admin/discussions?limit=100'
        : `/api/admin/discussions?status=${statusFilter}&limit=100`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setThreads(data.threads || []);
      }
    } catch { /* silent */ }
    setLoading(false);
  }

  const statuses = ['all', 'open', 'in_progress', 'resolved', 'closed'];

  return (
    <>
      {/* Status filter tabs */}
      <div className="discussions-page__filters">
        {statuses.map(s => (
          <button
            key={s}
            className={`discussions-page__filter ${statusFilter === s ? 'discussions-page__filter--active' : ''}`}
            onClick={() => setStatusFilter(s)}
          >
            {s === 'all' ? 'All' : STATUS_LABELS[s] || s}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="admin-empty">
          <div className="admin-empty__icon">&#x23F3;</div>
          <div className="admin-empty__title">Loading...</div>
        </div>
      ) : threads.length === 0 ? (
        <div className="admin-empty">
          <div className="admin-empty__icon">✅</div>
          <div className="admin-empty__title">No threads found</div>
          <div className="admin-empty__desc">
            Use the 🚩 button on any page to flag an issue and start a discussion thread.
          </div>
        </div>
      ) : (
        <div className="discussions-page__grid">
          {threads.map(t => (
            <Link key={t.id} href={`/admin/discussions/${t.id}`} className="discussions-page__card">
              <div
                className="discussions-page__card-indicator"
                style={{ background: ESCALATION_COLORS[t.escalation_level] || '#888' }}
              />
              <div className="discussions-page__card-body">
                <div className="discussions-page__card-top">
                  <span
                    className="discussion-panel__item-escalation"
                    style={{ background: ESCALATION_COLORS[t.escalation_level] || '#888' }}
                  >
                    {ESCALATION_ICONS[t.escalation_level]} {t.escalation_level.toUpperCase()}
                  </span>
                  <span className="discussion-panel__item-type">
                    {TYPE_LABELS[t.thread_type] || t.thread_type}
                  </span>
                  <span className="discussion-panel__item-type">
                    {STATUS_LABELS[t.status] || t.status}
                  </span>
                </div>
                <div className="discussions-page__card-title">{t.title}</div>
                {t.description && (
                  <div className="discussions-page__card-desc">{t.description.slice(0, 200)}</div>
                )}
                <div className="discussions-page__card-footer">
                  <span>By: {t.created_by}</span>
                  <span>Created: {new Date(t.created_at).toLocaleDateString()}</span>
                  {t.page_title && <span>Page: {t.page_title}</span>}
                  {t.resolved_at && <span>Resolved: {new Date(t.resolved_at).toLocaleDateString()}</span>}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}

// app/admin/components/DiscussionThreadButton.tsx — Floating button for admin discussion threads
// Allows admins to flag content issues, errors, and improvement suggestions
// directly from any page. Opens a panel to create or view existing threads.
'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { useSession } from 'next-auth/react';
import Link from 'next/link';

interface DiscussionThread {
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
}

const ESCALATION_COLORS: Record<string, string> = {
  low: '#10B981',
  medium: '#F59E0B',
  high: '#EF4444',
  critical: '#7C3AED',
};

const ESCALATION_ICONS: Record<string, string> = {
  low: 'ℹ️',
  medium: '⚠️',
  high: '🔴',
  critical: '🚨',
};

const TYPE_LABELS: Record<string, string> = {
  factual_error: 'Factual Error',
  improvement: 'Improvement',
  bug: 'Bug / Broken',
  content_review: 'Content Review',
  compliance: 'Compliance',
  general: 'General',
};

/** Derive content context from the current path */
function getPageContext(pathname: string): { pageTitle: string; contentType: string | null } {
  if (pathname.includes('/learn/modules/') && pathname.includes('/lessons/'))
    return { pageTitle: 'Lesson', contentType: 'lesson' };
  if (pathname.includes('/learn/modules/'))
    return { pageTitle: 'Module', contentType: 'module' };
  if (pathname.includes('/learn/knowledge-base/'))
    return { pageTitle: 'Article', contentType: 'article' };
  if (pathname.includes('/learn/flashcards/'))
    return { pageTitle: 'Flashcard Deck', contentType: 'flashcard' };
  if (pathname.includes('/learn/exam-prep/sit'))
    return { pageTitle: 'FS Exam Prep', contentType: 'fs_module' };
  if (pathname.includes('/learn/exam-prep/rpls'))
    return { pageTitle: 'RPLS Exam Prep', contentType: 'fs_module' };
  if (pathname.includes('/learn'))
    return { pageTitle: 'Learning Hub', contentType: null };
  return { pageTitle: 'Admin Page', contentType: null };
}

export default function DiscussionThreadButton() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const [isOpen, setIsOpen] = useState(false);
  const [view, setView] = useState<'list' | 'create'>('list');
  const [threads, setThreads] = useState<DiscussionThread[]>([]);
  const [loading, setLoading] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // Form state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [threadType, setThreadType] = useState('general');
  const [escalation, setEscalation] = useState('low');
  const [initialMessage, setInitialMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const userEmail = session?.user?.email;
  const pageContext = getPageContext(pathname);

  // Fetch recent threads for this page
  const fetchThreads = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/discussions?status=open&limit=20');
      if (res.ok) {
        const data = await res.json();
        setThreads(data.threads || []);
      }
    } catch { /* silent */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (isOpen) fetchThreads();
  }, [isOpen, fetchThreads]);

  // Close panel on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [isOpen]);

  async function handleSubmit() {
    if (!title.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/admin/discussions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || null,
          thread_type: threadType,
          escalation_level: escalation,
          page_path: pathname,
          page_title: pageContext.pageTitle,
          content_type: pageContext.contentType,
          initial_message: initialMessage.trim() || null,
        }),
      });
      if (res.ok) {
        // Reset form and switch to list view
        setTitle('');
        setDescription('');
        setThreadType('general');
        setEscalation('low');
        setInitialMessage('');
        setView('list');
        fetchThreads();
      }
    } catch { /* silent */ }
    setSubmitting(false);
  }

  // Don't show on login page or if not logged in
  if (pathname === '/admin/login' || !userEmail) return null;

  return (
    <>
      {/* FAB — positioned above the fieldbook button */}
      {!isOpen && (
        <div className="discussion-fab-wrap">
          <span className="discussion-fab-tooltip">Flag an Issue</span>
          <button
            className="discussion-fab"
            onClick={() => setIsOpen(true)}
            aria-label="Flag an issue or start a discussion"
          >
            🚩
          </button>
        </div>
      )}

      {/* Discussion panel */}
      {isOpen && (
        <div className="discussion-panel" ref={panelRef}>
          {/* Header */}
          <div className="discussion-panel__header">
            <div className="discussion-panel__header-tabs">
              <button
                className={`discussion-panel__tab ${view === 'list' ? 'discussion-panel__tab--active' : ''}`}
                onClick={() => setView('list')}
              >
                Open Threads
              </button>
              <button
                className={`discussion-panel__tab ${view === 'create' ? 'discussion-panel__tab--active' : ''}`}
                onClick={() => setView('create')}
              >
                New Thread
              </button>
            </div>
            <button className="discussion-panel__close" onClick={() => setIsOpen(false)}>✕</button>
          </div>

          {/* Current page context */}
          <div className="discussion-panel__context">
            📍 Page: <strong>{pageContext.pageTitle}</strong> — {pathname}
          </div>

          {/* List view */}
          {view === 'list' && (
            <div className="discussion-panel__body">
              {loading ? (
                <p className="discussion-panel__loading">Loading threads...</p>
              ) : threads.length === 0 ? (
                <div className="discussion-panel__empty">
                  <span>✅</span>
                  <p>No open discussion threads</p>
                  <button
                    className="admin-btn admin-btn--primary admin-btn--sm"
                    onClick={() => setView('create')}
                  >
                    Start a Thread
                  </button>
                </div>
              ) : (
                <div className="discussion-panel__list">
                  {threads.map(t => (
                    <Link
                      key={t.id}
                      href={`/admin/discussions/${t.id}`}
                      className="discussion-panel__item"
                      onClick={() => setIsOpen(false)}
                    >
                      <div className="discussion-panel__item-header">
                        <span className="discussion-panel__item-escalation"
                          style={{ background: ESCALATION_COLORS[t.escalation_level] || '#888' }}
                        >
                          {ESCALATION_ICONS[t.escalation_level]} {t.escalation_level.toUpperCase()}
                        </span>
                        <span className="discussion-panel__item-type">
                          {TYPE_LABELS[t.thread_type] || t.thread_type}
                        </span>
                      </div>
                      <h4 className="discussion-panel__item-title">{t.title}</h4>
                      {t.description && (
                        <p className="discussion-panel__item-desc">{t.description.slice(0, 100)}</p>
                      )}
                      <div className="discussion-panel__item-meta">
                        <span>{t.created_by}</span>
                        <span>{new Date(t.created_at).toLocaleDateString()}</span>
                      </div>
                    </Link>
                  ))}
                  <Link
                    href="/admin/discussions"
                    className="discussion-panel__view-all"
                    onClick={() => setIsOpen(false)}
                  >
                    View All Threads →
                  </Link>
                </div>
              )}
            </div>
          )}

          {/* Create view */}
          {view === 'create' && (
            <div className="discussion-panel__body discussion-panel__form">
              <label className="admin-label">Issue Title *</label>
              <input
                className="admin-input"
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="Brief description of the issue..."
              />

              <div className="discussion-panel__form-row">
                <div>
                  <label className="admin-label">Type</label>
                  <select className="admin-select" value={threadType} onChange={e => setThreadType(e.target.value)}>
                    <option value="factual_error">Factual Error</option>
                    <option value="improvement">Improvement</option>
                    <option value="bug">Bug / Broken</option>
                    <option value="content_review">Content Review</option>
                    <option value="compliance">Compliance</option>
                    <option value="general">General</option>
                  </select>
                </div>
                <div>
                  <label className="admin-label">Escalation</label>
                  <select className="admin-select" value={escalation} onChange={e => setEscalation(e.target.value)}>
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="critical">Critical</option>
                  </select>
                </div>
              </div>

              <label className="admin-label">Description</label>
              <textarea
                className="admin-textarea"
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Describe the issue in detail..."
                style={{ minHeight: '70px' }}
              />

              <label className="admin-label">Initial Message (optional)</label>
              <textarea
                className="admin-textarea"
                value={initialMessage}
                onChange={e => setInitialMessage(e.target.value)}
                placeholder="Start the discussion with a message..."
                style={{ minHeight: '50px' }}
              />

              <button
                className="admin-btn admin-btn--primary"
                onClick={handleSubmit}
                disabled={submitting || !title.trim()}
                style={{ marginTop: '.5rem', width: '100%' }}
              >
                {submitting ? 'Creating...' : '🚩 Create Discussion Thread'}
              </button>
            </div>
          )}
        </div>
      )}
    </>
  );
}

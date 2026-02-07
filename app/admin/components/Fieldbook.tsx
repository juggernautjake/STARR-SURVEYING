// app/admin/components/Fieldbook.tsx
'use client';

import { useState, useEffect, useCallback } from 'react';
import { usePathname } from 'next/navigation';

interface FieldbookEntry {
  id: string;
  content: string;
  context_label: string;
  context_path: string;
  created_at: string;
}

function getContextFromPath(pathname: string): { type: string; label: string } {
  if (pathname.includes('/learn/modules/') && pathname.split('/').length >= 7) {
    return { type: 'lesson', label: 'Lesson' };
  }
  if (pathname.includes('/learn/modules/') && pathname.includes('/quiz')) {
    return { type: 'quiz', label: 'Lesson Quiz' };
  }
  if (pathname.includes('/learn/modules/') && pathname.includes('/test')) {
    return { type: 'test', label: 'Module Test' };
  }
  if (pathname.includes('/learn/modules/')) {
    return { type: 'module', label: 'Module' };
  }
  if (pathname.includes('/learn/knowledge-base/')) {
    return { type: 'article', label: 'KB Article' };
  }
  if (pathname.includes('/learn/flashcards/')) {
    return { type: 'flashcards', label: 'Flashcards' };
  }
  if (pathname.includes('/learn/exam-prep/sit')) {
    return { type: 'sit_prep', label: 'SIT Exam Prep' };
  }
  if (pathname.includes('/learn/exam-prep/rpls')) {
    return { type: 'rpls_prep', label: 'RPLS Exam Prep' };
  }
  if (pathname.includes('/learn')) {
    return { type: 'learning', label: 'Learning Hub' };
  }
  if (pathname.includes('/dashboard')) {
    return { type: 'dashboard', label: 'Dashboard' };
  }
  return { type: 'general', label: 'Admin Panel' };
}

export default function Fieldbook() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const [entries, setEntries] = useState<FieldbookEntry[]>([]);
  const [noteText, setNoteText] = useState('');
  const [saving, setSaving] = useState(false);

  const context = getContextFromPath(pathname);

  const fetchEntries = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/learn/fieldbook?limit=20');
      if (res.ok) {
        const data = await res.json();
        setEntries(data.entries || []);
      }
    } catch {
      // Silent fail
    }
  }, []);

  useEffect(() => {
    if (isOpen) fetchEntries();
  }, [isOpen, fetchEntries]);

  async function saveNote() {
    if (!noteText.trim()) return;
    setSaving(true);
    try {
      const res = await fetch('/api/admin/learn/fieldbook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: noteText.trim(),
          context_type: context.type,
          context_label: context.label,
          context_path: pathname,
        }),
      });
      if (res.ok) {
        setNoteText('');
        fetchEntries();
      }
    } catch {
      // Silent fail
    } finally {
      setSaving(false);
    }
  }

  // Don't show on login page
  if (pathname === '/admin/login') return null;

  return (
    <>
      {/* Floating Action Button */}
      {!isOpen && (
        <div className="fieldbook-fab-wrap">
          <span className="fieldbook-fab-tooltip">Write in Fieldbook</span>
          <button className="fieldbook-fab" onClick={() => setIsOpen(true)} aria-label="Write in Fieldbook">
            📓
          </button>
        </div>
      )}

      {/* Panel */}
      {isOpen && (
        <div className="fieldbook-panel">
          <div className="fieldbook-panel__header">
            <span className="fieldbook-panel__title">📓 My Fieldbook</span>
            <button className="fieldbook-panel__close" onClick={() => setIsOpen(false)}>✕</button>
          </div>

          <div className="fieldbook-panel__context">
            📍 Currently on: <strong>{context.label}</strong> — {pathname}
            <br />
            🕐 {new Date().toLocaleString()}
          </div>

          <div className="fieldbook-panel__body">
            <div className="fieldbook-panel__entries">
              {entries.length === 0 && (
                <p style={{ fontFamily: 'Inter,sans-serif', fontSize: '.85rem', color: '#9CA3AF', textAlign: 'center', padding: '1rem 0' }}>
                  No notes yet. Start writing!
                </p>
              )}
              {entries.map((entry) => (
                <div key={entry.id} className="fieldbook-panel__entry">
                  <div className="fieldbook-panel__entry-date">
                    {new Date(entry.created_at).toLocaleString()}
                  </div>
                  <div className="fieldbook-panel__entry-context">
                    📍 {entry.context_label} — {entry.context_path}
                  </div>
                  <div className="fieldbook-panel__entry-text">{entry.content}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="fieldbook-panel__input-area">
            <textarea
              className="fieldbook-panel__textarea"
              placeholder="Write a note... (auto-saves with current page context)"
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && e.ctrlKey) saveNote(); }}
            />
            <button
              className="fieldbook-panel__save-btn"
              onClick={saveNote}
              disabled={saving || !noteText.trim()}
            >
              {saving ? '...' : 'Save'}
            </button>
          </div>
        </div>
      )}
    </>
  );
}

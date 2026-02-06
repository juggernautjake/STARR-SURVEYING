// app/admin/components/FieldbookButton.tsx
'use client';

import { useState } from 'react';

interface FieldbookButtonProps {
  contextType?: string;
  contextLabel?: string;
  moduleId?: string;
  lessonId?: string;
  topicId?: string;
  articleId?: string;
  pageUrl?: string;
}

export default function FieldbookButton({
  contextType, contextLabel, moduleId, lessonId, topicId, articleId, pageUrl
}: FieldbookButtonProps) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const save = async () => {
    if (!content.trim()) return;
    setSaving(true);
    try {
      const res = await fetch('/api/admin/learn/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim() || 'Fieldbook Note',
          content: content.trim(),
          page_context: contextLabel || document.title,
          page_url: pageUrl || window.location.pathname,
          module_id: moduleId || null,
          lesson_id: lessonId || null,
          topic_id: topicId || null,
          article_id: articleId || null,
          context_type: contextType || 'general',
          context_label: contextLabel || document.title,
        }),
      });
      if (res.ok) {
        setSaved(true);
        setTimeout(() => {
          setOpen(false);
          setTitle('');
          setContent('');
          setSaved(false);
        }, 1500);
      }
    } catch { /* ignore */ }
    setSaving(false);
  };

  return (
    <>
      {/* Floating Button */}
      <button
        className="fieldbook-fab"
        onClick={() => setOpen(true)}
        title="Write in Fieldbook"
      >
        📓 Write in Fieldbook
      </button>

      {/* Note Panel */}
      {open && (
        <div className="fieldbook-overlay" onClick={() => setOpen(false)}>
          <div className="fieldbook-panel" onClick={e => e.stopPropagation()}>
            <div className="fieldbook-panel__header">
              <h3 className="fieldbook-panel__title">📓 Fieldbook Note</h3>
              <button className="fieldbook-panel__close" onClick={() => setOpen(false)}>×</button>
            </div>

            {/* Auto-recorded context */}
            <div className="fieldbook-panel__context">
              <span>📅 {new Date().toLocaleString()}</span>
              {contextLabel && <span>📍 {contextLabel}</span>}
            </div>

            <input
              type="text"
              className="fieldbook-panel__title-input"
              placeholder="Note title (optional)"
              value={title}
              onChange={e => setTitle(e.target.value)}
            />

            <textarea
              className="fieldbook-panel__textarea"
              placeholder="Write your study notes here..."
              value={content}
              onChange={e => setContent(e.target.value)}
              rows={8}
              autoFocus
            />

            <div className="fieldbook-panel__footer">
              {saved ? (
                <span style={{ color: '#10B981', fontWeight: 600 }}>✓ Saved to Fieldbook!</span>
              ) : (
                <button
                  className="admin-btn admin-btn--primary"
                  onClick={save}
                  disabled={saving || !content.trim()}
                >
                  {saving ? 'Saving...' : '💾 Save Note'}
                </button>
              )}
              <button className="admin-btn admin-btn--ghost" onClick={() => setOpen(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

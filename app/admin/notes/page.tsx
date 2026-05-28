// app/admin/notes/page.tsx — Company Notes (shared company-wide notes board)
'use client';
import '../styles/AdminMyNotes.css';
import { useCallback, useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { usePageError } from '../hooks/usePageError';

interface Note {
  id: string;
  title: string;
  content: string;
  category: string;
  is_pinned: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
}

const CATEGORIES = [
  { key: 'general', label: 'General', color: '#6B7280' },
  { key: 'procedures', label: 'Procedures', color: 'var(--color-brand-navy)' },
  { key: 'safety', label: 'Safety', color: '#EF4444' },
  { key: 'equipment', label: 'Equipment', color: '#D97706' },
  { key: 'legal', label: 'Legal', color: '#7C3AED' },
  { key: 'hr', label: 'HR', color: '#059669' },
  { key: 'training', label: 'Training', color: '#0891B2' },
];

export default function CompanyNotesPage() {
  const { data: session } = useSession();
  const { safeFetch, safeAction } = usePageError('CompanyNotesPage');
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [showEditor, setShowEditor] = useState(false);
  const [editorForm, setEditorForm] = useState({ title: '', content: '', category: 'general' });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await safeFetch<{ notes: Note[] }>('/api/admin/notes');
      setNotes(res?.notes ?? []);
    } finally {
      setLoading(false);
    }
  }, [safeFetch]);

  useEffect(() => { void load(); }, [load]);

  async function saveNote() {
    if (!editorForm.title.trim() || saving) return;
    setSaving(true);
    try {
      await safeAction('saving note', async () => {
        const res = await fetch('/api/admin/notes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(editorForm),
        });
        if (!res.ok) throw new Error((await res.json().catch(() => ({})) as { error?: string }).error ?? `Server ${res.status}`);
      });
      setEditorForm({ title: '', content: '', category: 'general' });
      setShowEditor(false);
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function togglePin(note: Note) {
    await safeAction('updating note', async () => {
      const res = await fetch('/api/admin/notes', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: note.id, is_pinned: !note.is_pinned }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({})) as { error?: string }).error ?? `Server ${res.status}`);
    });
    await load();
  }

  async function deleteNote(id: string) {
    if (!window.confirm('Delete this note? This cannot be undone.')) return;
    await safeAction('deleting note', async () => {
      const res = await fetch(`/api/admin/notes?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (!res.ok) throw new Error((await res.json().catch(() => ({})) as { error?: string }).error ?? `Server ${res.status}`);
    });
    await load();
  }

  if (!session?.user) return null;

  const filtered = notes.filter(n => {
    if (categoryFilter !== 'all' && n.category !== categoryFilter) return false;
    if (search && !n.title.toLowerCase().includes(search.toLowerCase()) && !n.content.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const pinned = filtered.filter(n => n.is_pinned);
  const unpinned = filtered.filter(n => !n.is_pinned);

  function NoteCard({ note }: { note: Note }) {
    return (
      <div className="job-card" style={{ borderLeft: `3px solid ${CATEGORIES.find(c => c.key === note.category)?.color || '#6B7280'}` }}>
        <h3 className="job-card__name">{note.title}</h3>
        <p className="job-card__client" style={{ WebkitLineClamp: 3, display: '-webkit-box', WebkitBoxOrient: 'vertical', overflow: 'hidden', whiteSpace: 'pre-wrap' }}>{note.content}</p>
        <div className="job-card__footer">
          <span>{CATEGORIES.find(c => c.key === note.category)?.label}</span>
          <span>{new Date(note.updated_at).toLocaleDateString()}</span>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
          <button
            className="jobs-page__btn"
            style={{ fontSize: '0.72rem', padding: '0.25rem 0.6rem' }}
            onClick={() => void togglePin(note)}
          >
            {note.is_pinned ? '📌 Unpin' : '📌 Pin'}
          </button>
          <button
            className="jobs-page__btn"
            style={{ fontSize: '0.72rem', padding: '0.25rem 0.6rem', color: '#EF4444' }}
            onClick={() => void deleteNote(note.id)}
          >
            Delete
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="jobs-page">
      <div className="jobs-page__header">
        <div className="jobs-page__header-left">
          <h2 className="jobs-page__title">Company Notes</h2>
          <span className="jobs-page__count">{notes.length} notes</span>
        </div>
        <button className="jobs-page__btn jobs-page__btn--primary" onClick={() => setShowEditor(!showEditor)}>
          + New Note
        </button>
      </div>

      {/* Category filter */}
      <div className="jobs-page__pipeline">
        <button
          className={`jobs-page__pipeline-stage ${categoryFilter === 'all' ? 'jobs-page__pipeline-stage--active' : ''}`}
          onClick={() => setCategoryFilter('all')}
          style={{ '--stage-color': '#374151' } as React.CSSProperties}
        >
          <span className="jobs-page__pipeline-label">All</span>
          <span className="jobs-page__pipeline-count">{notes.length}</span>
        </button>
        {CATEGORIES.map(c => (
          <button
            key={c.key}
            className={`jobs-page__pipeline-stage ${categoryFilter === c.key ? 'jobs-page__pipeline-stage--active' : ''}`}
            onClick={() => setCategoryFilter(categoryFilter === c.key ? 'all' : c.key)}
            style={{ '--stage-color': c.color } as React.CSSProperties}
          >
            <span className="jobs-page__pipeline-label">{c.label}</span>
            <span className="jobs-page__pipeline-count">{notes.filter(n => n.category === c.key).length}</span>
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="jobs-page__controls">
        <form className="jobs-page__search-form" onSubmit={e => e.preventDefault()}>
          <input
            className="jobs-page__search"
            placeholder="Search notes..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </form>
      </div>

      {/* Note editor */}
      {showEditor && (
        <div className="job-form" style={{ marginBottom: '1.5rem' }}>
          <div className="job-form__section">
            <h3 className="job-form__section-title">New Company Note</h3>
            <div className="job-form__grid">
              <div className="job-form__field job-form__field--full">
                <label className="job-form__label">Title *</label>
                <input className="job-form__input" value={editorForm.title} onChange={e => setEditorForm(f => ({ ...f, title: e.target.value }))} placeholder="Note title" />
              </div>
              <div className="job-form__field">
                <label className="job-form__label">Category</label>
                <select className="job-form__select" value={editorForm.category} onChange={e => setEditorForm(f => ({ ...f, category: e.target.value }))}>
                  {CATEGORIES.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
                </select>
              </div>
              <div className="job-form__field job-form__field--full">
                <label className="job-form__label">Content</label>
                <textarea className="job-form__textarea" value={editorForm.content} onChange={e => setEditorForm(f => ({ ...f, content: e.target.value }))} rows={6} placeholder="Write your note..." />
              </div>
            </div>
            <div className="job-form__actions">
              <button className="job-form__cancel" onClick={() => setShowEditor(false)} disabled={saving}>Cancel</button>
              <button className="job-form__submit" onClick={() => void saveNote()} disabled={saving || !editorForm.title.trim()}>
                {saving ? 'Saving…' : 'Save Note'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Notes list */}
      {loading ? (
        <div className="jobs-page__empty">
          <span className="jobs-page__empty-icon">⏳</span>
          <h3>Loading notes…</h3>
        </div>
      ) : filtered.length === 0 ? (
        <div className="jobs-page__empty">
          <span className="jobs-page__empty-icon">📝</span>
          <h3>{notes.length === 0 ? 'No notes yet' : 'No notes match your filters'}</h3>
          <p>Create company-wide notes for procedures, safety guidelines, and announcements.</p>
        </div>
      ) : (
        <>
          {pinned.length > 0 && (
            <div className="jobs-page__section">
              <h3 className="jobs-page__section-title">Pinned</h3>
              <div className="jobs-page__grid">
                {pinned.map(note => <NoteCard key={note.id} note={note} />)}
              </div>
            </div>
          )}
          <div className="jobs-page__section">
            <h3 className="jobs-page__section-title">All Notes</h3>
            <div className="jobs-page__grid">
              {unpinned.map(note => <NoteCard key={note.id} note={note} />)}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

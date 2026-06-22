// app/admin/notes/page.tsx — Company Notes (shared company-wide notes board)
'use client';
import '../styles/AdminNotes.css';
import { useCallback, useEffect, useState } from 'react';
import { Pin, Search, StickyNote, Trash2 } from 'lucide-react';
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
  { key: 'general',    label: 'General',    color: '#6B7280' },
  { key: 'procedures', label: 'Procedures', color: '#1D4ED8' },
  { key: 'safety',     label: 'Safety',     color: '#DC2626' },
  { key: 'equipment',  label: 'Equipment',  color: '#D97706' },
  { key: 'legal',      label: 'Legal',      color: '#7C3AED' },
  { key: 'hr',         label: 'HR',         color: '#059669' },
  { key: 'training',   label: 'Training',   color: '#0891B2' },
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
    const category = CATEGORIES.find(c => c.key === note.category) ?? CATEGORIES[0];
    return (
      <article
        className="note-card"
        data-pinned={note.is_pinned ? 'true' : undefined}
        style={{ ['--note-tint' as string]: category.color }}
      >
        <header className="note-card__head">
          {note.is_pinned && (
            <span className="note-card__pin" aria-label="Pinned"><Pin size={14} strokeWidth={2.2} /></span>
          )}
          <h3 className="note-card__title">{note.title}</h3>
        </header>
        <span className="note-card__category">{category.label}</span>
        <p className="note-card__body">{note.content}</p>
        <div className="note-card__meta">
          <span className="note-card__author">{note.created_by}</span>
          <span>{new Date(note.updated_at).toLocaleDateString()}</span>
        </div>
        <div className="note-card__actions">
          <button
            type="button"
            className="note-card__action"
            data-variant={note.is_pinned ? 'pinned' : undefined}
            onClick={() => void togglePin(note)}
          >
            <Pin size={13} strokeWidth={2.2} />
            {note.is_pinned ? 'Unpin' : 'Pin'}
          </button>
          <button
            type="button"
            className="note-card__action"
            data-variant="danger"
            onClick={() => void deleteNote(note.id)}
          >
            <Trash2 size={13} strokeWidth={2.2} />
            Delete
          </button>
        </div>
      </article>
    );
  }

  return (
    <main className="notes-page">
      <header className="notes-page__header">
        <div className="notes-page__header-text">
          <h1 className="notes-page__title">Company Notes</h1>
          <p className="notes-page__subtitle">
            Shared notes for the whole firm — procedures, safety
            briefings, equipment guidance, HR reminders, and anything
            else that everyone should be able to read in one place.
          </p>
          <div className="notes-page__stats">
            <span className="notes-page__stat"><strong>{notes.length}</strong> total</span>
            <span className="notes-page__stat"><strong>{notes.filter(n => n.is_pinned).length}</strong> pinned</span>
          </div>
        </div>
        <button
          type="button"
          className="notes-page__new-btn"
          onClick={() => setShowEditor(!showEditor)}
        >
          + New note
        </button>
      </header>

      {/* Category filter chips */}
      <div className="notes-page__chips" role="tablist" aria-label="Filter by category">
        <button
          type="button"
          className="notes-page__chip"
          data-active={categoryFilter === 'all' ? 'true' : undefined}
          onClick={() => setCategoryFilter('all')}
          style={{ ['--chip-color' as string]: '#1F2937' }}
          role="tab"
          aria-selected={categoryFilter === 'all'}
        >
          <span className="notes-page__chip-dot" aria-hidden />
          All
          <span className="notes-page__chip-count">{notes.length}</span>
        </button>
        {CATEGORIES.map(c => (
          <button
            key={c.key}
            type="button"
            className="notes-page__chip"
            data-active={categoryFilter === c.key ? 'true' : undefined}
            onClick={() => setCategoryFilter(categoryFilter === c.key ? 'all' : c.key)}
            style={{ ['--chip-color' as string]: c.color }}
            role="tab"
            aria-selected={categoryFilter === c.key}
          >
            <span className="notes-page__chip-dot" aria-hidden />
            {c.label}
            <span className="notes-page__chip-count">{notes.filter(n => n.category === c.key).length}</span>
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="notes-page__search-wrap">
        <Search size={16} className="notes-page__search-icon" aria-hidden />
        <input
          className="notes-page__search"
          placeholder="Search notes…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {/* Note editor */}
      {showEditor && (
        <section className="notes-page__editor">
          <h2 className="notes-page__editor-title">New company note</h2>
          <div className="notes-page__editor-grid">
            <label className="notes-page__field">
              <span className="notes-page__label">Title</span>
              <input
                className="notes-page__input"
                value={editorForm.title}
                onChange={e => setEditorForm(f => ({ ...f, title: e.target.value }))}
                placeholder="Note title"
                autoFocus
              />
            </label>
            <label className="notes-page__field">
              <span className="notes-page__label">Category</span>
              <select
                className="notes-page__select"
                value={editorForm.category}
                onChange={e => setEditorForm(f => ({ ...f, category: e.target.value }))}
              >
                {CATEGORIES.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
              </select>
            </label>
          </div>
          <label className="notes-page__field">
            <span className="notes-page__label">Content</span>
            <textarea
              className="notes-page__textarea"
              value={editorForm.content}
              onChange={e => setEditorForm(f => ({ ...f, content: e.target.value }))}
              rows={6}
              placeholder="Write your note…"
            />
          </label>
          <div className="notes-page__editor-actions">
            <button
              type="button"
              className="notes-page__btn-cancel"
              onClick={() => setShowEditor(false)}
              disabled={saving}
            >
              Cancel
            </button>
            <button
              type="button"
              className="notes-page__btn-save"
              onClick={() => void saveNote()}
              disabled={saving || !editorForm.title.trim()}
            >
              {saving ? 'Saving…' : 'Save note'}
            </button>
          </div>
        </section>
      )}

      {/* Notes list */}
      {loading ? (
        <div className="notes-page__empty">
          <span className="notes-page__empty-icon"><StickyNote size={26} strokeWidth={1.5} /></span>
          <h3 className="notes-page__empty-title">Loading notes…</h3>
        </div>
      ) : filtered.length === 0 ? (
        <div className="notes-page__empty">
          <span className="notes-page__empty-icon"><StickyNote size={26} strokeWidth={1.5} /></span>
          <h3 className="notes-page__empty-title">
            {notes.length === 0 ? 'No notes yet' : 'No notes match your filters'}
          </h3>
          <p className="notes-page__empty-text">
            {notes.length === 0
              ? 'Create company-wide notes for procedures, safety guidelines, and announcements.'
              : 'Try clearing the search or picking a different category.'}
          </p>
        </div>
      ) : (
        <>
          {pinned.length > 0 && (
            <section className="notes-page__section" aria-label="Pinned notes">
              <h2 className="notes-page__section-title"><Pin size={13} strokeWidth={2.2} /> Pinned</h2>
              <div className="notes-page__grid">
                {pinned.map(note => <NoteCard key={note.id} note={note} />)}
              </div>
            </section>
          )}
          {unpinned.length > 0 && (
            <section className="notes-page__section" aria-label="All notes">
              <h2 className="notes-page__section-title">
                {pinned.length > 0 ? 'Everything else' : 'All notes'}
              </h2>
              <div className="notes-page__grid">
                {unpinned.map(note => <NoteCard key={note.id} note={note} />)}
              </div>
            </section>
          )}
        </>
      )}
    </main>
  );
}
